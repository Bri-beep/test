import type { Request, Response } from "express";
import type { ApiContext } from "@/lib/http/with-api-route";

import type { GenieMessageRequest } from "@/features/genie/contract";
import { createDatabricksGenieClient } from "@/features/genie/server/client";
import {
  genieConcurrencyLimiter,
  resolveGenieConcurrencyLimits,
} from "@/features/genie/server/concurrency";
import { resolveGenieRuntimeConfiguration } from "@/features/genie/server/config";
import { resolveGenieRequestIdentity } from "@/features/genie/server/obo-auth";
import {
  streamDemoGenieMessage,
  streamGenieMessage,
} from "@/features/genie/server/service";
import { writeGenieSse } from "@/features/genie/server/sse";

export async function sendGenieMessage(
  request: Request,
  response: Response,
  alias: string,
  body: GenieMessageRequest,
  context: ApiContext,
): Promise<void> {
  const configuration = resolveGenieRuntimeConfiguration(alias);
  const { requestId, log, signal } = context;
  const startedAt = performance.now();
  const logCompletion = ({ queryResultCount }: { queryResultCount: number }) => log?.info(
    { alias, queryResultCount, durationMs: performance.now() - startedAt },
    "Genie stream completed",
  );
  const logFailure = (error: { name: string; code: string; retryable: boolean }) => log?.error(
    {
      errorName: error.name,
      code: error.code,
      alias,
      retryable: error.retryable,
      durationMs: performance.now() - startedAt,
    },
    "Genie stream failed",
  );

  if (configuration.mode === "demo") {
    log?.info({ alias, authType: "demo" }, "Genie stream started");
    return writeGenieSse(
      response,
      streamDemoGenieMessage(body, {
        requestId,
        signal,
        onError: logFailure,
        onComplete: logCompletion,
      }),
      signal,
    );
  }

  const identity = await resolveGenieRequestIdentity(request, configuration);
  if (signal.aborted) return;
  const release = genieConcurrencyLimiter.acquire(
    identity.userId,
    resolveGenieConcurrencyLimits(),
  );
  log?.info({ alias, authType: identity.authType }, "Genie stream started");
  try {
    const client = createDatabricksGenieClient({
      workspaceUrl: configuration.workspaceUrl,
      accessToken: identity.accessToken,
    });
    await writeGenieSse(
      response,
      streamGenieMessage(body, {
        client,
        alias,
        spaceId: configuration.space.spaceId,
        requestId,
        signal,
        onError: logFailure,
        onComplete: logCompletion,
      }),
      signal,
    );
  } finally {
    release();
  }
}
