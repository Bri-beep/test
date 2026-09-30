import type { GenieMessageStatus } from "@/features/genie/contract";
import { GenieError, toGenieError } from "./errors";
import type { GenieRemoteMessage } from "./types";

export const TERMINAL_STATUSES = new Set<GenieMessageStatus>([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "QUERY_RESULT_EXPIRED",
]);

const PERMISSION_ERROR_TYPES = new Set([
  "WAREHOUSE_ACCESS_MISSING_EXCEPTION",
  "CUSTOMER_UNAUTHORIZED",
  "CUSTOMER_UNAUTHORIZED_EXCEPTION",
  "PERMISSION_DENIED",
  "PERMISSION_DENIED_EXCEPTION",
]);

export type GeniePollingOptions = {
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  maxReadRetries: number;
  timeoutMs: number;
};

export const DEFAULT_POLLING_OPTIONS: GeniePollingOptions = {
  initialDelayMs: 1_000,
  maxDelayMs: 5_000,
  multiplier: 1.6,
  maxReadRetries: 5,
  timeoutMs: 10 * 60_000,
};

export function createAbortError(): GenieError {
  return new GenieError("Genie stream was cancelled", "GENIE_CANCELLED", 409, false);
}

export function sleepWithAbort(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    function onAbort(): void {
      clearTimeout(timer);
      reject(createAbortError());
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export type ReadRetryContext = {
  deadline: number;
  initialDelayMs: number;
  maxDelayMs: number;
  maxReadRetries: number;
  multiplier: number;
  now: () => number;
  random: () => number;
  signal?: AbortSignal;
  sleep: (delayMs: number, signal?: AbortSignal) => Promise<void>;
};

function retryWaitMs(error: GenieError, delayMs: number, random: () => number): number {
  if (error.retryAfterMs !== undefined) {
    return error.retryAfterMs;
  }
  const randomValue = Math.max(0, Math.min(1, random()));
  return Math.max(1, Math.round(delayMs * (0.8 + randomValue * 0.4)));
}

export async function readWithRetry<T>(
  operation: () => Promise<T>,
  context: ReadRetryContext,
): Promise<T> {
  let delayMs = context.initialDelayMs;
  let retries = 0;

  while (true) {
    try {
      if (context.signal?.aborted) throw createAbortError();
      if (context.now() >= context.deadline) throw new GenieError("Genie deadline exceeded", "GENIE_TIMEOUT", 504, true);
      return await operation();
    } catch (error) {
      const normalized = toGenieError(error);
      if (!normalized.retryOnRead || retries >= context.maxReadRetries) {
        throw normalized;
      }
      const remainingMs = context.deadline - context.now();
      if (remainingMs <= 0) {
        throw new GenieError("Genie read-retry deadline exceeded", "GENIE_TIMEOUT", 504, true);
      }
      const waitMs = Math.min(remainingMs, retryWaitMs(normalized, delayMs, context.random));
      await context.sleep(waitMs, context.signal);
      retries += 1;
      delayMs = Math.min(context.maxDelayMs, Math.ceil(delayMs * context.multiplier));
      if (context.now() >= context.deadline) {
        throw new GenieError("Genie read-retry deadline exceeded", "GENIE_TIMEOUT", 504, true);
      }
    }
  }
}

export function failureForMessage(message: GenieRemoteMessage): GenieError {
  if (message.status === "CANCELLED") {
    return new GenieError("Genie cancelled the message", "GENIE_CANCELLED", 409, false);
  }
  if (message.status === "QUERY_RESULT_EXPIRED") {
    return new GenieError("Genie query result expired", "GENIE_RESULT_EXPIRED", 410, true);
  }
  const errorType = message.errorType?.toUpperCase() ?? "";
  if (
    PERMISSION_ERROR_TYPES.has(errorType)
    || errorType.includes("ACCESS_MISSING")
    || errorType.includes("UNAUTHORIZED")
    || errorType.includes("PERMISSION_DENIED")
  ) {
    return new GenieError("Genie or warehouse permission missing", "GENIE_PERMISSION_DENIED", 403, false);
  }
  return new GenieError("Genie failed to produce a response", "GENIE_UNAVAILABLE", 502, true);
}
