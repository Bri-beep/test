import { z } from "zod";
import type { ComparisonResult } from "./contract";
import { civilDateSchema, resolvePeriods, selectionSchema, type PeriodSelection } from "./periods";

export type ComparisonSharingOptions = {
  /** Stable identifier for this comparison on its registered page. */
  key: string;
  /** Enable only after reviewing the dimension: its values will appear in copied links. */
  allowSegment?: boolean;
};

const optionsSchema = z.object({ key: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/), allowSegment: z.boolean().optional() }).strict();
const sharedSelectionSchema = z.object({
  version: z.literal(1), key: optionsSchema.shape.key,
  start: civilDateSchema, end: civilDateSchema,
  mode: z.enum(["previous-period", "previous-year", "custom"]),
  referenceStart: civilDateSchema, referenceEnd: civilDateSchema,
  segment: z.string().min(1).max(402).optional(),
}).strict();
const PREFIX = "#comparison=";
const MAX_HASH_LENGTH = 4_096;

export type SharedComparison = { status: "none" } | { status: "invalid" }
  | { status: "ready"; selection: PeriodSelection };

function checkedSelection(selection: PeriodSelection, options: ComparisonSharingOptions) {
  optionsSchema.parse(options);
  const parsed = selectionSchema.parse(selection);
  if (parsed.segment && !options.allowSegment) throw new Error("This dimension is not approved for sharing");
  return parsed;
}

/** Decode only a definition. Unknown versions, fields, targets and changed date semantics fail closed. */
export function readSharedComparison(hash: string, options?: ComparisonSharingOptions): SharedComparison {
  if (hash !== "#comparison" && !hash.startsWith(PREFIX)) return { status: "none" };
  try {
    if (!options || !hash.startsWith(PREFIX) || hash.length > MAX_HASH_LENGTH) throw new Error("Invalid comparison link");
    const payload = sharedSelectionSchema.parse(JSON.parse(decodeURIComponent(hash.slice(PREFIX.length))));
    const { key, start, end, mode, referenceStart, referenceEnd, segment } = payload;
    const selection = { start, end, mode, referenceStart, referenceEnd, ...(segment ? { segment } : {}) };
    const parsed = checkedSelection(selection, options);
    if (key !== options.key) throw new Error("Comparison key does not match this view");
    const periods = resolvePeriods(parsed);
    if (periods.reference.start !== selection.referenceStart || periods.reference.end !== selection.referenceEnd) {
      throw new Error("Reference dates do not match the selected comparison");
    }
    return { status: "ready", selection: parsed };
  } catch {
    return { status: "invalid" };
  }
}

/** Rebuild the URL from the current page: never copy query strings, previous fragments or arbitrary targets. */
export function comparisonShareLink(pageUrl: string, selection: PeriodSelection, options: ComparisonSharingOptions): string {
  const parsed = checkedSelection(selection, options);
  const periods = resolvePeriods(parsed);
  const url = new URL(pageUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid application URL");
  url.search = "";
  url.hash = PREFIX + encodeURIComponent(JSON.stringify({
    version: 1, key: options.key, start: periods.current.start, end: periods.current.end, mode: parsed.mode,
    referenceStart: periods.reference.start, referenceEnd: periods.reference.end,
    ...(parsed.segment ? { segment: parsed.segment } : {}),
  }));
  if (url.hash.length > MAX_HASH_LENGTH) throw new Error("Comparison link is too long");
  return url.href;
}

/** A fetched response must describe the requested windows before it can be shared. */
export function assertComparisonSelection(result: ComparisonResult, selection: PeriodSelection): void {
  const expected = resolvePeriods(selection);
  for (const name of ["current", "reference"] as const) {
    for (const field of ["start", "end", "days"] as const) {
      if (result.periods[name][field] !== expected[name][field]) throw new Error("Comparison response does not match requested dates");
    }
  }
  const expectedFilter = selection.segment ? result.availableSegments.find((item) => item.id === selection.segment)?.label ?? "Segment sans données" : null;
  if (result.filterLabel !== expectedFilter) throw new Error("Comparison response does not match requested filter");
}

// A summary is plain text. Collapse control characters so labels cannot impersonate a new field or warning.
function plain(value: string): string {
  return value.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, " ").replace(/\s+/g, " ").trim();
}

export function comparisonShareSummary(result: ComparisonResult, consultedAt: string, link: string): string {
  const timestamp = new Date(consultedAt);
  if (!Number.isFinite(timestamp.getTime())) throw new Error("Invalid consultation date");
  const number = (value: number | null, signed = false) => value === null ? "Non disponible"
    : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2, signDisplay: signed ? "exceptZero" : "auto" }).format(value)} ${plain(result.unit)}`;
  const period = (value: ComparisonResult["periods"]["current"]) => `${value.start} → ${value.end} (${value.days} jours)`;
  const relative = {
    missing: "Non disponible : mesure manquante sur une période.",
    "zero-reference": "Non calculable : référence nulle.",
    "negative-reference": "Non affichée : référence négative.",
    ok: result.change.percent === null ? "Non disponible" : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(result.change.percent)} %`,
  }[result.change.reason];
  return [
    `${plain(result.label)} — Comparaison de périodes`,
    ...(result.status === "demo" ? ["DÉMONSTRATION — Données synthétiques, aucune requête Databricks exécutée."] : []),
    `Source : ${plain(result.sourceLabel)}`,
    `Mesure : ${{ count: "Nombre", sum: "Somme", avg: "Moyenne pondérée" }[result.aggregation]} · Unité : ${plain(result.unit)}`,
    `Période analysée : ${period(result.periods.current)}`,
    `Référence : ${period(result.periods.reference)}`,
    `Filtre commun : ${result.filterLabel === null ? "Tous les segments" : `Segment : ${plain(result.filterLabel)}`}`,
    `Valeur analysée : ${number(result.current.value)}`,
    `Valeur de référence : ${number(result.reference.value)}`,
    `Écart absolu : ${number(result.change.absolute, true)}`,
    `Variation relative : ${relative}`,
    "Réserves :",
    ...result.warnings.map((warning) => `- ${plain(warning)}`),
    ...(!result.completeCoverage ? ["- Complétude des périodes non vérifiée."] : []),
    "- La variation et les contributions ne démontrent pas une causalité.",
    `Consulté le : ${timestamp.toISOString()} (date de consultation, pas de fraîcheur des données)`,
    "Cette synthèse décrit les valeurs consultées. Le lien recalcule les données : les chiffres peuvent évoluer.",
    "L’accès à l’application et ses règles d’autorisation restent nécessaires.",
    `Reprendre l’analyse : ${link}`,
  ].join("\n");
}
