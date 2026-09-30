import type { z } from "zod";

export type SqlParameter = null | boolean | number | bigint | Date | string;

export type SqlQueryOptions<T> = {
  name: string;
  /** Preserve driver-specific values, such as JSON-looking STRING cells. */
  transport?: "driver";
  statement: string;
  /** Named values for native :parameter markers; never interpolate them into SQL. */
  parameters?: Readonly<Record<string, SqlParameter>>;
  rowSchema: z.ZodType<T>;
  requestId?: string;
  maxRows?: number;
};

export interface SqlExecutor {
  query<T>(options: SqlQueryOptions<T>): Promise<T[]>;
}
