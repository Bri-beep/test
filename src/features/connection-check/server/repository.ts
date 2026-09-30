import { z } from "zod";

import type { SqlExecutor } from "@/lib/databricks/types";
import { CURRENT_USER_QUERY } from "@/features/connection-check/server/queries";

const currentUserRowSchema = z.object({ current_user: z.string() });

export async function findCurrentUser(executor: SqlExecutor, requestId?: string): Promise<string> {
  const rows = await executor.query({
    name: "current-user",
    statement: CURRENT_USER_QUERY,
    rowSchema: currentUserRowSchema,
    requestId,
    maxRows: 1,
  });
  return rows[0]?.current_user ?? "unknown";
}
