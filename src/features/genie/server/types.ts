import type { GenieMessageStatus, GenieResultCell } from "@/features/genie/contract";

export type GenieRemoteQueryAttachment = {
  attachmentId: string;
  statementId: string | null;
  title: string | null;
  description: string | null;
  sql: string | null;
};

export type GenieRemoteMessage = {
  conversationId: string;
  messageId: string;
  status: GenieMessageStatus;
  answer: string | null;
  suggestedQuestions: string[];
  queryAttachments: GenieRemoteQueryAttachment[];
  errorType: string | null;
};

export type GenieRemoteQueryResult = {
  statementId: string | null;
  state: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "CLOSED" | "STATE_UNSPECIFIED";
  columns: Array<{ name: string; type: string }>;
  rows: GenieResultCell[][];
  rowCount: number;
  truncated: boolean;
};

export type SubmitGenieMessageInput = {
  spaceId: string;
  content: string;
  conversationId?: string;
  signal?: AbortSignal;
};

export type GetGenieMessageInput = {
  spaceId: string;
  conversationId: string;
  messageId: string;
  signal?: AbortSignal;
};

export type GetGenieQueryResultInput = GetGenieMessageInput & {
  attachmentId: string;
};

export interface GenieClient {
  submitMessage(input: SubmitGenieMessageInput): Promise<GenieRemoteMessage>;
  getMessage(input: GetGenieMessageInput): Promise<GenieRemoteMessage>;
  getQueryResult(input: GetGenieQueryResultInput): Promise<GenieRemoteQueryResult>;
}
