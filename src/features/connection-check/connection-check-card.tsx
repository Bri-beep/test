"use client";

import { useState } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { connectionCheckSchema, type ConnectionCheck } from "@/features/connection-check/contract";

type ViewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: ConnectionCheck }
  | { status: "error"; message: string; requestId?: string };

export function ConnectionCheckCard({ initialMode }: { initialMode: "demo" | "databricks" }) {
  const [state, setState] = useState<ViewState>({ status: "idle" });

  async function runCheck(): Promise<void> {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/connection-check", { cache: "no-store" });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const error = payload as { error?: { message?: string; requestId?: string } };
        setState({
          status: "error",
          message: error.error?.message ?? "La vérification a échoué.",
          requestId: error.error?.requestId,
        });
        return;
      }
      setState({ status: "success", result: connectionCheckSchema.parse(payload) });
    } catch {
      setState({ status: "error", message: "La réponse du serveur n’est pas valide." });
    }
  }

  return (
    <section
      className="rounded-[1.5rem] border border-line bg-surface p-6 shadow-panel sm:p-8"
      aria-labelledby="connection-title"
    >
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div className="flex gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-brand-ink" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <ellipse cx="12" cy="5.5" rx="7" ry="3" />
              <path d="M5 5.5v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6M5 11.5v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6" />
            </svg>
          </span>
          <div>
            <p className="inline-flex rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-brand-ink">
              Mode {initialMode}
            </p>
            <h2 id="connection-title" className="mt-2 text-2xl font-bold tracking-tight">Connexion Databricks</h2>
            <p className="mt-2 max-w-2xl text-sm font-light leading-6 text-muted sm:text-base">
              Vérifiez le chemin UI → service → Databricks SQL avec une requête nommée. Aucun credential
              n’est transmis au navigateur.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={state.status === "loading"}
          onClick={runCheck}
          aria-busy={state.status === "loading"}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-on-brand transition hover:-translate-y-0.5 hover:brightness-95 hover:shadow-floating disabled:cursor-wait disabled:opacity-60"
        >
          <svg viewBox="0 0 20 20" className={`size-4 ${state.status === "loading" ? "animate-spin" : ""}`} fill="none" aria-hidden="true">
            <path d="M15.5 6.5A6 6 0 1 0 16 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M12.5 6.5h3v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {state.status === "loading" ? "Vérification…" : "Vérifier la connexion"}
        </button>
      </div>

      <div className="mt-6" aria-live="polite" aria-atomic="true">
        {state.status === "idle" ? (
          <EmptyState title="Aucun test exécuté" message="Lancez le test pour valider le chemin UI → service → Databricks SQL." />
        ) : null}
        {state.status === "loading" ? <LoadingState label="Vérification en cours…" /> : null}
        {state.status === "error" ? (
          <ErrorState title="Connexion non vérifiée" message={state.message} requestId={state.requestId} onRetry={runCheck} />
        ) : null}
        {state.status === "success" ? (
          <div className="flex gap-3 rounded-xl border border-positive-border bg-positive-soft p-5 text-ink">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-positive text-on-positive" aria-hidden="true">
              <svg viewBox="0 0 20 20" className="size-4" fill="none">
                <path d="m5 10 3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <p className="font-semibold">
                {state.result.status === "demo" ? "Mode démo opérationnel" : "Connexion Databricks opérationnelle"}
              </p>
              <p className="mt-1 text-sm font-light text-muted">
                {state.result.currentUser ? `Utilisateur SQL : ${state.result.currentUser}` : "Aucun appel Databricks en mode démo."}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
