import { genieDashboardContextSchema, type GenieDashboardContext } from "@/features/genie/contract";
import { comparisonResultSchema, type ComparisonResult } from "./contract";

export function comparisonGenieContext(result: ComparisonResult, base: GenieDashboardContext = {}): GenieDashboardContext {
  const checked = comparisonResultSchema.parse(result);
  return genieDashboardContextSchema.parse({
    ...base,
    dateRange: { start: checked.periods.current.start, end: checked.periods.current.end },
    filters: { ...base.filters, segment: checked.filterLabel ?? "Tous les segments" },
    selectedMetrics: [checked.label],
    comparison: {
      metric: checked.label, unit: checked.unit, aggregation: checked.aggregation,
      currentPeriod: { start: checked.periods.current.start, end: checked.periods.current.end },
      referencePeriod: { start: checked.periods.reference.start, end: checked.periods.reference.end },
      currentValue: checked.current.value, referenceValue: checked.reference.value,
      absoluteChange: checked.change.absolute, percentChange: checked.change.percent,
      source: checked.sourceLabel, synthetic: checked.status === "demo", warnings: checked.warnings,
    },
  });
}

export function comparisonGenieQuestion(result: ComparisonResult): string {
  return `Explore l’écart de ${result.label} entre le ${result.periods.current.start} et le ${result.periods.current.end}, `
    + `par rapport au ${result.periods.reference.start}–${result.periods.reference.end}. `
    + "Vérifie les valeurs et la complétude sur le même périmètre. Quelles contributions peut-on mesurer ? "
    + "Distingue les observations, les hypothèses et les vérifications nécessaires avant de conclure à une cause.";
}
