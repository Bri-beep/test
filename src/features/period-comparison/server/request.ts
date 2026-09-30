import { AppError } from "@/lib/errors/app-error";
import { resolvePeriods, selectionSchema, type PeriodSelection } from "../periods";

export function parseComparisonRequest(query: unknown): PeriodSelection {
  if (query && typeof query === "object" && Object.values(query).some((value) => typeof value !== "string")) {
    throw new AppError("Duplicate comparison parameters", "INVALID_REQUEST", 400, "Chaque paramètre de période doit être unique.");
  }
  const parsed = selectionSchema.safeParse(query);
  if (!parsed.success) throw new AppError("Invalid comparison selection", "INVALID_REQUEST", 400,
    parsed.error.issues[0]?.message ?? "Les périodes ne sont pas valides.");
  try { resolvePeriods(parsed.data); }
  catch { throw new AppError("Unsupported comparison dates", "INVALID_REQUEST", 400, "La période de référence dépasse les dates prises en charge."); }
  return parsed.data;
}
