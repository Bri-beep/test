import type { PointerEvent as ReactPointerEvent } from "react";

import { clamp, getToneColor } from "@/components/data-visualization/format";
import { getMarkerAriaLabel, getRegionAriaLabel } from "@/components/maps/map-geometry";
import type {
  MapDataTableRow,
  MapRegionDatum,
  MapTooltipDatum,
  MapValueRange,
  ProjectedMapMarker,
} from "@/components/maps/types";

export function MapLoadingState({
  label,
  height,
}: {
  label: string;
  height: number;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className="relative overflow-hidden rounded-2xl border border-line bg-canvas"
      style={{ height }}
    >
      <div className="absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_42%_48%,var(--line)_0,transparent_34%),linear-gradient(135deg,transparent_30%,var(--line)_50%,transparent_70%)] opacity-[0.55]" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function MapEmptyState({
  title,
  message,
  height,
}: {
  title: string;
  message: string;
  height: number;
}) {
  return (
    <div
      className="grid place-items-center rounded-2xl border border-dashed border-line bg-canvas px-6 text-center"
      style={{ minHeight: height }}
    >
      <div className="max-w-md">
        <span
          className="mx-auto grid size-11 place-items-center rounded-full border border-line bg-surface text-data-slate-ink shadow-sm"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2V6Z" />
            <path d="M9 4v14m6-12v14" />
          </svg>
        </span>
        <p className="mt-3 font-semibold text-ink">{title}</p>
        <p className="mt-1.5 text-sm font-light leading-6 text-muted">
          {message}
        </p>
      </div>
    </div>
  );
}

export function MapErrorState({
  title,
  message,
  height,
}: {
  title: string;
  message: string;
  height: number;
}) {
  return (
    <div
      role="alert"
      className="grid place-items-center rounded-2xl border border-negative-border bg-negative-soft px-6 text-center"
      style={{ minHeight: height }}
    >
      <div className="max-w-md">
        <span
          className="mx-auto grid size-11 place-items-center rounded-full bg-surface text-negative-ink shadow-sm"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5m0 3.5h.01" strokeLinecap="round" />
          </svg>
        </span>
        <p className="mt-3 font-semibold text-ink">{title}</p>
        <p className="mt-1.5 text-sm font-light leading-6 text-muted">
          {message}
        </p>
      </div>
    </div>
  );
}

export function MapTooltip({
  datum,
  tooltipId,
  width,
  height,
  valueLabel,
  formatValue,
}: {
  datum: MapTooltipDatum;
  tooltipId: string;
  width: number;
  height: number;
  valueLabel: string;
  formatValue: (value: number) => string;
}) {
  const alignRight = datum.x > width / 2;
  const alignAbove = datum.y > height * 0.38;

  return (
    <div
      id={tooltipId}
      role="tooltip"
      className="pointer-events-none absolute z-20 w-max max-w-64 rounded-xl border border-line bg-surface-glass px-3.5 py-3 text-left shadow-floating backdrop-blur-md"
      style={{
        left: clamp(datum.x, 12, width - 12),
        top: clamp(datum.y, 12, height - 12),
        transform: `translate(${alignRight ? "-100%" : "0"}, ${
          alignAbove ? "calc(-100% - 12px)" : "12px"
        })`,
      }}
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: getToneColor(datum.tone) }}
          aria-hidden="true"
        />
        {datum.label}
      </span>
      <span className="mt-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-muted">
        {valueLabel}
      </span>
      <span className="mt-0.5 block text-lg font-semibold tabular-nums text-ink">
        {datum.value === undefined ? "Aucune donnée" : formatValue(datum.value)}
      </span>
      {datum.description ? (
        <span className="mt-1.5 block max-w-56 text-xs leading-5 text-muted">
          {datum.description}
        </span>
      ) : null}
    </div>
  );
}

function ZoomIcon({ direction }: { direction: "in" | "out" | "reset" }) {
  if (direction === "reset") {
    return (
      <svg
        viewBox="0 0 20 20"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        aria-hidden="true"
      >
        <path d="M4 7V3m0 0h4M4 3l3 3" strokeLinecap="round" />
        <path d="M16 13v4m0 0h-4m4 0-3-3" strokeLinecap="round" />
        <path d="M13 4h3v3M7 16H4v-3" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 20 20"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M4 10h12" strokeLinecap="round" />
      {direction === "in" ? (
        <path d="M10 4v12" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

export function MapZoomControls({
  zoom,
  initialZoom,
  minZoom,
  maxZoom,
  isCentered,
  onZoomChange,
  onReset,
}: {
  zoom: number;
  initialZoom: number;
  minZoom: number;
  maxZoom: number;
  isCentered: boolean;
  onZoomChange: (zoom: number) => void;
  onReset: () => void;
}) {
  const step = 0.5;
  const buttonClassName =
    "grid min-h-11 min-w-11 place-items-center text-ink transition duration-200 ease-out hover:bg-accent-soft hover:text-brand-ink disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <div
      role="group"
      aria-label="Contrôles de zoom"
      className="absolute right-3 top-3 z-10 flex overflow-hidden rounded-xl border border-line bg-surface-glass shadow-floating backdrop-blur-md"
    >
      <button
        type="button"
        aria-label="Dézoomer la carte"
        className={buttonClassName}
        disabled={zoom <= minZoom}
        onClick={() => onZoomChange(clamp(zoom - step, minZoom, maxZoom))}
      >
        <ZoomIcon direction="out" />
      </button>
      <button
        type="button"
        aria-label={`Réinitialiser et recentrer la carte au zoom ${initialZoom.toLocaleString("fr-FR")}`}
        className={`${buttonClassName} border-x border-line`}
        disabled={zoom === initialZoom && isCentered}
        onClick={onReset}
      >
        <ZoomIcon direction="reset" />
      </button>
      <button
        type="button"
        aria-label="Zoomer sur la carte"
        className={buttonClassName}
        disabled={zoom >= maxZoom}
        onClick={() => onZoomChange(clamp(zoom + step, minZoom, maxZoom))}
      >
        <ZoomIcon direction="in" />
      </button>
    </div>
  );
}

export function MapLegend({
  range,
  valueLabel,
  formatValue,
}: {
  range: MapValueRange;
  valueLabel: string;
  formatValue: (value: number) => string;
}) {
  return (
    <div
      role="img"
      className="absolute bottom-3 left-3 z-10 min-w-36 rounded-xl border border-line bg-surface-glass px-3 py-2.5 shadow-floating backdrop-blur-md"
      aria-label={`${valueLabel}, de ${formatValue(range.minimum)} à ${formatValue(range.maximum)}`}
    >
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted">
        {valueLabel}
      </p>
      <span
        className="mt-2 flex h-1.5 overflow-hidden rounded-full"
        aria-hidden="true"
      >
        {[0.2, 0.34, 0.48, 0.64, 0.82].map((opacity) => (
          <span
            key={opacity}
            className="flex-1"
            style={{
              backgroundColor: getToneColor("brand"),
              opacity,
            }}
          />
        ))}
      </span>
      <span className="mt-1.5 flex justify-between gap-4 text-[0.6875rem] font-medium tabular-nums text-muted">
        <span>{formatValue(range.minimum)}</span>
        <span>{formatValue(range.maximum)}</span>
      </span>
    </div>
  );
}

export function AccessibleMapDataTable({
  rows,
  valueLabel,
  formatValue,
}: {
  rows: readonly MapDataTableRow[];
  valueLabel: string;
  formatValue: (value: number) => string;
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <details className="group mt-3 rounded-xl border border-line bg-canvas-subtle text-sm">
      <summary className="flex min-h-11 list-none items-center justify-between gap-3 rounded-xl px-4 py-2.5 font-medium text-ink transition hover:bg-accent-soft marker:hidden [&::-webkit-details-marker]:hidden">
        Consulter les données sous forme de tableau
        <svg
          viewBox="0 0 20 20"
          className="size-4 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path d="m6 8 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="overflow-x-auto border-t border-line">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Valeurs représentées sur la carte
          </caption>
          <thead>
            <tr className="text-xs uppercase tracking-[0.08em] text-muted">
              <th scope="col" className="px-4 py-3 font-medium">
                Élément
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Type
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {valueLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-line text-ink">
                <th scope="row" className="px-4 py-3 font-medium">
                  {row.label}
                  {row.description ? (
                    <span className="mt-0.5 block font-normal text-muted">
                      {row.description}
                    </span>
                  ) : null}
                </th>
                <td className="px-4 py-3 text-muted">{row.kind}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">
                  {row.value === undefined
                    ? "Aucune donnée"
                    : formatValue(row.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function MapShadowFilter({ filterId }: { filterId: string }) {
  return (
    <defs>
      <filter
        id={filterId}
        x="-100%"
        y="-100%"
        width="300%"
        height="300%"
      >
        <feDropShadow
          dx="0"
          dy="2"
          stdDeviation="2.5"
          floodColor="var(--map-shadow)"
          floodOpacity="0.18"
        />
      </filter>
    </defs>
  );
}

export function MapRegionLayer({
  regions,
  activeKey,
  tooltipId,
  valueLabel,
  formatValue,
  onPointerEnter,
  onExit,
}: {
  regions: readonly MapRegionDatum[];
  activeKey: string | undefined;
  tooltipId: string;
  valueLabel: string;
  formatValue: (value: number) => string;
  onPointerEnter: (
    event: ReactPointerEvent<SVGPathElement>,
    region: MapRegionDatum,
  ) => void;
  onExit: () => void;
}) {
  return (
    <g role="group" aria-label="Zones géographiques">
      {regions.map((region) => {
        const datumKey = `region-${region.key}`;
        const isActive = activeKey === datumKey;

        return (
          <path
            key={datumKey}
            d={region.path}
            role="img"
            aria-label={getRegionAriaLabel(region, valueLabel, formatValue)}
            aria-describedby={isActive ? tooltipId : undefined}
            fill={getToneColor("brand")}
            fillOpacity={
              isActive
                ? Math.min(1, region.fillOpacity + 0.12)
                : region.fillOpacity
            }
            stroke={isActive ? "var(--ink)" : "var(--surface)"}
            strokeWidth={isActive ? 2 : 1.25}
            vectorEffect="non-scaling-stroke"
            className="cursor-default outline-none transition-[fill-opacity,stroke] duration-200 ease-out"
            onPointerEnter={(event) => onPointerEnter(event, region)}
            onPointerLeave={onExit}
          />
        );
      })}
    </g>
  );
}

export function MapHeatLayer({
  markers,
}: {
  markers: readonly ProjectedMapMarker[];
}) {
  return (
    <g aria-hidden="true" pointerEvents="none">
      {markers.map((marker) => (
        <circle
          key={`heat-${marker.id}`}
          cx={marker.point[0]}
          cy={marker.point[1]}
          r={marker.heatRadius}
          fill={getToneColor(marker.tone ?? "brand")}
          fillOpacity="0.16"
          className="blur-md"
        />
      ))}
    </g>
  );
}

export function MapMarkerLayer({
  markers,
  activeKey,
  tooltipId,
  filterId,
  zoom,
  valueLabel,
  formatValue,
  onPointerEnter,
  onExit,
  onFocus,
}: {
  markers: readonly ProjectedMapMarker[];
  activeKey: string | undefined;
  tooltipId: string;
  filterId: string;
  zoom: number;
  valueLabel: string;
  formatValue: (value: number) => string;
  onPointerEnter: (
    event: ReactPointerEvent<SVGGElement>,
    marker: ProjectedMapMarker,
  ) => void;
  onExit: () => void;
  onFocus: (marker: ProjectedMapMarker) => void;
}) {
  return (
    <g role="group" aria-label="Repères géographiques">
      {markers.map((marker) => {
        const datumKey = `marker-${marker.id}`;
        const isActive = activeKey === datumKey;
        const tone = marker.tone ?? "brand";

        return (
          <g
            key={datumKey}
            data-map-marker="true"
            role="img"
            tabIndex={0}
            aria-label={getMarkerAriaLabel(marker, valueLabel, formatValue)}
            aria-describedby={isActive ? tooltipId : undefined}
            className="cursor-default outline-none"
            transform={`translate(${marker.point[0]} ${marker.point[1]})`}
            onPointerEnter={(event) => onPointerEnter(event, marker)}
            onPointerLeave={onExit}
            onFocus={() => onFocus(marker)}
            onBlur={onExit}
          >
            <circle
              r={(isActive ? 11 : 9) / zoom}
              fill="var(--surface)"
              fillOpacity="0.96"
              stroke={isActive ? "var(--focus-ring)" : getToneColor(tone)}
              strokeWidth={isActive ? 3 : 2}
              filter={`url(#${filterId})`}
              vectorEffect="non-scaling-stroke"
              className="transition-all duration-200 ease-out"
            />
            <circle
              r={(isActive ? 4.5 : 3.5) / zoom}
              fill={getToneColor(tone)}
              className="transition-all duration-200 ease-out"
            />
          </g>
        );
      })}
    </g>
  );
}
