"use client";

import { useReducedMotion } from "framer-motion";
import { Bar, CartesianGrid, Cell, ComposedChart, LabelList, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { DataCard } from "@/components/cards/data-card";
import { ChartState } from "./chart-state";
import { buildWaterfall, type WaterfallData, type WaterfallStep } from "./waterfall-model";
import { formatNumber, getToneColor } from "@/components/data-visualization/format";
import { READY_VISUALIZATION_STATE, type NumberFormat, type VisualizationState } from "@/components/data-visualization/types";

export type WaterfallChartProps = WaterfallData & {
  title: string; description?: string; valueFormat?: NumberFormat; state?: VisualizationState; className?: string;
};

function stepColor(kind: WaterfallStep["kind"]) {
  return getToneColor(kind === "increase" ? "brand" : kind === "decrease" ? "purple" : kind === "residual" ? "negative" : "slate");
}

function WaterfallTooltip({ active, payload, valueFormat }: TooltipContentProps & { valueFormat: NumberFormat }) {
  const step = payload[0]?.payload as WaterfallStep | undefined;
  if (!active || !step) return null;
  return <div className="rounded-xl border border-line bg-tooltip p-3 text-sm shadow-floating">
    <p className="font-semibold">{step.label}</p>
    <p className="mt-1 tabular-nums">{formatNumber(step.value, { ...valueFormat, signDisplay: step.kind === "total" ? "auto" : "exceptZero" })}</p>
    {step.kind !== "total" ? <p className="mt-1 text-muted">Cumul : {formatNumber(step.after, valueFormat)}</p> : null}
  </div>;
}

export function WaterfallChart({ title, description, start, end, contributions, valueFormat = { maximumFractionDigits: 2 },
  state = READY_VISUALIZATION_STATE, className }: WaterfallChartProps) {
  const reducedMotion = useReducedMotion();
  let model: ReturnType<typeof buildWaterfall> | undefined;
  if (state.status === "ready") {
    try { model = buildWaterfall({ start, end, contributions }); } catch { /* Invalid data has an explicit visible state. */ }
  }
  const displayState = state.status !== "ready" ? state : !model
    ? { status: "error", title: "Décomposition indisponible", message: "Les contributions doivent être finies et identifiées sans doublon." } as const
    : null;
  return <DataCard title={title} description={description} className={className}>
    {displayState ? <ChartState state={displayState} minimumHeight={280} /> : model ? <>
      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted" aria-label="Légende des contributions">
        {[["increase", "Contribution à la hausse"], ["decrease", "Contribution à la baisse"], ["total", "Total"]].map(([kind, label]) =>
          <span key={kind} className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: stepColor(kind as WaterfallStep["kind"]) }} aria-hidden="true" />{label}</span>)}
      </div>
      {model.residual !== 0 ? <p className="mb-3 rounded-xl bg-negative-soft p-3 text-sm text-negative-ink" role="status">
        Une partie de l’écart reste non attribuée : {formatNumber(model.residual, valueFormat)}.
      </p> : null}
      <figure aria-label={title}>
        <div className="overflow-x-auto rounded-xl" role="region" aria-label="Graphique des contributions, défilement horizontal si nécessaire" tabIndex={0}>
          <div style={{ height: 310, minWidth: Math.max(540, model.steps.length * 110) }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={model.steps} margin={{ top: 28, right: 16, bottom: 12, left: 8 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 5" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} interval={0} tick={{ fill: "var(--muted)", fontSize: 11 }}
                  tickFormatter={(label: string) => label.length > 18 ? `${label.slice(0, 16)}…` : label} />
                <YAxis domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]} width="auto"
                  axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} tickFormatter={(value: number) => formatNumber(value, valueFormat)} />
                <ReferenceLine y={0} stroke="var(--chart-grid)" />
                <Tooltip content={(props) => <WaterfallTooltip {...props} valueFormat={valueFormat} />} isAnimationActive={false} />
                <Line type="stepAfter" dataKey="after" stroke="var(--muted)" strokeDasharray="3 4" strokeWidth={1} dot={false} activeDot={false} isAnimationActive={false} tooltipType="none" />
                <Bar dataKey="range" maxBarSize={64} isAnimationActive={!reducedMotion} animationDuration={300}>
                  {model.steps.map((step) => <Cell key={step.id} fill={stepColor(step.kind)} />)}
                  <LabelList dataKey="value" position="top" fill="var(--ink)" fontSize={11} formatter={(value) => typeof value === "number" ? formatNumber(value, valueFormat) : ""} />
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <figcaption className="mt-3 text-xs leading-5 text-muted">
          Référence + contributions = période analysée. Cette décomposition décrit l’écart, sans établir de causalité.
          {model.grouped ? ` Les ${model.grouped} dernières contributions sont regroupées dans « Autres ».` : ""}
        </figcaption>
      </figure>
      <details className="mt-4 rounded-xl border border-line bg-canvas">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Voir toutes les contributions</summary>
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Contributions exactes — {title}</caption>
            <thead><tr><th scope="col" className="px-4 py-3">Élément</th><th scope="col" className="px-4 py-3 text-right">Valeur</th></tr></thead>
            <tbody>
              <tr><th scope="row" className="px-4 py-2">Référence</th><td className="px-4 py-2 text-right tabular-nums">{formatNumber(start, valueFormat)}</td></tr>
              {contributions.map((item) => <tr key={item.id}><th scope="row" className="px-4 py-2 font-normal">{item.label}</th>
                <td className="px-4 py-2 text-right tabular-nums">{formatNumber(item.value, { ...valueFormat, signDisplay: "exceptZero" })}</td></tr>)}
              {model.residual !== 0 ? <tr><th scope="row" className="px-4 py-2">Écart non attribué</th><td className="px-4 py-2 text-right">{formatNumber(model.residual, valueFormat)}</td></tr> : null}
              <tr><th scope="row" className="px-4 py-2">Période analysée</th><td className="px-4 py-2 text-right tabular-nums">{formatNumber(end, valueFormat)}</td></tr>
            </tbody>
          </table>
        </div>
      </details>
    </> : null}
  </DataCard>;
}
