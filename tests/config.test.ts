import assert from "node:assert/strict";
import test from "node:test";

import { ConfigurationError } from "../src/lib/errors/app-error";
import { parseAppDisplayConfig, parseServerConfig } from "../src/lib/config/server-config";

test("defaults to an explicit credential-free demo mode", () => {
  const config = parseServerConfig({});
  assert.deepEqual(config, {
    mode: "demo",
    appName: "Databricks App",
    appDescription: "A reusable Databricks App",
    supportContact: {
      name: "Alexis",
      slackUrl: "https://valiuz.slack.com/team/U01C3FT98HE",
    },
    logLevel: "info",
  });
});

test("accepts only a Valiuz Slack support URL", () => {
  assert.throws(
    () => parseServerConfig({ APP_SUPPORT_SLACK_URL: "https://example.com/support" }),
    (error: unknown) =>
      error instanceof ConfigurationError && error.message.includes("Invalid application configuration"),
  );
});

test("presets the direct Slack support contact used by FRAIM", () => {
  const config = parseServerConfig({});

  assert.deepEqual(config.supportContact, {
    name: "Alexis",
    slackUrl: "https://valiuz.slack.com/team/U01C3FT98HE",
  });
});

test("builds display configuration without Databricks runtime variables", () => {
  assert.deepEqual(parseAppDisplayConfig({ APP_MODE: "databricks" }), {
    mode: "databricks",
    appName: "Databricks App",
    appDescription: "A reusable Databricks App",
    supportContact: {
      name: "Alexis",
      slackUrl: "https://valiuz.slack.com/team/U01C3FT98HE",
    },
  });
});

test("requires local credentials in databricks mode", () => {
  assert.throws(
    () => parseServerConfig({ APP_MODE: "databricks" }),
    (error: unknown) => error instanceof ConfigurationError && error.message.includes("DATABRICKS_HOST"),
  );
});

test("builds local CLI OAuth configuration without exposing the URL scheme to the driver", () => {
  const config = parseServerConfig({
    APP_MODE: "databricks",
    DATABRICKS_HOST: "https://dbc.example.cloud.databricks.com",
    DATABRICKS_CONFIG_PROFILE: "analytics-dev",
    DATABRICKS_SQL_WAREHOUSE_ID: "warehouse-id",
    DATABRICKS_CATALOG: "dev-dtm-operating",
    DATABRICKS_SCHEMA: "app_schema",
  });

  assert.equal(config.mode, "databricks");
  if (config.mode === "databricks") {
    assert.equal(config.host, "dbc.example.cloud.databricks.com");
    assert.deepEqual(config.auth, { type: "oauth-u2m-cli", profile: "analytics-dev" });
  }
});

test("keeps a local PAT as an explicit fallback", () => {
  const config = parseServerConfig({
    APP_MODE: "databricks",
    DATABRICKS_HOST: "https://dbc.example.cloud.databricks.com",
    DATABRICKS_TOKEN: "local-token",
    DATABRICKS_SQL_WAREHOUSE_ID: "warehouse-id",
    DATABRICKS_CATALOG: "dev-dtm-operating",
    DATABRICKS_SCHEMA: "app_schema",
  });

  assert.equal(config.mode, "databricks");
  if (config.mode === "databricks") {
    assert.equal(config.host, "dbc.example.cloud.databricks.com");
    assert.deepEqual(config.auth, { type: "pat", token: "local-token" });
  }
});

test("rejects competing local authentication methods", () => {
  assert.throws(
    () =>
      parseServerConfig({
        APP_MODE: "databricks",
        DATABRICKS_HOST: "https://dbc.example.cloud.databricks.com",
        DATABRICKS_CONFIG_PROFILE: "analytics-dev",
        DATABRICKS_TOKEN: "synthetic-token",
        DATABRICKS_SQL_WAREHOUSE_ID: "warehouse-id",
        DATABRICKS_CATALOG: "dev-dtm-operating",
        DATABRICKS_SCHEMA: "app_schema",
      }),
    (error: unknown) =>
      error instanceof ConfigurationError && error.message.includes("cannot both be set"),
  );
});

test("requires one explicit local authentication method", () => {
  assert.throws(
    () =>
      parseServerConfig({
        APP_MODE: "databricks",
        DATABRICKS_HOST: "https://dbc.example.cloud.databricks.com",
        DATABRICKS_SQL_WAREHOUSE_ID: "warehouse-id",
        DATABRICKS_CATALOG: "dev-dtm-operating",
        DATABRICKS_SCHEMA: "app_schema",
      }),
    (error: unknown) =>
      error instanceof ConfigurationError && error.message.includes("DATABRICKS_CONFIG_PROFILE or DATABRICKS_TOKEN"),
  );
});

test("uses Databricks Apps OAuth credentials at runtime", () => {
  const config = parseServerConfig({
    APP_MODE: "databricks",
    DATABRICKS_APP_NAME: "my-app",
    DATABRICKS_HOST: "https://dbc.example.cloud.databricks.com",
    DATABRICKS_CLIENT_ID: "client-id",
    DATABRICKS_CLIENT_SECRET: "client-secret",
    DATABRICKS_SQL_WAREHOUSE_ID: "warehouse-id",
    DATABRICKS_CATALOG: "dev-dtm-operating",
    DATABRICKS_SCHEMA: "app_schema",
  });

  assert.equal(config.mode, "databricks");
  if (config.mode === "databricks") {
    assert.deepEqual(config.auth, {
      type: "oauth-m2m",
      clientId: "client-id",
      clientSecret: "client-secret",
    });
  }
});

test("rejects a catalog outside approved Valiuz data projects", () => {
  assert.throws(
    () =>
      parseServerConfig({
        APP_MODE: "databricks",
        DATABRICKS_HOST: "https://dbc.example.cloud.databricks.com",
        DATABRICKS_CONFIG_PROFILE: "analytics-dev",
        DATABRICKS_SQL_WAREHOUSE_ID: "warehouse-id",
        DATABRICKS_CATALOG: "unmanaged-project",
        DATABRICKS_SCHEMA: "app_schema",
      }),
    (error: unknown) =>
      error instanceof ConfigurationError && error.message.includes("Invalid application configuration"),
  );
});
