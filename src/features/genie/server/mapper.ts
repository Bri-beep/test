import { MAX_GENIE_RESULT_ROWS, type GenieMessageStatus } from "@/features/genie/contract";
import type {
  GenieRemoteMessage,
  GenieRemoteQueryResult,
} from "@/features/genie/server/types";
import type {
  UpstreamMessage,
  UpstreamQueryResult,
} from "@/features/genie/server/upstream-schemas";


function normalizeMessageStatus(status: UpstreamMessage["status"]): GenieMessageStatus {
  return status === "IN_PROGRESS" ? "ASKING_AI" : status;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function mapUpstreamMessage(message: UpstreamMessage): GenieRemoteMessage {
  const attachments = message.attachments ?? [];
  const textAttachments = attachments
    .map((attachment) => attachment.text)
    .filter((text): text is NonNullable<typeof text> => Boolean(text));
  const answer = textAttachments.find((text) => text.purpose === "TEXT_ATTACHMENT_PURPOSE_ANSWER")
    ?? textAttachments.find((text) => text.purpose !== "FOLLOW_UP_QUESTION")
    ?? null;
  const suggestedQuestions = unique([
    ...attachments.flatMap((attachment) => attachment.suggested_questions?.questions ?? []),
    ...textAttachments
      .filter((text) => text.purpose === "FOLLOW_UP_QUESTION")
      .map((text) => text.content),
  ]);

  return {
    conversationId: message.conversation_id,
    messageId: message.message_id ?? message.id as string,
    status: normalizeMessageStatus(message.status),
    answer: answer?.content ?? null,
    suggestedQuestions,
    queryAttachments: attachments.flatMap((attachment) => {
      if (!attachment.query || !attachment.attachment_id) {
        return [];
      }
      return [{
        attachmentId: attachment.attachment_id,
        statementId: attachment.query.statement_id ?? null,
        title: attachment.query.title ?? null,
        description: attachment.query.description ?? null,
        sql: attachment.query.query ?? null,
      }];
    }),
    errorType: message.error?.type ?? null,
  };
}

export function mapUpstreamQueryResult(payload: UpstreamQueryResult): GenieRemoteQueryResult {
  const statement = payload.statement_response;
  const sourceRows = statement.result?.data_array ?? [];
  const rows = sourceRows.slice(0, MAX_GENIE_RESULT_ROWS);
  const columns = [...(statement.manifest?.schema?.columns ?? [])]
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
    .map((column) => ({
      name: column.name,
      type: column.type_name ?? column.type_text ?? "UNKNOWN",
    }));
  const reportedRowCount = statement.manifest?.total_row_count
    ?? statement.result?.row_count
    ?? sourceRows.length;

  return {
    statementId: statement.statement_id ?? null,
    state: statement.status.state,
    columns,
    rows,
    rowCount: reportedRowCount,
    truncated: Boolean(
      statement.manifest?.truncated
      || statement.result?.next_chunk_index !== undefined
      || statement.result?.next_chunk_internal_link
      || reportedRowCount > rows.length
      || sourceRows.length > rows.length,
    ),
  };
}
