"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

import { DataCard } from "@/components/cards/data-card";
import { ChartState } from "@/components/charts/chart-state";
import { Sparkline } from "@/components/charts/sparkline";
import { formatNumber, getToneColor, getToneInk } from "@/components/data-visualization/format";
import {
  READY_VISUALIZATION_STATE,
  type DataTone,
  type DataTrend,
  type NumberFormat,
  type SparklinePoint,
  type VisualizationState,
} from "@/components/data-visualization/types";
import { TrendIndicator } from "@/components/kpi/trend-indicator";

export type MultiMetricVisual =
  | { type: "bars"; values: readonly number[]; tone?: DataTone }
  | { type: "sparkline"; data: readonly SparklinePoint[]; tone?: DataTone };

export type MultiMetricItem = {
  id: string;
  label: string;
  value: number | string;
  format?: NumberFormat;
  trend?: DataTrend;
  status?: { label: string; tone?: DataTone };
  visual?: MultiMetricVisual;
  helpText?: string;
};

export type MultiMetricCardProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
  metrics: readonly MultiMetricItem[];
  columns?: 2 | 3;
  state?: VisualizationState;
  className?: string;
};

function MiniBars({ values, tone = "positive" }: { values: readonly number[]; tone?: DataTone }) {
  const prefersReducedMotion = useReducedMotion();
  const finiteValues = values.filter((value) => Number.isFinite(value)).map((value) => Math.max(value, 0));
  const maximum = Math.max(...finiteValues, 1);

  return (
    <div className="flex h-12 w-28 items-end gap-1" aria-hidden="true">
      {finiteValues.map((value, index) => (
        <motion.span
          key={`${index}-${value}`}
          className="min-w-1 flex-1 rounded-t-[0.3rem]"
          style={{ background: getToneColor(tone) }}
          initial={prefersReducedMotion ? false : { height: 3, opacity: 0.45 }}
          animate={{ height: `${Math.max((value / maximum) * 100, 8)}%`, opacity: index === finiteValues.length - 1 ? 1 : 0.72 }}
          transition={{ delay: index * 0.035, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </div>
  );
}

function MetricHelp({ label, text }: { label: string; text: string }) {
  return (
    <details className="group relative">
      <summary className="grid size-11 list-none place-items-center rounded-full text-muted transition-colors hover:bg-canvas hover:text-ink [&::-webkit-details-marker]:hidden">
        <span className="sr-only">Définition de {label}</span>
        <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8.4 8a1.7 1.7 0 0 1 3.3.5c0 1.4-1.7 1.4-1.7 2.7M10 14h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </summary>
      <p className="absolute right-0 top-12 z-20 w-64 rounded-xl border border-line bg-tooltip p-3 text-xs font-light leading-5 text-ink shadow-floating group-open:block">
        {text}
      </p>
    </details>
  );
}

function getMetricCornerClasses(
  index: number,
  count: number,
  columns: NonNullable<MultiMetricCardProps["columns"]>,
) {
  if (count === 1) {
    return "rounded-[0.95rem]";
  }

  const classes = [
    index === 0 ? "rounded-t-[0.95rem] sm:rounded-tr-none" : "",
    index === 1 ? "sm:rounded-tr-[0.95rem]" : "",
    index === count - 1
      ? `rounded-b-[0.95rem] ${count % 2 === 0 ? "sm:rounded-bl-none" : ""}`
      : "",
    count % 2 === 0 && index === count - 2
      ? "sm:rounded-bl-[0.95rem]"
      : "",
  ];

  if (columns === 3) {
    const lastRowStart = count - (count % 3 || 3);
    classes.push(
      "xl:rounded-none",
      index === 0 ? "xl:rounded-tl-[0.95rem]" : "",
      index === Math.min(2, count - 1) ? "xl:rounded-tr-[0.95rem]" : "",
      index === lastRowStart ? "xl:rounded-bl-[0.95rem]" : "",
      index === count - 1 ? "xl:rounded-br-[0.95rem]" : "",
    );
  }

  return classes.filter(Boolean).join(" ");
}

export function MultiMetricCard({
  title,
  description,
  eyebrow,
  action,
  metrics,
  columns = 2,
  state = READY_VISUALIZATION_STATE,
  className = "",
}: MultiMetricCardProps) {
  return (
    <DataCard title={title} description={description} eyebrow={eyebrow} action={action} className={className} overflow="visible">
      {state.status !== "ready" ? <ChartState state={state} minimumHeight={280} /> : null}
      {state.status === "ready" && metrics.length === 0 ? <ChartState state={{ status: "empty" }} minimumHeight={280} /> : null}
      {state.status === "ready" && metrics.length > 0 ? (
        <dl className={`grid gap-px overflow-visible rounded-2xl border border-line bg-line ${columns === 3 ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2"}`}>
          {metrics.map((metric, index) => {
            const formattedValue = typeof metric.value === "number" ? formatNumber(metric.value, metric.format) : metric.value;
            const statusTone = metric.status?.tone ?? "positive";

            return (
              <div
                key={metric.id}
                className={`relative min-w-0 bg-surface p-5 sm:p-6 ${getMetricCornerClasses(index, metrics.length, columns)}`}
              >
                <dt className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-muted">
                  <span className="truncate">{metric.label}</span>
                  {metric.helpText ? <MetricHelp label={metric.label} text={metric.helpText} /> : null}
                </dt>
                <dd className="mt-3 flex min-w-0 flex-wrap items-end justify-between gap-4">
                  <div className="min-w-0">
                    <span className="text-3xl font-bold leading-none tracking-[-0.04em] tabular-nums text-ink">{formattedValue}</span>
                    <div className="mt-3 flex min-h-7 items-center">
                      {metric.trend ? <TrendIndicator trend={metric.trend} compact /> : null}
                      {metric.status ? (
                        <span
                          className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
                          style={{ color: getToneInk(statusTone), background: `color-mix(in srgb, ${getToneColor(statusTone)} 14%, transparent)` }}
                        >
                          {metric.status.label}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {metric.visual?.type === "bars" ? <MiniBars values={metric.visual.values} tone={metric.visual.tone} /> : null}
                  {metric.visual?.type === "sparkline" ? (
                    <Sparkline
                      data={metric.visual.data}
                      ariaLabel={`Évolution de ${metric.label}`}
                      tone={metric.visual.tone}
                      height={66}
                      showDot={false}
                      showTooltip={false}
                      className="w-32 shrink-0"
                    />
                  ) : null}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : null}
    </DataCard>
  );
}
