import assert from "node:assert/strict";
import test from "node:test";

import type { DemoConfig } from "../src/lib/config/server-config";
import type { SqlExecutor } from "../src/lib/databricks/types";
import { checkConnection } from "../src/features/connection-check/server/service";
import { findCurrentUser } from "../src/features/connection-check/server/repository";

test("connection check stays offline in demo mode", async () => {
  const config: DemoConfig = {
    mode: "demo",
    appName: "Test",
    appDescription: "Test",
    supportContact: { name: "Test", slackUrl: "https://valiuz.slack.com/" },
    logLevel: "info",
  };
  const result = await checkConnection(undefined, {
    config,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });

  assert.deepEqual(result, {
    status: "demo",
    connected: false,
    currentUser: null,
    checkedAt: "2026-01-01T00:00:00.000Z",
  });
});

test("repository owns SQL and validates result rows", async () => {
  const executor: SqlExecutor = {
    query: async (options) => {
      assert.equal(options.name, "current-user");
      assert.match(options.statement, /^SELECT current_user\(\)/);
      return [{ current_user: "service-principal" }] as never[];
    },
  };

  assert.equal(await findCurrentUser(executor, "request-123"), "service-principal");
});
