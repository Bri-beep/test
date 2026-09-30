import assert from "node:assert/strict";
import { requestHandler } from "./http";
import { withApiRoute } from "../../src/lib/http/with-api-route";

import { createDatabricksGenieClient } from "../../src/features/genie/server/client";
import { resolveGenieRuntimeConfiguration } from "../../src/features/genie/server/config";
import { GenieError } from "../../src/features/genie/server/errors";
import { resolveGenieRequestIdentity } from "../../src/features/genie/server/obo-auth";

const SPACE_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CONVERSATION_ID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const MESSAGE_ID = "cccccccccccccccccccccccccccccccc";
const TOKEN = "synthetic-user-token";

const calls: Array<{ url: string; init: RequestInit }> = [];
const responses: unknown[] = [
  {
    conversation: { id: CONVERSATION_ID },
    message: {
      conversation_id: CONVERSATION_ID,
      message_id: MESSAGE_ID,
      status: "IN_PROGRESS",
      attachments: null,
    },
  },
  {
    conversation_id: CONVERSATION_ID,
    message_id: MESSAGE_ID,
    status: "SUBMITTED",
    attachments: null,
  },
  {
    conversation_id: CONVERSATION_ID,
    message_id: MESSAGE_ID,
    status: "ASKING_AI",
    attachments: [],
  },
  {
    statement_response: {
      statement_id: "statement-1",
      status: { state: "SUCCEEDED" },
      manifest: {
        total_row_count: 1,
        schema: { columns: [{ name: "metric", type_name: "DECIMAL", position: 0 }] },
      },
      result: { data_array: [["42"]], row_count: 1 },
    },
  },
];

const fetchImplementation: typeof fetch = async (input, init = {}) => {
  calls.push({ url: String(input), init });
  return Response.json(responses.shift());
};

const client = createDatabricksGenieClient({
  workspaceUrl: "https://workspace.example.databricks.com",
  accessToken: TOKEN,
  fetchImplementation,
});

await client.submitMessage({ spaceId: SPACE_ID, content: "Question initiale" });
await client.submitMessage({
  spaceId: SPACE_ID,
  conversationId: CONVERSATION_ID,
  content: "Question suivante",
});
await client.getMessage({ spaceId: SPACE_ID, conversationId: CONVERSATION_ID, messageId: MESSAGE_ID });
await client.getQueryResult({
  spaceId: SPACE_ID,
  conversationId: CONVERSATION_ID,
  messageId: MESSAGE_ID,
  attachmentId: "query-1",
});

assert.equal(
  calls[0]?.url,
  `https://workspace.example.databricks.com/api/2.0/genie/spaces/${SPACE_ID}/start-conversation`,
);
assert.equal(
  calls[1]?.url,
  `https://workspace.example.databricks.com/api/2.0/genie/spaces/${SPACE_ID}/conversations/${CONVERSATION_ID}/messages`,
);
assert.equal(
  calls[2]?.url,
  `https://workspace.example.databricks.com/api/2.0/genie/spaces/${SPACE_ID}/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}`,
);
assert.equal(
  calls[3]?.url,
  `https://workspace.example.databricks.com/api/2.0/genie/spaces/${SPACE_ID}/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}/attachments/query-1/query-result`,
);
assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
  content: "Question initiale",
  enable_visualization: true,
});
assert.deepEqual(JSON.parse(String(calls[1]?.init.body)), {
  content: "Question suivante",
  enable_visualization: true,
});
for (const call of calls) {
  assert.equal(new Headers(call.init.headers).get("authorization"), `Bearer ${TOKEN}`);
}

const malformedClient = createDatabricksGenieClient({
  workspaceUrl: "https://workspace.example.databricks.com",
  accessToken: TOKEN,
  fetchImplementation: async () => Response.json({ unexpected: true }),
});
await assert.rejects(
  malformedClient.submitMessage({ spaceId: SPACE_ID, content: "Question" }),
  (error: unknown) => error instanceof GenieError && error.code === "GENIE_UNAVAILABLE",
);

for (const [status, expectedCode] of [
  [401, "GENIE_AUTH_REQUIRED"],
  [403, "GENIE_PERMISSION_DENIED"],
] as const) {
  const failingClient = createDatabricksGenieClient({
    workspaceUrl: "https://workspace.example.databricks.com",
    accessToken: TOKEN,
    fetchImplementation: async () => new Response("discarded upstream details", { status }),
  });
  await assert.rejects(
    failingClient.submitMessage({ spaceId: SPACE_ID, content: "Question" }),
    (error: unknown) => error instanceof GenieError
      && error.code === expectedCode
      && !error.userMessage.includes("discarded"),
  );
}

const rateLimitedClient = createDatabricksGenieClient({
  workspaceUrl: "https://workspace.example.databricks.com",
  accessToken: TOKEN,
  fetchImplementation: async () => new Response(null, {
    status: 429,
    headers: { "retry-after": "7" },
  }),
});
await assert.rejects(
  rateLimitedClient.getMessage({
    spaceId: SPACE_ID,
    conversationId: CONVERSATION_ID,
    messageId: MESSAGE_ID,
  }),
  (error: unknown) => error instanceof GenieError
    && error.retryOnRead
    && error.retryAfterMs === 7_000,
);

const deployedConfiguration = resolveGenieRuntimeConfiguration("sales", {
  APP_MODE: "databricks",
  DATABRICKS_APP_NAME: "analytics-app",
  DATABRICKS_HOST: "https://workspace.example.databricks.com",
  DATABRICKS_GENIE_SPACE_ID_FRAIM_SALES: SPACE_ID,
});
assert.equal(deployedConfiguration.mode, "databricks");
assert.equal(deployedConfiguration.space.key, "fraim-sales");
if (deployedConfiguration.mode !== "databricks") {
  assert.fail("Expected Databricks Genie configuration");
}
const oboResponse = await requestHandler(withApiRoute(async (request) => {
  const identity = await resolveGenieRequestIdentity(request, deployedConfiguration);
  assert.deepEqual(identity, { userId: "workspace-user", accessToken: TOKEN, authType: "obo" });
  return { ok: true };
}), new Request("https://app.example/api/genie", { headers: {
  "x-forwarded-user": "workspace-user", "x-forwarded-access-token": TOKEN,
} }));
assert.equal(oboResponse.status, 200);
const missingIdentity = await requestHandler(withApiRoute(async (request) => {
  await resolveGenieRequestIdentity(request, deployedConfiguration);
}), new Request("https://app.example/api/genie"));
assert.equal(missingIdentity.status, 401);
assert.equal((await missingIdentity.json()).error.code, "GENIE_AUTH_REQUIRED");

const localConfiguration = resolveGenieRuntimeConfiguration("fraim-sales", {
  APP_MODE: "databricks",
  DATABRICKS_HOST: "https://workspace.example.databricks.com",
  DATABRICKS_CONFIG_PROFILE: "analytics-dev",
});
if (localConfiguration.mode !== "databricks") {
  assert.fail("Expected local Databricks Genie configuration");
}
const localResponse = await requestHandler(withApiRoute(async (request) => {
  const identity = await resolveGenieRequestIdentity(request, localConfiguration, { getCliToken: async () => TOKEN });
  assert.equal(identity.authType, "oauth-u2m-cli");
  return { ok: true };
}), new Request("http://localhost/api/genie"));
assert.equal(localResponse.status, 200);
