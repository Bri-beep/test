"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import {
  analysisHref, analysisSchema, pageSchema, preferencesSchema,
  type Preferences, type SavedAnalysis,
} from "./contract";
import { buttonClass, errorMessage, inputClass, jsonMutation, personalRequest } from "./client";

function AnalysisCard({ item, onChange }: { item: SavedAnalysis; onChange: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [note, setNote] = useState(item.note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function mutate(action: "edit" | "delete") {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const path = `/api/saved-analyses/${item.id}`;
      if (action === "edit") {
        await personalRequest(path, analysisSchema, jsonMutation("PUT", { title, note, definition: item.definition }));
      } else {
        await personalRequest(path, z.object({ deleted: z.literal(true) }), jsonMutation("DELETE", {}));
      }
      await onChange();
      setEditing(false); setDeleting(false);
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  return (
    <article className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <h2 className="break-words text-lg font-semibold">{item.title}</h2>
      <p className="text-sm text-muted">Modifiée le {new Date(item.updatedAt).toLocaleString("fr-FR")}</p>
      {item.note && <p className="whitespace-pre-wrap break-words text-sm">{item.note}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={buttonClass} disabled={busy} onClick={async () => {
          setBusy(true); setError("");
          try {
            // Recheck ownership, existence and contract at opening time.
            const current = await personalRequest(`/api/saved-analyses/${item.id}`, analysisSchema);
            window.location.assign(analysisHref(current.definition));
          } catch (error) { setError(errorMessage(error)); setBusy(false); }
        }}>Ouvrir</button>
        <button className={buttonClass} disabled={busy} onClick={() => {
          setTitle(item.title); setNote(item.note); setEditing(true); setDeleting(false);
        }}>Modifier</button>
        <button className={buttonClass} disabled={busy} onClick={() => { setDeleting(true); setEditing(false); }}>Supprimer</button>
      </div>
      {editing && <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void mutate("edit"); }}>
        <label className="block">Nom
          <input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required disabled={busy} />
        </label>
        <label className="block">Note
          <textarea className={inputClass} value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={3} disabled={busy} />
        </label>
        <div className="flex gap-2">
          <button className={buttonClass} disabled={busy || !title.trim()}>Enregistrer les modifications</button>
          <button className={buttonClass} type="button" disabled={busy} onClick={() => setEditing(false)}>Annuler</button>
        </div>
      </form>}
      {deleting && <div className="space-y-2">
        <p>Supprimer « {item.title} » de vos analyses ?</p>
        <div className="flex gap-2">
          <button className={buttonClass} disabled={busy} onClick={() => void mutate("delete")}>Confirmer la suppression</button>
          <button className={buttonClass} disabled={busy} onClick={() => setDeleting(false)}>Annuler</button>
        </div>
      </div>}
      {error && <p role="alert" className="text-negative">{error}</p>}
    </article>
  );
}

function PreferencesForm({ value, onSaved }: { value: Preferences; onSaved: (value: Preferences) => void }) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  return (
    <form className="space-y-4 rounded-xl border border-line bg-surface p-5" onSubmit={async (event) => {
      event.preventDefault();
      if (busy) return;
      setBusy(true); setError(""); setStatus("");
      try {
        const saved = await personalRequest("/api/user-preferences", preferencesSchema, jsonMutation("PUT", draft));
        setDraft(saved); onSaved(saved); setStatus("Réglages enregistrés.");
      } catch (error) { setError(errorMessage(error)); }
      finally { setBusy(false); }
    }}>
      <h2 className="text-xl font-semibold">Mes réglages</h2>
      <label className="block space-y-1"><span>Période par défaut</span>
        <select className={inputClass} disabled={busy} value={draft.defaultPeriodDays} onChange={(event) => {
          setDraft({ ...draft, defaultPeriodDays: Number(event.target.value) as Preferences["defaultPeriodDays"] });
        }}>{[7, 30, 90].map((days) => <option key={days} value={days}>{days} jours</option>)}</select>
      </label>
      <p className="text-sm text-muted">S’applique à l’exemple lors d’une ouverture sans période dans le lien.</p>
      <label className="block space-y-1"><span>Trier mes analyses</span>
        <select className={inputClass} disabled={busy} value={draft.librarySort} onChange={(event) => {
          setDraft({ ...draft, librarySort: event.target.value as Preferences["librarySort"] });
        }}><option value="updated">Dernière modification</option><option value="title">Nom</option></select>
      </label>
      <button className={buttonClass} disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer les réglages"}</button>
      <p role="status">{status}</p>
      {error && <p role="alert" className="text-negative">{error}</p>}
    </form>
  );
}

export function PersonalLibrary() {
  const [items, setItems] = useState<SavedAnalysis[]>([]);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      personalRequest("/api/saved-analyses", pageSchema, { signal: controller.signal }),
      personalRequest("/api/user-preferences", preferencesSchema, { signal: controller.signal }),
    ]).then(([page, settings]) => {
      if (controller.signal.aborted) return;
      setItems(page.items); setCursor(page.nextCursor); setPreferences(settings);
    }).catch((error) => { if (!controller.signal.aborted) setError(errorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, []);

  async function reload() {
    const page = await personalRequest("/api/saved-analyses", pageSchema);
    setItems(page.items); setCursor(page.nextCursor);
  }
  const sorted = [...items].sort((a, b) => preferences?.librarySort === "title"
    ? a.title.localeCompare(b.title, "fr") : b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="min-w-0 space-y-4" aria-label="Analyses enregistrées" aria-busy={busy}>
        {busy && <p role="status">Chargement des analyses…</p>}
        {error && <div role="alert"><p className="text-negative">{error}</p><a href="/saved-analyses" className="underline">Recharger</a></div>}
        {!busy && !error && items.length === 0 && <p>Vous n’avez pas encore d’analyse enregistrée. <a href="/saved-analyses/example" className="underline">Créer une première analyse</a>.</p>}
        {sorted.map((item) => <AnalysisCard key={`${item.id}:${item.updatedAt}`} item={item} onChange={reload} />)}
        {cursor && <div className="space-y-2">
          <p className="text-sm text-muted">Le tri porte sur les analyses chargées.</p>
          <button className={buttonClass} disabled={busy} onClick={async () => {
            setBusy(true); setError("");
            try {
              const page = await personalRequest(`/api/saved-analyses?cursor=${cursor}`, pageSchema);
              setItems((current) => [...new Map([...current, ...page.items].map((item) => [item.id, item])).values()]);
              setCursor(page.nextCursor);
            } catch (error) { setError(errorMessage(error)); }
            finally { setBusy(false); }
          }}>Charger plus d’analyses</button>
        </div>}
      </section>
      {preferences && <PreferencesForm value={preferences} onSaved={setPreferences} />}
    </div>
  );
}
