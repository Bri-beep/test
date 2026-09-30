import type { VisualizationState } from "@/components/data-visualization/types";

export function ChartState({
  state,
  minimumHeight = 180,
}: {
  state: Exclude<VisualizationState, { status: "ready" }>;
  minimumHeight?: number;
}) {
  const safeMinimumHeight = Number.isFinite(minimumHeight)
    ? Math.min(Math.max(minimumHeight, 80), 800)
    : 180;

  if (state.status === "loading") {
    return (
      <div
        role="status"
        aria-label={state.label ?? "Chargement de la visualisation"}
        className="flex animate-pulse flex-col justify-end gap-4 rounded-2xl bg-canvas-subtle p-5"
        style={{ minHeight: safeMinimumHeight }}
      >
        <span className="sr-only">{state.label ?? "Chargement de la visualisation…"}</span>
        <span className="h-3 w-2/5 rounded-full bg-line" aria-hidden="true" />
        <span className="h-24 rounded-xl bg-[color:var(--skeleton)]" aria-hidden="true" />
        <span className="h-3 w-3/4 rounded-full bg-line" aria-hidden="true" />
      </div>
    );
  }

  const isError = state.status === "error";
  const title = state.title ?? (isError ? "Visualisation indisponible" : "Aucune donnée");
  const message = isError
    ? state.message
    : state.message ?? "Aucune donnée ne correspond aux filtres sélectionnés.";

  return (
    <div
      role={isError ? "alert" : "status"}
      className={`grid place-items-center rounded-2xl border border-dashed p-6 text-center ${
        isError ? "border-negative-border bg-negative-soft" : "border-line bg-canvas-subtle"
      }`}
      style={{ minHeight: safeMinimumHeight }}
    >
      <div className="max-w-md">
        <span
          className={`mx-auto grid size-11 place-items-center rounded-full ${
            isError ? "bg-negative-soft text-negative-ink" : "bg-surface text-data-slate-ink shadow-sm"
          }`}
          aria-hidden="true"
        >
          {isError ? (
            <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M10 6.2v4.5M10 14h.01" strokeLinecap="round" />
              <circle cx="10" cy="10" r="7" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M4 14.5V10m4 4.5V6m4 8.5V8m4 6.5V4" strokeLinecap="round" />
            </svg>
          )}
        </span>
        <p className="mt-3 font-semibold text-ink">{title}</p>
        <p className="mt-1.5 text-sm font-light leading-6 text-muted">{message}</p>
      </div>
    </div>
  );
}
