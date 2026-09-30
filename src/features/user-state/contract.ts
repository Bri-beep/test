import { z } from "zod";

// Add a strict, versioned definition for each application view here. Never accept
// arbitrary URLs, SQL, tokens or query results as a saved analysis definition.
export const periodSchema = z.union([z.literal(7), z.literal(30), z.literal(90)]);
export const definitionSchema = z.object({
  schemaVersion: z.literal(1),
  view: z.literal("example"),
  filters: z.object({
    region: z.enum(["all", "north", "south"]),
    periodDays: periodSchema,
  }).strict(),
}).strict();

export const analysisInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  note: z.string().max(2000).default(""),
  definition: definitionSchema,
}).strict();
export const analysisSchema = analysisInputSchema.extend({
  id: z.string().uuid(),
  updatedAt: z.string().datetime(),
});
export const preferencesSchema = z.object({
  schemaVersion: z.literal(1),
  defaultPeriodDays: periodSchema,
  librarySort: z.enum(["updated", "title"]),
}).strict();
export const DEFAULT_PREFERENCES: Preferences = {
  schemaVersion: 1, defaultPeriodDays: 30, librarySort: "updated",
};
export const PAGE_SIZE = 50;
export const pageSchema = z.object({
  items: z.array(analysisSchema),
  nextCursor: z.string().uuid().nullable(),
});
export type AnalysisDefinition = z.infer<typeof definitionSchema>;
export type AnalysisInput = z.infer<typeof analysisInputSchema>;
export type SavedAnalysis = z.infer<typeof analysisSchema>;
export type Preferences = z.infer<typeof preferencesSchema>;
export type AnalysisPage = z.infer<typeof pageSchema>;

export function analysisHref(definition: AnalysisDefinition): string {
  const parsed = definitionSchema.parse(definition);
  const query = new URLSearchParams({
    region: parsed.filters.region, periodDays: String(parsed.filters.periodDays),
  });
  return `/saved-analyses/example?${query}`;
}
