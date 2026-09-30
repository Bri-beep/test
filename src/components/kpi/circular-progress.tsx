"use client";

import { motion, useReducedMotion } from "framer-motion";

import { ChartState } from "@/components/charts/chart-state";
import { clamp, formatNumber, getToneColor, getToneInk } from "@/components/data-visualization/format";
import {
  READY_VISUALIZATION_STATE,
  type DataTone,
  type NumberFormat,
  type VisualizationState,
} from "@/components/data-visualization/types";

export type CircularProgressStatus = {
  label: string;
  tone?: DataTone;
};

export type CircularProgressProps = {
  value: number;
  max?: number;
  label?: string;
  status?: CircularProgressStatus;
  tone?: DataTone;
  size?: number;
  thickness?: number;
  format?: NumberFormat;
  showMaximum?: boolean;
  state?: VisualizationState;
  className?: string;
};

export function CircularProgress({
  value,
  max = 100,
  label = "Score",
  status,
  tone = "brand",
  size = 190,
  thickness = 16,
  format = { maximumFractionDigits: 0 },
  showMaximum = true,
  state = READY_VISUALIZATION_STATE,
  className = "",
}: CircularProgressProps) {
  const prefersReducedMotion = useReducedMotion();
  const safeSize = Number.isFinite(size) ? clamp(size, 96, 480) : 190;
  const safeThickness = Number.isFinite(thickness) ? clamp(thickness, 4, safeSize / 3) : 16;

  if (state.status !== "ready") {
    return (
      <div className={className} style={{ width: safeSize, minHeight: safeSize }}>
        <ChartState state={state} minimumHeight={safeSize} />
      </div>
    );
  }

  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
    return (
      <div className={className} style={{ width: safeSize, minHeight: safeSize }}>
        <ChartState
          state={{
            status: "empty",
            title: "Indicateur indisponible",
            message: "Aucune valeur valide n’est disponible pour cet indicateur.",
          }}
          minimumHeight={safeSize}
        />
      </div>
    );
  }

  const safeMaximum = max;
  const safeValue = clamp(value, 0, safeMaximum);
  const radius = (safeSize - safeThickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = safeValue / safeMaximum;
  const statusTone = status?.tone ?? tone;
  const valueText = `${formatNumber(safeValue, format)}${showMaximum ? `/${formatNumber(safeMaximum, format)}` : ""}`;

  return (
    <div
      className={`relative grid shrink-0 place-items-center ${className}`}
      style={{ width: safeSize, height: safeSize }}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMaximum}
      aria-valuenow={safeValue}
      aria-valuetext={`${valueText}${status ? `, ${status.label}` : ""}`}
    >
      <svg viewBox={`0 0 ${safeSize} ${safeSize}`} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle
          cx={safeSize / 2}
          cy={safeSize / 2}
          r={radius}
          fill="none"
          stroke="var(--chart-grid)"
          strokeWidth={safeThickness}
        />
        <motion.circle
          cx={safeSize / 2}
          cy={safeSize / 2}
          r={radius}
          fill="none"
          stroke={getToneColor(tone)}
          strokeWidth={safeThickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={prefersReducedMotion ? false : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - progress) }}
          transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="relative max-w-[70%] text-center">
        <p className="text-xs font-medium text-muted">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-[-0.035em] tabular-nums text-ink">{valueText}</p>
        {status ? (
          <span
            className="mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{ color: getToneInk(statusTone), background: `color-mix(in srgb, ${getToneColor(statusTone)} 14%, transparent)` }}
          >
            {status.label}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function Gauge(props: CircularProgressProps) {
  return <CircularProgress {...props} />;
}
