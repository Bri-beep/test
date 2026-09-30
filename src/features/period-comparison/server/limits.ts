import type { ComparisonRow } from "../contract";
import { checkComparisonBounds, ComparisonLimitError } from "../model";
import { AppError } from "@/lib/errors/app-error";

export function comparisonLimits<T>(operation: () => T): T {
  try { return operation(); } catch (error) {
    if (error instanceof ComparisonLimitError) throw new AppError("Comparison bounds exceeded", "INVALID_REQUEST", 422,
      "La comparaison dépasse la limite de 1 000 agrégats ou 50 segments. Réduisez la période ou adaptez la segmentation de la source.");
    throw error;
  }
}

export function ensureComparisonBounds(rows: readonly ComparisonRow[]) {
  comparisonLimits(() => checkComparisonBounds(rows));
}
