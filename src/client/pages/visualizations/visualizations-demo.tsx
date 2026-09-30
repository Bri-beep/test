import type { FeatureCollection } from "geojson";
import { PeriodComparison } from "@/features/period-comparison";
import { DEMO_SELECTION } from "@/features/period-comparison/demo";
import { useAppConfig } from "@/client/app-config";
import {
  AnalyticsMap,
  BigNumberKPI,
  CircularProgress,
  DataCard,
  MiniAreaChart,
  MultiMetricCard,
  TimeSeriesChart,
} from "@/components/data-visualization";

import {
  channelSeries,
  conversionTrend,
  ordersTrend,
  points,
  revenueByCountry,
  revenueMarkers,
} from "./demo-data";

const compactEuro = {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 1,
} as const;

function MoreLink({ label }: { label: string }) {
  return (
    <a
      href="#states-title"
      aria-label={label}
      className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-muted shadow-sm transition hover:-translate-y-0.5 hover:text-ink hover:shadow-floating"
    >
      <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden="true">
        <circle cx="4" cy="10" r="1.25" />
        <circle cx="10" cy="10" r="1.25" />
        <circle cx="16" cy="10" r="1.25" />
      </svg>
    </a>
  );
}

export function VisualizationsDemo({ europeFeatures }: { europeFeatures: FeatureCollection }) {
  const config = useAppConfig();
  return (
    <div className="space-y-8 sm:space-y-10">
      <section className="relative overflow-hidden rounded-[1.75rem] border border-line bg-surface px-6 py-8 shadow-panel sm:px-9 sm:py-10">
        <div className="pointer-events-none absolute -right-24 -top-36 size-80 rounded-full opacity-[0.11] blur-3xl [background:var(--brand-gradient)]" aria-hidden="true" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-ink">
              <span className="size-2 rounded-full bg-brand" aria-hidden="true" />
              Bibliothèque analytics
            </p>
            <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-[-0.045em] sm:text-5xl">
              Des données lisibles au premier regard
            </h1>
            <p className="mt-4 max-w-2xl text-base font-light leading-7 text-muted">
              Des primitives composables pour présenter un KPI, comparer des tendances et explorer une géographie sans dépendre d’un accès Databricks.
            </p>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Contexte des données de démonstration">
            <span className="rounded-full border border-line bg-canvas px-3 py-2 text-sm font-medium text-ink">Données synthétiques</span>
            <span className="rounded-full border border-line bg-canvas px-3 py-2 text-sm font-medium text-ink">Mis à jour à 08:42</span>
          </div>
        </div>
      </section>

      <PeriodComparison endpoint="/api/period-comparison/demo" initialSelection={DEMO_SELECTION} showWaterfall
        sharing={{ key: "demo-orders", allowSegment: true }}
        genie={config.mode === "demo" ? { alias: "fraim-sales", context: { page: { title: "Comparaison de périodes", route: "/visualizations" } } } : undefined}
        description="Une option pour les analyses qui gagnent à être comparées dans le temps. Explorez ici des commandes synthétiques, puis la contribution de chaque canal à leur évolution." />

      <section aria-labelledby="kpi-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-ink">Vue d’ensemble</p>
            <h2 id="kpi-title" className="mt-1 text-2xl font-bold tracking-[-0.03em]">KPI essentiels</h2>
          </div>
          <p className="hidden text-sm font-light text-muted sm:block">30 derniers jours</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <BigNumberKPI
            label="Chiffre d’affaires"
            value={1_284_600}
            format={compactEuro}
            trend={{ value: 8.4, direction: "up", sentiment: "positive", comparisonLabel: "par rapport aux 30 jours précédents" }}
            description="Ventes nettes, hors retours"
            meta="Objectif mensuel atteint à 96 %."
            action={<MoreLink label="Voir les états disponibles pour le chiffre d’affaires" />}
            interactive
          />
          <BigNumberKPI
            variant="sparkline"
            label="Commandes confirmées"
            value={6_120}
            format={{ notation: "compact", maximumFractionDigits: 1 }}
            trend={{ value: 12.6, direction: "up", sentiment: "positive", comparisonLabel: "par rapport au mois précédent" }}
            description="Tous canaux e-commerce"
            sparkline={{ data: ordersTrend, tone: "positive", height: 94, format: { maximumFractionDigits: 0 } }}
            interactive
          />
          <BigNumberKPI
            variant="gauge"
            label="Qualité de service"
            value={92}
            trend={{ value: 3.1, direction: "up", sentiment: "positive", comparisonLabel: "depuis la dernière mesure" }}
            description="Indice composite sur 100"
            gauge={{ label: "Score", max: 100, tone: "positive", status: { label: "Très bon", tone: "positive" }, showMaximum: true }}
            interactive
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]" aria-label="Mini graphiques et jauges">
        <DataCard
          variant="glass"
          title="Taux de conversion"
          description="Sessions transformées en commande — 12 derniers mois"
          action={<span className="rounded-full bg-positive-soft px-3 py-1.5 text-sm font-semibold text-positive-ink">4,82 %</span>}
        >
          <MiniAreaChart
            data={conversionTrend}
            ariaLabel="Évolution du taux de conversion"
            tone="positive"
            height={196}
            format={{ style: "percent", maximumFractionDigits: 2 }}
          />
        </DataCard>
        <DataCard title="Santé du portefeuille" description="Progression vers les seuils de qualité" contentClassName="flex flex-wrap justify-center gap-6">
          <CircularProgress value={78} label="Activation" tone="purple" status={{ label: "Solide", tone: "purple" }} size={174} />
          <CircularProgress value={63} label="Rétention" tone="brand" status={{ label: "À suivre", tone: "brand" }} size={174} />
        </DataCard>
      </section>

      <MultiMetricCard
        eyebrow="Commerce digital"
        title="Performance e-commerce"
        description="Les principaux leviers de volume, de valeur et de fidélisation."
        action={<MoreLink label="Voir les états disponibles pour cette carte" />}
        metrics={[
          {
            id: "revenue",
            label: "Revenu net",
            value: 18_420_000,
            format: compactEuro,
            trend: { value: 9.2, direction: "up", sentiment: "positive", comparisonLabel: "par rapport à N-1" },
            visual: { type: "bars", values: [58, 74, 63, 81, 76, 89, 94], tone: "positive" },
            helpText: "Montant payé après remises et retours, hors taxes.",
          },
          {
            id: "customers",
            label: "Clients actifs",
            value: 284_600,
            format: { notation: "compact", maximumFractionDigits: 1 },
            trend: { value: 6.8, direction: "up", sentiment: "positive", comparisonLabel: "par rapport à N-1" },
            visual: { type: "sparkline", data: points([46, 51, 49, 58, 64, 62, 69, 73, 76, 82]), tone: "slate" },
            helpText: "Clients ayant réalisé au moins une commande sur les 90 derniers jours.",
          },
          {
            id: "margin",
            label: "Marge contributive",
            value: 0.317,
            format: { style: "percent", maximumFractionDigits: 1 },
            status: { label: "Dans la cible", tone: "positive" },
            helpText: "Marge après coûts variables de préparation et de livraison.",
          },
          {
            id: "returns",
            label: "Taux de retour",
            value: 0.043,
            format: { style: "percent", maximumFractionDigits: 1 },
            trend: { value: -1.8, direction: "down", sentiment: "positive", comparisonLabel: "par rapport au mois précédent" },
            helpText: "Part des unités remboursées dans les 30 jours après livraison.",
          },
          {
            id: "basket",
            label: "Panier moyen",
            value: 76.4,
            format: { style: "currency", currency: "EUR", maximumFractionDigits: 1 },
            trend: { value: 2.7, direction: "up", sentiment: "positive", comparisonLabel: "par rapport au mois précédent" },
            visual: { type: "bars", values: [42, 53, 47, 61, 58, 66, 72], tone: "purple" },
          },
          {
            id: "delivery",
            label: "Livraisons à l’heure",
            value: 0.961,
            format: { style: "percent", maximumFractionDigits: 1 },
            trend: { value: -0.6, direction: "down", sentiment: "negative", comparisonLabel: "par rapport à la semaine précédente" },
            helpText: "Commandes livrées avant ou à la date promise au client.",
          },
        ]}
      />

      <TimeSeriesChart
        title="Trafic par canal d’acquisition"
        description="Sessions mensuelles. La zone met en avant le trafic direct; les autres canaux restent comparables sans double axe."
        data={channelSeries}
        xKey="month"
        height={390}
        series={[
          { key: "direct", label: "Direct", tone: "positive", area: true },
          { key: "organic", label: "Recherche organique", tone: "slate" },
          { key: "paid", label: "Paid media", tone: "purple" },
          { key: "partners", label: "Partenaires", tone: "brand", strokeDasharray: "7 5" },
        ]}
        metrics={[
          { id: "sessions", label: "Sessions", value: 1_774_000, format: { notation: "compact", maximumFractionDigits: 1 }, trend: { value: 11.8, direction: "up", sentiment: "positive", comparisonLabel: "par rapport à N-1" } },
          { id: "unique", label: "Visiteurs uniques", value: 1_082_000, format: { notation: "compact", maximumFractionDigits: 1 }, trend: { value: 9.4, direction: "up", sentiment: "positive", comparisonLabel: "par rapport à N-1" } },
          { id: "pages", label: "Pages par session", value: "5,9", trend: { value: 3.2, direction: "up", sentiment: "positive", comparisonLabel: "par rapport au mois précédent" } },
          { id: "bounce", label: "Taux de rebond", value: "34,8 %", trend: { value: -2.1, direction: "down", sentiment: "positive", comparisonLabel: "par rapport au mois précédent" } },
        ]}
      />

      <AnalyticsMap
        title="Revenu par marché européen"
        description="Chiffre d’affaires net et principaux hubs commerciaux. Activez une zone ou un repère pour obtenir sa valeur."
        features={europeFeatures}
        values={revenueByCountry}
        featureLabelProperty="label"
        markers={revenueMarkers}
        projection="mercator"
        heatmap
        valueLabel="Revenu net"
        valueFormat={compactEuro}
        height={500}
      />

      <section aria-labelledby="states-title">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-ink">Contrat d’interface</p>
          <h2 id="states-title" className="mt-1 text-2xl font-bold tracking-[-0.03em]">États prêts pour la production</h2>
          <p className="mt-2 text-sm font-light leading-6 text-muted">Chaque composant distingue explicitement le chargement, l’absence de données et l’erreur.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <BigNumberKPI label="Chargement" value={0} state={{ status: "loading", label: "Chargement du revenu net" }} />
          <BigNumberKPI label="Nouveaux clients" value={0} state={{ status: "empty", title: "Aucun nouveau client", message: "Aucune acquisition n’est attribuée à la période sélectionnée." }} />
          <BigNumberKPI label="Marge" value={0} state={{ status: "error", title: "Marge indisponible", message: "Réessayez dans quelques instants ou contactez le support avec la référence affichée." }} />
        </div>
      </section>

      <p className="pb-2 text-center text-xs font-light text-muted">
        Données entièrement synthétiques — aucune connexion distante n’est utilisée. Géométrie Natural Earth via world-atlas.
      </p>
    </div>
  );
}
