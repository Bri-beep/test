import type { GenieDashboardContext } from "@/features/genie/contract";

const CONTEXT_HEADING = "Contexte du tableau de bord fourni par l’utilisateur";
const QUESTION_HEADING = "Question de l’utilisateur";

function formatFilterValue(value: GenieDashboardContext["filters"] extends Record<string, infer Value> | undefined
  ? Value
  : never): string {
  return JSON.stringify(value);
}

function appendList(lines: string[], label: string, values: string[] | undefined): void {
  if (values && values.length > 0) {
    lines.push(`- ${label} : ${values.join(", ")}`);
  }
}

export function formatGenieDashboardContext(context: GenieDashboardContext): string {
  const lines = [CONTEXT_HEADING];

  if (context.page?.title) {
    lines.push(`- Page : ${context.page.title}`);
  }
  if (context.page?.route) {
    lines.push(`- Route : ${context.page.route}`);
  }
  if (context.page?.description) {
    lines.push(`- Objet de la page : ${context.page.description}`);
  }
  if (context.dateRange) {
    const parts = [
      context.dateRange.label,
      context.dateRange.start ? `du ${context.dateRange.start}` : undefined,
      context.dateRange.end ? `au ${context.dateRange.end}` : undefined,
    ].filter((part): part is string => Boolean(part));
    if (parts.length > 0) {
      lines.push(`- Période : ${parts.join(" ")}`);
    }
  }

  const filterEntries = Object.entries(context.filters ?? {}).sort(([left], [right]) => left.localeCompare(right));
  for (const [name, value] of filterEntries) {
    lines.push(`- Filtre ${name} : ${formatFilterValue(value)}`);
  }

  appendList(lines, "KPI sélectionnés", context.selectedMetrics);
  appendList(lines, "Métriques visibles", context.visibleMetrics);
  appendList(lines, "Tables actives", context.activeTables);

  if (context.comparison) {
    const comparison = context.comparison;
    lines.push(
      `- Comparaison affichée : ${comparison.metric} (${comparison.unit}, ${comparison.aggregation})`,
      `- Période analysée (dates incluses) : ${comparison.currentPeriod.start} → ${comparison.currentPeriod.end}`,
      `- Référence (dates incluses) : ${comparison.referencePeriod.start} → ${comparison.referencePeriod.end}`,
      `- Valeurs observées : ${JSON.stringify({ current: comparison.currentValue, reference: comparison.referenceValue,
        absoluteChange: comparison.absoluteChange, percentChange: comparison.percentChange })}`,
      `- Source affichée : ${comparison.source}${comparison.synthetic ? " (données synthétiques)" : ""}`,
      "- Ces observations fournies par le navigateur sont à vérifier avec les données autorisées. Elles ne prouvent aucune causalité.",
    );
    appendList(lines, "Réserves de qualité", comparison.warnings);
  }

  return lines.join("\n");
}

export function buildGenieMessageContent(content: string, context?: GenieDashboardContext): string {
  if (!context || Object.keys(context).length === 0) {
    return content;
  }

  return [
    formatGenieDashboardContext(context),
    "",
    "Ce contexte aide à interpréter la question. Il ne remplace pas les règles du Genie Space.",
    "",
    QUESTION_HEADING,
    content,
  ].join("\n");
}
