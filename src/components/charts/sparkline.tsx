"use client";

import { useReducedMotion } from "framer-motion";
import { useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

import { ChartState } from "@/components/charts/chart-state";
import { formatNumber, getFiniteValues, getToneColor } from "@/components/data-visualization/format";
import {
  READY_VISUALIZATION_STATE,
  type DataTone,
  type NumberFormat,
  type SparklinePoint,
  type VisualizationState,
} from "@/components/data-visualization/types";

export type SparklineProps = {
  data: readonly SparklinePoint[];
  ariaLabel: string;
  tone?: DataTone;
  height?: number;
  showDot?: boolean;
  showTooltip?: boolean;
  format?: NumberFormat;
  state?: VisualizationState;
  className?: string;
};

type PreparedSparklinePoint = SparklinePoint & { index: number };

function SparklineTooltip({
  active,
  payload,
  format,
}: TooltipContentProps & { format: NumberFormat }) {
  const point = payload[0]?.payload as PreparedSparklinePoint | undefined;

  if (!active || !point) {
    return null;
  }

  return (
    <div className="rounded-xl border border-line bg-tooltip px-3 py-2 text-xs shadow-floating">
      {point.label ? <p className="font-medium text-muted">{point.label}</p> : null}
      <p className="mt-0.5 font-semibold tabular-nums text-ink">{formatNumber(point.value, format)}</p>
    </div>
  );
}

export function Sparkline({
  data,
  ariaLabel,
  tone = "positive",
  height = 96,
  showDot = true,
  showTooltip = true,
  format = {},
  state = READY_VISUALIZATION_STATE,
  className = "",
}: SparklineProps) {
  const prefersReducedMotion = useReducedMotion();
  const safeHeight = Number.isFinite(height) ? Math.min(Math.max(height, 48), 360) : 96;
  const gradientId = `sparkline-${useId().replaceAll(":", "")}`;
  const chartData = useMemo<PreparedSparklinePoint[]>(
    () =>
      data
        .filter((point) => Number.isFinite(point.value))
        .map((point, index) => ({ ...point, index })),
    [data],
  );

  if (state.status !== "ready") {
    return <ChartState state={state} minimumHeight={safeHeight} />;
  }

  if (chartData.length === 0) {
    return <ChartState state={{ status: "empty" }} minimumHeight={safeHeight} />;
  }

  const lastPoint = chartData.at(-1)!;
  const finiteValues = getFiniteValues(chartData.map((point) => point.value));
  const minimum = Math.min(...finiteValues);
  const maximum = Math.max(...finiteValues);
  const rangePadding = Math.max((maximum - minimum) * 0.22, Math.abs(maximum || 1) * 0.04);
  const domain: readonly [number, number] = [minimum - rangePadding, maximum + rangePadding];
  const firstPoint = chartData[0]!;
  const direction = lastPoint.value > firstPoint.value ? "en hausse" : lastPoint.value < firstPoint.value ? "en baisse" : "stable";

  return (
    <figure className={`relative min-w-0 ${className}`} aria-label={ariaLabel}>
      <div style={{ height: safeHeight }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={80}>
          <AreaChart data={chartData} margin={{ top: 10, right: 8, bottom: 4, left: 8 }} accessibilityLayer>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={getToneColor(tone)} stopOpacity={0.24} />
                <stop offset="74%" stopColor={getToneColor(tone)} stopOpacity={0.055} />
                <stop offset="100%" stopColor={getToneColor(tone)} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="index" hide type="number" domain={[0, Math.max(chartData.length - 1, 1)]} />
            <YAxis hide domain={domain} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={getToneColor(tone)}
              strokeWidth={2.15}
              fill={`url(#${gradientId})`}
              fillOpacity={1}
              dot={false}
              activeDot={{ r: 4.5, fill: getToneColor(tone), stroke: "var(--surface)", strokeWidth: 2.5 }}
              isAnimationActive={!prefersReducedMotion}
              animationDuration={620}
              animationEasing="ease-out"
            />
            {showDot ? (
              <ReferenceDot
                x={lastPoint.index}
                y={lastPoint.value}
                r={4.5}
                fill={getToneColor(tone)}
                stroke="var(--surface)"
                strokeWidth={2.5}
                ifOverflow="extendDomain"
              />
            ) : null}
            {showTooltip ? (
              <Tooltip
                cursor={{ stroke: getToneColor(tone), strokeDasharray: "3 4", strokeOpacity: 0.42 }}
                content={(props) => <SparklineTooltip {...props} format={format} />}
                isAnimationActive={false}
              />
            ) : null}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        {ariaLabel}. {chartData.length} points, de {formatNumber(firstPoint.value, format)} à {formatNumber(lastPoint.value, format)}, tendance {direction}.
        Minimum {formatNumber(minimum, format)}, maximum {formatNumber(maximum, format)}.
      </figcaption>
    </figure>
  );
}

export function MiniAreaChart(props: SparklineProps) {
  return <Sparkline {...props} height={props.height ?? 124} />;
}
