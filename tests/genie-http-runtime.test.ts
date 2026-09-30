import assert from "node:assert/strict";
import test from "node:test";
import { parseGenieMessageRequest } from "../src/features/genie/server/request";
import { sendGenieMessage } from "../src/features/genie/server/runtime";
import { withApiRoute } from "../src/lib/http/with-api-route";
import { startTestGenie } from "./fixtures/genie-appkit";
import { withHttpApp } from "./fixtures/http";

test("cancelling a Genie HTTP stream cancels submission and releases the user's quota without replay", { timeout: 5_000 }, async (t) => {
  const previous = { ...process.env };
  t.after(() => { process.env = previous; });
  Object.assign(process.env, {
    APP_MODE: "databricks", DATABRICKS_APP_NAME: "offline-test", DATABRICKS_HOST: "https://workspace.example.invalid",
    GENIE_MAX_CONCURRENT_STREAMS: "1", GENIE_MAX_CONCURRENT_STREAMS_PER_USER: "1",
  });
  await startTestGenie({ "fraim-sales": "a".repeat(32) });
  const networkFetch = globalThis.fetch;
  let submissions = 0;
  let requestSignal: AbortSignal | undefined;
  let submitted!: () => void;
  const firstSubmission = new Promise<void>((resolve) => { submitted = resolve; });
  t.mock.method(globalThis, "fetch", async (input: string | URL, init: RequestInit) => {
    assert.match(String(input), /^https:\/\/workspace\.example\.invalid\/api\/2\.0\/genie\//);
    assert.equal(init.method, "POST");
    submissions++;
    if (submissions === 1) {
      requestSignal = init.signal ?? undefined;
      submitted();
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("Synthetic interrupted submission")), { once: true });
      });
    }
    return Response.json({ message: {
      conversation_id: "b".repeat(32), message_id: "c".repeat(32), status: "COMPLETED",
      attachments: [{ text: { content: "Nouvelle conversation autorisée" } }],
    } });
  });
  let finished!: () => void;
  const firstFinished = new Promise<void>((resolve) => { finished = resolve; });
  const route = withApiRoute(async (request, context, response) => {
    try {
      await sendGenieMessage(request, response, "fraim-sales", parseGenieMessageRequest(request), context);
    } finally { finished(); }
  });
  await withHttpApp((app) => app.post("/api/genie/fraim-sales/messages", route), async (baseUrl) => {
    const send = () => networkFetch(`${baseUrl}/api/genie/fraim-sales/messages`, {
      method: "POST", body: JSON.stringify({ content: "Question synthétique" }),
      headers: { "content-type": "application/json", origin: baseUrl,
        "x-forwarded-user": "synthetic-user", "x-forwarded-access-token": "synthetic-token" },
    });
    const interrupted = await send();
    assert.equal(interrupted.status, 200);
    await firstSubmission;
    await interrupted.body!.cancel();
    await firstFinished;
    assert.equal(requestSignal?.aborted, true);
    assert.equal(submissions, 1);

    // Only this explicit new HTTP request can submit again; its quota is available immediately.
    const next = await send();
    assert.equal(next.status, 200);
    const body = await next.text();
    assert.match(body, /event: message_result/);
    assert.match(body, /Nouvelle conversation autorisée/);
    assert.doesNotMatch(body, /synthetic-token|GENIE_UNAVAILABLE/);
    assert.equal(submissions, 2);
  });
});
