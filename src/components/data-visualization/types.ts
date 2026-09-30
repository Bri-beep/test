export type DataTone = "brand" | "positive" | "negative" | "purple" | "slate" | "neutral";

export type VisualizationState =
  | { status: "ready" }
  | { status: "loading"; label?: string }
  | { status: "empty"; title?: string; message?: string }
  | { status: "error"; title?: string; message: string };

export type TrendDirection = "up" | "down" | "flat";
export type TrendSentiment = "positive" | "negative" | "neutral";

export type DataTrend = {
  value: number;
  direction: TrendDirection;
  sentiment: TrendSentiment;
  comparisonLabel: string;
};

export type NumberFormat = Intl.NumberFormatOptions & {
  locale?: string;
};

export type AxisValueFormat =
  | { type?: "text" }
  | { type: "number"; format?: NumberFormat }
  | { type: "date"; locale?: string; options?: Intl.DateTimeFormatOptions };

export type SparklinePoint = {
  label?: string;
  value: number;
};

export const READY_VISUALIZATION_STATE = { status: "ready" } as const satisfies VisualizationState;
