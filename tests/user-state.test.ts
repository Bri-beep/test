import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { analysisInputSchema, DEFAULT_PREFERENCES } from "../src/features/user-state/contract";
import { resolveUserStateConfig, type UserStateConfig } from "../src/features/user-state/server/config";
import { MemoryUserStateRepository, SqlUserStateRepository, type StateWrite } from "../src/features/user-state/server/repository";
import { readMutation, resolveOwner } from "../src/features/user-state/server/request";
import { UserStateService } from "../src/features/user-state/server/service";
import { userStateRoutes } from "../src/features/user-state/server/route";
import { GET_STATE, LIST_STATE } from "../src/features/user-state/server/queries";
import { parseDataAccessManifest } from "../src/lib/config/data-access";
import type { SqlExecutor, SqlQueryOptions } from "../src/lib/databricks/types";
import { withApiRoute } from "../src/lib/http/with-api-route";
import { requestHandler } from "./fixtures/http";

const analysis = {
  title: "Région Nord", note: "Ma note",
  definition: { schemaVersion: 1, view: "example", filters: { region: "north", periodDays: 7 } },
};
const tables = {
  analyses: "dev-dtm-media-pm.app_user_state.saved_analyses_v1",
  preferences: "dev-dtm-media-pm.app_user_state.user_preferences_v1",
};
const config: UserStateConfig = { mode: "databricks", appId: "example:dev", origin: "https://app.example", tables };
function fixture() {
  const repository = new MemoryUserStateRepository();
  let clock = Date.parse("2026-09-21T12:00:00.000Z");
  return { repository, service: new UserStateService(repository, () => new Date(clock++)) };
}
const hasCode = (code: string) => (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === code;
function request(method = "GET", body?: unknown, user = "user-a", id?: string) {
  return new Request(`https://app.example/api/saved-analyses${id ? `/${id}` : ""}`, {
    method,
    headers: { "x-forwarded-user": user, origin: config.origin, "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

test("personal definitions accept filters only and reject unknown versions, URLs, SQL and owners", () => {
  assert.equal(analysisInputSchema.safeParse(analysis).success, true);
  for (const extra of [{ owner: "other" }, { sql: "select secret" }, { result: [1, 2] }, { url: "https://evil.test" }]) {
    assert.equal(analysisInputSchema.safeParse({ ...analysis, ...extra }).success, false);
  }
  assert.equal(analysisInputSchema.safeParse({ ...analysis, definition: { ...analysis.definition, schemaVersion: 2 } }).success, false);
  assert.equal(analysisInputSchema.safeParse({ ...analysis, title: "   " }).success, false);
  const comparison = { currentValue: 1200, referenceValue: 1000, absoluteChange: 200 };
  assert.equal(analysisInputSchema.safeParse({ ...analysis, context: { comparison } }).success, false);
  assert.equal(analysisInputSchema.safeParse({ ...analysis, definition: { ...analysis.definition, comparison } }).success, false);
});

test("CRUD and preferences survive service recreation and remain private to their owner", async () => {
  const { service, repository } = fixture();
  const id = randomUUID();
  await service.put("alice", id, analysis);
  assert.equal((await service.get("alice", id)).title, analysis.title);
  assert.deepEqual((await service.list("bob")).items, []);
  await assert.rejects(service.get("bob", id), hasCode("USER_STATE_NOT_FOUND"));
  await assert.rejects(service.remove("bob", id), hasCode("USER_STATE_NOT_FOUND"));
  await service.put("alice", id, { ...analysis, title: "Nouveau nom" });
  assert.equal((await service.list("alice")).items.length, 1);
  assert.equal((await service.get("alice", id)).title, "Nouveau nom");
  await service.putPreferences("alice", { ...DEFAULT_PREFERENCES, defaultPeriodDays: 90 });
  const newService = new UserStateService(repository);
  assert.equal((await newService.preferences("alice")).defaultPeriodDays, 90);
  assert.deepEqual(await newService.preferences("bob"), DEFAULT_PREFERENCES);
  await service.remove("alice", id);
  assert.deepEqual((await service.list("alice")).items, []);
  await assert.rejects(service.get("alice", id), hasCode("USER_STATE_NOT_FOUND"));
});

test("concurrent first writes and replays yield one winner per logical entity", async () => {
  const { repository, service } = fixture();
  const id = randomUUID();
  const base: StateWrite = {
    entity_id: id, payload_json: JSON.stringify(analysis), updated_at: "2026-09-21T12:00:00.000Z",
    version_id: "a", deleted: false,
  };
  await Promise.all([
    repository.append("analyses", "alice", base),
    repository.append("analyses", "alice", { ...base, version_id: "b", payload_json: JSON.stringify({ ...analysis, title: "Winner" }) }),
    repository.append("analyses", "alice", base),
  ]);
  assert.equal((await service.list("alice")).items.length, 1);
  assert.equal((await service.get("alice", id)).title, "Winner");
  await repository.append("analyses", "alice", { ...base, version_id: "c", deleted: true, payload_json: "{}" });
  await repository.append("analyses", "alice", base);
  assert.deepEqual((await service.list("alice")).items, []);
});

test("pagination is bounded and covers more than one page without leaking other users", async () => {
  const { service } = fixture();
  for (let index = 0; index < 53; index++) await service.put("alice", randomUUID(), analysis);
  await service.put("bob", randomUUID(), analysis);
  const first = await service.list("alice");
  assert.equal(first.items.length, 50);
  assert.ok(first.nextCursor);
  const second = await service.list("alice", first.nextCursor);
  assert.equal(second.items.length, 3);
  assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 53);
  await assert.rejects(service.list("alice", "' or true"), hasCode("INVALID_REQUEST"));
});

test("proxy identity is mandatory and scoped to app and environment; demo ignores supplied identity", async () => {
  async function ownerFor(input: Request, selectedConfig = config): Promise<string> {
    const response = await requestHandler(withApiRoute((incoming) => ({ owner: resolveOwner(incoming, selectedConfig) })), input);
    assert.equal(response.status, 200);
    return (await response.json()).owner;
  }
  const owner = await ownerFor(request());
  assert.match(owner, /^[a-f0-9]{64}$/);
  assert.notEqual(owner, await ownerFor(request("GET", undefined, "user-b")));
  assert.notEqual(owner, await ownerFor(request(), { ...config, appId: "example:prod" }));
  assert.notEqual(owner, await ownerFor(request(), { ...config, appId: "other:dev" }));
  const missing = await requestHandler(withApiRoute((incoming) => resolveOwner(incoming, config)), new Request(config.origin));
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).error.code, "USER_STATE_AUTH_REQUIRED");
  const demo = { ...config, mode: "demo" as const };
  assert.equal(await ownerFor(request(), demo), await ownerFor(request("GET", undefined, "spoofed"), demo));
});

test("config fails closed outside local demo or trusted Apps runtime", () => {
  const demo = { USER_STATE_ENABLED: "true", APP_MODE: "demo", NODE_ENV: "test" as const, USER_STATE_ORIGIN: "http://127.0.0.1:3100" };
  assert.equal(resolveUserStateConfig(demo).mode, "demo");
  assert.throws(() => resolveUserStateConfig({ ...demo, USER_STATE_ENABLED: "false" }), hasCode("USER_STATE_DISABLED"));
  assert.throws(() => resolveUserStateConfig({ ...demo, NODE_ENV: "production" }));
  assert.throws(() => resolveUserStateConfig({ ...demo, DATABRICKS_APP_NAME: "deployed" }));
  assert.throws(() => resolveUserStateConfig({ ...demo, APP_MODE: "databricks" }));
  assert.throws(() => resolveUserStateConfig({ ...demo, USER_STATE_ORIGIN: "http://remote.example" }));
  const manifest = parseDataAccessManifest({ project: "dev-dtm-media-pm", sources: [], personalState: tables });
  const deployed = { ...demo, APP_MODE: "databricks", DATABRICKS_APP_NAME: "my-app", USER_STATE_NAMESPACE: "dev", USER_STATE_ORIGIN: config.origin };
  assert.equal(resolveUserStateConfig(deployed, manifest).appId, "my-app:dev");
  assert.throws(() => resolveUserStateConfig({ ...deployed, USER_STATE_ORIGIN: "http://app.example" }, manifest));
  assert.throws(() => resolveUserStateConfig({ ...deployed, USER_STATE_NAMESPACE: "" }, manifest));
});

test("mutations require exact configured origin and bound the parsed JSON payload", async () => {
  const route = withApiRoute((incoming) => readMutation(incoming, config));
  const valid = await requestHandler(route, request("PUT", analysis));
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), analysis);
  const forged = request("PUT", analysis);
  forged.headers.set("origin", "https://evil.test");
  forged.headers.set("x-forwarded-host", "evil.test");
  const absent = request("PUT", analysis); absent.headers.delete("origin");
  const crossSite = request("PUT", analysis); crossSite.headers.set("sec-fetch-site", "cross-site");
  const wrongType = request("PUT", analysis); wrongType.headers.set("content-type", "text/plain");
  const malformed = new Request(config.origin, {
    method: "PUT", headers: { origin: config.origin, "content-type": "application/json" },
    body: "{",
  });
  for (const invalid of [forged, absent, crossSite, wrongType, malformed,
    request("PUT", { note: "x".repeat(17 * 1024) }), request("PUT", { note: "é".repeat(9 * 1024) })]) {
    const response = await requestHandler(route, invalid);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "INVALID_REQUEST");
  }
});

test("routes preserve common envelopes and no-store on success, validation and identity errors", async () => {
  const { service } = fixture();
  const routes = userStateRoutes(() => ({ config, service }));
  const id = randomUUID();
  const path = "/api/saved-analyses/:id";
  const saved = await requestHandler(routes.put, request("PUT", analysis, "user-a", id), path);
  const found = await requestHandler(routes.get, request("GET", undefined, "user-a", id), path);
  assert.equal(saved.status, 200);
  assert.equal(found.status, 200);
  const foreign = await requestHandler(routes.get, request("GET", undefined, "other", id), path);
  assert.equal(foreign.status, 404);
  assert.equal((await foreign.json()).error.code, "USER_STATE_NOT_FOUND");
  const invalid = await requestHandler(routes.put, request("PUT", { ...analysis, owner: "other" }, "user-a", id), path);
  assert.equal(invalid.status, 400);
  const unauthenticated = await requestHandler(routes.get, new Request(`${config.origin}/api/saved-analyses/${id}`), path);
  assert.equal(unauthenticated.status, 401);
  for (const response of [saved, found, foreign, invalid, unauthenticated]) {
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.ok(response.headers.get("x-request-id"));
  }
  const remove = await requestHandler(routes.remove, request("DELETE", {}, "user-a", id), path);
  assert.equal(remove.status, 200);
  assert.equal((await requestHandler(routes.get, request("GET", undefined, "user-a", id), path)).status, 404);
});

test("SQL binds app, owner, entity and payload; tombstones are ranked before filtering", async () => {
  const calls: SqlQueryOptions<unknown>[] = [];
  const executor: SqlExecutor = { async query<T>(options: SqlQueryOptions<T>): Promise<T[]> { calls.push(options); return []; } };
  const repository = new SqlUserStateRepository(executor, "my-app:dev", tables, "request-id");
  await repository.list("opaque-owner", "");
  await repository.get("analyses", "opaque-owner", "id");
  await repository.append("preferences", "opaque-owner", {
    entity_id: "settings", version_id: "version", updated_at: "2026-09-21T12:00:00.000Z", deleted: false,
    payload_json: "'quoted payload'",
  });
  for (const call of calls) {
    assert.equal(call.parameters?.appId, "my-app:dev");
    assert.equal(call.parameters?.owner, "opaque-owner");
    assert.equal(call.requestId, "request-id");
    assert.ok(call.maxRows && call.maxRows <= 51);
    assert.doesNotMatch(call.statement, /opaque-owner|my-app|quoted payload/);
  }
  assert.match(LIST_STATE, /where app_id = :appId and owner_id = :owner/);
  assert.match(LIST_STATE, /where position = 1 and deleted = false/);
  assert.match(GET_STATE, /entity_id = :id/);
  assert.equal(calls[2]!.parameters?.payload, "'quoted payload'");
});

test("ambiguous SQL writes are not retried or reported as successful", async () => {
  let attempts = 0;
  const executor: SqlExecutor = { async query() { attempts++; throw new Error("timeout after commit"); } };
  const service = new UserStateService(new SqlUserStateRepository(executor, "app:dev", tables));
  await assert.rejects(service.put("alice", randomUUID(), analysis), hasCode("USER_STATE_UNAVAILABLE"));
  assert.equal(attempts, 1);
});
