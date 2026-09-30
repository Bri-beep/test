import type { Request } from "express";
import { genieMessageRequestSchema, type GenieMessageRequest } from "@/features/genie/contract";
import { RequestValidationError } from "@/lib/errors/app-error";

const MAX_REQUEST_BODY_BYTES = 64 * 1024;

function forwardedOrigin(request: Request): string | null {
  const host = request.get("x-forwarded-host")?.split(",")[0]?.trim();
  const protocol = request.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (!host || (protocol !== "http" && protocol !== "https")) {
    return null;
  }
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return null;
  }
}

function assertSameOrigin(request: Request): void {
  const fetchSite = request.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new RequestValidationError("Genie requests must be same-origin");
  }

  const rawOrigin = request.get("origin")?.trim();
  if (!rawOrigin) {
    return;
  }
  let origin: string;
  try {
    origin = new URL(rawOrigin).origin;
  } catch {
    throw new RequestValidationError("Genie request origin is invalid");
  }
  const acceptedOrigins = new Set([
    new URL(`${request.protocol}://${request.get("host")}`).origin,
    forwardedOrigin(request),
  ].filter((value): value is string => Boolean(value)));
  if (!acceptedOrigins.has(origin)) {
    throw new RequestValidationError("Genie requests must be same-origin");
  }
}

function assertJsonContentType(request: Request): void {
  const mediaType = request.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new RequestValidationError("Genie request content type must be application/json");
  }
}

function assertDeclaredBodySize(request: Request): void {
  const rawContentLength = request.get("content-length")?.trim();
  if (!rawContentLength) {
    return;
  }
  if (!/^\d+$/.test(rawContentLength) || Number(rawContentLength) > MAX_REQUEST_BODY_BYTES) {
    throw new RequestValidationError("Genie request body is too large");
  }
}

export function parseGenieMessageRequest(request: Request): GenieMessageRequest {
  assertSameOrigin(request);
  assertJsonContentType(request);
  assertDeclaredBodySize(request);
  const payload: unknown = request.body;
  const parsed = genieMessageRequestSchema.safeParse(payload);
  if (!parsed.success) {
    throw new RequestValidationError("Genie request body does not match the public contract");
  }
  return parsed.data;
}
