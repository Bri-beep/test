import assert from "node:assert/strict";
import test from "node:test";

import type { DataAccessManifest } from "../src/lib/config/data-access";
import type { DatabricksConfig, DemoConfig } from "../src/lib/config/server-config";
import type { SqlExecutor } from "../src/lib/databricks/types";
import { checkReadiness } from "../src/features/readiness/server/service";

const dataAccess: DataAccessManifest = {
  project: "dev-dtm-media-pm",
  sources: [
    {
      name: "campaign-performance",
      fullName: "dev-dtm-media-pm.analytics.campaign_performance",
      purpose: "Dashboard campaign performance",
    },
    {
      name: "campaign-budget",
      fullName: "dev-dtm-media-pm.analytics.campaign_budget",
      purpose: "Dashboard campaign budget",
    },
  ],
};

test("readiness stays offline in demo mode", async () => {
  const config: DemoConfig = {
    mode: "demo",
    appName: "Test",
    appDescription: "Test",
    supportContact: { name: "Test", slackUrl: "https://valiuz.slack.com/" },
    logLevel: "info",
  };

  const result = await checkReadiness(undefined, {
    config,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });

  assert.deepEqual(result, {
    status: "demo",
    ready: false,
    sourceCount: 0,
    checkedAt: "2026-01-01T00:00:00.000Z",
  });
});

test("readiness binds a qualified source name as an identifier parameter", async () => {
  const config: DatabricksConfig = {
    mode: "databricks",
    appName: "Test",
    appDescription: "Test",
    supportContact: { name: "Test", slackUrl: "https://valiuz.slack.com/" },
    logLevel: "info",
    host: "dbc.example.cloud.databricks.com",
    warehouseId: "warehouse-id",
    catalog: "dev-dtm-media-pm",
    schema: "analytics",
    timeoutMs: 30_000,
    auth: { type: "oauth-u2m-cli", profile: "analytics-dev" },
  };
  const executor: SqlExecutor = {
    query: async (options) => {
      assert.equal(options.name, "readiness-declared-sources");
      assert.equal(
        options.statement,
        "SELECT 1 AS accessible FROM IDENTIFIER(:source0) WHERE FALSE UNION ALL " +
          "SELECT 1 AS accessible FROM IDENTIFIER(:source1) WHERE FALSE",
      );
      assert.deepEqual(options.parameters, {
        source0: "`dev-dtm-media-pm`.`analytics`.`campaign_performance`",
        source1: "`dev-dtm-media-pm`.`analytics`.`campaign_budget`",
      });
      assert.equal(options.maxRows, 1);
      return [];
    },
  };

  const result = await checkReadiness("request-123", {
    config,
    dataAccess,
    executor,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });

  assert.deepEqual(result, {
    status: "ok",
    ready: true,
    sourceCount: 2,
    checkedAt: "2026-01-01T00:00:00.000Z",
  });
});

test("readiness rejects a manifest targeting another project", async () => {
  const config: DatabricksConfig = {
    mode: "databricks",
    appName: "Test",
    appDescription: "Test",
    supportContact: { name: "Test", slackUrl: "https://valiuz.slack.com/" },
    logLevel: "info",
    host: "dbc.example.cloud.databricks.com",
    warehouseId: "warehouse-id",
    catalog: "dev-dtm-operating",
    schema: "analytics",
    timeoutMs: 30_000,
    auth: { type: "oauth-u2m-cli", profile: "analytics-dev" },
  };

  await assert.rejects(checkReadiness(undefined, { config, dataAccess }), /must match/);
});
