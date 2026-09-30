import { buildComparison } from "./model";
import type { ComparisonAggregation, ComparisonRow } from "./contract";
import { resolvePeriods, shiftDate, type PeriodSelection } from "./periods";

export const DEMO_SELECTION: PeriodSelection = { start: "2026-09-01", end: "2026-09-14", mode: "previous-period" };

export function demoComparison(selection: PeriodSelection, {
  label = "Montant des commandes", unit = "EUR", aggregation = "sum", breakdown = true,
}: { label?: string; unit?: string; aggregation?: ComparisonAggregation; breakdown?: boolean } = {}) {
  const periods = resolvePeriods(selection);
  const rows: ComparisonRow[] = [];
  for (const period of ["current", "reference"] as const) {
    for (let index = 0; index < periods[period].days; index += 1) {
      const day = shiftDate(periods[period].start, index);
      if (day < "2024-01-01" || day > "2026-09-20") continue;
      const ordinal = Date.parse(`${day}T00:00:00Z`) / 86_400_000;
      const recent = day >= "2026-09-01";
      const values = [
        { segment: "Web", count: 12 + ordinal % 5 + (recent ? 10 : 0), price: 50 + ordinal % 9 },
        { segment: "Magasin", count: 20 + ordinal % 7 + (recent ? 2 : 0), price: 38 + ordinal % 6 },
        { segment: "Application", count: 8 + ordinal % 3 - (recent ? 4 : 0), price: 61 + ordinal % 4 },
      ];
      if (breakdown) {
        for (const item of values) rows.push({ period, day, segment: item.segment,
          value_sum: aggregation === "count" ? item.count : item.count * item.price, row_count: item.count, value_count: item.count });
      } else {
        const count = values.reduce((sum, item) => sum + item.count, 0);
        rows.push({ period, day, segment: null, value_sum: aggregation === "count" ? count : values.reduce((sum, item) => sum + item.count * item.price, 0),
          row_count: count, value_count: count });
      }
    }
  }
  return buildComparison({ rows, selection, label, unit, aggregation, breakdown, status: "demo",
    sourceLabel: "Commandes synthétiques", completeCoverage: { start: "2024-01-01", end: "2026-09-20" } });
}
