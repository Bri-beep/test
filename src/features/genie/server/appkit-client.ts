import { AsyncLocalStorage } from "node:async_hooks";
import type { WorkspaceClient } from "@databricks/appkit";

import { GenieError, toGenieError } from "./errors";
import { failureForMessage, readWithRetry, TERMINAL_STATUSES, type ReadRetryContext } from "./execution-policy";
import type { GenieClient, GenieRemoteMessage, GenieRemoteQueryResult } from "./types";

type GenieApi = Pick<WorkspaceClient["genie"], "startConversation" | "createMessage" | "getMessageAttachmentQueryResult">;
type SdkMessage = Awaited<ReturnType<WorkspaceClient["genie"]["getMessage"]>>;

export type GenieExecution = {
  client: GenieClient;
  spaceId: string;
  policy: ReadRetryContext;
  message?: GenieRemoteMessage;
  results: Map<string, GenieRemoteQueryResult>;
  failure?: GenieError;
};

// Request-local credentials and cancellation never enter AppKit's service identity or caches.
export const genieExecution = new AsyncLocalStorage<GenieExecution>();

function toSdkMessage(message: GenieRemoteMessage, spaceId: string): SdkMessage {
  return {
    id: message.messageId, space_id: spaceId, content: message.answer ?? "",
    conversation_id: message.conversationId,
    message_id: message.messageId,
    status: message.status,
    attachments: [
      ...(message.answer === null ? [] : [{ text: { content: message.answer } }]),
      { suggested_questions: { questions: message.suggestedQuestions } },
      ...message.queryAttachments.map((attachment) => ({
        attachment_id: attachment.attachmentId,
        query: {
          statement_id: attachment.statementId ?? undefined,
          title: attachment.title ?? undefined,
          description: attachment.description ?? undefined,
          query: attachment.sql ?? undefined,
        },
      })),
    ],
  };
}

async function guarded<T>(scope: GenieExecution, operation: () => Promise<T>): Promise<T> {
  try {
    if (scope.policy.signal?.aborted) throw new GenieError("Genie cancelled", "GENIE_CANCELLED", 409, false);
    return await operation();
  } catch (error) {
    scope.failure = toGenieError(error);
    // AppKit 0.76.1 logs caught errors. Never pass causes, payloads or credentials to it.
    throw new Error("Genie operation failed");
  }
}

export async function readGenieResult(scope: GenieExecution, attachmentId: string): Promise<GenieRemoteQueryResult> {
  const message = scope.message;
  if (!message) throw new GenieError("Missing Genie message", "GENIE_UNAVAILABLE", 502, false);
  let delay = scope.policy.initialDelayMs;
  while (true) {
    const result = await readWithRetry(() => scope.client.getQueryResult({
      spaceId: scope.spaceId, conversationId: message.conversationId, messageId: message.messageId,
      attachmentId, signal: scope.policy.signal,
    }), scope.policy);
    if (result.state === "SUCCEEDED") {
      scope.results.set(attachmentId, result);
      return result;
    }
    if (result.state === "CANCELED") throw new GenieError("Genie result cancelled", "GENIE_CANCELLED", 409, false);
    if (result.state === "CLOSED") throw new GenieError("Genie result expired", "GENIE_RESULT_EXPIRED", 410, true);
    if (result.state === "FAILED") throw new GenieError("Genie query failed", "GENIE_UNAVAILABLE", 502, true);
    await scope.policy.sleep(Math.min(delay, Math.max(0, scope.policy.deadline - scope.policy.now())), scope.policy.signal);
    delay = Math.min(scope.policy.maxDelayMs, Math.ceil(delay * scope.policy.multiplier));
  }
}

function scopedGenieApi(scope: GenieExecution): GenieApi {
  async function submit(input: { space_id: string; content: string; conversation_id?: string }) {
    return guarded(scope, async () => {
      if (input.space_id !== scope.spaceId) throw new GenieError("Unexpected Genie Space", "UNKNOWN_SPACE", 404, false);
      // A POST is never retried, even when the remote outcome is unknown.
      let message = await scope.client.submitMessage({
        spaceId: scope.spaceId, content: input.content, conversationId: input.conversation_id, signal: scope.policy.signal,
      });
      scope.message = message;
      return {
        ...toSdkMessage(message, scope.spaceId), conversation_id: message.conversationId, message_id: message.messageId,
        wait: async (options?: { onProgress?: (message: SdkMessage) => Promise<void> }) => guarded(scope, async () => {
          let delay = scope.policy.initialDelayMs;
          while (true) {
            if (scope.policy.signal?.aborted) throw new GenieError("Genie cancelled", "GENIE_CANCELLED", 409, false);
            await options?.onProgress?.(toSdkMessage(message, scope.spaceId));
            if (TERMINAL_STATUSES.has(message.status)) {
              if (message.status !== "COMPLETED") throw failureForMessage(message);
              return toSdkMessage(message, scope.spaceId);
            }
            await scope.policy.sleep(Math.min(delay, Math.max(0, scope.policy.deadline - scope.policy.now())), scope.policy.signal);
            delay = Math.min(scope.policy.maxDelayMs, Math.ceil(delay * scope.policy.multiplier));
            message = await readWithRetry(() => scope.client.getMessage({
              spaceId: scope.spaceId, conversationId: message.conversationId, messageId: message.messageId, signal: scope.policy.signal,
            }), scope.policy);
            scope.message = message;
          }
        }),
      };
    });
  }
  return {
    startConversation: submit,
    createMessage: submit,
    getMessageAttachmentQueryResult: (input) => guarded(scope, async () => {
      const message = scope.message;
      if (input.space_id !== scope.spaceId || input.conversation_id !== message?.conversationId
        || input.message_id !== message?.messageId || !message?.queryAttachments.some((item) => item.attachmentId === input.attachment_id)) {
        throw new GenieError("Unexpected Genie attachment", "GENIE_UNAVAILABLE", 502, false);
      }
      const result = await readGenieResult(scope, input.attachment_id);
      // Rows stay in the validated request-local result map. AppKit only dispatches the attachment event.
      return { statement_response: {
        statement_id: result.statementId ?? undefined, status: { state: "SUCCEEDED" },
      } };
    }),
  };
}

export function withGenieClient(client: WorkspaceClient): WorkspaceClient {
  return new Proxy(client, {
    get(target, key) {
      if (key !== "genie") return Reflect.get(target, key, target);
      const scope = genieExecution.getStore();
      if (!scope) throw new Error("Genie requires a validated request identity");
      return scopedGenieApi(scope);
    },
  });
}
