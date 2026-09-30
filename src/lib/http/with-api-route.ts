import type { ErrorRequestHandler, Request, RequestHandler, Response } from "express";
import { normalizeError, RequestValidationError, type AppError } from "@/lib/errors/app-error";
import { createRequestContext, type RequestContext } from "@/lib/logging/request-context";

export type ApiContext = RequestContext & { signal: AbortSignal };
type ApiHandler<T> = (request: Request, context: ApiContext, response: Response) => T | Promise<T>;

function prepareResponse(response: Response, requestId: string): void {
  response.set("x-request-id", requestId);
  response.set("cache-control", "private, no-store");
  response.vary("Cookie, x-forwarded-user");
}

function sendError(error: unknown, request: Request, response: Response, context: RequestContext): void {
  const normalized = normalizeError(error);
  context.log.error({ errorName: normalized.name, code: normalized.code,
    method: request.method, path: request.path }, "request failed");
  const metadata = normalized as AppError & { retryable?: unknown; retryAfterMs?: unknown };
  if (typeof metadata.retryAfterMs === "number" && Number.isFinite(metadata.retryAfterMs)) {
    response.set("retry-after", String(Math.ceil(Math.max(0, metadata.retryAfterMs) / 1_000)));
  }
  response.status(normalized.status).json({ error: {
    code: normalized.code, message: normalized.userMessage, requestId: context.requestId,
    ...(typeof metadata.retryable === "boolean" ? { retryable: metadata.retryable } : {}),
  } });
}

/** Native Express handler: return JSON, or await writing a response (including SSE). */
export function withApiRoute<T>(handler: ApiHandler<T>): RequestHandler {
  return (request, response, next) => {
    const controller = new AbortController();
    const context: ApiContext = { ...createRequestContext(request), signal: controller.signal };
    const startedAt = performance.now();
    const abort = () => { if (!response.writableFinished) controller.abort(); };
    request.once("aborted", abort);
    response.once("close", abort);
    if (request.aborted) abort();
    prepareResponse(response, context.requestId);
    void Promise.resolve().then(() => handler(request, context, response)).then((result) => {
      if (!response.headersSent && !response.writableEnded) {
        if (result === undefined) response.status(204).end();
        else response.json(result);
      }
      context.log.info({ method: request.method, path: request.path,
        durationMs: performance.now() - startedAt }, "request completed");
    }).catch((error: unknown) => {
      if (controller.signal.aborted || response.headersSent) {
        controller.abort();
        response.destroy();
      }
      else {
        try { sendError(error, request, response, context); }
        catch (failure) { next(failure); }
      }
    }).finally(() => {
      request.off("aborted", abort);
      response.off("close", abort);
    });
  };
}

/** AppKit's Express parser runs before feature routes; normalize its errors too. */
export const expressErrorHandler: ErrorRequestHandler = (error, request, response, next) => {
  if (response.headersSent) { next(error); return; }
  const context = createRequestContext(request);
  prepareResponse(response, context.requestId);
  const parserError = typeof error?.type === "string" && new Set([
    "entity.parse.failed", "entity.too.large", "encoding.unsupported", "charset.unsupported",
    "request.aborted", "request.size.invalid", "stream.encoding.set", "stream.not.readable",
  ]).has(error.type);
  sendError(parserError ? new RequestValidationError("Invalid HTTP request") : error, request, response, context);
};
