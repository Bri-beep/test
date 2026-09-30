import assert from "node:assert/strict";
import test from "node:test";

import { AppError, DatabricksError, normalizeError } from "../src/lib/errors/app-error";
import { withApiRoute } from "../src/lib/http/with-api-route";
import { requestHandler } from "./fixtures/http";

test("preserves typed application errors", () => {
  const error = new DatabricksError("technical detail");
  assert.equal(normalizeError(error), error);
  assert.equal(error.status, 503);
  assert.doesNotMatch(error.userMessage, /technical detail/);
});

test("normalizes unknown failures with a safe user message", () => {
  const error = normalizeError(new Error("sensitive implementation detail"));
  assert.ok(error instanceof AppError);
  assert.equal(error.code, "UNEXPECTED_ERROR");
  assert.doesNotMatch(error.userMessage, /sensitive/);
});

test("unknown asynchronous route failures expose only the shared safe envelope", async () => {
  const response = await requestHandler(withApiRoute(async () => {
    await Promise.resolve();
    throw new Error("sensitive upstream credential");
  }), new Request("http://localhost/failure", { headers: { "x-request-id": "safe-error-id" } }));
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("x-request-id"), "safe-error-id");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const text = await response.text();
  assert.doesNotMatch(text, /sensitive|credential/);
  assert.deepEqual(JSON.parse(text).error, {
    code: "UNEXPECTED_ERROR",
    message: normalizeError(new Error()).userMessage,
    requestId: "safe-error-id",
  });
});
