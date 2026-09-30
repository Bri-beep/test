import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "@databricks/appkit";
import { z } from "zod";
import type { DatabricksConfig } from "@/lib/config/server-config";
import type { SqlExecutor, SqlQueryOptions } from "./types";
import { SqlQueryError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/logger";

type Marker = ReturnType<typeof sql.string | typeof sql.number | typeof sql.boolean | typeof sql.timestamp>;
export type AnalyticsQuery = (
  statement: string, parameters: Record<string, Marker>, options: Record<string, unknown>, signal: AbortSignal,
) => Promise<unknown>;
export const analyticsExecution = new AsyncLocalStorage<{ signal: AbortSignal; onFinish: Array<() => void> }>();
let runtimeQuery: AnalyticsQuery | undefined;
export function configureAnalytics(query: AnalyticsQuery) { runtimeQuery = query; }
export function getAnalyticsQuery() { return runtimeQuery; }

const resultSchema = z.object({ data: z.array(z.unknown()), next_chunk_index: z.number().optional() });

export class AppKitSqlExecutor implements SqlExecutor {
  constructor(private readonly config: DatabricksConfig, private readonly analytics: AnalyticsQuery,
    private readonly driver: SqlExecutor) {}

  async query<T>(options: SqlQueryOptions<T>): Promise<T[]> {
    const { name, maxRows = 1_000, rowSchema, requestId } = options;
    const queryLog = logger.child({ queryName: name, requestId });
    const startedAt = performance.now();
    const controller = new AbortController();
    const onFinish: Array<() => void> = [];
    let timer: NodeJS.Timeout | undefined;
    try {
      if (!name || !Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 100_000) throw new Error("Invalid query bounds");
      const sqlPrefix = options.statement.replace(/^(?:\s|--[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/)*/, "");
      if (!/^(SELECT|WITH)\b/i.test(sqlPrefix)) throw new Error("Analytics executor accepts reads only");
      // Select known compatibility exceptions before submission; never retry a native failure.
      if (Array.isArray(options.parameters)) throw new Error("SQL parameters must be named");
      const entries = Object.entries(options.parameters ?? {});
      if (options.transport === "driver" || entries.some(([, value]) => value === null)) {
        return await this.driver.query(options);
      }
      const parameters = Object.fromEntries(entries.map(([key, value]) => {
        if (value instanceof Date) return [key, sql.timestamp(value)];
        if (typeof value === "bigint") return [key, sql.bigint(value)];
        if (typeof value === "number") return [key, sql.number(value)];
        if (typeof value === "boolean") return [key, sql.boolean(value)];
        if (typeof value === "string") return [key, sql.string(value)];
        throw new Error("Unsupported SQL parameter value");
      }));
      const result = await Promise.race([
        analyticsExecution.run({ signal: controller.signal, onFinish }, () => this.analytics(
          options.statement, parameters, {
            catalog: this.config.catalog, schema: this.config.schema,
            row_limit: maxRows, byte_limit: 8 * 1024 * 1024,
            disposition: "INLINE", format: "JSON_ARRAY", wait_timeout: "0s",
          }, controller.signal,
        )),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error("SQL deadline exceeded")); }, this.config.timeoutMs);
        }),
      ]);
      const parsed = resultSchema.parse(result);
      if (parsed.data.length > maxRows || parsed.next_chunk_index !== undefined) throw new Error("SQL result exceeded the inline bound");
      const rows = parsed.data.map((row) => rowSchema.parse(row));
      queryLog.info({ durationMs: performance.now() - startedAt, rowCount: rows.length }, "SQL query completed");
      return rows;
    } catch {
      controller.abort();
      queryLog.error({ durationMs: performance.now() - startedAt }, "SQL query failed");
      throw new SqlQueryError(name);
    } finally {
      clearTimeout(timer);
      onFinish.forEach((finish) => finish());
    }
  }
}
