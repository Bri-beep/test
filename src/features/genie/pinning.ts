import type {
  GenieDashboardContext,
  GenieQueryResult,
  GenieResultCell,
  GenieResultColumn,
  PinnedGenieInsight,
} from "@/features/genie/contract";

const NUMBER_TYPE_PATTERN = /^(?:TINYINT|SMALLINT|INT|INTEGER|BIGINT|LONG|FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL|SHORT)/i;
const DATE_TYPE_PATTERN = /^(?:DATE|TIMESTAMP)/i;

export type GenieVisualization =
  | {
      kind: "kpi";
      valueColumnIndex: number;
      labelColumnIndex: number | null;
    }
  | {
      kind: "time-series";
      dimensionColumnIndex: number;
      valueColumnIndexes: number[];
    }
  | {
      kind: "categorical";
      dimensionColumnIndex: number;
      valueColumnIndexes: number[];
    }
  | { kind: "table" };

export function isNumericColumn(column: GenieResultColumn, rows: GenieQueryResult["rows"], columnIndex: number) {
  if (NUMBER_TYPE_PATTERN.test(column.type)) {
    return true;
  }

  const populatedValues = rows
    .map((row) => row[columnIndex])
    .filter((value): value is Exclude<GenieResultCell, null> => value !== null);

  return (
    populatedValues.length > 0 &&
    populatedValues.every((value) => {
      if (typeof value === "number") {
        return Number.isFinite(value);
      }
      return typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value));
    })
  );
}

export function isDateColumn(column: GenieResultColumn, rows: GenieQueryResult["rows"], columnIndex: number) {
  if (DATE_TYPE_PATTERN.test(column.type)) {
    return true;
  }

  const populatedValues = rows
    .map((row) => row[columnIndex])
    .filter((value): value is string => typeof value === "string" && value.trim() !== "");

  return (
    populatedValues.length > 0 &&
    populatedValues.every((value) => /^\d{4}-\d{2}(?:-\d{2})?/.test(value) && Number.isFinite(Date.parse(value)))
  );
}

export function toNumericCell(value: GenieResultCell | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }
  return null;
}

export function inferGenieVisualization(result: GenieQueryResult): GenieVisualization {
  if (result.columns.length === 0 || result.rows.length === 0) {
    return { kind: "table" };
  }

  const numericColumnIndexes = result.columns.flatMap((column, columnIndex) =>
    isNumericColumn(column, result.rows, columnIndex) ? [columnIndex] : [],
  );

  if (result.rows.length === 1 && numericColumnIndexes.length === 1) {
    const labelColumnIndex = result.columns.findIndex((_, index) => index !== numericColumnIndexes[0]);
    return {
      kind: "kpi",
      valueColumnIndex: numericColumnIndexes[0]!,
      labelColumnIndex: labelColumnIndex >= 0 ? labelColumnIndex : null,
    };
  }

  if (numericColumnIndexes.length === 0) {
    return { kind: "table" };
  }

  const dateColumnIndex = result.columns.findIndex((column, columnIndex) =>
    isDateColumn(column, result.rows, columnIndex),
  );
  if (dateColumnIndex >= 0 && result.rows.length >= 2) {
    return {
      kind: "time-series",
      dimensionColumnIndex: dateColumnIndex,
      valueColumnIndexes: numericColumnIndexes.filter((index) => index !== dateColumnIndex).slice(0, 1),
    };
  }

  const categoryColumnIndex = result.columns.findIndex((_, index) => !numericColumnIndexes.includes(index));
  if (categoryColumnIndex >= 0 && result.rows.length >= 2 && result.rows.length <= 20) {
    return {
      kind: "categorical",
      dimensionColumnIndex: categoryColumnIndex,
      valueColumnIndexes: numericColumnIndexes.slice(0, 1),
    };
  }

  return { kind: "table" };
}

function createInsightId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `genie-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getGenieResultTitle(result: GenieQueryResult) {
  const explicitTitle = result.title?.trim();
  if (explicitTitle) {
    return explicitTitle;
  }

  const visualization = inferGenieVisualization(result);
  if (visualization.kind === "kpi") {
    return result.columns[visualization.valueColumnIndex]?.name ?? "Indicateur Genie";
  }
  if (visualization.kind === "time-series" || visualization.kind === "categorical") {
    const measureLabels = visualization.valueColumnIndexes
      .map((index) => result.columns[index]?.name)
      .filter(Boolean);
    return measureLabels.length > 0 ? measureLabels.join(" · ") : "Analyse Genie";
  }
  return "Résultat Genie";
}

export function createPinnedGenieInsight({
  alias,
  result,
  answer,
  context,
  provenance,
}: {
  alias: string;
  result: GenieQueryResult;
  answer: string | null;
  context?: GenieDashboardContext;
  provenance: PinnedGenieInsight["provenance"];
}): PinnedGenieInsight {
  const visualization = inferGenieVisualization(result);
  const kind = visualization.kind === "kpi" ? "kpi" : visualization.kind === "table" ? "table" : "chart";

  return {
    id: createInsightId(),
    alias,
    title: getGenieResultTitle(result),
    kind,
    answer,
    queryResult: result,
    context,
    provenance,
    createdAt: new Date().toISOString(),
  };
}

export function createPinnedGenieAnswer({
  alias,
  answer,
  context,
  provenance,
}: {
  alias: string;
  answer: string;
  context?: GenieDashboardContext;
  provenance: PinnedGenieInsight["provenance"];
}): PinnedGenieInsight {
  const plainQuestion = provenance.question.replace(/\s+/g, " ").trim();
  return {
    id: createInsightId(),
    alias,
    title: plainQuestion.length > 80 ? `${plainQuestion.slice(0, 77)}…` : plainQuestion || "Synthèse Genie",
    kind: "text",
    answer,
    queryResult: null,
    context,
    provenance,
    createdAt: new Date().toISOString(),
  };
}
