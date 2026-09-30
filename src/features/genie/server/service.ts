import type { genie } from "@databricks/appkit";
import { genieStreamEventSchema, MAX_GENIE_RESULT_ROWS, type GenieMessageRequest, type GenieQueryResult, type GenieStreamEvent } from "@/features/genie/contract";
import { buildGenieMessageContent } from "@/features/genie/context";
import { createDemoGenieMessageResult, demoComparisonResult, DEMO_GENIE_MESSAGE_ID, DEMO_GENIE_QUERY_RESULT, DEMO_GENIE_STATUS_SEQUENCE } from "@/features/genie/demo-fixtures";
import { GenieError, toGenieError, toGenieStreamErrorEvent } from "./errors";
import { genieExecution, readGenieResult, type GenieExecution } from "./appkit-client";
import { DEFAULT_POLLING_OPTIONS, sleepWithAbort, type GeniePollingOptions } from "./execution-policy";
import type { GenieClient, GenieRemoteQueryAttachment, GenieRemoteQueryResult } from "./types";

export { sleepWithAbort, type GeniePollingOptions } from "./execution-policy";
type AppKitSendMessage = InstanceType<ReturnType<typeof genie>["plugin"]>["sendMessage"];
let appkitSendMessage: AppKitSendMessage | undefined;
export function configureGenie(sendMessage: AppKitSendMessage): void { appkitSendMessage = sendMessage; }

type StreamDependencies = {
  client: GenieClient;
  alias?: string;
  sendMessage?: AppKitSendMessage;
  spaceId: string;
  requestId: string;
  signal?: AbortSignal;
  polling?: Partial<GeniePollingOptions>;
  now?: () => number;
  random?: () => number;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  onError?: (error: GenieError) => void;
  onComplete?: (summary: { queryResultCount: number }) => void;
};

type DemoDependencies = {
  requestId: string;
  signal?: AbortSignal;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  statusDelayMs?: number;
  onError?: (error: GenieError) => void;
  onComplete?: (summary: { queryResultCount: number }) => void;
};

function queryEvent(attachment: GenieRemoteQueryAttachment, result: GenieRemoteQueryResult | GenieQueryResult): Extract<GenieStreamEvent, { type: "query_result" }> {
  const rows = result.rows.slice(0, MAX_GENIE_RESULT_ROWS);
  return {
    type: "query_result", attachmentId: attachment.attachmentId,
    statementId: result.statementId ?? attachment.statementId ?? "",
    data: {
      manifest: { schema: { columns: result.columns.map((column) => ({ name: column.name, type_name: column.type })) } },
      result: { data_array: rows.map((row) => row.map((cell) => cell === null ? null : String(cell))) },
    },
    rowCount: result.rowCount,
    truncated: result.truncated || result.rows.length > rows.length || result.rowCount > rows.length,
  };
}

export async function* streamGenieMessage(
  request: GenieMessageRequest,
  dependencies: StreamDependencies,
): AsyncGenerator<GenieStreamEvent> {
  const polling = { ...DEFAULT_POLLING_OPTIONS, ...dependencies.polling };
  const now = dependencies.now ?? Date.now;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), polling.timeoutMs);
  const signal = dependencies.signal ? AbortSignal.any([dependencies.signal, controller.signal]) : controller.signal;
  const scope: GenieExecution = {
    client: dependencies.client, spaceId: dependencies.spaceId, results: new Map(),
    policy: { ...polling, deadline: now() + polling.timeoutMs, now, signal,
      random: dependencies.random ?? Math.random, sleep: dependencies.sleep ?? sleepWithAbort },
  };
  let upstream: ReturnType<AppKitSendMessage> | undefined;
  let receivedAnswer = false;
  const emitted = new Set<string>();
  let lastStatus: string | undefined;
  try {
    const sendMessage = dependencies.sendMessage ?? appkitSendMessage;
    if (!sendMessage) throw new GenieError("AppKit Genie is not initialized", "GENIE_UNAVAILABLE", 503, false);
    upstream = sendMessage(dependencies.alias ?? dependencies.spaceId, buildGenieMessageContent(request.content, request.context),
      request.conversationId, { timeout: polling.timeoutMs, signal });
    while (true) {
      // Async generators execute during next(), not when they are constructed.
      const next = await genieExecution.run(scope, () => upstream!.next());
      if (signal.aborted) throw new GenieError("Genie tracking stopped", "GENIE_CANCELLED", 409, false);
      if (next.done) break;
      const event = next.value;
      if (event.type === "error") throw scope.failure ?? new GenieError("AppKit Genie failed", "GENIE_UNAVAILABLE", 502, false);
      if (event.type === "message_start") yield genieStreamEventSchema.parse(event);
      if (event.type === "status" && event.status !== lastStatus) {
        yield genieStreamEventSchema.parse(event); lastStatus = event.status;
      }
      if (event.type === "message_result") {
        if (scope.message?.status !== "COMPLETED") throw new GenieError("Incomplete Genie message", "GENIE_UNAVAILABLE", 502, false);
        receivedAnswer = true;
        yield genieStreamEventSchema.parse({ ...event, message: { ...event.message, content: request.content } });
      }
      if (event.type === "query_result") {
        if (emitted.has(event.attachmentId)) continue;
        const attachment = scope.message?.queryAttachments.find((item) => item.attachmentId === event.attachmentId);
        const result = scope.results.get(event.attachmentId);
        if (!attachment || !result) throw new GenieError("Unexpected Genie result", "GENIE_UNAVAILABLE", 502, false);
        emitted.add(attachment.attachmentId);
        yield queryEvent(attachment, result);
        scope.results.delete(event.attachmentId);
      }
    }
    if (!receivedAnswer) throw new GenieError("Genie ended before completion", "GENIE_UNAVAILABLE", 502, false);
    // AppKit 0.76.1 skips attachments without a statement ID. Their read endpoint is still valid.
    for (const attachment of scope.message?.queryAttachments ?? []) {
      if (emitted.has(attachment.attachmentId)) continue;
      const result = await readGenieResult(scope, attachment.attachmentId);
      yield queryEvent(attachment, result);
      emitted.add(attachment.attachmentId);
    }
    dependencies.onComplete?.({ queryResultCount: emitted.size });
  } catch (error) {
    const normalized = controller.signal.aborted && !dependencies.signal?.aborted
      ? new GenieError("Genie deadline exceeded", "GENIE_TIMEOUT", 504, true) : toGenieError(error);
    dependencies.onError?.(normalized);
    yield toGenieStreamErrorEvent(normalized, dependencies.requestId);
  } finally {
    clearTimeout(timer);
    controller.abort();
    await upstream?.return(undefined);
    scope.results.clear();
  }
}

export async function* streamDemoGenieMessage(
  request: GenieMessageRequest,
  dependencies: DemoDependencies,
): AsyncGenerator<GenieStreamEvent> {
  const sleep = dependencies.sleep ?? sleepWithAbort;
  const statusDelayMs = dependencies.statusDelayMs ?? 180;
  const conversationId = request.conversationId ?? "11111111111111111111111111111111";
  const comparison = request.context?.comparison;
  const queryResult = comparison ? demoComparisonResult(comparison) : DEMO_GENIE_QUERY_RESULT;

  try {
    yield {
      type: "message_start",
      conversationId, messageId: DEMO_GENIE_MESSAGE_ID,
    };
    for (const status of DEMO_GENIE_STATUS_SEQUENCE) {
      if (statusDelayMs > 0) {
        await sleep(statusDelayMs, dependencies.signal);
      }
      yield { type: "status", status };
    }
    const message = createDemoGenieMessageResult(conversationId);
    message.content = request.content;
    if (comparison) {
      message.attachments = [
        { text: { content: `Cette démonstration reprend la comparaison de ${comparison.metric} affichée à l’écran. `
          + "Aucune requête Databricks n’a été exécutée. Vérifiez la complétude, les définitions et les contributions par segment avant de rechercher une cause." } },
        { suggestedQuestions: ["Quelles vérifications de qualité faut-il effectuer ?"] },
        { attachmentId: queryResult.attachmentId, query: { title: queryResult.title ?? undefined,
          description: queryResult.description ?? undefined } },
      ];
    }
    yield { type: "message_result", message };
    yield queryEvent(queryResult, queryResult);
    dependencies.onComplete?.({ queryResultCount: 1 });
  } catch (error) {
    const normalized = toGenieError(error);
    dependencies.onError?.(normalized);
    yield toGenieStreamErrorEvent(normalized, dependencies.requestId);
  }
}
