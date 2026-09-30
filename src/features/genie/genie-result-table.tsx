"use client";

import type { GenieQueryResult, GenieResultCell, GenieResultColumn } from "@/features/genie/contract";

type GenieResultTableProps = {
  result: GenieQueryResult;
  caption?: string;
  compact?: boolean;
};

const NUMBER_TYPE_PATTERN = /^(?:TINYINT|SMALLINT|INT|INTEGER|BIGINT|LONG|FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL|SHORT)/i;
const DATE_TYPE_PATTERN = /^(?:DATE|TIMESTAMP)/i;

function formatDate(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  const includesTime = /T|\s\d{1,2}:\d{2}/.test(value);
  return new Intl.DateTimeFormat("fr-FR", includesTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(new Date(timestamp));
}

export function formatGenieCell(value: GenieResultCell, column?: GenieResultColumn) {
  if (value === null) {
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? "Oui" : "Non";
  }
  if (typeof value === "number") {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(value);
  }
  if (column && DATE_TYPE_PATTERN.test(column.type)) {
    return formatDate(value);
  }
  if (column && NUMBER_TYPE_PATTERN.test(column.type)) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(numericValue);
    }
  }
  return value;
}

export function GenieResultTable({ result, caption, compact = false }: GenieResultTableProps) {
  if (result.columns.length === 0) {
    return (
      <div role="status" className="rounded-2xl border border-line bg-surface px-5 py-8 text-center">
        <p className="font-semibold text-ink">Aucune colonne à afficher</p>
        <p className="mt-1 text-sm font-light text-muted">Genie n’a pas joint de structure tabulaire à ce résultat.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="max-h-[30rem] overflow-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <caption className="sr-only">{caption ?? result.title ?? "Résultat de la requête Genie"}</caption>
          <thead className="sticky top-0 z-10 bg-canvas text-xs uppercase tracking-[0.07em] text-muted shadow-[0_1px_0_var(--line)]">
            <tr>
              {result.columns.map((column, index) => (
                <th
                  key={`${column.name}-${index}`}
                  scope="col"
                  className={`${compact ? "px-3 py-2.5" : "px-4 py-3"} whitespace-nowrap font-semibold`}
                >
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={result.columns.length} className="px-4 py-8 text-center font-light text-muted">
                  Aucune ligne ne correspond à cette question et au contexte actuel.
                </td>
              </tr>
            ) : null}
            {result.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="transition-colors hover:bg-neutral-soft">
                {result.columns.map((column, columnIndex) => {
                  const rawValue = row[columnIndex] ?? null;
                  const isNumeric = typeof rawValue === "number" || NUMBER_TYPE_PATTERN.test(column.type);
                  const content = formatGenieCell(rawValue, column);

                  return columnIndex === 0 ? (
                    <th
                      key={`${column.name}-${columnIndex}`}
                      scope="row"
                      className={`${compact ? "px-3 py-2.5" : "px-4 py-3"} max-w-[24rem] font-medium text-ink`}
                    >
                      <span className="line-clamp-3">{content}</span>
                    </th>
                  ) : (
                    <td
                      key={`${column.name}-${columnIndex}`}
                      className={`${compact ? "px-3 py-2.5" : "px-4 py-3"} max-w-[24rem] text-muted ${isNumeric ? "text-right tabular-nums" : ""}`}
                    >
                      <span className="line-clamp-3">{content}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-canvas px-4 py-2.5 text-xs text-muted">
        <span>{result.rowCount.toLocaleString("fr-FR")} ligne{result.rowCount > 1 ? "s" : ""}</span>
        {result.truncated ? (
          <span className="rounded-full border border-line bg-surface px-2 py-1 font-medium text-ink">
            Aperçu limité
          </span>
        ) : null}
      </div>
    </div>
  );
}
