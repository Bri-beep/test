import type {
  GenieMessageResult,
  GenieMessageStatus,
  GenieQueryResult,
  GenieDashboardContext,
} from "@/features/genie/contract";

export function demoComparisonResult(comparison: NonNullable<GenieDashboardContext["comparison"]>): GenieQueryResult {
  return {
    attachmentId: "demo-period-comparison", statementId: null, title: "Comparaison synthétique",
    description: "Valeurs du contexte de démonstration, sans requête Databricks.", sql: null,
    columns: [{ name: "Période", type: "STRING" }, { name: comparison.metric, type: "DOUBLE" }],
    rows: [["Référence", comparison.referenceValue], ["Période analysée", comparison.currentValue]],
    rowCount: 2, truncated: false,
  };
}

export const DEMO_GENIE_CONVERSATION_ID = "11111111111111111111111111111111";
export const DEMO_GENIE_MESSAGE_ID = "22222222222222222222222222222222";

export const DEMO_GENIE_STATUS_SEQUENCE = [
  "SUBMITTED",
  "ASKING_AI",
  "EXECUTING_QUERY",
  "COMPLETED",
] as const satisfies readonly GenieMessageStatus[];

export const DEMO_GENIE_QUERY_RESULT: GenieQueryResult = {
  attachmentId: "demo-sales-by-product",
  statementId: "demo-statement",
  title: "Produits à surveiller",
  description: "Évolution synthétique des ventes sur la période sélectionnée.",
  sql: [
    "SELECT product_name, revenue, change_percent",
    "FROM demo.sales_performance",
    "WHERE region = :region AND sale_date >= :start_date",
    "ORDER BY change_percent ASC",
    "LIMIT 5",
  ].join("\n"),
  columns: [
    { name: "product_name", type: "STRING" },
    { name: "revenue", type: "DECIMAL" },
    { name: "change_percent", type: "DECIMAL" },
  ],
  rows: [
    ["Produit Alpha", 184_200, -12.4],
    ["Produit Bravo", 162_900, -9.1],
    ["Produit Charlie", 141_500, -6.8],
    ["Produit Delta", 128_400, -4.7],
    ["Produit Echo", 116_750, -3.2],
  ],
  rowCount: 5,
  truncated: false,
};

export function createDemoGenieMessageResult(
  conversationId = DEMO_GENIE_CONVERSATION_ID,
  messageId = DEMO_GENIE_MESSAGE_ID,
): GenieMessageResult {
  return {
    conversationId,
    messageId,
    status: "COMPLETED",
    content: "Question de démonstration",
    attachments: [
      { text: { content: "Les cinq produits affichés reculent sur la période. Produit Alpha mérite l’attention en premier, avec la baisse la plus forte." } },
      { suggestedQuestions: [
        "Quelle région explique le plus cette baisse ?",
        "Compare ces produits à la période précédente.",
        "Quels produits progressent le plus ?",
      ] },
      { attachmentId: DEMO_GENIE_QUERY_RESULT.attachmentId, query: {
        title: DEMO_GENIE_QUERY_RESULT.title ?? undefined,
        description: DEMO_GENIE_QUERY_RESULT.description ?? undefined,
        query: DEMO_GENIE_QUERY_RESULT.sql ?? undefined,
        statementId: DEMO_GENIE_QUERY_RESULT.statementId ?? undefined,
      } },
    ],
  };
}
