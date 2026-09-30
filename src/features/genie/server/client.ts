import { z } from "zod";

import { GenieError, mapGenieHttpError } from "@/features/genie/server/errors";
import { mapUpstreamMessage, mapUpstreamQueryResult } from "@/features/genie/server/mapper";
import type {
  GenieClient,
  GetGenieMessageInput,
  GetGenieQueryResultInput,
  SubmitGenieMessageInput,
} from "@/features/genie/server/types";
import {
  upstreamMessageSchema,
  upstreamQueryResultSchema,
  upstreamStartConversationSchema,
} from "@/features/genie/server/upstream-schemas";

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRY_AFTER_MS = 60_000;

type ClientOptions = {
  workspaceUrl: string;
  accessToken: string;
  fetchImplementation?: typeof fetch;
  requestTimeoutMs?: number;
};

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function combineSignals(signal: AbortSignal | undefined, timeoutSignal: AbortSignal): AbortSignal {
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_AFTER_MS, Math.ceil(seconds * 1_000));
  }
  const date = Date.parse(value);
  if (!Number.isFinite(date)) {
    return undefined;
  }
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, date - Date.now()));
}

export function createDatabricksGenieClient(options: ClientOptions): GenieClient {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

  async function requestJson<T>(
    path: string,
    schema: z.ZodType<T>,
    init: { method: "GET" | "POST"; body?: Record<string, unknown>; signal?: AbortSignal },
  ): Promise<T> {
    const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
    const signal = combineSignals(init.signal, timeoutSignal);
    let response: Response;

    try {
      response = await fetchImplementation(new URL(path, options.workspaceUrl), {
        method: init.method,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${options.accessToken}`,
          ...(init.body ? { "content-type": "application/json" } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal,
      });
    } catch (error) {
      if (init.signal?.aborted) {
        throw new GenieError("Genie request was cancelled by the caller", "GENIE_CANCELLED", 409, false, {
          cause: error,
        });
      }
      if (timeoutSignal.aborted) {
        throw new GenieError("Genie HTTP request exceeded its deadline", "GENIE_TIMEOUT", 504, true, {
          cause: error,
          retryOnRead: true,
        });
      }
      throw new GenieError("Unable to reach the Databricks Genie API", "GENIE_UNAVAILABLE", 503, true, {
        cause: error,
        retryOnRead: true,
      });
    }

    if (!response.ok) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      await response.body?.cancel();
      throw mapGenieHttpError(response.status, retryAfterMs);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new GenieError("Databricks Genie returned invalid JSON", "GENIE_UNAVAILABLE", 502, true, {
        cause: error,
        retryOnRead: true,
      });
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new GenieError("Databricks Genie returned an unexpected response shape", "GENIE_UNAVAILABLE", 502, true, {
        retryOnRead: true,
      });
    }
    return parsed.data;
  }

  function spacePath(spaceId: string): string {
    return `/api/2.0/genie/spaces/${encodePathSegment(spaceId)}`;
  }

  function messagePath(input: GetGenieMessageInput): string {
    return [
      spacePath(input.spaceId),
      "conversations",
      encodePathSegment(input.conversationId),
      "messages",
      encodePathSegment(input.messageId),
    ].join("/");
  }

  return {
    async submitMessage(input: SubmitGenieMessageInput) {
      const body = { content: input.content, enable_visualization: true };
      if (input.conversationId) {
        const path = [
          spacePath(input.spaceId),
          "conversations",
          encodePathSegment(input.conversationId),
          "messages",
        ].join("/");
        const message = await requestJson(path, upstreamMessageSchema, {
          method: "POST",
          body,
          signal: input.signal,
        });
        return mapUpstreamMessage(message);
      }

      const response = await requestJson(
        `${spacePath(input.spaceId)}/start-conversation`,
        upstreamStartConversationSchema,
        { method: "POST", body, signal: input.signal },
      );
      return mapUpstreamMessage(response.message);
    },

    async getMessage(input: GetGenieMessageInput) {
      const message = await requestJson(messagePath(input), upstreamMessageSchema, {
        method: "GET",
        signal: input.signal,
      });
      return mapUpstreamMessage(message);
    },

    async getQueryResult(input: GetGenieQueryResultInput) {
      const path = [
        messagePath(input),
        "attachments",
        encodePathSegment(input.attachmentId),
        "query-result",
      ].join("/");
      const result = await requestJson(path, upstreamQueryResultSchema, {
        method: "GET",
        signal: input.signal,
      });
      return mapUpstreamQueryResult(result);
    },
  };
}
