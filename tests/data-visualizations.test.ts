import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ChartState } from "../src/components/charts/chart-state";
import {
  getValidHiddenSeries,
  TimeSeriesChart,
} from "../src/components/charts/time-series-chart";
import { clamp, formatNumber, formatSignedPercent, getToneColor } from "../src/components/data-visualization/format";
import type { BigNumberKPIProps } from "../src/components/kpi/big-number-kpi";
import { CircularProgress } from "../src/components/kpi/circular-progress";
import { MultiMetricCard } from "../src/components/kpi/multi-metric-card";
import { TrendIndicator } from "../src/components/kpi/trend-indicator";
import { AnalyticsMap } from "../src/components/maps/analytics-map";
import {
  constrainMapPan,
  createProjectedMapMarkers,
  getZoomedMapPoint,
  stabilizeMapMeasurement,
} from "../src/components/maps/map-geometry";

test("visualization formatters keep values finite, localized and bounded", () => {
  assert.equal(clamp(120, 0, 100), 100);
  assert.equal(clamp(-4, 0, 100), 0);
  assert.equal(formatNumber(Number.NaN), "—");
  assert.match(formatNumber(1284600, { locale: "fr-FR", notation: "compact", maximumFractionDigits: 1 }), /1,3\s*M/);
  assert.match(formatNumber(1284, { locale: "not_a_locale" }), /1[\s\u202f]284/);
  assert.match(formatSignedPercent(8.4), /^\+8,4/);
  assert.match(formatSignedPercent(-2), /^-2/);
  assert.match(formatSignedPercent(8.4, "not_a_locale"), /^\+8,4/);
  assert.equal(getToneColor("positive"), "var(--chart-positive)");
});

test("circular progress exposes its exact meter contract", () => {
  const html = renderToStaticMarkup(
    createElement(CircularProgress, {
      value: 39,
      max: 100,
      label: "Score de visibilité",
      status: { label: "Faible", tone: "negative" },
      tone: "negative",
    }),
  );

  assert.match(html, /role="meter"/);
  assert.match(html, /aria-valuemin="0"/);
  assert.match(html, /aria-valuemax="100"/);
  assert.match(html, /aria-valuenow="39"/);
  assert.match(html, /39\/100, Faible/);

  const clamped = renderToStaticMarkup(createElement(CircularProgress, { value: 140, max: 100 }));
  assert.match(clamped, /aria-valuenow="100"/);
  assert.doesNotMatch(clamped, /140\/100/);
});

test("circular progress rejects invalid ready measurements", () => {
  for (const props of [
    { value: Number.NaN, max: 100 },
    { value: Number.POSITIVE_INFINITY, max: 100 },
    { value: 39, max: Number.NaN },
    { value: 39, max: 0 },
    { value: 39, max: -100 },
  ]) {
    const html = renderToStaticMarkup(createElement(CircularProgress, props));

    assert.match(html, /role="status"/);
    assert.match(html, /Indicateur indisponible/);
    assert.doesNotMatch(html, /role="meter"/);
    assert.doesNotMatch(html, /aria-valuenow=/);
  }
});

test("time series treats rows without finite values as an explicit empty state", () => {
  const html = renderToStaticMarkup(
    createElement(TimeSeriesChart, {
      title: "Trafic",
      data: [{ month: "Août", visits: null }],
      xKey: "month",
      series: [{ key: "visits", label: "Visites", tone: "positive" }],
    }),
  );

  assert.match(html, /Aucune donnée/);
  assert.match(html, /role="status"/);
});

test("time series keeps at least one current series visible after definitions change", () => {
  const hiddenSeries = new Set(["visits", "removed"]);

  assert.deepEqual(
    [...getValidHiddenSeries(hiddenSeries, [{ key: "visits" }])],
    [],
  );
  assert.deepEqual(
    [...getValidHiddenSeries(hiddenSeries, [{ key: "visits" }, { key: "orders" }])],
    ["visits"],
  );
  assert.deepEqual(
    [...getValidHiddenSeries(hiddenSeries, [{ key: "orders" }])],
    [],
  );
});

type GaugeKpiValue = Extract<
  BigNumberKPIProps,
  { variant: "gauge" }
>["value"];

const validGaugeKpiValue: GaugeKpiValue = 39;
// @ts-expect-error Gauge KPI values must remain numeric.
const invalidGaugeKpiValue: GaugeKpiValue = "39";
void validGaugeKpiValue;
void invalidGaugeKpiValue;

test("multi metric items keep direct definition term and value semantics", () => {
  const html = renderToStaticMarkup(
    createElement(MultiMetricCard, {
      title: "Vue commerce",
      metrics: [{ id: "revenue", label: "Revenu net", value: 42 }],
    }),
  );

  assert.match(html, /<dl[^>]*>/);
  assert.match(html, /<dt[^>]*>.*Revenu net.*<\/dt><dd[^>]*>/s);
  assert.match(html, /rounded-\[0\.95rem\]/);
});

test("trend direction and sentiment remain separate and explicit", () => {
  const html = renderToStaticMarkup(
    createElement(TrendIndicator, {
      trend: {
        value: -1.8,
        direction: "down",
        sentiment: "positive",
        comparisonLabel: "par rapport au mois précédent",
      },
    }),
  );

  assert.match(html, /baisse/);
  assert.match(html, /par rapport au mois précédent/);
  assert.match(html, /var\(--positive-ink\)/);
});

test("shared visualization states use status and alert semantics", () => {
  const loading = renderToStaticMarkup(
    createElement(ChartState, { state: { status: "loading", label: "Chargement des ventes" } }),
  );
  const empty = renderToStaticMarkup(
    createElement(ChartState, { state: { status: "empty", title: "Aucune vente", message: "Changez la période." } }),
  );
  const error = renderToStaticMarkup(
    createElement(ChartState, { state: { status: "error", title: "Ventes indisponibles", message: "Réessayez." } }),
  );

  assert.match(loading, /role="status"/);
  assert.match(loading, /Chargement des ventes/);
  assert.match(empty, /role="status"/);
  assert.match(empty, /Aucune vente/);
  assert.match(error, /role="alert"/);
  assert.match(error, /Ventes indisponibles/);
});

test("analytics map exposes keyboard data and a tabular fallback", () => {
  const html = renderToStaticMarkup(
    createElement(AnalyticsMap, {
      title: "Ventes par zone",
      features: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: "north",
            properties: { label: "Nord" },
            geometry: {
              type: "Polygon",
              coordinates: [[[1, 50], [4, 50], [4, 52], [1, 52], [1, 50]]],
            },
          },
        ],
      },
      values: { north: 1280 },
      featureLabelProperty: "label",
      valueLabel: "Ventes",
      markers: [{ id: "lille", label: "Lille", coordinates: [3.06, 50.63], value: 420 }],
      height: 280,
    }),
  );

  assert.match(html, /Utilisez les touches plus et moins/);
  assert.match(html, /faites-la glisser avec un pointeur/);
  assert.match(html, /aria-keyshortcuts="\+ - 0 Home ArrowUp ArrowDown ArrowLeft ArrowRight"/);
  assert.match(html, /Nord\. Ventes : 1[\s\u202f]280/);
  assert.match(html, /Consulter les données sous forme de tableau/);
  assert.match(html, /Valeurs représentées sur la carte/);
  assert.match(html, /aria-label="Zoomer sur la carte"/);
  assert.doesNotMatch(html, /<path[^>]+tabindex=/i);
  assert.match(html, /focus-visible:ring-\[var\(--focus-ring\)\]/);
});

test("analytics map keeps panning centered at base zoom and bounded when enlarged", () => {
  assert.deepEqual(constrainMapPan({ x: 120, y: -80 }, 1, 400, 200), { x: 0, y: 0 });
  assert.deepEqual(constrainMapPan({ x: 800, y: -500 }, 2, 400, 200), { x: 200, y: -100 });
  assert.deepEqual(constrainMapPan({ x: Number.NaN, y: Number.POSITIVE_INFINITY }, 3, 400, 200), {
    x: 0,
    y: 0,
  });
  assert.deepEqual(getZoomedMapPoint([150, 75], 2, 200, 100, { x: 20, y: -10 }), [220, 90]);
});

test("analytics map stabilizes projected measurements across server and browser rounding", () => {
  const serverCoordinate = 416.9148157767163;
  const browserCoordinate = 416.91481577671635;
  type MapProjection = Parameters<typeof createProjectedMapMarkers>[1];
  const serverProjection = (() => [335.365307209535, serverCoordinate]) as unknown as MapProjection;
  const browserProjection = (() => [335.365307209535, browserCoordinate]) as unknown as MapProjection;
  const markers = [{ id: "lyon", label: "Lyon", coordinates: [4.8357, 45.764] as const }];

  assert.notEqual(serverCoordinate, browserCoordinate);
  assert.equal(
    stabilizeMapMeasurement(serverCoordinate),
    stabilizeMapMeasurement(browserCoordinate),
  );
  assert.equal(stabilizeMapMeasurement(browserCoordinate), 416.914816);
  assert.deepEqual(
    createProjectedMapMarkers(markers, serverProjection),
    createProjectedMapMarkers(markers, browserProjection),
  );
});

test("theme and demo contracts include dark mode and every requested component", async () => {
  const [styles, demo, themeToggle] = await Promise.all([
    readFile("src/client/globals.css", "utf8"),
    readFile("src/client/pages/visualizations/visualizations-demo.tsx", "utf8"),
    readFile("src/components/theme/theme-toggle.tsx", "utf8"),
  ]);

  assert.match(styles, /:root\[data-theme="dark"\]/);
  assert.match(styles, /@media \(prefers-color-scheme: dark\)/);
  assert.match(styles, /--positive-ink:/);
  assert.match(styles, /--negative-ink:/);
  assert.match(styles, /--chart-positive: #2f7f69/);
  assert.match(styles, /--chart-brand: #c16a00/);
  assert.match(styles, /--focus-ring: #a55600/);
  assert.match(styles, /summary:focus-visible/);
  assert.match(demo, /valueFormat=\{compactEuro\}/);
  assert.doesNotMatch(demo, /formatValue=\{/);
  assert.match(themeToggle, /fallbackThemePreference = theme/);

  for (const component of [
    "DataCard",
    "BigNumberKPI",
    "MiniAreaChart",
    "CircularProgress",
    "MultiMetricCard",
    "TimeSeriesChart",
    "AnalyticsMap",
  ]) {
    assert.match(demo, new RegExp(`<${component}`));
  }
});
