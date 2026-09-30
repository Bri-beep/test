import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { before } from "node:test";
import { parse } from "yaml";
import { createDatabricksGenieClient } from "../src/features/genie/server/client";
import { genieResourceRequirements, resolveGeniePluginSpaces } from "../src/features/genie/server/config";
import { streamGenieMessage } from "../src/features/genie/server/service";
import { GET as session } from "../src/server/routes/genie/[alias]/session/route";
import { privateGenie } from "../src/server/genie-plugin";
import { startTestGenie } from "./fixtures/genie-appkit";
import { requestHandler } from "./fixtures/http";


async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of stream) result.push(item);
  return result;
}

const spaceId = "a".repeat(32);
const conversationId = "b".repeat(32);
const messageId = "c".repeat(32);
before(async () => { await startTestGenie({ sales: spaceId }); });

const complete = (withStatementId = true) => ({ message: {
  conversation_id: conversationId, message_id: messageId, status: "COMPLETED",
  attachments: [{ attachment_id: "query-1", query: { query: "SELECT synthetic", ...(withStatementId ? { statement_id: "statement-1" } : {}) } },
    { text: { content: "Réponse synthétique" } }],
} });

test("AppKit preserves exact cells and 500-row truncation, including attachments without statement IDs", async () => {
  for (const withStatementId of [true, false]) {
    const methods: string[] = [];
    const client = createDatabricksGenieClient({ workspaceUrl: "https://example.invalid", accessToken: "synthetic-token",
      fetchImplementation: async (_url, init) => {
        assert.equal(new Headers(init?.headers).get("authorization"), "Bearer synthetic-token");
        methods.push(init!.method!);
        if (init?.method === "POST") return Response.json(complete(withStatementId));
        return Response.json({ statement_response: { ...(withStatementId ? {} : { statement_id: "statement-1" }), status: { state: "SUCCEEDED" },
          manifest: { total_row_count: 501, schema: { columns: [{ name: "value", type_name: "STRING" }] } },
          result: { data_array: Array.from({ length: 501 }, (_, i) => [i === 0 ? "null" : i === 1 ? null : "{\"key\":true}"]),
            next_chunk_internal_link: "https://signed.example.invalid/private-result" } } });
      },
    });
    const events = await collect(streamGenieMessage({ content: "Question" }, { client, alias: "sales", spaceId, requestId: "safe-result" }));
    assert.deepEqual(methods, ["POST", "GET"]);
    const result = events.find((event) => event.type === "query_result");
    assert.ok(result?.type === "query_result");
    assert.equal(result.data.result.data_array.length, 500);
    assert.equal(result.statementId, "statement-1");
    assert.ok(!("state" in result.data));
    assert.equal(result.truncated, true);
    assert.deepEqual(result.data.result.data_array.slice(0, 3), [["null"], [null], ["{\"key\":true}"]]);
    assert.doesNotMatch(JSON.stringify(events), /synthetic-token|signed\.example/);
    assert.equal(events.at(-1)?.type, "query_result");
  }
});

for (const phase of ["submit", "result"] as const) {
  test(`AppKit cancels a pending ${phase} call without replaying the question`, async () => {
    let reached!: () => void;
    const started = new Promise<void>((resolve) => { reached = resolve; });
    const controller = new AbortController();
    const methods: string[] = [];
    let cancelled = false;
    const client = createDatabricksGenieClient({ workspaceUrl: "https://example.invalid", accessToken: "synthetic-token",
      fetchImplementation: async (_url, init) => {
        methods.push(init!.method!);
        if (phase === "result" && init?.method === "POST") return Response.json(complete());
        reached();
        return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => {
          cancelled = true; reject(new DOMException("private error", "AbortError"));
        }, { once: true }));
      },
    });
    const completed = collect(streamGenieMessage({ content: "Private question" }, {
      client, alias: "sales", spaceId, requestId: "interrupted", signal: controller.signal,
    }));
    await started;
    controller.abort();
    const events = await completed;
    assert.equal(cancelled, true);
    assert.equal(methods.filter((method) => method === "POST").length, 1);
    assert.equal(events.at(-1)?.type, "error");
    assert.equal(events.some((event) => event.type === "message_result"), phase === "result");
    assert.doesNotMatch(JSON.stringify(events), /private error|synthetic-token/);
    assert.doesNotMatch(JSON.stringify(events.filter((event) => event.type === "error")), /Private question/);
    const answer = events.find((event) => event.type === "message_result");
    if (phase === "result") assert.equal(answer?.message.content, "Private question");
  });
}

test("the total deadline bounds the submission itself and the retryable SDK error cannot resubmit", async () => {
  let submissions = 0;
  const client = createDatabricksGenieClient({ workspaceUrl: "https://example.invalid", accessToken: "synthetic-token",
    fetchImplementation: async (_url, init) => {
      submissions++;
      return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("private timeout")), { once: true }));
    },
  });
  const events = await collect(streamGenieMessage({ content: "Question" }, {
    client, alias: "sales", spaceId, requestId: "deadline", polling: { timeoutMs: 20 },
  }));
  assert.equal(submissions, 1);
  assert.equal(events.at(-1)?.type, "error");
  const failure = events.at(-1);
  assert.ok(failure?.type === "error");
  assert.equal(failure.code, "GENIE_TIMEOUT");
});

test("the plugin exposes no routes and resource metadata agrees with the declared Genie bindings", async () => {
  const definition = privateGenie(resolveGeniePluginSpaces({ APP_MODE: "demo" }));
  const plugin = new definition.plugin(definition.config);
  plugin.injectRoutes();
  const config = JSON.parse(await readFile("config/genie-spaces.json", "utf8"));
  const manifest = parse(await readFile("app.yaml", "utf8"));
  assert.deepEqual(genieResourceRequirements().required.map((resource) => ({ key: resource.resourceKey, env: resource.fields.id.env, permission: resource.permission })),
    config.spaces.map((space: { key: string; environmentVariable: string }) => ({ key: space.key, env: space.environmentVariable, permission: "CAN_RUN" })));
  for (const resource of genieResourceRequirements().required) {
    assert.equal(manifest.env.find((item: { name: string }) => item.name === resource.fields.id.env)?.valueFrom, resource.resourceKey);
  }
});

test("session identity stays private and a deployed request without OBO fails before any API call", async (t) => {
  const original = { ...process.env };
  t.after(() => { process.env = original; });
  Object.assign(process.env, { APP_MODE: "databricks", DATABRICKS_APP_NAME: "offline", DATABRICKS_HOST: "https://example.invalid" });
  const response = await requestHandler(session, new Request("https://example.invalid/api/genie/sales/session"), "/api/genie/:alias/session");
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await response.json()).error.code, "GENIE_AUTH_REQUIRED");
  const authenticated = await requestHandler(session, new Request("https://example.invalid/api/genie/sales/session", {
    headers: { "x-forwarded-user": "synthetic-user", "x-forwarded-access-token": "synthetic-token" },
  }), "/api/genie/:alias/session");
  const payload = await authenticated.json();
  assert.equal(payload.mode, "obo");
  assert.doesNotMatch(JSON.stringify(payload), /synthetic-token/);
});
