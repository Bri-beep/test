import { z } from "zod";

export const connectionCheckSchema = z.object({
  status: z.enum(["demo", "ok"]),
  connected: z.boolean(),
  currentUser: z.string().nullable(),
  checkedAt: z.string(),
});

export type ConnectionCheck = z.infer<typeof connectionCheckSchema>;
