"use client";

import { useMemo, useState } from "react";

import {
  BigNumberKPI,
  TimeSeriesChart,
  type TimeSeriesPoint,
} from "@/components/data-visualization";
import type {
  GenieConversationSnapshot,
  GenieDashboardContext,
  PinnedGenieInsight,
} from "@/features/genie/contract";
import { GenieChat } from "@/features/genie/genie-chat";
import { DatabaseIcon, PinIcon, SparklesIcon } from "@/features/genie/genie-icons";
import { PinnedGenieInsightCard } from "@/features/genie/genie-result-renderer";

const periodOptions = ["30 derniers jours", "90 derniers jours", "12 derniers mois"] as const;
const regionOptions = ["Toutes les régions", "EMEA", "France", "Benelux"] as const;
const channelOptions = ["Tous les canaux", "E-commerce", "Magasins", "Marketplace"] as const;

const baseSalesTrend: readonly TimeSeriesPoint[] = [
  { period: "M-5", revenue: 782_000 },
  { period: "M-4", revenue: 846_000 },
  { period: "M-3", revenue: 821_000 },
  { period: "M-2", revenue: 904_000 },
  { period: "M-1", revenue: 938_000 },
  { period: "M", revenue: 1_012_000 },
];

const regionFactors: Record<(typeof regionOptions)[number], number> = {
  "Toutes les régions": 1,
  EMEA: 0.78,
  France: 0.43,
  Benelux: 0.19,
};

function formatDemoCompactValue(value: number, suffix = "") {
  const divisor = Math.abs(value) >= 1_000_000 ? 1_000_000 : 1_000;
  const magnitude = divisor === 1_000_000 ? "M" : "k";
  const formattedValue = (value / divisor).toFixed(1).replace(".", ",");
  return `${formattedValue}\u00a0${magnitude}${suffix ? `\u00a0${suffix}` : ""}`;
}

export function GenieDemo({ alias, mode }: { alias: string; mode: "demo" | "databricks" }) {
  const [region, setRegion] = useState<(typeof regionOptions)[number]>("EMEA");
  const [period, setPeriod] = useState<(typeof periodOptions)[number]>("90 derniers jours");
  const [channel, setChannel] = useState<(typeof channelOptions)[number]>("Tous les canaux");
  const [pinnedInsights, setPinnedInsights] = useState<PinnedGenieInsight[]>([]);
  const [savedConversations, setSavedConversations] = useState<GenieConversationSnapshot[]>([]);

  const context = useMemo<GenieDashboardContext>(() => ({
    page: {
      title: "Performance commerciale FRAIM",
      route: "/genie",
      description: "Pilotage des ventes, de la marge et des produits sous-performants.",
    },
    filters: {
      région: region,
      canal: channel,
    },
    dateRange: { label: period },
    selectedMetrics: ["Chiffre d’affaires", "Marge contributive"],
    visibleMetrics: ["Chiffre d’affaires", "Commandes", "Panier moyen", "Marge contributive"],
    activeTables: ["sales_performance"],
  }), [channel, period, region]);

  const factor = regionFactors[region];
  const salesTrend = useMemo(
    () => baseSalesTrend.map((point) => ({
      ...point,
      revenue: typeof point.revenue === "number" ? Math.round(point.revenue * factor) : point.revenue,
    })),
    [factor],
  );

  function pinInsight(insight: PinnedGenieInsight) {
    setPinnedInsights((currentInsights) => [...currentInsights, insight]);
  }

  function removePinnedInsight(insightId: string) {
    setPinnedInsights((currentInsights) => currentInsights.filter((insight) => insight.id !== insightId));
  }

  function saveConversation(snapshot: GenieConversationSnapshot) {
    setSavedConversations((currentSnapshots) => [...currentSnapshots, snapshot]);
  }

  return (
    <div className="space-y-9 sm:space-y-11">
      <section className="relative overflow-hidden rounded-[1.75rem] border border-line bg-surface px-6 py-8 shadow-panel sm:px-9 sm:py-10">
        <div className="pointer-events-none absolute -right-24 -top-36 size-80 rounded-full opacity-[0.11] blur-3xl [background:var(--brand-gradient)]" aria-hidden="true" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-ink">
              <SparklesIcon className="size-4" />
              AI/BI Genie
            </p>
            <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-[-0.045em] sm:text-5xl">
              Passez du signal à la question, sans quitter le dashboard
            </h1>
            <p className="mt-4 max-w-2xl text-base font-light leading-7 text-muted">
              Explorez les KPI en langage naturel, suivez l’exécution et transformez une réponse utile en carte réutilisable.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-canvas px-3 py-2 font-medium text-ink">
              <DatabaseIcon className="size-4 text-positive-ink" />
              Genie - FRAIM - Sales Performance
            </span>
            {mode === "databricks" ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-positive-border bg-positive-soft px-3 py-2 font-semibold text-positive-ink">
                Accès vérifié pour chaque question
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-canvas px-3 py-2 font-semibold text-muted">
                Données synthétiques · aucune connexion
              </span>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="filters-title" className="rounded-[1.5rem] border border-line bg-surface p-4 shadow-panel sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-ink">Contexte partagé</p>
            <h2 id="filters-title" className="mt-1 text-xl font-bold tracking-[-0.025em]">Filtres du dashboard</h2>
            <p className="mt-1 text-sm font-light text-muted">Chaque prochaine question reçoit cet état, sans exposer de jeton au navigateur.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5 text-xs font-semibold text-muted">
              Région
              <select
                value={region}
                onChange={(event) => setRegion(event.target.value as (typeof regionOptions)[number])}
                className="min-h-11 rounded-xl border border-line bg-canvas px-3 text-sm font-medium text-ink"
              >
                {regionOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-muted">
              Période
              <select
                value={period}
                onChange={(event) => setPeriod(event.target.value as (typeof periodOptions)[number])}
                className="min-h-11 rounded-xl border border-line bg-canvas px-3 text-sm font-medium text-ink"
              >
                {periodOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-muted">
              Canal
              <select
                value={channel}
                onChange={(event) => setChannel(event.target.value as (typeof channelOptions)[number])}
                className="min-h-11 rounded-xl border border-line bg-canvas px-3 text-sm font-medium text-ink"
              >
                {channelOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
          </div>
        </div>
      </section>

      {pinnedInsights.length > 0 ? (
        <section aria-labelledby="pinned-title">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-ink">
                <PinIcon className="size-3.5" />
                Composition locale
              </p>
              <h2 id="pinned-title" className="mt-1 text-2xl font-bold tracking-[-0.03em]">Éléments épinglés</h2>
            </div>
            <p className="text-xs font-light text-muted">
              {pinnedInsights.length} carte{pinnedInsights.length > 1 ? "s" : ""} · conservée{pinnedInsights.length > 1 ? "s" : ""} uniquement pendant cette session
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {pinnedInsights.map((insight) => (
              <PinnedGenieInsightCard key={insight.id} insight={insight} onRemove={removePinnedInsight} />
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="embedded-title">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-ink">Mode intégré</p>
          <h2 id="embedded-title" className="mt-1 text-2xl font-bold tracking-[-0.03em]">Les KPI et la conversation, côte à côte</h2>
          <p className="mt-2 text-sm font-light leading-6 text-muted">Les chiffres ci-dessous sont synthétiques. Le chat utilise le même contexte de filtres.</p>
        </div>
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(28rem,1.1fr)]">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <BigNumberKPI
              label="Chiffre d’affaires"
              value={formatDemoCompactValue(Math.round(1_284_600 * factor), "€")}
              trend={{ value: 8.4, direction: "up", sentiment: "positive", comparisonLabel: "par rapport à la période précédente" }}
              description={`${region} · ${period}`}
            />
            <BigNumberKPI
              label="Commandes confirmées"
              value={formatDemoCompactValue(Math.round(6_120 * factor))}
              trend={{ value: 3.6, direction: "up", sentiment: "positive", comparisonLabel: "par rapport à la période précédente" }}
              description={channel}
            />
            <div className="sm:col-span-2 xl:col-span-1 2xl:col-span-2">
              <TimeSeriesChart
                title="Tendance des ventes"
                description="Série synthétique utilisée pour illustrer le contexte visuel du dashboard."
                data={salesTrend}
                xKey="period"
                series={[{ key: "revenue", label: "Chiffre d’affaires", tone: "positive", area: true }]}
                valueFormat={{ style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 }}
                height={260}
                showDataTable={false}
                showLegend={false}
              />
            </div>
          </div>
          <GenieChat
            alias={alias}
            context={context}
            height={760}
            variant="embedded"
            onPin={pinInsight}
            onSave={saveConversation}
          />
        </div>
      </section>

      <section aria-labelledby="standalone-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-ink">Mode autonome</p>
            <h2 id="standalone-title" className="mt-1 text-2xl font-bold tracking-[-0.03em]">Une exploration en pleine largeur</h2>
          </div>
          {savedConversations.length > 0 ? (
            <span className="rounded-full border border-positive-border bg-positive-soft px-3 py-1.5 text-xs font-semibold text-positive-ink" role="status">
              {savedConversations.length} conversation{savedConversations.length > 1 ? "s" : ""} enregistrée{savedConversations.length > 1 ? "s" : ""} dans la session
            </span>
          ) : null}
        </div>
        <GenieChat
          alias={alias}
          context={context}
          height={780}
          variant="standalone"
          onPin={pinInsight}
          onSave={saveConversation}
        />
      </section>

      <p className="pb-2 text-center text-xs font-light leading-5 text-muted">
        {mode === "demo"
          ? "Les réponses de cette page proviennent de fixtures synthétiques et n’effectuent aucun appel distant."
          : "Chaque requête Genie s’exécute côté serveur avec l’identité de l’utilisateur connecté."}
      </p>
    </div>
  );
}
