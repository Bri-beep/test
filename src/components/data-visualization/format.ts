import type { AxisValueFormat, DataTone, NumberFormat } from "@/components/data-visualization/types";

const toneColors: Record<DataTone, string> = {
  brand: "var(--chart-brand)",
  positive: "var(--chart-positive)",
  negative: "var(--chart-negative)",
  purple: "var(--chart-purple)",
  slate: "var(--chart-slate)",
  neutral: "var(--chart-neutral)",
};

const toneInks: Record<DataTone, string> = {
  brand: "var(--brand-ink)",
  positive: "var(--positive-ink)",
  negative: "var(--negative-ink)",
  purple: "var(--data-purple-ink)",
  slate: "var(--data-slate-ink)",
  neutral: "var(--muted)",
};

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function formatNumber(value: number, format: NumberFormat = {}) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  const { locale = "fr-FR", ...options } = format;
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return new Intl.NumberFormat("fr-FR").format(value);
  }
}

export function formatSignedPercent(value: number, locale = "fr-FR") {
  if (!Number.isFinite(value)) {
    return "—";
  }

  const options = {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    signDisplay: "exceptZero",
    style: "percent",
  } satisfies Intl.NumberFormatOptions;

  try {
    return new Intl.NumberFormat(locale, options).format(value / 100);
  } catch {
    return new Intl.NumberFormat("fr-FR", options).format(value / 100);
  }
}

export function formatAxisValue(value: string | number, format: AxisValueFormat = { type: "text" }) {
  if (format.type === "number") {
    const numericValue = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numericValue) ? formatNumber(numericValue, format.format) : String(value);
  }

  if (format.type === "date") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    try {
      return new Intl.DateTimeFormat(format.locale ?? "fr-FR", format.options).format(date);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

export function getToneColor(tone: DataTone) {
  return toneColors[tone];
}

export function getToneInk(tone: DataTone) {
  return toneInks[tone];
}

export function getFiniteValues(values: readonly number[]) {
  return values.filter((value) => Number.isFinite(value));
}
