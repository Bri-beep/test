"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { comparisonResultSchema, type ComparisonResult } from "./contract";
import { ComparisonResults } from "./comparison-results";
import { ComparisonGenie, type ComparisonGenieOptions } from "./comparison-genie";
import { ComparisonSharing } from "./comparison-sharing";
import { assertComparisonSelection, readSharedComparison, type ComparisonSharingOptions } from "./sharing";
import { defaultSelection, resolvePeriods, selectionParameters, selectionSchema, type PeriodSelection } from "./periods";

export type PeriodComparisonProps = {
  endpoint: string;
  title?: string;
  description?: string;
  initialSelection?: PeriodSelection;
  showWaterfall?: boolean;
  genie?: ComparisonGenieOptions;
  sharing?: ComparisonSharingOptions;
};
type State = { status: "loading" | "blocked" } | { status: "ready"; result: ComparisonResult; applied: PeriodSelection; consultedAt: string }
  | { status: "error"; message: string; requestId?: string };
const errorSchema = z.object({ error: z.object({ message: z.string(), requestId: z.string().optional() }) });
const inputClass = "mt-2 min-h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink";

export function PeriodComparison({ endpoint, title = "Comparer deux périodes", description,
  initialSelection, showWaterfall = false, genie, sharing }: PeriodComparisonProps) {
  const id = useId();
  const initial = useRef(initialSelection ?? defaultSelection());
  const [selection, setSelection] = useState<PeriodSelection>(initial.current);
  const [state, setState] = useState<State>({ status: "loading" });
  const [segments, setSegments] = useState<ComparisonResult["availableSegments"]>([]);
  const [validation, setValidation] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);
  const [sharedLink, setSharedLink] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const sharingKey = sharing?.key;
  const allowSegment = sharing?.allowSegment;

  const load = useCallback(async (next: PeriodSelection) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setState({ status: "loading" });
    setDirty(false);
    try {
      const response = await fetch(`${endpoint}?${selectionParameters(next)}`, { signal: controller.signal, cache: "no-store" });
      const payload: unknown = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) {
        const error = errorSchema.safeParse(payload);
        setState({ status: "error", message: error.success ? error.data.error.message : "La comparaison n’est pas disponible.",
          requestId: error.success ? error.data.error.requestId : undefined });
        return;
      }
      const result = comparisonResultSchema.parse(payload);
      assertComparisonSelection(result, next);
      setSegments(result.availableSegments);
      setState({ status: "ready", result, applied: { ...next }, consultedAt: new Date().toISOString() });
    } catch {
      if (!controller.signal.aborted) setState({ status: "error", message: "La comparaison n’a pas pu être chargée. Vérifiez votre connexion puis réessayez." });
    }
  }, [endpoint]);

  useEffect(() => {
    let lastHash: string | undefined;
    function restore(first = false) {
      if (!first && lastHash === window.location.hash) return;
      lastHash = window.location.hash;
      const shared = readSharedComparison(window.location.hash, sharingKey ? { key: sharingKey, allowSegment } : undefined);
      if (shared.status === "invalid") {
        pending.current?.abort();
        setInvalidLink(true);
        setSharedLink(false);
        setValidation(undefined);
        setDirty(false);
        setState({ status: "blocked" });
        return;
      }
      if (shared.status === "ready" || first) {
        const next = shared.status === "ready" ? shared.selection : initial.current;
        setInvalidLink(false);
        setSharedLink(shared.status === "ready");
        setValidation(undefined);
        setSelection(next);
        void load(next);
      }
    }
    restore(true);
    const onNavigation = () => restore();
    window.addEventListener("hashchange", onNavigation);
    // History API navigation may restore a fragment without a native hashchange event.
    window.addEventListener("popstate", onNavigation);
    return () => {
      pending.current?.abort();
      window.removeEventListener("hashchange", onNavigation);
      window.removeEventListener("popstate", onNavigation);
    };
  }, [load, sharingKey, allowSegment]);

  function update(change: Partial<PeriodSelection>) {
    setSelection((previous) => ({ ...previous, ...change }));
    setValidation(undefined);
    setDirty(true);
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const parsed = selectionSchema.safeParse(selection);
    if (!parsed.success) { setValidation(parsed.error.issues[0]?.message ?? "Vérifiez les dates."); return; }
    try { resolvePeriods(parsed.data); } catch { setValidation("Ces dates sortent de la plage prise en charge."); return; }
    setValidation(undefined);
    setInvalidLink(false);
    setSharedLink(false);
    void load(parsed.data);
  }

  return <section id="period-comparison" aria-labelledby={`${id}-title`} className="min-w-0 space-y-5">
    <div><h2 id={`${id}-title`} className="text-2xl font-bold tracking-[-0.03em]">{title}</h2>
      {description ? <p className="mt-2 text-sm leading-6 text-muted">{description}</p> : null}</div>
    {invalidLink ? <p role="alert" className="rounded-xl border border-negative-border bg-negative-soft p-4 text-sm text-negative-ink">
      Lien de comparaison invalide. Choisissez les périodes et lancez une comparaison, ou demandez un nouveau lien.
    </p> : null}
    {sharedLink ? <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted" role="status">
      Analyse ouverte depuis un lien partagé. Les données sont recalculées avec les accès applicables ; les chiffres peuvent avoir évolué.
    </p> : null}
    <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-5 shadow-panel" aria-label="Choix des périodes">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="min-w-0 text-sm font-semibold">Début de la période analysée
          <input type="date" required max="9998-12-31" className={inputClass} value={selection.start} onChange={(event) => update({ start: event.target.value })} /></label>
        <label className="min-w-0 text-sm font-semibold">Fin de la période analysée
          <input type="date" required max="9998-12-31" className={inputClass} value={selection.end} onChange={(event) => update({ end: event.target.value })} /></label>
        <label className="min-w-0 text-sm font-semibold">Comparer avec
          <select className={inputClass} value={selection.mode} onChange={(event) => update({ mode: event.target.value as PeriodSelection["mode"], referenceStart: undefined, referenceEnd: undefined })}>
            <option value="previous-period">Période précédente</option><option value="previous-year">Année précédente</option><option value="custom">Dates personnalisées</option>
          </select></label>
        {selection.mode === "custom" ? <>
          <label className="min-w-0 text-sm font-semibold">Début de la référence
            <input type="date" required max="9998-12-31" className={inputClass} value={selection.referenceStart ?? ""} onChange={(event) => update({ referenceStart: event.target.value })} /></label>
          <label className="min-w-0 text-sm font-semibold">Fin de la référence
            <input type="date" required max="9998-12-31" className={inputClass} value={selection.referenceEnd ?? ""} onChange={(event) => update({ referenceEnd: event.target.value })} /></label>
        </> : null}
        {segments.length || selection.segment ? <label className="min-w-0 text-sm font-semibold">Segment commun aux deux périodes
          <select className={inputClass} value={selection.segment ?? ""} onChange={(event) => update({ segment: event.target.value || undefined })}>
            <option value="">Tous les segments</option>
            {selection.segment && !segments.some((segment) => segment.id === selection.segment) ? <option value={selection.segment}>Segment sans données</option> : null}
            {segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.label}</option>)}
          </select></label> : null}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button type="submit" className="min-h-11 rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-white">Comparer les périodes</button>
        <p className="text-xs leading-5 text-muted">Dates incluses · 366 jours maximum par période · mêmes filtres</p>
      </div>
      {validation ? <p role="alert" className="mt-3 text-sm text-negative-ink">{validation}</p> : null}
      {dirty ? <p className="mt-3 text-sm text-muted" role="status">Modifications non appliquées. Lancez la comparaison pour actualiser les résultats.</p> : null}
    </form>
    <div aria-busy={state.status === "loading"}>
      {state.status === "loading" ? <LoadingState label="Comparaison des périodes…" /> : null}
      {state.status === "error" ? <ErrorState title="Comparaison indisponible" message={state.message} requestId={state.requestId} onRetry={() => submit()} /> : null}
      {state.status === "ready" ? <>
        <ComparisonResults result={state.result} showWaterfall={showWaterfall} />
        {sharing ? <ComparisonSharing key={JSON.stringify([state.applied, state.consultedAt])}
          result={state.result} selection={state.applied} consultedAt={state.consultedAt} options={sharing} disabled={dirty} /> : null}
        {genie && state.result.change.absolute !== null ? <ComparisonGenie
          key={JSON.stringify([state.result.periods, state.result.filterLabel, state.result.current.value, state.result.reference.value])}
          result={state.result} options={genie} disabled={dirty} /> : null}
      </> : null}
    </div>
  </section>;
}
