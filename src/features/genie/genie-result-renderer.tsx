"use client";

import { useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  BigNumberKPI,
  DataCard,
  TimeSeriesChart,
  formatNumber,
  getToneColor,
  type DataTone,
  type NumberFormat,
  type TimeSeriesDefinition,
  type TimeSeriesPoint,
} from "@/components/data-visualization";
import type {
  GenieDashboardContext,
  GenieQueryResult,
  PinnedGenieInsight,
} from "@/features/genie/contract";
import { CheckIcon, ChevronDownIcon, CloseIcon, CopyIcon, PinIcon, TableIcon } from "@/features/genie/genie-icons";
import { GenieResultTable } from "@/features/genie/genie-result-table";
import { GenieMarkdown } from "@/features/genie/genie-markdown";
import {
  createPinnedGenieInsight,
  getGenieResultTitle,
  inferGenieVisualization,
  toNumericCell,
} from "@/features/genie/pinning";

const tones: readonly DataTone[] = ["positive", "purple", "brand", "slate"];

function getNumberFormat(columnName: string, values: readonly number[]): NumberFormat {
  const normalizedName = columnName.toLocaleLowerCase("fr-FR");
  const maximumAbsoluteValue = Math.max(...values.map((value) => Math.abs(value)), 0);

  if (/(?:taux|rate|ratio|percent|pourcent|conversion|part)/.test(normalizedName) && maximumAbsoluteValue <= 1) {
    return { style: "percent", maximumFractionDigits: 1 };
  }
  if (/(?:taux|rate|ratio|percent|pourcent|conversion|part)/.test(normalizedName)) {
    return { style: "unit", unit: "percent", maximumFractionDigits: 1 };
  }
  if (/(?:chiffre d.?affaires|revenu|revenue|sales|gmv|montant|amount|panier|prix|price|ca\b)/.test(normalizedName)) {
    return { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 };
  }
  return { notation: maximumAbsoluteValue >= 10_000 ? "compact" : "standard", maximumFractionDigits: 2 };
}

function PinResultButton({
  alias,
  answer,
  context,
  provenance,
  result,
  onPin,
}: {
  alias: string;
  answer: string | null;
  context?: GenieDashboardContext;
  provenance?: PinnedGenieInsight["provenance"];
  result: GenieQueryResult;
  onPin?: (insight: PinnedGenieInsight) => void | Promise<void>;
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  if (!onPin || !provenance) {
    return null;
  }
  const pinProvenance = provenance;
  const pinCallback = onPin;

  async function pinResult() {
    setState("saving");
    try {
      await pinCallback(createPinnedGenieInsight({ alias, result, answer, context, provenance: pinProvenance }));
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <button
      type="button"
      onClick={pinResult}
      disabled={state === "saving" || state === "saved"}
      aria-label={state === "saved" ? "Résultat épinglé" : "Épingler ce résultat au dashboard"}
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition disabled:cursor-default ${
        state === "saved"
          ? "border-positive-border bg-positive-soft text-positive-ink"
          : state === "error"
            ? "border-negative-border bg-negative-soft text-negative-ink"
            : "border-line bg-surface text-ink hover:-translate-y-0.5 hover:shadow-floating"
      }`}
    >
      {state === "saved" ? <CheckIcon className="size-4" /> : <PinIcon className="size-4" />}
      {state === "saving" ? "Ajout…" : state === "saved" ? "Épinglé" : state === "error" ? "Réessayer" : "Épingler"}
    </button>
  );
}

function SqlDisclosure({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);

  async function copySql() {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <details className="group overflow-hidden rounded-2xl border border-line bg-canvas">
      <summary className="flex min-h-11 list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-neutral-soft [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg border border-line bg-surface font-mono text-[0.65rem] text-brand-ink" aria-hidden="true">
            SQL
          </span>
          Requête générée
        </span>
        <ChevronDownIcon className="size-4 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="relative border-t border-line bg-ink p-4 text-canvas">
        <button
          type="button"
          onClick={copySql}
          className="absolute right-3 top-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/15"
        >
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
          {copied ? "Copié" : "Copier"}
        </button>
        <pre className="max-h-80 overflow-auto pr-24 text-xs leading-6">
          <code>{sql}</code>
        </pre>
      </div>
    </details>
  );
}

function ExactDataDisclosure({ result }: { result: GenieQueryResult }) {
  return (
    <details className="group">
      <summary className="inline-flex min-h-11 list-none items-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted transition-colors hover:bg-neutral-soft hover:text-ink [&::-webkit-details-marker]:hidden">
        <TableIcon className="size-4" />
        Voir les données exactes
        <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2">
        <GenieResultTable result={result} />
      </div>
    </details>
  );
}

function CategoricalChart({
  result,
  dimensionColumnIndex,
  valueColumnIndexes,
}: {
  result: GenieQueryResult;
  dimensionColumnIndex: number;
  valueColumnIndexes: number[];
}) {
  const prefersReducedMotion = useReducedMotion();
  const dimensionColumn = result.columns[dimensionColumnIndex]!;
  const definitions = valueColumnIndexes.map((columnIndex, index) => ({
    columnIndex,
    key: `measure_${index}`,
    label: result.columns[columnIndex]?.name ?? `Mesure ${index + 1}`,
    tone: tones[index % tones.length]!,
  }));
  const data = result.rows.map((row, rowIndex) => {
    const point: Record<string, string | number | null> = {
      category: String(row[dimensionColumnIndex] ?? `Ligne ${rowIndex + 1}`),
    };
    definitions.forEach((definition) => {
      point[definition.key] = toNumericCell(row[definition.columnIndex]);
    });
    return point;
  });
  const firstDefinition = definitions[0];
  const values = firstDefinition
    ? data.map((point) => point[firstDefinition.key]).filter((value): value is number => typeof value === "number")
    : [];
  const valueFormat = getNumberFormat(firstDefinition?.label ?? "Valeur", values);

  return (
    <DataCard
      title={getGenieResultTitle(result)}
      description={result.description ?? `Comparaison par ${dimensionColumn.name}`}
      padding="compact"
    >
      <figure aria-label={`Graphique de ${getGenieResultTitle(result)}`}>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 6, left: -8 }} accessibilityLayer>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 5" />
              <XAxis
                dataKey="category"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                tickMargin={10}
                minTickGap={12}
                tickFormatter={(value: string) => value.length > 16 ? `${value.slice(0, 15)}…` : value}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                tickMargin={8}
                width={58}
                tickFormatter={(value: number) => formatNumber(value, valueFormat)}
              />
              <Tooltip
                cursor={{ fill: "var(--neutral-soft)", opacity: 0.7 }}
                contentStyle={{
                  background: "var(--tooltip)",
                  border: "1px solid var(--line)",
                  borderRadius: "14px",
                  boxShadow: "var(--shadow-floating)",
                  color: "var(--ink)",
                }}
                formatter={(value, name) => [
                  typeof value === "number" ? formatNumber(value, valueFormat) : String(value ?? "—"),
                  String(name),
                ]}
                isAnimationActive={false}
              />
              {definitions.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
              {definitions.map((definition) => (
                <Bar
                  key={definition.key}
                  dataKey={definition.key}
                  name={definition.label}
                  fill={getToneColor(definition.tone)}
                  radius={[6, 6, 2, 2]}
                  maxBarSize={44}
                  isAnimationActive={!prefersReducedMotion}
                  animationDuration={620}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <figcaption className="sr-only">
          {definitions.map((definition) => definition.label).join(", ")} par {dimensionColumn.name}. Les valeurs exactes sont disponibles sous le graphique.
        </figcaption>
      </figure>
    </DataCard>
  );
}

function QueryVisualization({ result }: { result: GenieQueryResult }) {
  const visualization = useMemo(() => inferGenieVisualization(result), [result]);

  if (visualization.kind === "kpi") {
    const valueColumn = result.columns[visualization.valueColumnIndex]!;
    const rawValue = result.rows[0]?.[visualization.valueColumnIndex];
    const value = toNumericCell(rawValue) ?? 0;
    const labelValue = visualization.labelColumnIndex === null
      ? null
      : result.rows[0]?.[visualization.labelColumnIndex];
    const format = getNumberFormat(valueColumn.name, [value]);

    return (
      <BigNumberKPI
        label={result.title ?? valueColumn.name}
        value={value}
        format={format}
        description={result.description ?? (labelValue === null || labelValue === undefined ? undefined : String(labelValue))}
      />
    );
  }

  if (visualization.kind === "time-series") {
    const dimensionColumn = result.columns[visualization.dimensionColumnIndex]!;
    const definitions: TimeSeriesDefinition[] = visualization.valueColumnIndexes.map((columnIndex, index) => ({
      key: `measure_${index}`,
      label: result.columns[columnIndex]?.name ?? `Mesure ${index + 1}`,
      tone: tones[index % tones.length]!,
      area: index === 0,
    }));
    const data: TimeSeriesPoint[] = result.rows.map((row, rowIndex) => {
      const point: TimeSeriesPoint = {
        period: row[visualization.dimensionColumnIndex] === null
          ? `Période ${rowIndex + 1}`
          : String(row[visualization.dimensionColumnIndex]),
      };
      visualization.valueColumnIndexes.forEach((columnIndex, index) => {
        point[`measure_${index}`] = toNumericCell(row[columnIndex]);
      });
      return point;
    });
    const firstValues = data
      .map((point) => point.measure_0)
      .filter((value): value is number => typeof value === "number");

    return (
      <TimeSeriesChart
        title={getGenieResultTitle(result)}
        description={result.description ?? `Évolution par ${dimensionColumn.name}`}
        data={data}
        xKey="period"
        series={definitions}
        xFormat={{ type: "date", locale: "fr-FR", options: { dateStyle: "medium" } }}
        valueFormat={getNumberFormat(definitions[0]?.label ?? "Valeur", firstValues)}
        height={300}
        showDataTable={false}
      />
    );
  }

  if (visualization.kind === "categorical") {
    return (
      <CategoricalChart
        result={result}
        dimensionColumnIndex={visualization.dimensionColumnIndex}
        valueColumnIndexes={visualization.valueColumnIndexes}
      />
    );
  }

  return <GenieResultTable result={result} />;
}

export function GenieResultRenderer({
  alias,
  result,
  answer,
  context,
  provenance,
  onPin,
}: {
  alias: string;
  result: GenieQueryResult;
  answer: string | null;
  context?: GenieDashboardContext;
  provenance?: PinnedGenieInsight["provenance"];
  onPin?: (insight: PinnedGenieInsight) => void | Promise<void>;
}) {
  const visualization = useMemo(() => inferGenieVisualization(result), [result]);

  return (
    <section aria-label={result.title ?? "Résultat Genie"} className="mt-5 space-y-3 rounded-[1.25rem] border border-line bg-canvas p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted">
          <span className="size-2 rounded-full bg-positive" aria-hidden="true" />
          Résultat de la requête
        </div>
        <PinResultButton alias={alias} answer={answer} context={context} provenance={provenance} result={result} onPin={onPin} />
      </div>

      <QueryVisualization result={result} />

      {visualization.kind !== "table" ? <ExactDataDisclosure result={result} /> : null}
      {result.sql ? <SqlDisclosure sql={result.sql} /> : null}
    </section>
  );
}

export function PinnedGenieInsightCard({
  insight,
  onRemove,
}: {
  insight: PinnedGenieInsight;
  onRemove?: (insightId: string) => void;
}) {
  if (!insight.queryResult) {
    return (
      <DataCard
        eyebrow="Synthèse Genie"
        title={insight.title}
        action={onRemove ? (
          <button
            type="button"
            onClick={() => onRemove(insight.id)}
            aria-label={`Retirer ${insight.title} du dashboard`}
            className="grid size-10 place-items-center rounded-xl border border-line bg-surface text-muted transition hover:bg-negative-soft hover:text-negative-ink"
          >
            <CloseIcon className="size-4" />
          </button>
        ) : null}
      >
        {insight.answer ? <GenieMarkdown content={insight.answer} /> : <p className="text-sm text-muted">Synthèse indisponible.</p>}
      </DataCard>
    );
  }

  return (
    <div className="relative min-w-0">
      {onRemove ? (
        <button
          type="button"
          onClick={() => onRemove(insight.id)}
          aria-label={`Retirer ${insight.title} du dashboard`}
          className="absolute -right-2 -top-2 z-10 grid size-10 place-items-center rounded-xl border border-line bg-surface text-muted shadow-panel transition hover:bg-negative-soft hover:text-negative-ink"
        >
          <CloseIcon className="size-4" />
        </button>
      ) : null}
      <QueryVisualization result={insight.queryResult} />
    </div>
  );
}
