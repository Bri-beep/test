import assert from "node:assert/strict";
import test from "node:test";

import {
  checkDatabricksAccess,
  parseDatabricksCliHost,
  parseDatabricksCliVersion,
} from "../scripts/check-databricks";
import { parseServerConfig } from "../src/lib/config/server-config";
import type { DatabricksCliRunner } from "../src/lib/databricks/cli-auth";

function databricksConfig() {
  const config = parseServerConfig({
    APP_MODE: "databricks",
    DATABRICKS_HOST: "https://dbc.example.cloud.databricks.com",
    DATABRICKS_CONFIG_PROFILE: "analytics-dev",
    DATABRICKS_SQL_WAREHOUSE_ID: "warehouse-id",
    DATABRICKS_CATALOG: "dev-dtm-media-pm",
    DATABRICKS_SCHEMA: "app_schema",
  });
  assert.equal(config.mode, "databricks");
  return config;
}

test("accepts CLI versions above the bundle minimum", () => {
  assert.deepEqual(parseDatabricksCliVersion("Databricks CLI v1.12.1"), [1, 12, 1]);
});

test("accepts current and legacy CLI host descriptions", () => {
  const host = "dbc.example.cloud.databricks.com";
  assert.equal(parseDatabricksCliHost(`  ✓ host: https://${host} (from profile)\n`), host);
  assert.equal(parseDatabricksCliHost(`Host: https://${host}\n`), host);
});

test("checks identity, warehouse, catalog and schema without running SQL", async () => {
  const calls: string[][] = [];
  const runner: DatabricksCliRunner = async (args) => {
    calls.push([...args]);
    const operation = args.slice(0, 2).join(" ");
    if (args[0] === "version") return "Databricks CLI v1.12.1";
    if (operation === "auth describe") {
      return "Current configuration:\n  ✓ host: https://dbc.example.cloud.databricks.com (from profile)\n";
    }
    if (operation === "current-user me") return JSON.stringify({ user_name: "analytics@example.com" });
    if (operation === "warehouses get") return JSON.stringify({ name: "team-da-poc", state: "RUNNING" });
    if (operation === "catalogs get") return JSON.stringify({ name: "dev-dtm-media-pm" });
    if (operation === "schemas get") return JSON.stringify({ full_name: "dev-dtm-media-pm.app_schema" });
    if (operation === "tables get") return JSON.stringify({ full_name: args[2] });
    throw new Error(`Unexpected operation: ${operation}`);
  };

  const result = await checkDatabricksAccess(
    databricksConfig(),
    runner,
    ["dev-dtm-media-pm.app_schema.dashboard_source"],
  );

  assert.equal(result.profile, "analytics-dev");
  assert.equal(result.identity, "analytics@example.com");
  assert.equal(result.warehouse, "team-da-poc");
  assert.equal(result.schema, "dev-dtm-media-pm.app_schema");
  assert.equal(result.sourceCount, 1);
  assert.equal(calls.some((args) => args.includes("execute-statement")), false);
  assert.equal(calls.some((args) => args[0] === "tables" && args[1] === "get"), true);
});

test("rejects a CLI profile targeting another workspace", async () => {
  const runner: DatabricksCliRunner = async (args) => {
    if (args[0] === "version") return "Databricks CLI v1.12.1";
    return "  ✓ host: https://another-workspace.gcp.databricks.com (from profile)\n";
  };

  await assert.rejects(
    checkDatabricksAccess(databricksConfig(), runner),
    /targets a different workspace/,
  );
});
