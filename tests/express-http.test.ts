import assert from "node:assert/strict";
import test from "node:test";
import { withApiRoute } from "../src/lib/http/with-api-route";
import { parseGenieMessageRequest } from "../src/features/genie/server/request";
import { requestHandler, withHttpApp } from "./fixtures/http";

test("Express rejects malformed and oversized JSON before the feature with private safe errors", async () => {
  let calls = 0;
  const route = withApiRoute((request) => { calls++; return request.body; });
  for (const path of ["/api/saved-analyses/missing", "/api/user-preferences", "/api/genie/sales/session"]) {
    for (const body of ["{", JSON.stringify({ content: "x".repeat(70_000) })]) {
      const response = await requestHandler(route, new Request(`http://localhost${path}`, {
        method: "POST", headers: { "content-type": "application/json", "x-request-id": "parser-error" }, body,
      }));
      assert.equal(response.status, 400);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.match(response.headers.get("vary") ?? "", /x-forwarded-user/i);
      assert.equal(response.headers.get("x-request-id"), "parser-error");
      const payload = await response.json();
      assert.equal(payload.error.code, "INVALID_REQUEST");
      assert.equal(payload.error.requestId, "parser-error");
      assert.doesNotMatch(JSON.stringify(payload), /content|70_000|SyntaxError/);
    }
  }
  assert.equal(calls, 0);
});

test("the global JSON parser bounds chunked bodies without a content-length header", async () => {
  let calls = 0;
  const route = withApiRoute(() => { calls++; return { accepted: true }; });
  await withHttpApp((app) => app.post("/body", route), async (baseUrl) => {
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('{"content":"'));
      for (let index = 0; index < 70; index++) controller.enqueue(new TextEncoder().encode("x".repeat(1024)));
      controller.enqueue(new TextEncoder().encode('"}'));
      controller.close();
    } });
    const response = await fetch(`${baseUrl}/body`, {
      method: "POST", headers: { "content-type": "application/json" }, body, duplex: "half",
    } as RequestInit);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "INVALID_REQUEST");
  });
  assert.equal(calls, 0);
});

test("valid JSON still requires the Genie feature schema", async () => {
  const route = withApiRoute((request) => parseGenieMessageRequest(request));
  const response = await requestHandler(route, new Request("http://localhost/api/genie/sales/messages", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: 123 }),
  }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "INVALID_REQUEST");
});
