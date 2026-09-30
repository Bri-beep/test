import assert from "node:assert/strict";
import test from "node:test";
import type { GenieStreamEvent } from "../src/features/genie/contract";
import { queryResultFromEvent } from "../src/features/genie/contract";
import { sendGenieRequest } from "../src/features/genie/stream";
import { streamDemoGenieMessage } from "../src/features/genie/server/service";

function responseFor(data: string): Response {
  const bytes = new TextEncoder().encode(data);
  return new Response(new ReadableStream({ start(controller) {
    // Split accents and frame delimiters across chunks: upstream owns incremental parsing.
    for (let offset = 0; offset < bytes.length; offset += 7) controller.enqueue(bytes.slice(offset, offset + 7));
    controller.close();
  } }), { headers: { "content-type": "text/event-stream" } });
}

test("AppKit transport consumes native message then query events and preserves inspectable previews", async (t) => {
  const events: GenieStreamEvent[] = [];
  for await (const event of streamDemoGenieMessage({ content: "Question" }, { requestId: "native", statusDelayMs: 0 })) events.push(event);
  const calls: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    calls.push(url);
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(String(options.body)), { content: "Question", context: { filters: { canal: "Web" } } });
    return responseFor(": heartbeat\r\n\r\n" + events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join(""));
  });
  const received: GenieStreamEvent[] = [];
  await sendGenieRequest("sales", { content: "Question", context: { filters: { canal: "Web" } } }, new AbortController().signal, (event) => received.push(event));
  assert.equal(calls.length, 1);
  assert.deepEqual(received, events);
  const message = received.find((event) => event.type === "message_result");
  const query = received.find((event) => event.type === "query_result");
  assert.ok(message?.type === "message_result" && query?.type === "query_result");
  assert.ok(received.indexOf(message) < received.indexOf(query));
  assert.equal(message.message.content, "Question");
  const preview = queryResultFromEvent(query, message.message);
  assert.match(preview.sql!, /:region/);
  assert.equal(preview.rowCount, 5);
  assert.equal(preview.truncated, false);
  assert.doesNotMatch(JSON.stringify(received), /spaceId/);
});

test("AppKit transport never retries an ambiguous POST or an HTTP failure", async (t) => {
  for (const status of [null, 503, 403]) {
    let calls = 0;
    const mock = t.mock.method(globalThis, "fetch", async () => {
      calls++;
      if (status === null) throw new Error("connection interrupted after submission");
      return new Response("private upstream details", { status });
    });
    await assert.rejects(sendGenieRequest("sales", { content: "Question" }, new AbortController().signal, () => {}));
    assert.equal(calls, 1);
    mock.mock.restore();
  }
});

test("AppKit transport rejects malformed, legacy and incomplete streams without replay", async (t) => {
  const streams = [
    "data: {invalid}\n\n",
    'data: {"type":"status","data":{"status":"COMPLETED"}}\n\n',
    'data: {"type":"status","status":"ASKING_AI"}\n\n',
    'data: {"type":"message_start","messageId":"m","conversationId":"c"}\n\ndata: {"type":"message_result","message":{"messageId":"m","conversationId":"c","status":"COMPLETED","content":"", "attachments":[{"attachmentId":"missing","query":{}}]}}\n\n',
  ];
  for (const body of streams) {
    let calls = 0;
    const mock = t.mock.method(globalThis, "fetch", async () => { calls++; return responseFor(body); });
    await assert.rejects(sendGenieRequest("sales", { content: "Question" }, new AbortController().signal, () => {}));
    assert.equal(calls, 1);
    mock.mock.restore();
  }
});

test("AppKit transport interrupts an active request and never replays it", async (t) => {
  let calls = 0;
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    calls++;
    return new Promise((_resolve, reject) => options.signal?.addEventListener("abort", () => reject(new DOMException("stopped", "AbortError")), { once: true }));
  });
  const pending = sendGenieRequest("sales", { content: "Question" }, controller.signal, () => {});
  controller.abort();
  await assert.rejects(pending);
  assert.equal(calls, 1);
});


test("AppKit transport rejects interleaved identities and repeated lifecycle events before forwarding them", async (t) => {
  const start = { type: "message_start", conversationId: "c", messageId: "m" };
  const answer = { type: "message_result", message: { conversationId: "c", messageId: "m",
    status: "COMPLETED", content: "Question", attachments: [] } };
  const failure = { type: "error", error: "Erreur sûre", code: "GENIE_UNAVAILABLE", requestId: "r", retryable: false };
  const cases = [
    { events: [start, { ...answer, message: { ...answer.message, conversationId: "other" } }], accepted: ["message_start"] },
    { events: [start, { ...answer, message: { ...answer.message, messageId: "other" } }], accepted: ["message_start"] },
    { events: [start, start], accepted: ["message_start"] },
    { events: [start, answer, answer], accepted: ["message_start", "message_result"] },
    { events: [start], accepted: [], conversationId: "expected-conversation" },
    { events: [answer], accepted: [] },
    { events: [failure, start], accepted: ["error"] },
  ];
  for (const item of cases) {
    let calls = 0;
    const accepted: string[] = [];
    const mock = t.mock.method(globalThis, "fetch", async () => {
      calls++;
      return responseFor(item.events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""));
    });
    await assert.rejects(sendGenieRequest("sales", { content: "Question", conversationId: item.conversationId },
      new AbortController().signal, (event) => accepted.push(event.type)));
    assert.deepEqual(accepted, item.accepted);
    assert.equal(calls, 1);
    mock.mock.restore();
  }
});
