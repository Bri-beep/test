import { randomUUID } from "node:crypto";
import type { Request } from "express";

import type { Logger } from "pino";

import { logger } from "@/lib/logging/logger";

const requestIdPattern = /^[A-Za-z0-9._-]{1,128}$/;

export type RequestContext = {
  requestId: string;
  log: Logger;
};

export function createRequestContext(request: Request): RequestContext {
  const candidate = request.get("x-request-id") ?? "";
  const requestId = requestIdPattern.test(candidate) ? candidate : randomUUID();
  return { requestId, log: logger.child({ requestId }) };
}
