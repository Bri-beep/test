import assert from "node:assert/strict";
import test from "node:test";

import { GenieError } from "../src/features/genie/server/errors";
import { withApiRoute } from "../src/lib/http/with-api-route";
import { requestHandler, withHttpApp } from "./fixtures/http";

test("native handlers stream without changing bytes or the shared request ID", async () => {
  const route = withApiRoute((_request, _context, response) => {
    response.type("text/event-stream");
    response.write("event: status\ndata: {}\n\n");
    response.end();
  });
  const response = await requestHandler(route, new Request("http://localhost/api/stream", {
    headers: { "x-request-id": "stream-request" },
  }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream/);
  assert.equal(response.headers.get("x-request-id"), "stream-request");
  assert.equal(await response.text(), "event: status\ndata: {}\n\n");
});

test("native path parameters, query parameters and headers keep the JSON contract", async () => {
  const route = withApiRoute((request) => ({
    alias: request.params.alias,
    cursor: request.query.cursor,
    source: request.get("x-source"),
  }));
  const response = await requestHandler(route, new Request("http://localhost/api/genie/sales?cursor=next", {
    headers: { "x-source": "test" },
  }), "/api/genie/:alias");
  assert.deepEqual(await response.json(), { alias: "sales", cursor: "next", source: "test" });
  assert.ok(response.headers.get("x-request-id"));
});

test("preserves safe retry metadata for a pre-stream concurrency rejection", async () => {
  const route = withApiRoute(() => {
    throw new GenieError("limit reached", "GENIE_UNAVAILABLE", 429, true, { retryAfterMs: 5_000 });
  });
  const response = await requestHandler(route, new Request("http://localhost/api/genie/sales/messages"));
  const payload = await response.json();
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "5");
  assert.equal(payload.error.retryable, true);
  assert.equal(payload.error.code, "GENIE_UNAVAILABLE");
  assert.ok(payload.error.requestId);
});

test("closing a live response aborts request work", { timeout: 5_000 }, async () => {
  let observedAbort!: () => void;
  const aborted = new Promise<void>((resolve) => { observedAbort = resolve; });
  const route = withApiRoute(async (_request, { signal }, response) => {
    response.type("text/event-stream").write("event: ready\ndata: {}\n\n");
    await new Promise<void>((resolve) => signal.addEventListener("abort", () => {
      observedAbort();
      resolve();
    }, { once: true }));
  });
  await withHttpApp((app) => app.get("/stream", route), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/stream`);
    const reader = response.body!.getReader();
    assert.equal((await reader.read()).done, false);
    await reader.cancel();
    await aborted;
  });
});

test("a failed partial stream closes without appending an error envelope or secret", { timeout: 5_000 }, async () => {
  let fail!: () => void;
  let signal: AbortSignal | undefined;
  const waiting = new Promise<void>((resolve) => { fail = resolve; });
  const route = withApiRoute(async (_request, context, response) => {
    signal = context.signal;
    response.type("text/event-stream").write("event: ready\ndata: {}\n\n");
    await waiting;
    throw new Error("private upstream detail");
  });
  await withHttpApp((app) => app.get("/stream", route), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/stream`);
    const reader = response.body!.getReader();
    assert.equal(new TextDecoder().decode((await reader.read()).value), "event: ready\ndata: {}\n\n");
    fail();
    await assert.rejects(reader.read());
    assert.equal(signal?.aborted, true, "failed streaming responses cancel work associated with the request");
  });
});
