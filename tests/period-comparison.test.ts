import { requestHandler } from "./fixtures/http";
import assert from "node:assert/strict";
import test from "node:test";
import { buildComparison, calculateChange, ComparisonLimitError } from "../src/features/period-comparison/model";
import { comparisonRowSchema, type ComparisonRow } from "../src/features/period-comparison/contract";
import { resolvePeriods, selectionSchema, defaultSelection, shiftDate, type PeriodSelection } from "../src/features/period-comparison/periods";
import { DEMO_SELECTION, demoComparison } from "../src/features/period-comparison/demo";
import { GET } from "../src/server/routes/period-comparison/route";
import { buildWaterfall } from "../src/components/charts/waterfall-model";
import { comparisonGenieContext, comparisonGenieQuestion } from "../src/features/period-comparison/genie-context";
import { buildGenieMessageContent } from "../src/features/genie/context";
import { genieMessageRequestSchema } from "../src/features/genie/contract";

const selection: PeriodSelection = { start: "2024-03-30", end: "2024-03-31", mode: "previous-period" };
function row(period: "current" | "reference", segment: string | null, value: number | null, count = 1): ComparisonRow {
  return { period, segment, day: period === "current" ? "2024-03-30" : "2024-03-28", value_sum: value, row_count: count, value_count: value === null ? 0 : count };
}
function compare(rows: ComparisonRow[], options: Partial<Parameters<typeof buildComparison>[0]> = {}) {
  return buildComparison({ rows, selection, aggregation: "sum", breakdown: true, label: "Montant", unit: "EUR", sourceLabel: "Fixture", ...options });
}

test("Genie receives the applied periods, shared filters, exact observations and quality warnings without detailed rows", () => {
  const result = demoComparison({ ...DEMO_SELECTION, mode: "custom", referenceStart: "2026-08-01", referenceEnd: "2026-08-07", segment: '"Web"' });
  const context = comparisonGenieContext(result, { activeTables: ["declared.source"], filters: { country: "FR" } });
  const request = genieMessageRequestSchema.parse({ content: comparisonGenieQuestion(result), context });
  assert.deepEqual(request.context?.comparison?.referencePeriod, { start: "2026-08-01", end: "2026-08-07" });
  assert.deepEqual(request.context?.comparison?.warnings, result.warnings);
  assert.equal(request.context?.comparison?.currentValue, result.current.value);
  assert.equal(request.context?.filters?.country, "FR");
  assert.equal(request.context?.filters?.segment, result.filterLabel);
  assert.equal(request.context?.comparison?.synthetic, true);
  assert.ok(!("series" in request.context!));
  assert.ok(!("segments" in request.context!));
  assert.match(buildGenieMessageContent(request.content, request.context), /ne prouvent aucune causalité/);
  assert.match(buildGenieMessageContent(request.content, request.context), /durées différentes/);
  assert.equal(genieMessageRequestSchema.safeParse({ ...request, context: { ...context, comparison: { ...context.comparison, currentValue: Infinity } } }).success, false);
});

test("periods use inclusive civil dates across DST and year boundaries", () => {
  assert.deepEqual(resolvePeriods(selection), {
    current: { start: "2024-03-30", end: "2024-03-31", days: 2 },
    reference: { start: "2024-03-28", end: "2024-03-29", days: 2 },
  });
  assert.equal(shiftDate("2024-12-31", 1), "2025-01-01");
  assert.deepEqual(defaultSelection("2024-01-02"), { start: "2023-12-19", end: "2024-01-01", mode: "previous-period" });
  assert.equal(resolvePeriods({ start: "2024-01-01", end: "2024-12-31", mode: "previous-period" }).current.days, 366);
});

test("previous year uses calendar dates and announces leap-day and duration changes", () => {
  const result = compare([], { selection: { start: "2024-02-29", end: "2024-03-01", mode: "previous-year" } });
  assert.deepEqual(result.periods.reference, { start: "2023-02-28", end: "2023-03-01", days: 2 });
  assert.ok(result.warnings.some((warning) => warning.includes("29 février")));
  const unequal = compare([], { selection: { start: "2024-02-28", end: "2024-03-01", mode: "previous-year" } });
  assert.equal(unequal.periods.reference.days, 2);
  assert.equal(unequal.periods.current.days, 3);
  assert.ok(unequal.warnings.some((warning) => warning.includes("durées différentes")));
  assert.equal(unequal.series[2].referenceDate, null);
});

test("invalid, reversed, missing and excessive windows are rejected before execution", () => {
  for (const input of [
    { ...selection, start: "2023-02-29" }, { ...selection, end: "2024-03-01" },
    { ...selection, start: "2024-01-01", end: "2025-01-01" }, { ...selection, mode: "custom" },
    { ...selection, start: "2024-03-30T00:00:00Z" }, { ...selection, query: "SELECT anything" },
  ]) assert.equal(selectionSchema.safeParse(input).success, false);
  assert.throws(() => resolvePeriods({ start: "1000-01-01", end: "1000-01-01", mode: "previous-period" }));
  assert.throws(() => resolvePeriods({ start: "9999-12-31", end: "9999-12-31", mode: "previous-period" }));
});

test("custom overlap and incomplete coverage are visible without inferring completeness from rows", () => {
  const custom = { ...selection, mode: "custom" as const, referenceStart: "2024-03-29", referenceEnd: "2024-03-30" };
  const result = compare([], { selection: custom, completeCoverage: { start: "2024-03-30", end: "2024-03-31" } });
  assert.ok(result.warnings.some((warning) => warning.includes("se chevauchent")));
  assert.ok(result.warnings.some((warning) => warning.includes("Période partielle")));
  assert.ok(compare([row("current", null, 10)]).warnings.some((warning) => warning.includes("n’a pas été vérifiée")));
});

test("absolute and relative changes distinguish zero, negative and absent references", () => {
  assert.deepEqual(calculateChange(120, 100), { absolute: 20, percent: 20, reason: "ok" });
  assert.deepEqual(calculateChange(0, 100), { absolute: -100, percent: -100, reason: "ok" });
  assert.deepEqual(calculateChange(0, 0), { absolute: 0, percent: null, reason: "zero-reference" });
  assert.deepEqual(calculateChange(-10, -20), { absolute: 10, percent: null, reason: "negative-reference" });
  assert.deepEqual(calculateChange(20, null), { absolute: null, percent: null, reason: "missing" });
  assert.throws(() => calculateChange(Number.MAX_VALUE, -Number.MAX_VALUE), /overflow/);
});

test("averages are weighted by valid observations and never get an additive waterfall", () => {
  const result = compare([row("current", "A", 100, 10), row("current", "B", 100, 1), row("reference", "A", 90, 3)], { aggregation: "avg" });
  assert.equal(result.current.value, 200 / 11);
  assert.equal(result.reference.value, 30);
  assert.equal(result.waterfall, null);
});

test("additive segment contributions reconcile including disappearing and new segments", () => {
  const result = compare([row("current", "A", 120), row("reference", "A", 100), row("current", "B", 30), row("reference", "C", 40)]);
  assert.equal(result.current.value, 150);
  assert.equal(result.reference.value, 140);
  assert.deepEqual(result.segments.map(({ label, delta }) => [label, delta]), [["A", 20], ["B", 30], ["C", -40]]);
  assert.equal(buildWaterfall(result.waterfall!).residual, 0);
});

test("one common segment filter applies to both periods and retains available options", () => {
  const result = compare([row("current", "A", 120), row("reference", "A", 100), row("current", "B", 50)], { selection: { ...selection, segment: JSON.stringify("A") } });
  assert.equal(result.current.value, 120);
  assert.equal(result.reference.value, 100);
  assert.equal(result.availableSegments.length, 2);
  assert.equal(result.filterLabel, "A");
  assert.equal(result.waterfall?.contributions.length, 1);
});

test("null measures remain missing and disable decomposition; empty periods are never fabricated as zero", () => {
  const result = compare([row("current", "A", 10), row("current", "B", null), row("reference", "A", 20)]);
  assert.equal(result.current.value, 10);
  assert.equal(result.current.missingValues, 1);
  assert.equal(result.waterfall, null);
  assert.equal(compare([]).current.value, null);
  assert.equal(compare([row("current", "A", 10)]).waterfall, null);
});

test("aggregate contracts reject invalid dates, counts, duplicates, grain and overflow", () => {
  for (const invalid of [
    { ...row("current", null, 1), value_count: 2 }, { ...row("current", null, 1), row_count: -1 },
    { ...row("current", null, 1), value_sum: Infinity }, { ...row("current", null, null), value_count: 1 },
    { ...row("current", null, 1), day: "2024-02-30" },
    { ...row("current", null, 1), value_sum: "" }, { ...row("current", null, 1), value_sum: false },
    { ...row("current", null, 1), value_count: null },
  ]) assert.equal(comparisonRowSchema.safeParse(invalid).success, false);
  assert.throws(() => compare([row("current", null, 1), row("current", null, 1)]), /grain/);
  assert.throws(() => compare([{ ...row("current", null, 1), day: "2024-03-28" }]), /period/);
  assert.throws(() => compare([row("current", "A", 1)], { breakdown: false }), /breakdown/);
  assert.throws(() => compare([row("current", null, 5)], { aggregation: "count" }), /count statistics/);
  assert.throws(() => compare([row("current", "A", Number.MAX_VALUE), row("current", "B", Number.MAX_VALUE)]), /overflow/);
  assert.equal(compare([row("current", "null", 10), row("reference", null, 5)]).segments.length, 2);
});

test("row and segment bounds fail closed before filtering or aggregation", () => {
  assert.throws(() => compare(Array.from({ length: 1001 }, () => row("current", null, 1))), ComparisonLimitError);
  assert.throws(() => compare(Array.from({ length: 51 }, (_, index) => row("current", String(index), 1)), { selection: { ...selection, segment: '"1"' } }), ComparisonLimitError);
});

test("comparison API preserves safe errors, request IDs, cache policy and rejects generic SQL parameters", async () => {
  for (const [query, status] of [
    ["start=2024-02-30&end=2024-03-01&mode=previous-year", 400],
    ["start=2024-03-30&end=2024-03-31&mode=previous-period&source=private", 400],
    ["start=2024-03-30&start=2024-03-29&end=2024-03-31&mode=previous-period", 400],
    ["start=2025-01-01&end=2025-12-31&mode=previous-year", 422],
  ] as const) {
    const response = await requestHandler(GET, new Request(`http://localhost/api/period-comparison/demo?${query}`, { headers: { "x-request-id": "comparison-test" } }));
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.error.code, "INVALID_REQUEST");
    assert.equal(body.error.requestId, "comparison-test");
    assert.ok(!JSON.stringify(body).includes("stack"));
  }
  const response = await requestHandler(GET, new Request("http://localhost/api/period-comparison/demo?start=2026-09-01&end=2026-09-14&mode=previous-period"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await response.json()).status, "demo");
});

test("the demo stays deterministic, honors empty dates and reports partial periods", () => {
  assert.deepEqual(demoComparison(DEMO_SELECTION), demoComparison(DEMO_SELECTION));
  const empty = demoComparison({ start: "2023-09-01", end: "2023-09-02", mode: "previous-period" });
  assert.equal(empty.current.value, null);
  const partial = demoComparison({ start: "2026-09-19", end: "2026-09-22", mode: "previous-period" });
  assert.ok(partial.warnings.some((warning) => warning.includes("Période partielle")));
  assert.equal(partial.series[3].current, null);
});

test("waterfall ranges support negative totals and explicit unexplained residuals", () => {
  const model = buildWaterfall({ start: -10, end: 10, contributions: [{ id: "a", label: "A", value: -5 }, { id: "b", label: "B", value: 20 }] });
  assert.deepEqual(model.steps.map((step) => step.range), [[-10, 0], [-15, -10], [-15, 5], [5, 10], [0, 10]]);
  assert.equal(model.residual, 5);
  assert.equal(model.steps[3].label, "Écart non attribué");
  assert.equal(buildWaterfall({ start: 0.1, end: 0.3, contributions: [{ id: "a", label: "A", value: 0.2 }] }).residual, 0);
});

test("waterfall groups long decompositions without dropping values and rejects invalid inputs", () => {
  const contributions = Array.from({ length: 12 }, (_, index) => ({ id: String(index), label: String(index), value: index + 1 }));
  const model = buildWaterfall({ start: 100, end: 178, contributions });
  assert.equal(model.grouped, 3);
  assert.equal(model.steps[10].value, 33);
  assert.equal(model.residual, 0);
  assert.equal(contributions.length, 12);
  assert.throws(() => buildWaterfall({ start: NaN, end: 0, contributions: [] }));
  assert.throws(() => buildWaterfall({ start: 0, end: 0, contributions: [contributions[0], contributions[0]] }));
});
