"use client";

import type { ReactNode } from "react";

import { DataCard } from "@/components/cards/data-card";
import { ChartState } from "@/components/charts/chart-state";
import { Sparkline, type SparklineProps } from "@/components/charts/sparkline";
import { formatNumber } from "@/components/data-visualization/format";
import {
  READY_VISUALIZATION_STATE,
  type DataTrend,
  type NumberFormat,
  type VisualizationState,
} from "@/components/data-visualization/types";
import { CircularProgress, type CircularProgressProps } from "@/components/kpi/circular-progress";
import { TrendIndicator } from "@/components/kpi/trend-indicator";

type BaseKpiProps<TValue extends number | string = number | string> = {
  label: string;
  value: TValue;
  format?: NumberFormat;
  trend?: DataTrend;
  description?: string;
  meta?: ReactNode;
  action?: ReactNode;
  state?: VisualizationState;
  className?: string;
  interactive?: boolean;
};

export type BigNumberKPIProps =
  | (BaseKpiProps & { variant?: "plain" })
  | (BaseKpiProps & {
      variant: "sparkline";
      sparkline: Omit<SparklineProps, "ariaLabel"> & { ariaLabel?: string };
    })
  | (BaseKpiProps<number> & {
      variant: "gauge";
      gauge: Omit<CircularProgressProps, "value"> & { value?: number };
    });

function BigNumberLoading({ label = "Chargement de l’indicateur" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="animate-pulse">
      <span className="block h-4 w-2/5 rounded-full bg-line" aria-hidden="true" />
      <span className="mt-5 block h-12 w-3/5 rounded-xl bg-[color:var(--skeleton)]" aria-hidden="true" />
      <span className="mt-4 block h-8 w-1/3 rounded-full bg-line" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function BigNumberKPI(props: BigNumberKPIProps) {
  const {
    label,
    value,
    format = { maximumFractionDigits: 1 },
    trend,
    description,
    meta,
    action,
    state = READY_VISUALIZATION_STATE,
    className = "",
    interactive = false,
  } = props;
  const variant = props.variant ?? "plain";
  const formattedValue = typeof value === "number" ? formatNumber(value, format) : value;

  return (
    <DataCard className={className} interactive={interactive} padding="compact" ariaLabel={label}>
      {state.status === "loading" ? <BigNumberLoading label={state.label} /> : null}
      {state.status === "empty" || state.status === "error" ? <ChartState state={state} minimumHeight={164} /> : null}
      {state.status === "ready" ? (
        <div className={variant === "gauge" ? "grid items-center gap-5 sm:grid-cols-[minmax(0,1fr)_auto]" : ""}>
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted">{label}</p>
                {description ? <p className="mt-1 text-xs font-light leading-5 text-muted">{description}</p> : null}
              </div>
              {action ? <div className="shrink-0">{action}</div> : null}
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-2">
              <p className="text-[2.75rem] font-black leading-none tracking-[-0.055em] tabular-nums text-ink sm:text-5xl">
                {formattedValue}
              </p>
              {trend ? <TrendIndicator trend={trend} /> : null}
            </div>
            {meta ? <div className="mt-4 text-sm font-light leading-6 text-muted">{meta}</div> : null}
            {props.variant === "sparkline" ? (
              <div className="-mx-2 mt-3">
                <Sparkline {...props.sparkline} ariaLabel={props.sparkline.ariaLabel ?? `Évolution de ${label}`} />
              </div>
            ) : null}
          </div>
          {props.variant === "gauge" ? (
            <CircularProgress
              {...props.gauge}
              value={props.gauge.value ?? props.value}
              size={props.gauge.size ?? 158}
            />
          ) : null}
        </div>
      ) : null}
    </DataCard>
  );
}
