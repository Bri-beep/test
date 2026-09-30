// Optional feature slice. The SQL stays in the generated business repository.
export function comparisonTemplates(feature, source, { pascal, upper }) {
  const { slug, title, question, metric, comparison } = feature;
  const breakdown = Boolean(comparison.breakdownColumn);
  const date = `\`${comparison.dateColumn}\``;
  const dimension = breakdown ? `CAST(\`${comparison.breakdownColumn}\` AS STRING)` : "CAST(NULL AS STRING)";
  const sum = metric.aggregation === "count" ? "COUNT(*)" : `SUM(\`${metric.column}\`)`;
  const count = metric.aggregation === "count" ? "COUNT(*)" : `COUNT(\`${metric.column}\`)`;
  const group = `${date}${breakdown ? `, \`${comparison.breakdownColumn}\`` : ""}`;
  const queryPart = (period) => `SELECT '${period}' AS period, CAST(${date} AS STRING) AS day, ${dimension} AS segment,
  CAST(${sum} AS DOUBLE) AS value_sum, CAST(COUNT(*) AS DOUBLE) AS row_count, CAST(${count} AS DOUBLE) AS value_count
FROM IDENTIFIER(:source)
WHERE ${date} >= CAST(:${period}Start AS DATE) AND ${date} < CAST(:${period}End AS DATE)
GROUP BY ${group}`;
  const query = `${queryPart("current")}\nUNION ALL\n${queryPart("reference")}\nORDER BY period, day, segment\nLIMIT 1001`;
  const options = JSON.stringify({ label: metric.label, unit: metric.unit, aggregation: metric.aggregation, breakdown });
  const path = `src/features/${slug}`;
  const files = new Map();
  files.set(`${path}/contract.ts`, `export { comparisonResultSchema as ${pascal}Schema } from "@/features/period-comparison/contract";
export type { ComparisonResult as ${pascal}Result } from "@/features/period-comparison/contract";
`);
  files.set(`${path}/server/queries.ts`, `// Requires a DATE column in the agreed business calendar. Review before real-data use.
// The extra row detects oversized results; partial results are never displayed.
export const ${upper}_QUERY = ${JSON.stringify(query)};
`);
  files.set(`${path}/server/repository.ts`, `import { comparisonRowSchema, MAX_COMPARISON_ROWS } from "@/features/period-comparison/contract";
import { resolvePeriods, shiftDate, type PeriodSelection } from "@/features/period-comparison/periods";
import { ensureComparisonBounds } from "@/features/period-comparison/server/limits";
import { ${upper}_QUERY } from "./queries";
import { quoteQualifiedIdentifier } from "@/lib/databricks/identifiers";
import type { SqlExecutor } from "@/lib/databricks/types";

export async function load${pascal}(executor: SqlExecutor, source: string, selection: PeriodSelection, requestId?: string) {
  const periods = resolvePeriods(selection);
  const identifier = quoteQualifiedIdentifier(source);
  const rows = await executor.query({
    name: ${JSON.stringify(`${slug}-comparison`)}, statement: ${upper}_QUERY,
    ${breakdown ? '// Preserve JSON-looking STRING segment labels (AppKit compatibility exception).\n    transport: "driver",' : '// Numeric aggregates use the AppKit analytics adapter.'}
    parameters: { source: identifier, currentStart: periods.current.start, currentEnd: shiftDate(periods.current.end, 1),
      referenceStart: periods.reference.start, referenceEnd: shiftDate(periods.reference.end, 1) },
    rowSchema: comparisonRowSchema, requestId, maxRows: MAX_COMPARISON_ROWS + 1,
  });
  ensureComparisonBounds(rows);
  return rows;
}
`);
  files.set(`${path}/server/service.ts`, `import { demoComparison } from "@/features/period-comparison/demo";
import { buildComparison } from "@/features/period-comparison/model";
import type { PeriodSelection } from "@/features/period-comparison/periods";
import { comparisonLimits } from "@/features/period-comparison/server/limits";
import { load${pascal} } from "./repository";
import { getServerConfig, type ServerConfig } from "@/lib/config/server-config";
import { getSqlExecutor } from "@/lib/databricks/sql";
import type { SqlExecutor } from "@/lib/databricks/types";

const metric = ${options} as const;
type Dependencies = { config?: ServerConfig; executor?: SqlExecutor };

export async function get${pascal}(selection: PeriodSelection, requestId?: string, dependencies: Dependencies = {}) {
  const config = dependencies.config ?? getServerConfig();
  if (config.mode === "demo") return comparisonLimits(() => demoComparison(selection, metric));
  const rows = await load${pascal}(dependencies.executor ?? getSqlExecutor(), ${JSON.stringify(source.fullName)}, selection, requestId);
  // Completeness remains unknown until verified against an explicit source contract.
  return comparisonLimits(() => buildComparison({ rows, selection, ...metric, sourceLabel: ${JSON.stringify(source.name)} }));
}
`);
  files.set(`src/server/routes/${slug}/route.ts`, `import { get${pascal} } from "@/features/${slug}/server/service";
import { parseComparisonRequest } from "@/features/period-comparison/server/request";
import { withApiRoute } from "@/lib/http/with-api-route";

export const GET = withApiRoute((request, context) => get${pascal}(parseComparisonRequest(request.query), context.requestId));
`);
  files.set(`${path}/${slug}-card.tsx`, `import { useAppConfig } from "@/client/app-config";
import { PeriodComparison, defaultSelection } from "@/features/period-comparison";
import { DEMO_SELECTION } from "@/features/period-comparison/demo";

export function ${pascal}Card() {
  const config = useAppConfig();
  return <PeriodComparison endpoint=${JSON.stringify(`/api/${slug}`)} title={${JSON.stringify(title)}} description={${JSON.stringify(question)}}
    initialSelection={config.mode === "demo" ? DEMO_SELECTION : defaultSelection()} showWaterfall={${breakdown && metric.aggregation !== "avg"}}${comparison.sharing ? `
    sharing={{ key: ${JSON.stringify(slug)}, allowSegment: ${comparison.sharing.allowSegment} }}` : ""} />;
}
`);
  files.set(`src/client/pages/${slug}/page.tsx`, `import { ${pascal}Card } from "@/features/${slug}/${slug}-card";

export default function ${pascal}Page() {
  return <${pascal}Card />;
}
`);
  const sourceParameter = JSON.stringify(source.fullName.split(".").map((part) => `\`${part}\``).join("."));
  files.set(`tests/${slug}.test.ts`, `import assert from "node:assert/strict";
import test from "node:test";
import { load${pascal} } from "../${path}/server/repository";
import { get${pascal} } from "../${path}/server/service";
import { DEMO_SELECTION } from "../src/features/period-comparison/demo";
import type { DemoConfig } from "../src/lib/config/server-config";
import type { SqlExecutor } from "../src/lib/databricks/types";

test(${JSON.stringify(`${slug} comparison works without credentials`)}, async () => {
  const config: DemoConfig = { mode: "demo", appName: "Test", appDescription: "Test", supportContact: { name: "Test", slackUrl: "https://valiuz.slack.com/" }, logLevel: "info" };
  const result = await get${pascal}(DEMO_SELECTION, undefined, { config, executor: { query: async () => { throw new Error("Demo must not query SQL"); } } });
  assert.equal(result.status, "demo");
  assert.equal(result.periods.current.days, 14);
  assert.equal(result.periods.reference.end, "2026-08-31");
  assert.equal(result.aggregation, ${JSON.stringify(metric.aggregation)});
  assert.ok(result.current.value !== null);
  assert.equal(result.waterfall !== null, ${breakdown && metric.aggregation !== "avg"});
});

test(${JSON.stringify(`${slug} binds both DATE windows and validates aggregate rows`)}, async () => {
  const executor: SqlExecutor = { query: async (options) => {
    assert.equal(options.name, ${JSON.stringify(`${slug}-comparison`)});
    assert.equal(options.requestId, "comparison-test");
    assert.equal(options.maxRows, 1001);
    assert.equal(options.transport, ${breakdown ? '"driver"' : "undefined"});
    assert.deepEqual(options.parameters, { source: ${sourceParameter}, currentStart: "2026-09-01", currentEnd: "2026-09-15",
      referenceStart: "2026-08-18", referenceEnd: "2026-09-01" });
    assert.match(options.statement, /UNION ALL/);
    assert.match(options.statement, /LIMIT 1001$/);
    assert.ok(!options.statement.includes(${JSON.stringify(source.fullName)}));
    assert.equal(options.rowSchema.safeParse({ period: "current", day: "wrong", segment: null, value_sum: 1, row_count: 1, value_count: 1 }).success, false);
    return [options.rowSchema.parse({ period: "current", day: "2026-09-01", segment: null, value_sum: "2", row_count: "2", value_count: "2" })];
  } };
  const rows = await load${pascal}(executor, ${JSON.stringify(source.fullName)}, DEMO_SELECTION, "comparison-test");
  assert.equal(rows[0]?.value_sum, 2);
});

test(${JSON.stringify(`${slug} refuses truncated aggregate results`)}, async () => {
  const executor: SqlExecutor = { query: async (options) => Array.from({ length: 1001 }, () => options.rowSchema.parse({ period: "current", day: "2026-09-01", segment: null, value_sum: 1, row_count: 1, value_count: 1 })) };
  await assert.rejects(load${pascal}(executor, ${JSON.stringify(source.fullName)}, DEMO_SELECTION), /Comparison bounds/);
});
`);
  return files;
}
