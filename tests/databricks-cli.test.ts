import assert from "node:assert/strict";
import test from "node:test";

import {
  getDatabricksCliToken,
  parseDatabricksCliToken,
  type DatabricksCliRunner,
} from "../src/lib/databricks/cli-auth";

test("parses unexpired OAuth token metadata without returning the metadata envelope", () => {
  const now = Date.parse("2026-08-21T08:00:00.000Z");
  const token = parseDatabricksCliToken(
    JSON.stringify({
      access_token: "synthetic-access-value",
      token_type: "Bearer",
      expiry: "2026-08-21T09:00:00.000Z",
    }),
    now,
  );

  assert.equal(token.accessToken, "synthetic-access-value");
  assert.equal(token.expiresAt.toISOString(), "2026-08-21T09:00:00.000Z");
});

test("loads an OAuth token from the selected CLI profile", async () => {
  const calls: string[][] = [];
  const runner: DatabricksCliRunner = async (args) => {
    calls.push([...args]);
    return JSON.stringify({
      access_token: "synthetic-access-value",
      expiry: new Date(Date.now() + 60_000).toISOString(),
    });
  };

  const token = await getDatabricksCliToken("analytics-dev", runner);

  assert.equal(token, "synthetic-access-value");
  assert.deepEqual(calls, [[
    "auth",
    "token",
    "--profile",
    "analytics-dev",
    "--output",
    "json",
    "--timeout",
    "30s",
  ]]);
});

test("never includes CLI token output in authentication errors", async () => {
  const runner: DatabricksCliRunner = async () => '{"access_token":"must-not-leak"}';

  await assert.rejects(
    getDatabricksCliToken("analytics-dev", runner),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("analytics-dev") &&
      !error.message.includes("must-not-leak"),
  );
});
