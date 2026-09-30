import type { Request } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError, RequestValidationError } from "@/lib/errors/app-error";
import type { UserStateConfig } from "./config";

export function resolveOwner(request: Request, config: UserStateConfig): string {
  // No owner field, query argument, email fallback or client-selected demo identity.
  const raw = config.mode === "demo" ? "local-demo-user" : request.get("x-forwarded-user");
  // Reject control characters in the identity supplied by the trusted proxy.
  // eslint-disable-next-line no-control-regex
  if (!raw?.trim() || raw.length > 512 || /[\u0000-\u001f\u007f]/.test(raw)) {
    throw new AppError("Missing proxy identity", "USER_STATE_AUTH_REQUIRED", 401,
      "Connectez-vous à l’application pour accéder à vos analyses.");
  }
  return createHash("sha256").update(JSON.stringify([config.appId, raw])).digest("hex");
}

export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new RequestValidationError("Invalid personal state payload");
  return parsed.data;
}

export async function readMutation(request: Request, config: UserStateConfig): Promise<unknown> {
  if (request.get("origin") !== config.origin
    || request.get("sec-fetch-site") === "cross-site"
    || request.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    throw new RequestValidationError("Personal state mutations require same-origin JSON");
  }
  // AppKit bounds the decoded HTTP body at 64 KiB; this feature bounds its JSON value at 16 KiB.
  if (request.body === undefined) throw new RequestValidationError("Missing personal state payload");
  if (Buffer.byteLength(JSON.stringify(request.body), "utf8") > 16 * 1024) {
    throw new RequestValidationError("Personal state payload exceeds 16 KiB");
  }
  return request.body;
}
