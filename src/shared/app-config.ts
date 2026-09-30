import { z } from "zod";

// Only display data crosses the server boundary. No environment object is serialized.
export const publicAppConfigSchema = z.object({
  mode: z.enum(["demo", "databricks"]),
  appName: z.string().min(1),
  appDescription: z.string(),
  supportContact: z.object({
    name: z.string().min(1),
    slackUrl: z.url().refine((value) => {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === "valiuz.slack.com"
        && !url.username && !url.password && !url.port;
    }),
  }).strict(),
  personalStateEnabled: z.boolean(),
  personalStateDemo: z.boolean(),
}).strict();

export type PublicAppConfig = z.infer<typeof publicAppConfigSchema>;
