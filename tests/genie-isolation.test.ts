import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { sendGenieMessage } from "../src/features/genie/server/runtime";
import { parseGenieMessageRequest } from "../src/features/genie/server/request";
import { withApiRoute } from "../src/lib/http/with-api-route";
import { startTestGenie } from "./fixtures/genie-appkit";

test("concurrent Express Genie streams keep OBO identities and answers isolated", { timeout: 10_000 }, async (t) => {
  const environment = {
    APP_MODE: "databricks", DATABRICKS_APP_NAME: "offline-test",
    DATABRICKS_HOST: "https://workspace.example.invalid",
    DATABRICKS_GENIE_SPACE_ID_FRAIM_SALES: "a".repeat(32),
    GENIE_MAX_CONCURRENT_STREAMS: "2", GENIE_MAX_CONCURRENT_STREAMS_PER_USER: "1",
  };
  const previous = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
  Object.assign(process.env, environment);
  await startTestGenie({ "fraim-sales": "a".repeat(32) });
  const networkFetch = globalThis.fetch;
  const submissions: string[] = [];
  let release!: () => void;
  const bothSubmitted = new Promise<void>((resolve) => { release = resolve; });
  t.mock.method(globalThis, "fetch", async (input: string | URL, init: RequestInit) => {
    assert.match(String(input), /^https:\/\/workspace\.example\.invalid\/api\/2\.0\/genie\//);
    const authorization = new Headers(init.headers).get("authorization");
    assert.ok(authorization === "Bearer synthetic-a" || authorization === "Bearer synthetic-b");
    const user = authorization.endsWith("a") ? "a" : "b";
    if (init.method === "POST") {
      submissions.push(user);
      if (submissions.length === 2) release();
      await bothSubmitted;
      return Response.json({ message: { conversation_id: user.repeat(32), message_id: "c".repeat(32), status: "SUBMITTED" } });
    }
    assert.equal(init.method, "GET");
    assert.ok(String(input).includes(`/conversations/${user.repeat(32)}/`), "every read must keep the submitting user's token");
    if (String(input).endsWith("query-result")) return Response.json({ statement_response: {
      status: { state: "SUCCEEDED" }, manifest: { schema: { columns: [{ name: "user", type_name: "STRING" }] } },
      result: { data_array: [[`Result for user ${user}`]] },
    } });
    return Response.json({
      conversation_id: user.repeat(32), message_id: "c".repeat(32), status: "COMPLETED",
      attachments: [{ attachment_id: "answer", text: { content: `Answer for user ${user}` } },
        { attachment_id: "query", query: { statement_id: "statement", query: "SELECT synthetic" } }],
    });
  });
  const app = express();
  app.use(express.json({ limit: "64kb" }));
  app.post("/api/genie/fraim-sales/messages", withApiRoute(async (request, context, response) =>
    sendGenieMessage(request, response, "fraim-sales", parseGenieMessageRequest(request), context)));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  async function send(user?: string) {
    return networkFetch(origin + "/api/genie/fraim-sales/messages", {
      method: "POST", body: JSON.stringify({ content: "Question synthétique" }),
      headers: { "content-type": "application/json", origin,
        ...(user ? { "x-forwarded-user": user, "x-forwarded-access-token": `synthetic-${user}` } : {}) },
    });
  }
  try {
    const unauthorized = await send();
    assert.equal(unauthorized.status, 401);
    assert.equal((await unauthorized.json()).error.code, "GENIE_AUTH_REQUIRED");
    assert.equal(submissions.length, 0);
    const bodies = await Promise.all(["a", "b"].map(async (user) => {
      const response = await send(user);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type")!, /text\/event-stream/);
      return response.text();
    }));
    assert.deepEqual(submissions.sort(), ["a", "b"]);
    bodies.forEach((body, index) => {
      assert.match(body, new RegExp(`Answer for user ${index === 0 ? "a" : "b"}`));
      assert.doesNotMatch(body, new RegExp(`Answer for user ${index === 0 ? "b" : "a"}`));
      assert.doesNotMatch(body, /synthetic-[ab]/);
      assert.match(body, /event: message_result/);
      assert.match(body, new RegExp(`Result for user ${index === 0 ? "a" : "b"}`));
      assert.doesNotMatch(body, new RegExp(`Result for user ${index === 0 ? "b" : "a"}`));
    });
  } finally {
    release();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
