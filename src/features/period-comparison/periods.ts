import { z } from "zod";

const DAY_MS = 86_400_000;
export const MAX_PERIOD_DAYS = 366;

export function isCivilDate(value: string): boolean {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const civilDateSchema = z.string().refine(isCivilDate, "Utilisez une date valide au format AAAA-MM-JJ.");

export function shiftDate(value: string, days: number): string {
  const result = new Date(new Date(`${value}T00:00:00.000Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
  if (!isCivilDate(result)) throw new Error("Date outside the supported calendar.");
  return result;
}

export function periodDays(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS + 1;
}

function previousYear(value: string): string {
  const year = Number(value.slice(0, 4)) - 1;
  const candidate = `${year.toString().padStart(4, "0")}${value.slice(4)}`;
  return isCivilDate(candidate) ? candidate : `${year.toString().padStart(4, "0")}-02-28`;
}

export const selectionSchema = z.object({
  start: civilDateSchema,
  end: civilDateSchema,
  mode: z.enum(["previous-period", "previous-year", "custom"]),
  referenceStart: civilDateSchema.optional(),
  referenceEnd: civilDateSchema.optional(),
  segment: z.string().min(1).max(402).optional(),
}).strict().superRefine((selection, context) => {
  function checkRange(start?: string, end?: string) {
    if (!start || !end) {
      context.addIssue({ code: "custom", message: "Précisez les deux dates de référence." });
      return;
    }
    if (!isCivilDate(start) || !isCivilDate(end)) return;
    const days = periodDays(start, end);
    if (days < 1 || days > MAX_PERIOD_DAYS) {
      context.addIssue({ code: "custom", message: `Chaque période doit couvrir entre 1 et ${MAX_PERIOD_DAYS} jours.` });
    }
  }
  checkRange(selection.start, selection.end);
  if (selection.mode === "custom") checkRange(selection.referenceStart, selection.referenceEnd);
});

export type PeriodSelection = z.infer<typeof selectionSchema>;
export type Period = { start: string; end: string; days: number };
export type ResolvedPeriods = { current: Period; reference: Period };

export function resolvePeriods(input: PeriodSelection): ResolvedPeriods {
  const selection = selectionSchema.parse(input);
  const current = { start: selection.start, end: selection.end, days: periodDays(selection.start, selection.end) };
  const start = selection.mode === "custom" ? selection.referenceStart!
    : selection.mode === "previous-year" ? previousYear(current.start) : shiftDate(current.start, -current.days);
  const end = selection.mode === "custom" ? selection.referenceEnd!
    : selection.mode === "previous-year" ? previousYear(current.end) : shiftDate(current.start, -1);
  const reference = { start, end, days: periodDays(start, end) };
  // SQL uses the following day as an exclusive bound.
  shiftDate(current.end, 1);
  shiftDate(reference.end, 1);
  if (!isCivilDate(start) || !isCivilDate(end) || reference.days < 1 || reference.days > MAX_PERIOD_DAYS) {
    throw new Error("La période de référence dépasse les dates prises en charge.");
  }
  return { current, reference };
}

export function defaultSelection(today = new Date().toISOString().slice(0, 10)): PeriodSelection {
  return { start: shiftDate(today, -14), end: shiftDate(today, -1), mode: "previous-period" };
}

export function selectionParameters(selection: PeriodSelection): URLSearchParams {
  const parsed = selectionSchema.parse(selection);
  return new URLSearchParams({
    start: parsed.start, end: parsed.end, mode: parsed.mode,
    ...(parsed.mode === "custom" ? { referenceStart: parsed.referenceStart!, referenceEnd: parsed.referenceEnd! } : {}),
    ...(parsed.segment ? { segment: parsed.segment } : {}),
  });
}

export function formatPeriodDate(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}
