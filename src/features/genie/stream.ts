import { connectSSE } from "@databricks/appkit-ui/js";
import { genieStreamEventSchema, type GenieMessageRequest, type GenieStreamEvent } from "./contract";

// Unlike useGenieChat in AppKit 0.76.1, this call explicitly forbids POST retries.
// Keep application policy here; parsing, buffering and transport belong to AppKit.
export async function sendGenieRequest(
  alias: string,
  payload: GenieMessageRequest,
  signal: AbortSignal,
  onEvent: (event: GenieStreamEvent) => void,
): Promise<void> {
  if (signal.aborted) throw new DOMException("Genie tracking stopped", "AbortError");
  const controller = new AbortController();
  let failure: unknown;
  let started: Extract<GenieStreamEvent, { type: "message_start" }> | undefined;
  let completedMessage = false;
  let terminalError = false;
  let expectedAttachments: string[] = [];
  const receivedAttachments = new Set<string>();
  const timer = setTimeout(() => {
    failure = new Error("Genie stream timed out");
    controller.abort();
  }, 660_000);
  try {
    await connectSSE({
      url: `/api/genie/${encodeURIComponent(alias)}/messages`, payload,
      signal: AbortSignal.any([signal, controller.signal]), maxRetries: 0,
      timeout: 660_000, maxBufferSize: 5 * 1024 * 1024,
      onMessage: async ({ data }) => {
        if (failure || signal.aborted) return;
        // AppKit does not await this callback: capture failures here, then reject below.
        try {
          const event = genieStreamEventSchema.parse(JSON.parse(data));
          if (terminalError) throw new Error("Genie event after terminal error");
          if (event.type === "message_start") {
            if (started || (payload.conversationId && payload.conversationId !== event.conversationId)) throw new Error("Unexpected Genie conversation");
            started = event;
          } else if (event.type !== "error" && !started) throw new Error("Genie event before message start");
          if (event.type === "message_result") {
            if (completedMessage || event.message.status !== "COMPLETED"
              || event.message.conversationId !== started?.conversationId || event.message.messageId !== started?.messageId) {
              throw new Error("Unexpected Genie message");
            }
            completedMessage = true;
            expectedAttachments = event.message.attachments.flatMap((item) => item.query && item.attachmentId ? [item.attachmentId] : []);
          }
          if (event.type === "query_result") {
            if (!completedMessage || !expectedAttachments.includes(event.attachmentId)) throw new Error("Unexpected Genie attachment");
            receivedAttachments.add(event.attachmentId);
          }
          if (event.type === "error") terminalError = true;
          onEvent(event);
        }
        catch (error) { failure = error; controller.abort(); }
      },
      onError: (error) => { failure ??= error; },
    });
    if (failure) throw failure;
    if (signal.aborted) throw new DOMException("Genie tracking stopped", "AbortError");
    if (!terminalError && (!completedMessage || expectedAttachments.some((id) => !receivedAttachments.has(id)))) {
      throw new Error("Incomplete Genie stream");
    }
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
