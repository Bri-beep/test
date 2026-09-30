import { once } from "node:events";
import type { Response } from "express";
import type { GenieStreamEvent } from "@/features/genie/contract";

export function encodeGenieSseEvent(event: GenieStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** Write to Express directly, respecting backpressure and request cancellation. */
export async function writeGenieSse(
  response: Response,
  events: AsyncIterable<GenieStreamEvent>,
  signal: AbortSignal,
  heartbeatIntervalMs = 15_000,
): Promise<void> {
  if (signal.aborted) return;
  response.set({ "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "private, no-cache, no-store, no-transform",
    connection: "keep-alive", "x-accel-buffering": "no" });
  response.flushHeaders();
  const iterator = events[Symbol.asyncIterator]();
  let abort!: () => void;
  const interrupted = new Promise<{ kind: "abort" }>((resolve) => {
    abort = () => resolve({ kind: "abort" });
    signal.addEventListener("abort", abort, { once: true });
  });
  let pending = iterator.next();
  try {
    while (!signal.aborted) {
      let timer: NodeJS.Timeout | undefined;
      const next = await Promise.race([
        pending.then((result) => ({ kind: "event" as const, result })),
        interrupted,
        new Promise<{ kind: "heartbeat" }>((resolve) => {
          timer = setTimeout(() => resolve({ kind: "heartbeat" }), heartbeatIntervalMs);
        }),
      ]).finally(() => clearTimeout(timer));
      if (next.kind === "abort" || signal.aborted) break;
      if (next.kind === "event" && next.result.done) break;
      const chunk = next.kind === "heartbeat" ? ": heartbeat\n\n" : encodeGenieSseEvent(next.result.value);
      if (!response.write(chunk)) await once(response, "drain", { signal });
      if (next.kind === "event") pending = iterator.next();
    }
    if (!signal.aborted) response.end();
  } finally {
    signal.removeEventListener("abort", abort);
    await iterator.return?.();
  }
}
