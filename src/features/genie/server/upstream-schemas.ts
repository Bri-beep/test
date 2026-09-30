import { z } from "zod";

const upstreamIdSchema = z.string().min(1).max(256);

export const upstreamMessageStatusSchema = z.enum([
  "IN_PROGRESS",
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

const textAttachmentSchema = z.object({
  content: z.string(),
  id: z.string().optional(),
  purpose: z
    .enum([
      "TEXT_ATTACHMENT_PURPOSE_UNSPECIFIED",
      "FOLLOW_UP_QUESTION",
      "TEXT_ATTACHMENT_PURPOSE_ANSWER",
    ])
    .optional(),
}).passthrough();

const queryAttachmentSchema = z.object({
  title: z.string().nullish(),
  query: z.string().nullish(),
  description: z.string().nullish(),
  statement_id: z.string().nullish(),
}).passthrough();

export const upstreamAttachmentSchema = z.object({
  attachment_id: upstreamIdSchema.optional(),
  text: textAttachmentSchema.nullish(),
  query: queryAttachmentSchema.nullish(),
  suggested_questions: z.object({ questions: z.array(z.string()).max(20) }).passthrough().nullish(),
  viz: z.object({
    title: z.string().nullish(),
    query_attachment_id: z.string(),
  }).passthrough().nullish(),
}).passthrough();

export const upstreamMessageSchema = z.object({
  id: upstreamIdSchema.optional(),
  message_id: upstreamIdSchema.optional(),
  conversation_id: upstreamIdSchema,
  status: upstreamMessageStatusSchema,
  attachments: z.array(upstreamAttachmentSchema).nullable().optional(),
  error: z.object({
    type: z.string().nullish(),
    error: z.string().nullish(),
  }).passthrough().nullable().optional(),
}).passthrough().superRefine((message, issueContext) => {
  if (!message.message_id && !message.id) {
    issueContext.addIssue({ code: "custom", message: "message_id is required" });
  }
});

export const upstreamStartConversationSchema = z.object({
  conversation_id: upstreamIdSchema.optional(),
  message_id: upstreamIdSchema.optional(),
  conversation: z.object({
    id: upstreamIdSchema.optional(),
    conversation_id: upstreamIdSchema.optional(),
  }).passthrough().optional(),
  message: upstreamMessageSchema,
}).passthrough();

const statementStateSchema = z.enum([
  "STATE_UNSPECIFIED",
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELED",
  "CLOSED",
]);

const statementColumnSchema = z.object({
  name: z.string(),
  type_name: z.string().optional(),
  type_text: z.string().optional(),
  position: z.number().int().nonnegative().optional(),
}).passthrough();

const statementCellSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);

export const upstreamQueryResultSchema = z.object({
  statement_response: z.object({
    statement_id: z.string().nullish(),
    status: z.object({
      state: statementStateSchema.default("STATE_UNSPECIFIED"),
      error: z.object({ error_code: z.string().optional() }).passthrough().optional(),
    }).passthrough(),
    manifest: z.object({
      schema: z.object({
        columns: z.array(statementColumnSchema).default([]),
      }).passthrough().optional(),
      total_row_count: z.number().int().nonnegative().optional(),
      truncated: z.boolean().optional(),
    }).passthrough().nullish(),
    result: z.object({
      data_array: z.array(z.array(statementCellSchema)).default([]),
      row_count: z.number().int().nonnegative().optional(),
      next_chunk_index: z.number().int().nonnegative().optional(),
      next_chunk_internal_link: z.string().optional(),
    }).passthrough().nullish(),
  }).passthrough(),
}).passthrough();

export type UpstreamMessage = z.infer<typeof upstreamMessageSchema>;
export type UpstreamQueryResult = z.infer<typeof upstreamQueryResultSchema>;
