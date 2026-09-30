import type {
  AnalyticsMapMarker,
  TimeSeriesPoint,
} from "@/components/data-visualization";

const monthLabels = ["Sep.", "Oct.", "Nov.", "Déc.", "Jan.", "Fév.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août"];

export function points(values: readonly number[]) {
  return values.map((value, index) => ({ label: monthLabels[index] ?? `P${index + 1}`, value }));
}

export const ordersTrend = points([3820, 4010, 3940, 4280, 4510, 4430, 4890, 5110, 5020, 5480, 5730, 6120]);
export const conversionTrend = points([0.0392, 0.0408, 0.0402, 0.0417, 0.0428, 0.0435, 0.0431, 0.0452, 0.0448, 0.0463, 0.0471, 0.0482]);

export const channelSeries: readonly TimeSeriesPoint[] = [
  { month: "Sep.", direct: 348000, organic: 286000, paid: 148000, partners: 92000 },
  { month: "Oct.", direct: 372000, organic: 301000, paid: 162000, partners: 108000 },
  { month: "Nov.", direct: 361000, organic: 329000, paid: 178000, partners: 124000 },
  { month: "Déc.", direct: 414000, organic: 346000, paid: 196000, partners: 139000 },
  { month: "Jan.", direct: 438000, organic: 381000, paid: 205000, partners: 151000 },
  { month: "Fév.", direct: 421000, organic: 397000, paid: 221000, partners: 164000 },
  { month: "Mars", direct: 462000, organic: 425000, paid: 236000, partners: 183000 },
  { month: "Avr.", direct: 489000, organic: 451000, paid: 248000, partners: 197000 },
  { month: "Mai", direct: 523000, organic: 478000, paid: 271000, partners: 218000 },
  { month: "Juin", direct: 551000, organic: 506000, paid: 284000, partners: 239000 },
  { month: "Juil.", direct: 586000, organic: 542000, paid: 302000, partners: 257000 },
  { month: "Août", direct: 612000, organic: 568000, paid: 318000, partners: 276000 },
];

export const revenueByCountry: Readonly<Record<string, number>> = {
  "040": 1_280_000,
  "056": 3_960_000,
  "203": 920_000,
  "208": 1_110_000,
  "250": 18_420_000,
  "276": 8_730_000,
  "372": 1_640_000,
  "380": 5_480_000,
  "528": 4_610_000,
  "578": 760_000,
  "616": 1_920_000,
  "620": 1_370_000,
  "724": 6_240_000,
  "752": 1_460_000,
  "756": 2_180_000,
  "826": 7_340_000,
};

export const revenueMarkers: readonly AnalyticsMapMarker[] = [
  { id: "lille", label: "Lille", coordinates: [3.0573, 50.6292], value: 2_840_000, description: "Hub retail Nord", tone: "brand" },
  { id: "paris", label: "Paris", coordinates: [2.3522, 48.8566], value: 6_910_000, description: "Premier bassin d’activité", tone: "positive" },
  { id: "lyon", label: "Lyon", coordinates: [4.8357, 45.764], value: 2_360_000, description: "Croissance de 14,2 %", tone: "purple" },
  { id: "madrid", label: "Madrid", coordinates: [-3.7038, 40.4168], value: 1_720_000, description: "Marché en accélération", tone: "slate" },
  { id: "berlin", label: "Berlin", coordinates: [13.405, 52.52], value: 1_980_000, description: "Partenaires B2B", tone: "brand" },
];
