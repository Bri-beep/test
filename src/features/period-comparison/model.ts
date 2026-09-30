import { z } from "zod";
import {
  comparisonResultSchema, comparisonRowSchema, MAX_COMPARISON_ROWS, MAX_COMPARISON_SEGMENTS,
  type ComparisonAggregation, type ComparisonResult, type ComparisonRow, type CompleteCoverage,
} from "./contract";
import { formatPeriodDate, resolvePeriods, shiftDate, type PeriodSelection } from "./periods";

export class ComparisonLimitError extends Error {}

export function checkComparisonBounds(rows: readonly ComparisonRow[]) {
  if (rows.length > MAX_COMPARISON_ROWS || new Set(rows.map((row) => row.segment)).size > MAX_COMPARISON_SEGMENTS) {
    throw new ComparisonLimitError("Comparison bounds exceeded.");
  }
}

export function measure(rows: readonly ComparisonRow[], aggregation: ComparisonAggregation) {
  const rowCount = rows.reduce((sum, row) => sum + row.row_count, 0);
  const valueCount = rows.reduce((sum, row) => sum + row.value_count, 0);
  const sum = rows.reduce((total, row) => total + (row.value_sum ?? 0), 0);
  if (!Number.isSafeInteger(rowCount) || !Number.isSafeInteger(valueCount) || !Number.isFinite(sum)) throw new Error("Comparison statistics overflow.");
  const value = !valueCount ? null : aggregation === "avg" ? sum / valueCount : sum;
  return { value, rowCount, missingValues: rowCount - valueCount };
}

export function calculateChange(current: number | null, reference: number | null): ComparisonResult["change"] {
  if (current === null || reference === null) return { absolute: null, percent: null, reason: "missing" };
  const absolute = current - reference;
  if (!Number.isFinite(absolute)) throw new Error("Comparison overflow.");
  if (reference <= 0) return { absolute, percent: null, reason: reference === 0 ? "zero-reference" : "negative-reference" };
  const percent = absolute / reference * 100;
  if (!Number.isFinite(percent)) throw new Error("Comparison percentage overflow.");
  return { absolute, percent, reason: "ok" };
}

export function buildComparison({
  rows: inputRows, selection, aggregation, breakdown = false, label, unit, sourceLabel,
  status = "ok", completeCoverage = null,
}: {
  rows: readonly ComparisonRow[]; selection: PeriodSelection; aggregation: ComparisonAggregation;
  breakdown?: boolean; label: string; unit: string; sourceLabel: string; status?: "demo" | "ok";
  completeCoverage?: CompleteCoverage | null;
}): ComparisonResult {
  const periods = resolvePeriods(selection);
  checkComparisonBounds(inputRows);
  const allRows = z.array(comparisonRowSchema).max(MAX_COMPARISON_ROWS).parse(inputRows);
  const keys = new Set<string>();
  for (const row of allRows) {
    const window = periods[row.period];
    const key = JSON.stringify([row.period, row.day, row.segment]);
    if (row.day < window.start || row.day > window.end || keys.has(key)) throw new Error("Invalid comparison row grain or period.");
    if (aggregation === "count" && (row.value_sum !== row.row_count || row.value_count !== row.row_count)) throw new Error("Invalid count statistics.");
    if (!breakdown && row.segment !== null) throw new Error("Unexpected comparison breakdown.");
    keys.add(key);
  }
  const segmentKeys = [...new Set(allRows.map((row) => JSON.stringify(row.segment)))].sort();
  const availableSegments = breakdown ? segmentKeys.map((id) => ({ id, label: JSON.parse(id) ?? "Non renseigné" })) : [];
  const filterLabel = selection.segment ? availableSegments.find((item) => item.id === selection.segment)?.label ?? "Segment sans données" : null;
  const rows = selection.segment ? allRows.filter((row) => JSON.stringify(row.segment) === selection.segment) : allRows;
  const currentRows = rows.filter((row) => row.period === "current");
  const referenceRows = rows.filter((row) => row.period === "reference");
  const current = measure(currentRows, aggregation);
  const reference = measure(referenceRows, aggregation);
  const change = calculateChange(current.value, reference.value);
  const warnings: string[] = [];
  if (periods.current.days !== periods.reference.days) warnings.push("Les périodes ont des durées différentes. Les totaux ne sont pas normalisés par jour.");
  if (periods.current.start <= periods.reference.end && periods.reference.start <= periods.current.end) warnings.push("Les périodes se chevauchent : certaines observations appartiennent aux deux périodes.");
  if (selection.mode === "previous-year" && (selection.start.endsWith("-02-29") || selection.end.endsWith("-02-29"))) warnings.push("Le 29 février est ramené au 28 février dans l’année de référence.");
  if (current.missingValues || reference.missingValues) warnings.push("Des mesures sont absentes. Les valeurs nulles sont exclues du calcul ; la décomposition est désactivée.");
  if (!completeCoverage) warnings.push("La complétude des périodes n’a pas été vérifiée.");
  else if (Object.values(periods).some((period) => period.start < completeCoverage.start || period.end > completeCoverage.end)) {
    warnings.push(`Période partielle : la couverture complète est confirmée uniquement du ${formatPeriodDate(completeCoverage.start)} au ${formatPeriodDate(completeCoverage.end)}.`);
  }
  const series = Array.from({ length: Math.max(periods.current.days, periods.reference.days) }, (_, index) => {
    const currentDate = index < periods.current.days ? shiftDate(periods.current.start, index) : null;
    const referenceDate = index < periods.reference.days ? shiftDate(periods.reference.start, index) : null;
    return {
      position: `J${index + 1}`, currentDate, referenceDate,
      current: measure(currentRows.filter((row) => row.day === currentDate), aggregation).value,
      reference: measure(referenceRows.filter((row) => row.day === referenceDate), aggregation).value,
    };
  });
  const additive = aggregation !== "avg";
  const segments = breakdown ? segmentKeys.filter((id) => !selection.segment || id === selection.segment).map((id) => {
    const segment: string | null = JSON.parse(id);
    const selectedCurrent = currentRows.filter((row) => row.segment === segment);
    const selectedReference = referenceRows.filter((row) => row.segment === segment);
    // A missing category is zero only within an observed period for an additive measure.
    const currentValue = additive && !selectedCurrent.length && current.value !== null ? 0 : measure(selectedCurrent, aggregation).value;
    const referenceValue = additive && !selectedReference.length && reference.value !== null ? 0 : measure(selectedReference, aggregation).value;
    return { id, label: segment ?? "Non renseigné", current: currentValue, reference: referenceValue,
      delta: calculateChange(currentValue, referenceValue).absolute };
  }) : [];
  const waterfall = breakdown && additive && current.value !== null && reference.value !== null
    && !current.missingValues && !reference.missingValues ? {
      start: reference.value, end: current.value,
      contributions: segments.map((segment) => ({ id: segment.id, label: segment.label, value: segment.delta! })),
    } : null;
  return comparisonResultSchema.parse({ status, label, unit, aggregation, sourceLabel, availableSegments, filterLabel, periods, current, reference,
    change, series, segments, waterfall, warnings, completeCoverage });
}
