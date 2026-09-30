export type WaterfallContribution = { id: string; label: string; value: number };
export type WaterfallData = { start: number; end: number; contributions: readonly WaterfallContribution[] };
export type WaterfallStep = {
  id: string; label: string; value: number; after: number; range: [number, number];
  kind: "total" | "increase" | "decrease" | "residual";
};

export function buildWaterfall(data: WaterfallData): { steps: WaterfallStep[]; residual: number; grouped: number } {
  if (![data.start, data.end, ...data.contributions.map((item) => item.value)].every(Number.isFinite)
    || data.contributions.length > 50 || data.contributions.some((item) => !item.id || !item.label)
    || new Set(data.contributions.map((item) => item.id)).size !== data.contributions.length) {
    throw new Error("Invalid waterfall data.");
  }
  const contributions = [...data.contributions];
  const grouped = contributions.length > 10 ? contributions.length - 9 : 0;
  if (grouped) {
    const rest = contributions.splice(9);
    contributions.push({ id: "grouped-remainder", label: `Autres (${grouped})`, value: rest.reduce((sum, item) => sum + item.value, 0) });
  }
  const steps: WaterfallStep[] = [{
    id: "start", label: "Référence", value: data.start, after: data.start, range: [Math.min(0, data.start), Math.max(0, data.start)], kind: "total",
  }];
  let running = data.start;
  contributions.forEach((item, index) => {
    const after = running + item.value;
    steps.push({ id: `step-${index}`, label: item.label, value: item.value, after,
      range: [Math.min(running, after), Math.max(running, after)], kind: item.value < 0 ? "decrease" : "increase" });
    running = after;
  });
  const difference = data.end - running;
  const tolerance = Number.EPSILON * 32 * Math.max(1, Math.abs(data.start), Math.abs(data.end),
    ...data.contributions.map((item) => Math.abs(item.value)));
  const residual = Math.abs(difference) <= tolerance ? 0 : difference;
  if (residual !== 0) steps.push({
    id: "residual", label: "Écart non attribué", value: residual, after: data.end,
    range: [Math.min(running, data.end), Math.max(running, data.end)], kind: "residual",
  });
  steps.push({
    id: "end", label: "Période analysée", value: data.end, after: data.end, range: [Math.min(0, data.end), Math.max(0, data.end)], kind: "total",
  });
  if (steps.some((step) => ![step.value, step.after, ...step.range].every(Number.isFinite))) throw new Error("Waterfall overflow.");
  return { steps, residual, grouped };
}
