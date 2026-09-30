import { z } from "zod";
import type { GenieStreamEvent as AppKitGenieStreamEvent, GenieMessageResponse } from "@databricks/appkit-ui/react";

export const MAX_GENIE_RESULT_ROWS = 500;

const contextTextSchema = z.string().trim().min(1).max(500);
const contextListSchema = z.array(contextTextSchema).max(30);
const contextScalarSchema = z.union([
  z.string().trim().max(500),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const contextFilterValueSchema = z.union([
  contextScalarSchema,
  z.array(contextScalarSchema).max(50),
]);

const comparisonPeriodSchema = z.object({ start: contextTextSchema, end: contextTextSchema }).strict();
const comparisonValueSchema = z.number().finite().nullable();

export const genieDashboardContextSchema = z
  .object({
    page: z
      .object({
        title: contextTextSchema.optional(),
        route: z.string().trim().min(1).max(300).optional(),
        description: z.string().trim().min(1).max(1_000).optional(),
      })
      .strict()
      .optional(),
    filters: z.record(contextTextSchema, contextFilterValueSchema).optional(),
    dateRange: z
      .object({
        start: contextTextSchema.optional(),
        end: contextTextSchema.optional(),
        label: contextTextSchema.optional(),
      })
      .strict()
      .optional(),
    selectedMetrics: contextListSchema.optional(),
    visibleMetrics: contextListSchema.optional(),
    activeTables: contextListSchema.optional(),
    comparison: z.object({
      metric: contextTextSchema, unit: contextTextSchema, aggregation: z.enum(["count", "sum", "avg"]),
      currentPeriod: comparisonPeriodSchema, referencePeriod: comparisonPeriodSchema,
      currentValue: comparisonValueSchema, referenceValue: comparisonValueSchema,
      absoluteChange: comparisonValueSchema, percentChange: comparisonValueSchema,
      source: contextTextSchema, synthetic: z.boolean(), warnings: z.array(contextTextSchema).max(12),
    }).strict().optional(),
  })
  .strict()
  .superRefine((context, issueContext) => {
    if (context.filters && Object.keys(context.filters).length > 50) {
      issueContext.addIssue({
        code: "custom",
        path: ["filters"],
        message: "At most 50 dashboard filters are accepted",
      });
    }
    if (JSON.stringify(context).length > 12_000) {
      issueContext.addIssue({
        code: "custom",
        message: "Dashboard context is too large",
      });
    }
  });

export type GenieDashboardContext = z.infer<typeof genieDashboardContextSchema>;

export const genieSessionSchema = z.object({
  mode: z.enum(["demo", "obo", "oauth-u2m-cli", "pat"]),
  label: z.string().max(300),
}).strict();

export const genieConversationIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{32}$/, "must be a 32-character lowercase hexadecimal identifier");

export const genieMessageRequestSchema = z
  .object({
    content: z.string().trim().min(1).max(10_000),
    conversationId: genieConversationIdSchema.optional(),
    context: genieDashboardContextSchema.optional(),
  })
  .strict();

export type GenieMessageRequest = z.infer<typeof genieMessageRequestSchema>;

export const genieMessageStatusSchema = z.enum([
  "SUBMITTED",
  "FETCHING_METADATA",
  "FILTERING_CONTEXT",
  "ASKING_AI",
  "PENDING_WAREHOUSE",
  "EXECUTING_QUERY",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "QUERY_RESULT_EXPIRED",
]);

export type GenieMessageStatus = z.infer<typeof genieMessageStatusSchema>;

export const genieResultCellSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export type GenieResultCell = z.infer<typeof genieResultCellSchema>;

export const genieResultColumnSchema = z.object({
  name: z.string(),
  type: z.string(),
});

export type GenieResultColumn = z.infer<typeof genieResultColumnSchema>;

export const genieQueryResultSchema = z.object({
  attachmentId: z.string(),
  statementId: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  sql: z.string().nullable(),
  columns: z.array(genieResultColumnSchema),
  rows: z.array(z.array(genieResultCellSchema)),
  rowCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
});

export type GenieQueryResult = z.infer<typeof genieQueryResultSchema>;

export const geniePublicErrorCodeSchema = z.enum([
  "INVALID_REQUEST", "UNKNOWN_SPACE", "GENIE_AUTH_REQUIRED", "GENIE_PERMISSION_DENIED",
  "GENIE_TIMEOUT", "GENIE_CANCELLED", "GENIE_RESULT_EXPIRED", "GENIE_UNAVAILABLE", "UNEXPECTED_ERROR",
]);
export type GeniePublicErrorCode = z.infer<typeof geniePublicErrorCodeSchema>;

// AppKit event fields, with resource IDs omitted and bounded previews/safe errors added.
// The runtime schema also rejects an old 1.x data-envelope instead of silently misreading it.
export const genieMessageSchema = z.object({
  messageId: z.string(), conversationId: z.string(), status: genieMessageStatusSchema,
  content: z.string(),
  attachments: z.array(z.object({
    attachmentId: z.string().optional(),
    query: z.object({ title: z.string().optional(), description: z.string().optional(),
      query: z.string().optional(), statementId: z.string().optional() }).optional(),
    text: z.object({ content: z.string().optional() }).optional(),
    suggestedQuestions: z.array(z.string()).optional(),
  })).default([]),
});
export type GenieMessageResult = z.infer<typeof genieMessageSchema>;

type AppKitPublicEvent =
  | Omit<Extract<AppKitGenieStreamEvent, { type: "message_start" }>, "spaceId">
  | Extract<AppKitGenieStreamEvent, { type: "status" }>
  | { type: "message_result"; message: Omit<GenieMessageResponse, "spaceId" | "error"> }
  | (Extract<AppKitGenieStreamEvent, { type: "query_result" }> & { rowCount: number; truncated: boolean })
  | (Extract<AppKitGenieStreamEvent, { type: "error" }> & { code: GeniePublicErrorCode; requestId: string; retryable: boolean });

export const genieStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message_start"), conversationId: z.string(), messageId: z.string() }),
  z.object({ type: z.literal("status"), status: genieMessageStatusSchema }),
  z.object({ type: z.literal("message_result"), message: genieMessageSchema }),
  z.object({ type: z.literal("query_result"), attachmentId: z.string(), statementId: z.string(),
    data: z.object({
      manifest: z.object({ schema: z.object({ columns: z.array(z.object({ name: z.string(), type_name: z.string() })) }) }),
      result: z.object({ data_array: z.array(z.array(z.string().nullable())).max(MAX_GENIE_RESULT_ROWS) }),
    }),
    rowCount: z.number().int().nonnegative(), truncated: z.boolean(),
  }),
  z.object({ type: z.literal("error"), error: z.string(), code: geniePublicErrorCodeSchema,
    requestId: z.string(), retryable: z.boolean() }),
]) satisfies z.ZodType<AppKitPublicEvent>;
export type GenieStreamEvent = z.infer<typeof genieStreamEventSchema>;

export function queryResultFromEvent(
  event: Extract<GenieStreamEvent, { type: "query_result" }>,
  message: GenieMessageResult,
): GenieQueryResult {
  const attachment = message.attachments.find((item) => item.attachmentId === event.attachmentId)?.query;
  if (!attachment) throw new Error("Unexpected Genie attachment");
  return {
    attachmentId: event.attachmentId, statementId: event.statementId || null,
    title: attachment.title ?? null, description: attachment.description ?? null, sql: attachment.query ?? null,
    columns: event.data.manifest.schema.columns.map((column) => ({ name: column.name, type: column.type_name })),
    rows: event.data.result.data_array, rowCount: event.rowCount, truncated: event.truncated,
  };
}

export type GenieConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: GenieMessageStatus;
  queryResults?: GenieQueryResult[];
  createdAt: string;
};

/**
 * Contains governed Genie answer text and query rows.
 * Persist it only in storage scoped to the signed-in user, or omit the response payloads.
 */
export type GenieConversationSnapshot = {
  alias: string;
  conversationId: string | null;
  messages: GenieConversationMessage[];
  savedAt: string;
};

/**
 * Contains a governed result preview, generated SQL and answer text.
 * Shared compositions must refresh the definition with each viewer's identity instead of sharing this snapshot.
 */
export type PinnedGenieInsight = {
  id: string;
  alias: string;
  title: string;
  kind: "text" | "kpi" | "chart" | "table";
  answer: string | null;
  queryResult: GenieQueryResult | null;
  provenance: {
    conversationId: string;
    messageId: string;
    question: string;
  };
  context?: GenieDashboardContext;
  createdAt: string;
};
