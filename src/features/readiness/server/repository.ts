import { z } from "zod";

import type { DataSource } from "@/lib/config/data-access";
import { quoteQualifiedIdentifier } from "@/lib/databricks/identifiers";
import type { SqlExecutor } from "@/lib/databricks/types";
import { buildSourceAccessQuery } from "@/features/readiness/server/queries";

const emptyRowSchema = z.object({}).loose();

export async function verifySourceAccess(
  executor: SqlExecutor,
  sources: readonly DataSource[],
  requestId?: string,
): Promise<void> {
  await executor.query({
    name: "readiness-declared-sources",
    statement: buildSourceAccessQuery(sources.length),
    parameters: Object.fromEntries(sources.map((source, index) => [`source${index}`, quoteQualifiedIdentifier(source.fullName)])),
    rowSchema: emptyRowSchema,
    requestId,
    maxRows: 1,
  });
}
