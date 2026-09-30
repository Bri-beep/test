import { BigNumberKPI, DataCard, TimeSeriesChart, WaterfallChart, formatNumber, type NumberFormat } from "@/components/data-visualization";
import { EmptyState } from "@/components/states/empty-state";
import type { ComparisonResult } from "./contract";
import { formatPeriodDate, type Period } from "./periods";

function periodLabel(period: Period) {
  return `${formatPeriodDate(period.start)} – ${formatPeriodDate(period.end)} · ${period.days} jours`;
}

export function ComparisonResults({ result, showWaterfall }: { result: ComparisonResult; showWaterfall: boolean }) {
  const format: NumberFormat = result.unit === "EUR"
    ? { style: "currency", currency: "EUR", maximumFractionDigits: 2 }
    : { maximumFractionDigits: 2 };
  const value = (amount: number | null) => amount === null ? "Non disponible" : formatNumber(amount, format);
  const percentReason = {
    missing: "Variation indisponible : une période ne contient aucune mesure exploitable.",
    "zero-reference": "Variation relative non calculable : la référence vaut zéro.",
    "negative-reference": "Variation relative non affichée : la référence est négative.",
    ok: result.change.percent === null ? "" : `${formatNumber(result.change.percent, { maximumFractionDigits: 2, signDisplay: "exceptZero" })} % par rapport à la référence`,
  }[result.change.reason];

  return <div className="space-y-5" aria-label="Résultats de la comparaison">
    <p className="text-sm text-muted" role="status">
      {result.label} · {result.unit} · {result.sourceLabel}
      {result.filterLabel ? ` · Segment : ${result.filterLabel}` : " · Tous les segments"}
      {result.status === "demo" ? " · Données synthétiques" : ""}
    </p>
    {result.warnings.length ? <div className="rounded-xl border border-line bg-canvas p-4 text-sm text-muted" aria-label="Précautions de comparaison">
      <ul className="list-disc space-y-1 pl-4">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
    </div> : null}
    {result.current.value === null && result.reference.value === null ? <EmptyState title="Aucune donnée sur ces périodes" message="Choisissez d’autres dates ou un autre segment." /> : <>
      <div className="grid gap-4 xl:grid-cols-3">
        <BigNumberKPI label="Période analysée" value={value(result.current.value)} description={periodLabel(result.periods.current)} />
        <BigNumberKPI label="Période de référence" value={value(result.reference.value)} description={periodLabel(result.periods.reference)} />
        <BigNumberKPI label="Écart absolu" value={result.change.absolute === null ? "Non disponible" : formatNumber(result.change.absolute, { ...format, signDisplay: "exceptZero" })} description={percentReason} />
      </div>
      <TimeSeriesChart title="Évolution comparée" description="Les jours sont alignés par position dans chaque période. Les dates exactes sont disponibles ci-dessous."
        data={result.series} xKey="position" valueFormat={format} showDataTable={false}
        series={[{ key: "current", label: "Période analysée", tone: "brand" }, { key: "reference", label: "Référence", tone: "slate", strokeDasharray: "5 4" }]} />
      <DataCard title="Valeurs et dates exactes" padding="compact">
        <details>
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Voir les valeurs par jour</summary>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Comparaison quotidienne — {result.label} ({result.unit})</caption>
              <thead><tr>{["Position", "Date analysée", "Valeur analysée", "Date de référence", "Valeur de référence"].map((label) => <th key={label} scope="col" className="whitespace-nowrap px-3 py-2">{label}</th>)}</tr></thead>
              <tbody>{result.series.map((day) => <tr key={day.position} className="border-t border-line">
                <th scope="row" className="px-3 py-2 font-normal">{day.position}</th>
                <td className="whitespace-nowrap px-3 py-2">{day.currentDate ? formatPeriodDate(day.currentDate) : "Hors période"}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{value(day.current)}</td>
                <td className="whitespace-nowrap px-3 py-2">{day.referenceDate ? formatPeriodDate(day.referenceDate) : "Hors période"}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{value(day.reference)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </details>
      </DataCard>
      {showWaterfall && result.waterfall ? <WaterfallChart title="Décomposition de l’écart" description="Contribution de chaque segment à la variation totale."
        {...result.waterfall} valueFormat={format} /> : null}
      {showWaterfall && result.aggregation === "avg" ? <p className="text-sm text-muted">Une moyenne n’est pas additive : sa décomposition demande une méthode métier spécifique.</p> : null}
    </>}
  </div>;
}
