"use client";

import { useEffect, useState } from "react";
import { definitionSchema, preferencesSchema, type AnalysisDefinition } from "./contract";
import { errorMessage, inputClass, personalRequest } from "./client";
import { SaveAnalysisButton } from "./save-analysis-button";

export function ExampleAnalysis() {
  const [definition, setDefinition] = useState<AnalysisDefinition | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(window.location.search);
    personalRequest("/api/user-preferences", preferencesSchema, { signal: controller.signal }).then((preferences) => {
      const parsed = definitionSchema.safeParse({ schemaVersion: 1, view: "example", filters: {
        region: params.get("region") ?? "all",
        periodDays: params.has("periodDays") ? Number(params.get("periodDays")) : preferences.defaultPeriodDays,
      } });
      if (!parsed.success) throw new Error("Ce lien contient des filtres invalides.");
      if (!controller.signal.aborted) setDefinition(parsed.data);
    }).catch((error) => { if (!controller.signal.aborted) setError(errorMessage(error)); });
    return () => controller.abort();
  }, []);

  if (error) return <p role="alert" className="text-negative">{error} <a className="underline" href="/saved-analyses">Mes analyses</a></p>;
  if (!definition) return <p role="status">Chargement de vos réglages…</p>;
  const regions = { all: "Toutes les régions", north: "Nord", south: "Sud" };
  return (
    <div className="max-w-3xl space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1"><span>Région</span>
          <select className={inputClass} value={definition.filters.region} onChange={(event) => setDefinition({
            ...definition, filters: { ...definition.filters, region: event.target.value as AnalysisDefinition["filters"]["region"] },
          })}>{Object.entries(regions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </label>
        <label className="space-y-1"><span>Période</span>
          <select className={inputClass} value={definition.filters.periodDays} onChange={(event) => setDefinition({
            ...definition, filters: { ...definition.filters, periodDays: Number(event.target.value) as AnalysisDefinition["filters"]["periodDays"] },
          })}>{[7, 30, 90].map((days) => <option key={days} value={days}>{days} jours</option>)}</select>
        </label>
      </div>
      <section className="rounded-xl border border-line bg-surface p-6" aria-label="Analyse affichée">
        <h2 className="text-xl font-semibold">{regions[definition.filters.region]} · {definition.filters.periodDays} jours</h2>
        <p className="mt-2 text-muted">Enregistrez cette sélection pour retrouver vos filtres lors d’une prochaine visite.</p>
      </section>
      <SaveAnalysisButton key={JSON.stringify(definition)} definition={definition}
        suggestedTitle={`${regions[definition.filters.region]} · ${definition.filters.periodDays} jours`} />
    </div>
  );
}
