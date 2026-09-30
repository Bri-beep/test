import assert from "node:assert/strict";
import test from "node:test";
import { demoComparison, DEMO_SELECTION } from "../src/features/period-comparison/demo";
import { buildComparison } from "../src/features/period-comparison/model";
import { assertComparisonSelection, comparisonShareLink, comparisonShareSummary, readSharedComparison } from "../src/features/period-comparison/sharing";
import { resolvePeriods, type PeriodSelection } from "../src/features/period-comparison/periods";

const options = { key: "sales", allowSegment: true };
const pageUrl = "https://analytics.example/ventes?token=not-shareable&region=private#old-fragment";
const consultedAt = "2026-09-24T12:00:00.000Z";
const hashFor = (payload: unknown) => `#comparison=${encodeURIComponent(JSON.stringify(payload))}`;
const payload = {
  version: 1, key: "sales", start: "2026-09-01", end: "2026-09-14", mode: "previous-period",
  referenceStart: "2026-08-18", referenceEnd: "2026-08-31",
};

test("share links carry only an explicit versioned selection on the current page and restore each comparison mode", () => {
  const selections: PeriodSelection[] = [DEMO_SELECTION,
    { ...DEMO_SELECTION, mode: "previous-year", segment: '"Web & été"' },
    { ...DEMO_SELECTION, mode: "custom", referenceStart: "2026-08-01", referenceEnd: "2026-08-07" },
    { start: "2024-02-29", end: "2024-03-01", mode: "previous-year" },
  ];
  for (const selection of selections) {
    const url = new URL(comparisonShareLink(pageUrl, selection, options));
    assert.equal(url.origin, "https://analytics.example");
    assert.equal(url.pathname, "/ventes");
    assert.equal(url.search, "");
    assert.doesNotMatch(url.href, /token|private|old-fragment/);
    const shared = readSharedComparison(url.hash, options);
    assert.equal(shared.status, "ready");
    if (shared.status !== "ready") throw new Error("Expected a valid shared definition");
    assert.deepEqual(resolvePeriods(shared.selection), resolvePeriods(selection));
    assert.equal(shared.selection.segment, selection.segment);
    assert.equal(shared.selection.mode, selection.mode);
    const data = JSON.parse(decodeURIComponent(url.hash.slice("#comparison=".length)));
    assert.deepEqual(Object.keys(data).sort(), ["version", "key", "start", "end", "mode", "referenceStart", "referenceEnd", ...(selection.segment ? ["segment"] : [])].sort());
  }
});

test("unapproved dimensions are rejected on copy and restore, never silently removed", () => {
  const privateDimension = { ...DEMO_SELECTION, segment: '"customer-123"' };
  assert.throws(() => comparisonShareLink(pageUrl, privateDimension, { key: "sales" }));
  const shared = comparisonShareLink(pageUrl, privateDimension, options);
  assert.deepEqual(readSharedComparison(new URL(shared).hash, { key: "sales", allowSegment: false }), { status: "invalid" });
  assert.equal(readSharedComparison(new URL(comparisonShareLink(pageUrl, DEMO_SELECTION, { key: "sales" })).hash, { key: "sales" }).status, "ready");
  assert.deepEqual(readSharedComparison(hashFor(payload)), { status: "invalid" });
  assert.deepEqual(readSharedComparison("#period-comparison"), { status: "none" });
});

test("malformed, oversized, unknown and manipulated definitions fail closed", () => {
  const invalid = ["#comparison", "#comparison=", "#comparison=%broken", "#comparison=" + "x".repeat(4096),
    ...[null, [], { ...payload, version: 2 }, { ...payload, key: "another-view" },
      { ...payload, sql: "SELECT private" }, { ...payload, results: [123] }, { ...payload, target: "https://outside.example" },
      { ...payload, start: "2026-02-30" }, { ...payload, end: "2028-09-14" },
      { ...payload, referenceStart: "2026-08-17" }, { ...payload, referenceEnd: "2026-08-30" },
      { ...payload, segment: "a".repeat(403) }, { ...payload, mode: "other" },
    ].map(hashFor),
  ];
  for (const hash of invalid) assert.deepEqual(readSharedComparison(hash, options), { status: "invalid" });
  for (const hash of ["", "#period-comparison", "#comparison-results", "#other"]) {
    assert.deepEqual(readSharedComparison(hash, options), { status: "none" });
  }
  for (const url of ["javascript:alert(1)", "https://username:password@example.test/ventes"]) {
    assert.throws(() => comparisonShareLink(url, DEMO_SELECTION, options));
  }
  assert.throws(() => comparisonShareLink(pageUrl, DEMO_SELECTION, { key: "not a slug" }));
});

test("applied result checks reject mismatched windows and filters before sharing", () => {
  const selection = { ...DEMO_SELECTION, segment: '"Web"' };
  const result = demoComparison(selection);
  assert.doesNotThrow(() => assertComparisonSelection(result, selection));
  assert.throws(() => assertComparisonSelection(result, { ...selection, end: "2026-09-13" }));
  assert.throws(() => assertComparisonSelection(result, { ...selection, segment: '"Magasin"' }));
  assert.throws(() => assertComparisonSelection(result, DEMO_SELECTION));
  assert.throws(() => assertComparisonSelection({ ...result, periods: { ...result.periods,
    current: { ...result.periods.current, days: 13 } } }, selection));
});

test("summary keeps observed figures, filters, warnings, source and consultation time distinct from data freshness", () => {
  const selection: PeriodSelection = { start: "2026-09-18", end: "2026-09-22", mode: "custom",
    referenceStart: "2026-08-01", referenceEnd: "2026-08-07", segment: '"Web"' };
  const result = demoComparison(selection);
  const link = comparisonShareLink(pageUrl, selection, options);
  const summary = comparisonShareSummary(result, consultedAt, link);
  for (const expected of [result.label, result.unit, result.sourceLabel, "Segment : Web", "DÉMONSTRATION", "Données synthétiques", "2026-09-18 → 2026-09-22 (5 jours)",
    "2026-08-01 → 2026-08-07 (7 jours)", ...result.warnings, consultedAt, "pas de fraîcheur des données", "les chiffres peuvent évoluer", link]) {
    assert.ok(summary.includes(expected), `Summary must include ${expected}`);
  }
  for (const value of [result.current.value, result.reference.value, result.change.absolute, result.change.percent]) {
    assert.ok(summary.includes(new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value!)));
  }
  assert.doesNotMatch(summary, /SELECT|messageId|conversationId|customer-123/);
  assert.equal(comparisonShareSummary(result, consultedAt, link), summary);
  assert.throws(() => comparisonShareSummary(result, "not a date", link));
});

test("summary preserves zero, missing and negative reference semantics without invented percentages", () => {
  const link = comparisonShareLink(pageUrl, DEMO_SELECTION, options);
  const empty = demoComparison({ start: "2023-09-01", end: "2023-09-14", mode: "previous-period" });
  const absent = comparisonShareSummary(empty, consultedAt, link);
  assert.match(absent, /Valeur analysée : Non disponible/);
  assert.match(absent, /Variation relative : Non disponible/);
  for (const reference of [0, -10]) {
    const result = buildComparison({ selection: DEMO_SELECTION, aggregation: "sum", label: "Valeur", unit: "EUR", sourceLabel: "Source autorisée",
      rows: [
        { period: "current", day: "2026-09-01", segment: null, value_sum: 0, value_count: 1, row_count: 1 },
        { period: "reference", day: "2026-08-18", segment: null, value_sum: reference, value_count: 1, row_count: 1 },
      ] });
    const summary = comparisonShareSummary(result, consultedAt, link);
    assert.match(summary, /Valeur analysée : 0 EUR/);
    assert.match(summary, reference === 0 ? /Non calculable : référence nulle/ : /Non affichée : référence négative/);
    assert.match(summary, /Complétude des périodes non vérifiée/);
    assert.doesNotMatch(summary, /NaN|Infinity|DÉMONSTRATION/);
  }
});

test("summary labels cannot inject control lines and the average is identified correctly", () => {
  const result = demoComparison(DEMO_SELECTION, { aggregation: "avg", label: "Ventes\nSource : autre\u202e" });
  const summary = comparisonShareSummary(result, consultedAt, comparisonShareLink(pageUrl, DEMO_SELECTION, options));
  assert.equal(summary.split("\n").filter((line) => line.startsWith("Source :")).length, 1);
  assert.match(summary, /Moyenne pondérée/);
  assert.ok(!summary.includes("\u202e"));
});
