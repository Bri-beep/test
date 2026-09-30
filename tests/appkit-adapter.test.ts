import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { z } from "zod";
import { AppKitSqlExecutor } from "../src/lib/databricks/appkit-executor";
import { DatabricksSqlExecutor } from "../src/lib/databricks/sql";
import type IDBSQLClient from "@databricks/sql/dist/contracts/IDBSQLClient";
import type { ExecuteStatementOptions } from "@databricks/sql/dist/contracts/IDBSQLSession";
import type { DatabricksConfig } from "../src/lib/config/server-config";
import type { SqlExecutor } from "../src/lib/databricks/types";

const config: DatabricksConfig = {
  mode: "databricks", appName: "test", appDescription: "", supportContact: { name: "test", slackUrl: "https://valiuz.slack.com" },
  logLevel: "error", host: "example.invalid", warehouseId: "a".repeat(16), catalog: "dev-dtm-operating", schema: "test",
  timeoutMs: 15, auth: { type: "pat", token: "synthetic" },
};
const rowSchema = z.object({ value: z.number() });
const query = { name: "bounded-read", statement: "SELECT :value AS value", parameters: { value: 7 }, rowSchema, maxRows: 1 };
const noDriver: SqlExecutor = { async query() { throw new Error("Driver must not be used"); } };

test("named binding passes SQL unchanged, including repeated markers, literals and comments", async () => {
  const statement = "SELECT '?', ':value', `?`, :value -- ?\n /* :other */ WHERE x = :value";
  const value = "x'; DROP TABLE y --";
  const executor = new AppKitSqlExecutor(config, async (sqlText, parameters) => {
    assert.equal(sqlText, statement);
    assert.deepEqual(Object.keys(parameters), ["value"]);
    assert.equal(parameters.value.value, value);
    assert.equal(parameters.value.__sql_type, "STRING");
    return { data: [] };
  }, noDriver);
  await executor.query({ ...query, statement, parameters: { value } });
});

test("AppKit adapter binds values, enforces row validation and rejects excess rows", async () => {
  const executor = new AppKitSqlExecutor(config, async (statement, parameters, options, signal) => {
    assert.equal(statement, "SELECT :value AS value");
    assert.equal(parameters.value.value, "7");
    assert.equal(options.row_limit, 1);
    assert.equal(options.disposition, "INLINE");
    assert.equal(options.catalog, "dev-dtm-operating");
    assert.ok(signal instanceof AbortSignal);
    return { data: [{ value: 7 }] };
  }, noDriver);
  assert.deepEqual(await executor.query(query), [{ value: 7 }]);
  for (const data of [[{ value: "invalid" }], [{ value: 1 }, { value: 2 }]]) {
    const invalid = new AppKitSqlExecutor(config, async () => ({ data }), noDriver);
    await assert.rejects(invalid.query(query), { code: "SQL_QUERY_FAILED" });
  }
  await assert.rejects(executor.query({ ...query, statement: "DELETE FROM test" }), { code: "SQL_QUERY_FAILED" });
});

test("deadline aborts native execution and never retries or falls back", async () => {
  let calls = 0;
  let signal: AbortSignal | undefined;
  const executor = new AppKitSqlExecutor(config, async (_sql, _params, _options, abort) => {
    calls++; signal = abort;
    return new Promise(() => {});
  }, noDriver);
  await assert.rejects(executor.query(query), { code: "SQL_QUERY_FAILED" });
  assert.equal(calls, 1);
  assert.equal(signal?.aborted, true);
});

test("null and exact STRING exceptions select the driver before submission", async () => {
  let calls = 0;
  const driver: SqlExecutor = { async query(options) { calls++; return [options.rowSchema.parse({ value: 8 })]; } };
  const executor = new AppKitSqlExecutor(config, async () => { throw new Error("Must not submit"); }, driver);
  await executor.query({ ...query, parameters: { value: null } });
  await executor.query({ ...query, transport: "driver" });
  assert.equal(calls, 2);
  await assert.rejects(executor.query({ ...query, transport: "driver", maxRows: 0 }), { code: "SQL_QUERY_FAILED" });
  await assert.rejects(executor.query({ ...query, parameters: { value: null }, statement: "DELETE FROM test WHERE x = :value" }), { code: "SQL_QUERY_FAILED" });
  assert.equal(calls, 2);
});

test("legacy parameter arrays are rejected before either transport submits", async () => {
  let submissions = 0;
  const driver: SqlExecutor = { async query() { submissions++; return []; } };
  const executor = new AppKitSqlExecutor(config, async () => { submissions++; return { data: [] }; }, driver);
  // @ts-expect-error Arrays are no longer part of the 2.0 authoring contract.
  await assert.rejects(executor.query({ ...query, parameters: [7] }), { code: "SQL_QUERY_FAILED" });
  assert.equal(submissions, 0);
  const direct = driverFixture([]);
  // @ts-expect-error The private driver uses the same named authoring contract.
  await assert.rejects(direct.executor.query({ ...query, parameters: [7] }), { code: "SQL_QUERY_FAILED" });
  assert.equal(direct.calls.length, 0);
});

function driverFixture(rows: unknown[], failure?: Error, nextChunks: unknown[][] = []) {
  const calls: { statement: string; options: ExecuteStatementOptions }[] = [];
  const cleanup: string[] = [];
  const fetches: number[] = [];
  const chunks = [rows, ...nextChunks];
  const operation = {
    async fetchChunk(options: { maxRows: number }) {
      fetches.push(options.maxRows);
      return chunks.shift() ?? [];
    },
    async hasMoreRows() { return chunks.length > 0; },
    async cancel() { cleanup.push("cancel"); },
    async close() { cleanup.push("operation"); },
  };
  const client = {
    async openSession() {
      return {
        async executeStatement(statement: string, options: ExecuteStatementOptions) {
          calls.push({ statement, options });
          if (failure) throw failure;
          return operation;
        },
        async close() { cleanup.push("session"); },
      };
    },
    async close() { cleanup.push("client"); },
  } as unknown as IDBSQLClient;
  return { calls, cleanup, fetches, executor: new DatabricksSqlExecutor(config, async () => client) };
}

test("driver exceptions bind native names and preserve null and JSON-looking STRING values", async () => {
  const { calls, cleanup, executor } = driverFixture([{ value: "{\"exact\":true}" }]);
  const parameters = { value: null, source: "`dev-dtm-operating`.`analytics`.`example`" };
  const statement = "SELECT :value AS value FROM IDENTIFIER(:source)";
  const result = await executor.query({ ...query, statement, parameters, rowSchema: z.object({ value: z.string() }) });
  assert.deepEqual(result, [{ value: "{\"exact\":true}" }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].statement, statement);
  assert.deepEqual(calls[0].options.namedParameters, parameters);
  assert.equal(calls[0].options.ordinalParameters, undefined);
  assert.deepEqual(cleanup, ["operation", "session", "client"]);
});

test("driver rejects invalid rows and bounds, then cancels and releases resources", async () => {
  for (const rows of [[{ value: "invalid" }], [{ value: 1 }, { value: 2 }]]) {
    const { executor, cleanup } = driverFixture(rows);
    await assert.rejects(executor.query(query), { code: "SQL_QUERY_FAILED" });
    assert.deepEqual(cleanup, ["cancel", "operation", "session", "client"]);
  }
  const invalid = driverFixture([]);
  await assert.rejects(invalid.executor.query({ ...query, maxRows: 0 }), { code: "SQL_QUERY_FAILED" });
  assert.equal(invalid.calls.length, 0);
});

test("driver accumulates bounded chunks and stops at the first excess row without returning partial data", async () => {
  const bounded = driverFixture([{ value: 1 }], undefined, [[{ value: 2 }]]);
  assert.deepEqual(await bounded.executor.query({ ...query, maxRows: 2 }), [{ value: 1 }, { value: 2 }]);
  assert.deepEqual(bounded.fetches, [3, 2]);
  const oversized = driverFixture([{ value: 1 }], undefined, [[{ value: 2 }], [{ value: 3 }]]);
  await assert.rejects(oversized.executor.query(query), { code: "SQL_QUERY_FAILED" });
  assert.deepEqual(oversized.fetches, [2, 1]);
  assert.equal(oversized.calls.length, 1);
  assert.deepEqual(oversized.cleanup, ["cancel", "operation", "session", "client"]);
});

test("driver bounds the whole fetch phase and cancels without submitting again", async () => {
  const cleanup: string[] = [];
  let submissions = 0;
  const client = {
    async openSession() { return {
      async executeStatement() {
        submissions++;
        return {
          async fetchChunk() { return new Promise<object[]>(() => {}); },
          async cancel() { cleanup.push("cancel"); },
          async close() { cleanup.push("operation"); },
        };
      },
      async close() { cleanup.push("session"); },
    }; },
    async close() { cleanup.push("client"); },
  } as unknown as IDBSQLClient;
  const executor = new DatabricksSqlExecutor(config, async () => client);
  await assert.rejects(executor.query(query), { code: "SQL_QUERY_FAILED" });
  assert.equal(submissions, 1);
  assert.deepEqual(cleanup, ["cancel", "operation", "session", "client"]);
});

test("private writes retain named parameters and do not replay an ambiguous failure", async () => {
  const { executor, calls, cleanup } = driverFixture([], new Error("commit status unknown"));
  const statement = "INSERT INTO IDENTIFIER(:table) VALUES (:owner, :payload)";
  const parameters = { table: "`dev-dtm-operating`.`analytics`.`preferences`", owner: "opaque-owner", payload: "{\"theme\":\"dark\"}" };
  await assert.rejects(executor.query({ ...query, statement, parameters }), { code: "SQL_QUERY_FAILED" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].statement, statement);
  assert.deepEqual(calls[0].options.namedParameters, parameters);
  assert.deepEqual(cleanup, ["session", "client"]);
});

test("installed AppKit analytics passes the offline package contract", () => {
  execFileSync(process.execPath, ["--import", "tsx", "tests/fixtures/appkit-contract.ts"], {
    encoding: "utf8", timeout: 30_000,
    env: { ...process.env, NODE_ENV: "test", DATABRICKS_HOST: "https://example.invalid", DATABRICKS_WAREHOUSE_ID: "a".repeat(16),
      OTEL_EXPORTER_OTLP_ENDPOINT: "" },
  });
});
