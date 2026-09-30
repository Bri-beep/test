import { z } from "zod";

import { GenieError } from "@/features/genie/server/errors";
import { ConfigurationError } from "@/lib/errors/app-error";

const DEFAULT_GLOBAL_LIMIT = 8;
const DEFAULT_PER_USER_LIMIT = 2;

const limitSchema = z.coerce.number().int().min(1).max(100);

export type GenieConcurrencyLimits = {
  global: number;
  perUser: number;
};

export function resolveGenieConcurrencyLimits(
  environment: Record<string, string | undefined> = process.env,
): GenieConcurrencyLimits {
  const global = limitSchema.safeParse(
    environment.GENIE_MAX_CONCURRENT_STREAMS ?? DEFAULT_GLOBAL_LIMIT,
  );
  const perUser = limitSchema.safeParse(
    environment.GENIE_MAX_CONCURRENT_STREAMS_PER_USER ?? DEFAULT_PER_USER_LIMIT,
  );
  if (!global.success || !perUser.success || perUser.data > global.data) {
    throw new ConfigurationError(
      "Genie concurrency limits must be positive integers and the per-user limit cannot exceed the global limit",
    );
  }
  return { global: global.data, perUser: perUser.data };
}

export class GenieConcurrencyLimiter {
  private active = 0;
  private readonly activeByUser = new Map<string, number>();

  acquire(userId: string, limits: GenieConcurrencyLimits): () => void {
    const activeForUser = this.activeByUser.get(userId) ?? 0;
    if (this.active >= limits.global || activeForUser >= limits.perUser) {
      throw new GenieError(
        "Genie active-stream concurrency limit reached",
        "GENIE_UNAVAILABLE",
        429,
        true,
        { retryAfterMs: 5_000 },
      );
    }

    this.active += 1;
    this.activeByUser.set(userId, activeForUser + 1);
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.active = Math.max(0, this.active - 1);
      const remainingForUser = (this.activeByUser.get(userId) ?? 1) - 1;
      if (remainingForUser > 0) {
        this.activeByUser.set(userId, remainingForUser);
      } else {
        this.activeByUser.delete(userId);
      }
    };
  }
}

export const genieConcurrencyLimiter = new GenieConcurrencyLimiter();
