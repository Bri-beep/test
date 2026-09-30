import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test, { before } from "node:test";
import { startTestGenie } from "./fixtures/genie-appkit";
import { requestHandler, withHttpApp } from "./fixtures/http";
import { withApiRoute } from "../src/lib/http/with-api-route";

import {
  genieMessageRequestSchema,
  type GenieStreamEvent,
} from "../src/features/genie/contract";
import { buildGenieMessageContent } from "../src/features/genie/context";
import {
  GenieConcurrencyLimiter,
  resolveGenieConcurrencyLimits,
} from "../src/features/genie/server/concurrency";
import { GenieError } from "../src/features/genie/server/errors";
import { extractForwardedGenieIdentity } from "../src/features/genie/server/identity";
import { mapUpstreamMessage, mapUpstreamQueryResult } from "../src/features/genie/server/mapper";
import { parseGenieMessageRequest } from "../src/features/genie/server/request";
import {
  streamDemoGenieMessage,
  streamGenieMessage,
} from "../src/features/genie/server/service";
import { writeGenieSse, encodeGenieSseEvent } from "../src/features/genie/server/sse";
import type {
  GenieClient,
  GenieRemoteMessage,
  GenieRemoteQueryResult,
} from "../src/features/genie/server/types";
import {
  upstreamMessageSchema,
  upstreamQueryResultSchema,
} from "../src/features/genie/server/upstream-schemas";

const CONVERSATION_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MESSAGE_ID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const execFileAsync = promisify(execFile);

before(async () => { await startTestGenie({ [CONVERSATION_ID]: CONVERSATION_ID, ["c".repeat(32)]: "c".repeat(32) }); });

async function collect(events: AsyncIterable<GenieStreamEvent>): Promise<GenieStreamEvent[]> {
  const collected: GenieStreamEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

function message(
  status: GenieRemoteMessage["status"],
  overrides: Partial<GenieRemoteMessage> = {},
): GenieRemoteMessage {
  return {
    conversationId: CONVERSATION_ID,
    messageId: MESSAGE_ID,
    status,
    answer: null,
    suggestedQuestions: [],
    queryAttachments: [],
    errorType: null,
    ...overrides,
  };
}

test("validates a bounded alias-free message request and rejects browser-supplied IDs", () => {
  const valid = genieMessageRequestSchema.parse({
    content: "Quels produits reculent ?",
    context: {
      filters: { region: "EMEA" },
      dateRange: { label: "90 derniers jours" },
    },
  });
  assert.equal(valid.content, "Quels produits reculent ?");
  assert.equal(
    genieMessageRequestSchema.safeParse({ content: "Question", spaceId: CONVERSATION_ID }).success,
    false,
  );
  assert.equal(
    genieMessageRequestSchema.safeParse({ content: "Question", conversationId: "../another-space" }).success,
    false,
  );
});

test("accepts only bounded same-origin JSON requests before OBO work", async () => {
  const route = withApiRoute((request) => parseGenieMessageRequest(request));
  const response = await requestHandler(route, new Request("https://app.example/api/genie/sales/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8", origin: "https://app.example",
      "sec-fetch-site": "same-origin", "x-forwarded-host": "app.example", "x-forwarded-proto": "https",
    },
    body: JSON.stringify({ content: "Question autorisée" }),
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).content, "Question autorisée");

  const invalidRequests = [
    new Request("https://app.example/api/genie/sales/messages", {
      method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ content: "Question" }),
    }),
    new Request("http://internal:3000/api/genie/sales/messages", {
      method: "POST", headers: {
        "content-type": "application/json", origin: "https://attacker.example", "sec-fetch-site": "cross-site",
        "x-forwarded-host": "app.example", "x-forwarded-proto": "https",
      }, body: JSON.stringify({ content: "Question" }),
    }),
    new Request("https://app.example/api/genie/sales/messages", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: "x".repeat(65 * 1024) }),
    }),
    new Request("https://app.example/api/genie/sales/messages", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: "Question", spaceId: "undeclared" }),
    }),
  ];
  for (const request of invalidRequests) {
    const response = await requestHandler(route, request);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "INVALID_REQUEST");
  }
});

test("bounds active Genie streams globally and per user without retaining released users", async () => {
  assert.deepEqual(resolveGenieConcurrencyLimits({}), { global: 8, perUser: 2 });
  assert.throws(
    () => resolveGenieConcurrencyLimits({
      GENIE_MAX_CONCURRENT_STREAMS: "1",
      GENIE_MAX_CONCURRENT_STREAMS_PER_USER: "2",
    }),
    /per-user limit cannot exceed the global limit/,
  );

  const limiter = new GenieConcurrencyLimiter();
  const releaseFirst = limiter.acquire("first-user", { global: 2, perUser: 1 });
  assert.throws(
    () => limiter.acquire("first-user", { global: 2, perUser: 1 }),
    (error: unknown) => error instanceof GenieError && error.status === 429 && error.retryable,
  );
  const releaseSecond = limiter.acquire("second-user", { global: 2, perUser: 1 });
  assert.throws(
    () => limiter.acquire("third-user", { global: 2, perUser: 1 }),
    (error: unknown) => error instanceof GenieError && error.status === 429,
  );
  releaseFirst();
  releaseFirst();
  const releaseReplacement = limiter.acquire("third-user", { global: 2, perUser: 1 });
  releaseSecond();
  releaseReplacement();

});

test("emits SSE comment heartbeats while the next Genie event is pending", async () => {
  async function* delayedEvents(): AsyncGenerator<GenieStreamEvent> {
    await new Promise((resolve) => setTimeout(resolve, 18));
    yield { type: "status", status: "ASKING_AI" };
  }
  const route = withApiRoute((_request, { signal }, response) => writeGenieSse(response, delayedEvents(), signal, 5));
  const response = await requestHandler(route, new Request("http://localhost/stream"));
  const body = await response.text();
  assert.match(body, /: heartbeat\n\n/);
  assert.match(body, /event: status/);
  assert.equal(response.headers.get("cache-control"), "private, no-cache, no-store, no-transform");
});

test("closes the Genie iterator and releases its slot when the response is cancelled", { timeout: 5_000 }, async () => {
  let released!: () => void;
  const finished = new Promise<void>((resolve) => { released = resolve; });
  let observedSignal: AbortSignal | undefined;
  const route = withApiRoute((_request, { signal }, response) => {
    observedSignal = signal;
    async function* cancellableEvents(): AsyncGenerator<GenieStreamEvent> {
      try {
        yield { type: "status", status: "ASKING_AI" };
        await new Promise<void>((resolve) => {
          if (signal.aborted) { resolve(); return; }
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
      } finally { released(); }
    }
    return writeGenieSse(response, cancellableEvents(), signal, 60_000);
  });
  await withHttpApp((app) => app.get("/stream", route), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/stream`);
    const reader = response.body!.getReader();
    assert.equal((await reader.read()).done, false);
    await reader.cancel();
    await finished;
    assert.equal(observedSignal?.aborted, true);
  });
});

test("adds sorted dashboard context without changing a context-free question", () => {
  assert.equal(buildGenieMessageContent("Question simple"), "Question simple");
  const content = buildGenieMessageContent("Quels produits reculent ?", {
    page: { title: "Performance commerciale", route: "/genie" },
    filters: { region: "EMEA", canal: ["Magasin", "Web"] },
    dateRange: { start: "2026-06-01", end: "2026-08-30" },
    selectedMetrics: ["Chiffre d’affaires"],
    activeTables: ["sales_performance"],
  });

  assert.match(content, /Contexte du tableau de bord/);
  assert.ok(content.indexOf("Filtre canal") < content.indexOf("Filtre region"));
  assert.match(content, /Question de l’utilisateur\nQuels produits reculent \?/);
});

test("requires both forwarded OBO headers as a request-scoped identity", () => {
  assert.equal(extractForwardedGenieIdentity({}), null);
  assert.equal(
    extractForwardedGenieIdentity({ "x-forwarded-user": "user-id" }),
    null,
  );
  assert.deepEqual(
    extractForwardedGenieIdentity({
      "x-forwarded-user": " user-id ",
      "x-forwarded-access-token": " user-token ",
    }),
    { userId: "user-id", accessToken: "user-token" },
  );
});

test("uses the official Genie REST paths and validates malformed upstream responses", async () => {
  const fixture = new URL("./fixtures/genie-client-contract.ts", import.meta.url);
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ["--import", "tsx", fixture.pathname],
    { encoding: "utf8" },
  );
  assert.doesNotMatch(stdout + stderr, /synthetic-user-token|workspace-user|Question initiale|discarded upstream details/);
  assert.ok(stdout.trim().split("\n").every((line) => typeof JSON.parse(line).requestId === "string"));
  assert.equal(stderr, "");
});

test("maps validated Genie attachments and bounded statement results", () => {
  const upstream = upstreamMessageSchema.parse({
    conversation_id: CONVERSATION_ID,
    message_id: MESSAGE_ID,
    status: "COMPLETED",
    attachments: [
      {
        attachment_id: "answer",
        text: { content: "Réponse finale", purpose: "TEXT_ATTACHMENT_PURPOSE_ANSWER" },
      },
      {
        attachment_id: "query-1",
        query: {
          title: "Ventes",
          description: "Résultat agrégé",
          query: "SELECT metric FROM governed.source",
          statement_id: "statement-1",
        },
      },
      {
        attachment_id: "suggestions",
        suggested_questions: { questions: ["Et par région ?", "Et par région ?"] },
      },
    ],
  });
  const mappedMessage = mapUpstreamMessage(upstream);
  assert.equal(mappedMessage.answer, "Réponse finale");
  assert.deepEqual(mappedMessage.suggestedQuestions, ["Et par région ?"]);
  assert.equal(mappedMessage.queryAttachments[0]?.sql, "SELECT metric FROM governed.source");

  const sourceRows = Array.from({ length: 501 }, (_, index) => [`Produit ${index}`, String(index)]);
  const result = upstreamQueryResultSchema.parse({
    statement_response: {
      statement_id: "statement-1",
      status: { state: "SUCCEEDED" },
      manifest: {
        total_row_count: 501,
        schema: {
          columns: [
            { name: "revenue", type_name: "DECIMAL", position: 1 },
            { name: "product", type_name: "STRING", position: 0 },
          ],
        },
      },
      result: { data_array: sourceRows, row_count: 501 },
    },
  });
  const mappedResult = mapUpstreamQueryResult(result);
  assert.deepEqual(mappedResult.columns.map((column) => column.name), ["product", "revenue"]);
  assert.equal(mappedResult.rows.length, 500);
  assert.equal(mappedResult.rowCount, 501);
  assert.equal(mappedResult.truncated, true);
});

test("streams official lifecycle states, uses continuation IDs, and emits a rich query result", async () => {
  const queryAttachment = {
    attachmentId: "query-1",
    statementId: "statement-1",
    title: "Produits à surveiller",
    description: "Baisse sur la période",
    sql: "SELECT product, change FROM governed.sales",
  };
  const polledMessages = [
    message("ASKING_AI"),
    message("EXECUTING_QUERY", { queryAttachments: [queryAttachment] }),
    message("COMPLETED", {
      answer: "Produit Alpha recule le plus.",
      suggestedQuestions: ["Pourquoi ?"],
      queryAttachments: [queryAttachment],
    }),
  ];
  const remoteResults: GenieRemoteQueryResult[] = [
    {
      statementId: "statement-1",
      state: "RUNNING",
      columns: [],
      rows: [],
      rowCount: 0,
      truncated: false,
    },
    {
      statementId: "statement-1",
      state: "SUCCEEDED",
      columns: [{ name: "product", type: "STRING" }, { name: "change", type: "DECIMAL" }],
      rows: [["Produit Alpha", "-12.4"]],
      rowCount: 1,
      truncated: false,
    },
  ];
  let submittedContent = "";
  let submittedConversationId: string | undefined;
  const client: GenieClient = {
    submitMessage: async (input) => {
      submittedContent = input.content;
      submittedConversationId = input.conversationId;
      return message("SUBMITTED");
    },
    getMessage: async () => polledMessages.shift() as GenieRemoteMessage,
    getQueryResult: async () => remoteResults.shift() as GenieRemoteQueryResult,
  };
  const delays: number[] = [];

  const events = await collect(streamGenieMessage(
    {
      content: "Top produits",
      conversationId: CONVERSATION_ID,
      context: { filters: { region: "EMEA" } },
    },
    {
      client,
      spaceId: "cccccccccccccccccccccccccccccccc",
      requestId: "request-live",
      polling: { initialDelayMs: 10, maxDelayMs: 20, multiplier: 2, timeoutMs: 1_000 },
      sleep: async (delayMs) => { delays.push(delayMs); },
    },
  ));

  assert.equal(submittedConversationId, CONVERSATION_ID);
  assert.match(submittedContent, /Filtre region : "EMEA"/);
  // AppKit requests attachments after the final message; the first result is still RUNNING.
  assert.deepEqual(delays, [10, 20, 20, 10]);
  assert.deepEqual(events.map((event) => event.type), [
    "message_start",
    "status",
    "status",
    "status",
    "status",
    "message_result",
    "query_result",
  ]);
  const resultEvent = events.find((event) => event.type === "message_result");
  assert.equal(resultEvent?.message.content, "Top produits");
  assert.equal(resultEvent?.message.attachments.find((attachment) => attachment.text)?.text?.content, "Produit Alpha recule le plus.");
  assert.equal(resultEvent?.message.attachments.find((attachment) => attachment.query)?.query?.query, queryAttachment.sql);
});

test("keeps polling a completed message until its known query result succeeds", async () => {
  const queryAttachment = {
    attachmentId: "query-after-completion",
    statementId: "statement-after-completion",
    title: "Résultat différé",
    description: null,
    sql: "SELECT metric FROM governed.sales",
  };
  const remoteResults: GenieRemoteQueryResult[] = [
    {
      statementId: "statement-after-completion",
      state: "RUNNING",
      columns: [],
      rows: [],
      rowCount: 0,
      truncated: false,
    },
    {
      statementId: "statement-after-completion",
      state: "SUCCEEDED",
      columns: [{ name: "metric", type: "BIGINT" }],
      rows: [["42"]],
      rowCount: 1,
      truncated: false,
    },
  ];
  let messagePollCount = 0;
  const delays: number[] = [];
  const client: GenieClient = {
    submitMessage: async () => message("COMPLETED", {
      answer: "Le résultat est prêt.",
      queryAttachments: [queryAttachment],
    }),
    getMessage: async () => {
      messagePollCount += 1;
      return message("COMPLETED");
    },
    getQueryResult: async () => remoteResults.shift() as GenieRemoteQueryResult,
  };

  const events = await collect(streamGenieMessage(
    { content: "Question" },
    {
      client,
      spaceId: CONVERSATION_ID,
      requestId: "request-delayed-result",
      polling: { initialDelayMs: 5, maxDelayMs: 20, multiplier: 2, timeoutMs: 100 },
      sleep: async (delayMs) => { delays.push(delayMs); },
    },
  ));

  assert.equal(messagePollCount, 0);
  assert.deepEqual(delays, [5]);
  assert.deepEqual(events.map((event) => event.type), [
    "message_start",
    "status",
    "message_result",
    "query_result",
  ]);
});

test("retries transient message reads with bounded jitter but never resubmits", async () => {
  let submitCount = 0;
  let readCount = 0;
  let now = 0;
  const delays: number[] = [];
  const client: GenieClient = {
    submitMessage: async () => {
      submitCount += 1;
      return message("SUBMITTED");
    },
    getMessage: async () => {
      readCount += 1;
      if (readCount === 1) {
        throw new GenieError("temporary polling failure", "GENIE_UNAVAILABLE", 503, true, {
          retryOnRead: true,
        });
      }
      return message("COMPLETED", { answer: "Lecture rétablie." });
    },
    getQueryResult: async () => assert.fail("query result should not be requested"),
  };

  const events = await collect(streamGenieMessage(
    { content: "Question" },
    {
      client,
      spaceId: CONVERSATION_ID,
      requestId: "request-read-retry",
      polling: { initialDelayMs: 5, maxDelayMs: 20, multiplier: 2, timeoutMs: 100 },
      now: () => now,
      random: () => 0.5,
      sleep: async (delayMs) => {
        delays.push(delayMs);
        now += delayMs;
      },
    },
  ));

  assert.equal(submitCount, 1);
  assert.equal(readCount, 2);
  assert.deepEqual(delays, [5, 5]);
  assert.deepEqual(events.map((event) => event.type), [
    "message_start",
    "status",
    "status",
    "message_result",
  ]);
});

test("honors Retry-After while retrying an idempotent query-result read", async () => {
  const queryAttachment = {
    attachmentId: "query-retry-after",
    statementId: "statement-retry-after",
    title: "Résultat",
    description: null,
    sql: "SELECT metric FROM governed.sales",
  };
  let resultReadCount = 0;
  let now = 0;
  const delays: number[] = [];
  const client: GenieClient = {
    submitMessage: async () => message("COMPLETED", {
      answer: "Résultat prêt.",
      queryAttachments: [queryAttachment],
    }),
    getMessage: async () => assert.fail("completed message should not be polled"),
    getQueryResult: async () => {
      resultReadCount += 1;
      if (resultReadCount === 1) {
        throw new GenieError("rate limited", "GENIE_UNAVAILABLE", 503, true, {
          retryAfterMs: 17,
          retryOnRead: true,
        });
      }
      return {
        statementId: "statement-retry-after",
        state: "SUCCEEDED",
        columns: [{ name: "metric", type: "BIGINT" }],
        rows: [["42"]],
        rowCount: 1,
        truncated: false,
      };
    },
  };

  const events = await collect(streamGenieMessage(
    { content: "Question" },
    {
      client,
      spaceId: CONVERSATION_ID,
      requestId: "request-query-retry",
      polling: { initialDelayMs: 5, maxDelayMs: 20, multiplier: 2, timeoutMs: 100 },
      now: () => now,
      random: () => 0,
      sleep: async (delayMs) => {
        delays.push(delayMs);
        now += delayMs;
      },
    },
  ));

  assert.equal(resultReadCount, 2);
  assert.deepEqual(delays, [17]);
  assert.deepEqual(events.map((event) => event.type), [
    "message_start",
    "status",
    "message_result",
    "query_result",
  ]);
});

test("turns permission failures into a safe SSE error without leaking technical content", async () => {
  const client: GenieClient = {
    submitMessage: async () => {
      throw new GenieError(
        "token=secret prompt=customer-row",
        "GENIE_PERMISSION_DENIED",
        403,
        false,
      );
    },
    getMessage: async () => message("FAILED"),
    getQueryResult: async () => assert.fail("query result should not be requested"),
  };
  const events = await collect(streamGenieMessage(
    { content: "Question sensible" },
    { client, spaceId: CONVERSATION_ID, requestId: "request-denied" },
  ));

  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, "error");
  assert.deepEqual(events[0], {
    type: "error",
    code: "GENIE_PERMISSION_DENIED",
    error: "Vous n’avez pas l’autorisation d’utiliser cet espace Genie ou ses données.",
    requestId: "request-denied",
    retryable: false,
  });
  assert.doesNotMatch(JSON.stringify(events), /secret|customer-row|Question sensible/);
});

test("maps explicit upstream permission failure types to the permission error", async () => {
  const client: GenieClient = {
    submitMessage: async () => message("FAILED", { errorType: "PERMISSION_DENIED" }),
    getMessage: async () => message("FAILED"),
    getQueryResult: async () => assert.fail("query result should not be requested"),
  };
  const events = await collect(streamGenieMessage(
    { content: "Question" },
    { client, spaceId: CONVERSATION_ID, requestId: "request-permission-type" },
  ));
  const error = events.at(-1);
  assert.equal(error?.type, "error");
  assert.equal(error?.code, "GENIE_PERMISSION_DENIED");
});

test("bounds polling with a timeout error", async () => {
  let now = 0;
  const client: GenieClient = {
    submitMessage: async () => message("ASKING_AI"),
    getMessage: async () => message("ASKING_AI"),
    getQueryResult: async () => assert.fail("query result should not be requested"),
  };
  const events = await collect(streamGenieMessage(
    { content: "Question" },
    {
      client,
      spaceId: CONVERSATION_ID,
      requestId: "request-timeout",
      polling: { initialDelayMs: 10, maxDelayMs: 20, multiplier: 2, timeoutMs: 25 },
      now: () => now,
      sleep: async (delayMs) => { now += delayMs; },
    },
  ));

  assert.deepEqual(events.map((event) => event.type), ["message_start", "status", "error"]);
  const error = events.at(-1);
  assert.equal(error?.type, "error");
  assert.equal(error?.code, "GENIE_TIMEOUT");
  assert.equal(error?.retryable, true);
});

test("demo mode emits a deterministic synthetic lifecycle and valid SSE frames", async () => {
  const events = await collect(streamDemoGenieMessage(
    { content: "Question démo" },
    { requestId: "request-demo", statusDelayMs: 0 },
  ));
  assert.deepEqual(events.map((event) => event.type), [
    "message_start",
    "status",
    "status",
    "status",
    "status",
    "message_result",
    "query_result",
  ]);
  const frame = encodeGenieSseEvent(events[0] as GenieStreamEvent);
  assert.match(frame, /^event: message_start\ndata: \{"type":"message_start"/);
  assert.match(frame, /\n\n$/);
  assert.doesNotMatch(JSON.stringify(events), /customer|client_id|access.token/i);
});
