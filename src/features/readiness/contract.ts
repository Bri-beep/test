import { z } from "zod";

export const readinessSchema = z.object({
  status: z.enum(["demo", "ok"]),
  ready: z.boolean(),
  sourceCount: z.number().int().nonnegative(),
  checkedAt: z.string(),
});

export type Readiness = z.infer<typeof readinessSchema>;
