"use client";

import { useId, useRef, useState } from "react";
import { analysisSchema, type AnalysisDefinition } from "./contract";
import { buttonClass, errorMessage, inputClass, jsonMutation, personalRequest } from "./client";

// Mount with a key derived from the applied definition when the dashboard changes.
export function SaveAnalysisButton({ definition, suggestedTitle }: {
  definition: AnalysisDefinition; suggestedTitle: string;
}) {
  const fieldId = useId();
  const id = useRef<string | null>(null);
  const [title, setTitle] = useState(suggestedTitle);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  return (
    <details className="rounded-xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-semibold">Enregistrer cette analyse</summary>
      <form className="mt-4 max-w-lg space-y-3" onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true); setError("");
        id.current ??= crypto.randomUUID();
        try {
          await personalRequest(`/api/saved-analyses/${id.current}`, analysisSchema,
            jsonMutation("PUT", { title, note: "", definition }));
          setSaved(true);
        } catch (error) { setError(errorMessage(error)); }
        finally { setBusy(false); }
      }}>
        <label className="block space-y-1" htmlFor={fieldId}>
          <span>Nom de l’analyse</span>
          <input id={fieldId} className={inputClass} value={title} maxLength={120} required disabled={busy || saved}
            onChange={(event) => setTitle(event.target.value)} />
        </label>
        <p className="text-sm text-muted">Retrouvez ces filtres dans Mes analyses. Les données seront actualisées à l’ouverture.</p>
        <button className={buttonClass} disabled={busy || saved || !title.trim()}>
          {busy ? "Enregistrement…" : saved ? "Analyse enregistrée" : "Enregistrer"}
        </button>
        {error && <p role="alert" className="text-sm text-negative">{error}</p>}
        <p role="status">{saved && <a className="underline" href="/saved-analyses">Ouvrir Mes analyses</a>}</p>
      </form>
    </details>
  );
}
