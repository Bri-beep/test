import { formatSignedPercent } from "@/components/data-visualization/format";
import type { DataTrend, TrendSentiment } from "@/components/data-visualization/types";

const sentimentInk: Record<TrendSentiment, string> = {
  positive: "var(--positive-ink)",
  negative: "var(--negative-ink)",
  neutral: "var(--muted)",
};

const sentimentSurface: Record<TrendSentiment, string> = {
  positive: "var(--positive-soft)",
  negative: "var(--negative-soft)",
  neutral: "var(--neutral-soft)",
};

const directionLabels = {
  up: "hausse",
  down: "baisse",
  flat: "stable",
} as const;

export function TrendIndicator({ trend, compact = false }: { trend: DataTrend; compact?: boolean }) {
  const arrowPath =
    trend.direction === "up"
      ? "M5 10.5 10 5.5l5 5M10 6v8.5"
      : trend.direction === "down"
        ? "M5 9.5 10 14.5l5-5M10 14V5.5"
        : "M5 10h10";
  const formattedTrend = formatSignedPercent(trend.value);

  return (
    <span
      className={`inline-flex min-h-7 items-center gap-1.5 rounded-full font-semibold tabular-nums ${
        compact ? "px-2 text-xs" : "px-2.5 text-sm"
      }`}
      style={{ color: sentimentInk[trend.sentiment], background: sentimentSurface[trend.sentiment] }}
      aria-label={`${formattedTrend}, ${directionLabels[trend.direction]}, ${trend.comparisonLabel}`}
      title={trend.comparisonLabel}
    >
      <svg viewBox="0 0 20 20" className={compact ? "size-3.5" : "size-4"} fill="none" aria-hidden="true">
        <path d={arrowPath} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {formattedTrend}
    </span>
  );
}
