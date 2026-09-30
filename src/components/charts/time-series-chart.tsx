"use client";

import { useReducedMotion } from "framer-motion";
import { useId, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

import { DataCard } from "@/components/cards/data-card";
import { ChartState } from "@/components/charts/chart-state";
import { formatAxisValue, formatNumber, getToneColor } from "@/components/data-visualization/format";
import {
  READY_VISUALIZATION_STATE,
  type AxisValueFormat,
  type DataTone,
  type DataTrend,
  type NumberFormat,
  type VisualizationState,
} from "@/components/data-visualization/types";
import { TrendIndicator } from "@/components/kpi/trend-indicator";

export type TimeSeriesPoint = Record<string, string | number | null | undefined>;

export type TimeSeriesDefinition = {
  key: string;
  label: string;
  tone: DataTone;
  area?: boolean;
  strokeDasharray?: string;
};

export type TimeSeriesMetric = {
  id: string;
  label: string;
  value: number | string;
  format?: NumberFormat;
  trend?: DataTrend;
};

export type TimeSeriesChartProps = {
  title: string;
  description?: string;
  data: readonly TimeSeriesPoint[];
  xKey: string;
  series: readonly TimeSeriesDefinition[];
  metrics?: readonly TimeSeriesMetric[];
  state?: VisualizationState;
  height?: number;
  valueFormat?: NumberFormat;
  xFormat?: AxisValueFormat;
  tooltipLabelFormat?: AxisValueFormat;
  showLegend?: boolean;
  showDataTable?: boolean;
  className?: string;
};

export function getValidHiddenSeries(
  hiddenSeries: ReadonlySet<string>,
  series: readonly Pick<TimeSeriesDefinition, "key">[],
) {
  const validKeys = new Set(series.map((definition) => definition.key));
  const validHiddenSeries = new Set(
    [...hiddenSeries].filter((hiddenKey) => validKeys.has(hiddenKey)),
  );

  if (
    series.length > 0 &&
    series.every((definition) => validHiddenSeries.has(definition.key))
  ) {
    validHiddenSeries.delete(series[0]!.key);
  }

  return validHiddenSeries;
}

type ChartTooltipProps = TooltipContentProps & {
  series: readonly TimeSeriesDefinition[];
  valueFormat: NumberFormat;
  formatLabel: (value: string | number) => string;
};

function TimeSeriesTooltip({ active, payload, label, series, valueFormat, formatLabel }: ChartTooltipProps) {
  if (!active || payload.length === 0 || label === undefined) {
    return null;
  }

  const rows = series
    .map((definition) => {
      const entry = payload.find((item) => String(item.dataKey) === definition.key);
      const numericValue = typeof entry?.value === "number" ? entry.value : Number(entry?.value);
      return Number.isFinite(numericValue) ? { definition, value: numericValue } : null;
    })
    .filter((row): row is { definition: TimeSeriesDefinition; value: number } => row !== null);

  return (
    <div className="min-w-48 rounded-2xl border border-line bg-tooltip p-3.5 shadow-floating">
      <p className="text-xs font-medium text-muted">{formatLabel(label)}</p>
      <ul className="mt-2.5 space-y-2">
        {rows.map(({ definition, value }) => (
          <li key={definition.key} className="flex items-center justify-between gap-5 text-sm">
            <span className="flex items-center gap-2 text-muted">
              <span className="size-2 rounded-full" style={{ background: getToneColor(definition.tone) }} aria-hidden="true" />
              {definition.label}
            </span>
            <span className="font-semibold tabular-nums text-ink">{formatNumber(value, valueFormat)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TimeSeriesDataTable({
  title,
  data,
  xKey,
  series,
  xFormat,
  valueFormat,
}: {
  title: string;
  data: readonly TimeSeriesPoint[];
  xKey: string;
  series: readonly TimeSeriesDefinition[];
  xFormat?: AxisValueFormat;
  valueFormat: NumberFormat;
}) {
  return (
    <details className="group mt-4 rounded-xl border border-line bg-canvas">
      <summary className="flex min-h-11 list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-neutral-soft [&::-webkit-details-marker]:hidden">
        Voir les données du graphique
        <svg viewBox="0 0 20 20" className="size-4 text-muted transition-transform group-open:rotate-180" fill="none" aria-hidden="true">
          <path d="m6.5 8 3.5 3.5L13.5 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="max-h-80 overflow-auto border-t border-line">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <caption className="sr-only">Données exactes — {title}</caption>
          <thead className="sticky top-0 bg-surface text-xs uppercase tracking-[0.08em] text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Période</th>
              {series.map((definition) => (
                <th key={definition.key} scope="col" className="px-4 py-3 text-right font-semibold">{definition.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.map((point, index) => (
              <tr key={`${String(point[xKey])}-${index}`}>
                <th scope="row" className="whitespace-nowrap px-4 py-3 font-medium text-ink">
                  {formatAxisValue(point[xKey] ?? index, xFormat)}
                </th>
                {series.map((definition) => {
                  const rawValue = point[definition.key];
                  const value = typeof rawValue === "number" && Number.isFinite(rawValue) ? formatNumber(rawValue, valueFormat) : "—";
                  return <td key={definition.key} className="px-4 py-3 text-right tabular-nums text-muted">{value}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function TimeSeriesChart({
  title,
  description,
  data,
  xKey,
  series,
  metrics = [],
  state = READY_VISUALIZATION_STATE,
  height = 360,
  valueFormat = { notation: "compact", maximumFractionDigits: 1 },
  xFormat,
  tooltipLabelFormat,
  showLegend = true,
  showDataTable = true,
  className = "",
}: TimeSeriesChartProps) {
  const prefersReducedMotion = useReducedMotion();
  const safeHeight = Number.isFinite(height) ? Math.min(Math.max(height, 220), 720) : 360;
  const gradientPrefix = `series-${useId().replaceAll(":", "")}`;
  const [hiddenSeries, setHiddenSeries] = useState<ReadonlySet<string>>(() => new Set());
  const validHiddenSeries = useMemo(
    () => getValidHiddenSeries(hiddenSeries, series),
    [hiddenSeries, series],
  );
  const preparedData = useMemo(
    () =>
      data.map((point) => {
        const preparedPoint: TimeSeriesPoint = { ...point };
        series.forEach((definition) => {
          const value = point[definition.key];
          preparedPoint[definition.key] = typeof value === "number" && Number.isFinite(value) ? value : null;
        });
        return preparedPoint;
      }),
    [data, series],
  );
  const hasChartValues = useMemo(
    () => preparedData.some((point) => series.some((definition) => typeof point[definition.key] === "number")),
    [preparedData, series],
  );

  function toggleSeries(key: string) {
    setHiddenSeries((current) => {
      const next = new Set(getValidHiddenSeries(current, series));
      if (next.has(key)) {
        next.delete(key);
      } else if (
        series.some(
          (definition) =>
            definition.key !== key && !next.has(definition.key),
        )
      ) {
        next.add(key);
      }
      return getValidHiddenSeries(next, series);
    });
  }

  return (
    <DataCard title={title} description={description} className={className}>
      {state.status !== "ready" ? <ChartState state={state} minimumHeight={safeHeight} /> : null}
      {state.status === "ready" && (preparedData.length === 0 || series.length === 0 || !hasChartValues) ? (
        <ChartState state={{ status: "empty" }} minimumHeight={safeHeight} />
      ) : null}
      {state.status === "ready" && preparedData.length > 0 && series.length > 0 && hasChartValues ? (
        <>
          {metrics.length > 0 ? (
            <dl className="mb-6 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
              {metrics.map((metric) => (
                <div key={metric.id} className="bg-surface px-4 py-4 sm:px-5">
                  <dt className="text-xs font-medium text-muted">{metric.label}</dt>
                  <dd className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-2xl font-bold tracking-[-0.035em] tabular-nums text-ink">
                      {typeof metric.value === "number" ? formatNumber(metric.value, metric.format) : metric.value}
                    </span>
                    {metric.trend ? <TrendIndicator trend={metric.trend} compact /> : null}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {showLegend ? (
            <div className="mb-3 flex flex-wrap gap-1" role="group" aria-label="Séries affichées">
              {series.map((definition) => {
                const isVisible = !validHiddenSeries.has(definition.key);
                return (
                  <button
                    key={definition.key}
                    type="button"
                    aria-pressed={isVisible}
                    onClick={() => toggleSeries(definition.key)}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium transition ${
                      isVisible ? "bg-neutral-soft text-ink" : "text-muted opacity-60 hover:opacity-100"
                    }`}
                  >
                    <svg viewBox="0 0 24 8" className="h-2 w-6" aria-hidden="true">
                      <path
                        d="M1 4h22"
                        stroke={getToneColor(definition.tone)}
                        strokeWidth="2.2"
                        strokeDasharray={definition.strokeDasharray}
                        strokeLinecap="round"
                      />
                      <circle cx="12" cy="4" r="2.1" fill={getToneColor(definition.tone)} />
                    </svg>
                    {definition.label}
                  </button>
                );
              })}
            </div>
          ) : null}

          <figure aria-label={`${title}. ${description ?? "Évolution temporelle."}`}>
            <div style={{ height: safeHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={preparedData} margin={{ top: 14, right: 8, bottom: 2, left: 0 }} accessibilityLayer>
                  <defs>
                    {series.map((definition, index) => definition.area ? (
                      <linearGradient key={definition.key} id={`${gradientPrefix}-${index}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={getToneColor(definition.tone)} stopOpacity={0.17} />
                        <stop offset="72%" stopColor={getToneColor(definition.tone)} stopOpacity={0.035} />
                        <stop offset="100%" stopColor={getToneColor(definition.tone)} stopOpacity={0} />
                      </linearGradient>
                    ) : null)}
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 5" />
                  <XAxis
                    dataKey={xKey}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "var(--muted)", fontSize: 12 }}
                    tickMargin={13}
                    minTickGap={28}
                    tickFormatter={(value: string | number) => formatAxisValue(value, xFormat)}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "var(--muted)", fontSize: 12 }}
                    tickMargin={10}
                    width="auto"
                    tickFormatter={(value: number) => formatNumber(value, valueFormat)}
                  />
                  <Tooltip
                    cursor={{ stroke: "var(--data-neutral)", strokeDasharray: "3 4", strokeOpacity: 0.68 }}
                    content={(props) => (
                      <TimeSeriesTooltip
                        {...props}
                        series={series.filter((definition) => !validHiddenSeries.has(definition.key))}
                        valueFormat={valueFormat}
                        formatLabel={(value) => formatAxisValue(value, tooltipLabelFormat ?? xFormat)}
                      />
                    )}
                    isAnimationActive={false}
                  />
                  {series.map((definition, index) =>
                    definition.area ? (
                      <Area
                        key={definition.key}
                        type="monotone"
                        dataKey={definition.key}
                        name={definition.label}
                        stroke={getToneColor(definition.tone)}
                        strokeWidth={2.35}
                        strokeDasharray={definition.strokeDasharray}
                        fill={`url(#${gradientPrefix}-${index})`}
                        fillOpacity={1}
                        dot={false}
                        activeDot={{ r: 4.5, stroke: "var(--surface)", strokeWidth: 2.5 }}
                        connectNulls={false}
                        hide={validHiddenSeries.has(definition.key)}
                        isAnimationActive={!prefersReducedMotion}
                        animationDuration={720}
                        animationEasing="ease-out"
                      />
                    ) : (
                      <Line
                        key={definition.key}
                        type="monotone"
                        dataKey={definition.key}
                        name={definition.label}
                        stroke={getToneColor(definition.tone)}
                        strokeWidth={2.2}
                        strokeDasharray={definition.strokeDasharray}
                        dot={false}
                        activeDot={{ r: 4.5, fill: getToneColor(definition.tone), stroke: "var(--surface)", strokeWidth: 2.5 }}
                        connectNulls={false}
                        hide={validHiddenSeries.has(definition.key)}
                        isAnimationActive={!prefersReducedMotion}
                        animationDuration={720}
                        animationEasing="ease-out"
                      />
                    ),
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <figcaption className="sr-only">
              {series.map((definition) => definition.label).join(", ")} sur {preparedData.length} périodes.
              {showDataTable ? " Les valeurs exactes sont disponibles dans le tableau qui suit." : ""}
            </figcaption>
          </figure>

          {showDataTable ? (
            <TimeSeriesDataTable
              title={title}
              data={preparedData}
              xKey={xKey}
              series={series}
              xFormat={xFormat}
              valueFormat={valueFormat}
            />
          ) : null}
        </>
      ) : null}
    </DataCard>
  );
}
