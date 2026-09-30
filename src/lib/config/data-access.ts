import { z } from "zod";

import rawDataAccess from "../../../config/data-access.json";
import { isAllowedDataProject } from "@/lib/config/data-projects";
import { ConfigurationError } from "@/lib/errors/app-error";

const identifierSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);
const sourceSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  fullName: z.string().trim().min(1),
  purpose: z.string().trim().min(3).max(200),
});

const dataAccessSchema = z
  .object({
    project: z.string().refine(isAllowedDataProject, "unknown data project"),
    sources: z.array(sourceSchema).max(50),
    personalState: z.object({ analyses: z.string(), preferences: z.string() }).strict().optional(),
  })
  .superRefine((manifest, context) => {
    const names = new Set<string>();
    const fullNames = new Set<string>();
    for (const [index, source] of manifest.sources.entries()) {
      const parts = source.fullName.split(".");
      if (parts.length !== 3 || parts.some((part) => !identifierSchema.safeParse(part).success)) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "fullName"],
          message: "must use the project.schema.object format",
        });
      } else if (parts[0] !== manifest.project) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "fullName"],
          message: `must belong to ${manifest.project}`,
        });
      }
      if (names.has(source.name)) {
        context.addIssue({ code: "custom", path: ["sources", index, "name"], message: "duplicate name" });
      }
      if (fullNames.has(source.fullName)) {
        context.addIssue({ code: "custom", path: ["sources", index, "fullName"], message: "duplicate source" });
      }
      names.add(source.name);
      fullNames.add(source.fullName);
    }
    if (manifest.personalState) {
      for (const [kind, fullName] of Object.entries(manifest.personalState)) {
        const parts = fullName.split(".");
        const expected = kind === "analyses" ? "saved_analyses_v1" : "user_preferences_v1";
        if (parts.length !== 3 || parts[0] !== manifest.project || parts[2] !== expected
          || parts.some((part) => !identifierSchema.safeParse(part).success) || fullNames.has(fullName)) {
          context.addIssue({ code: "custom", path: ["personalState", kind], message: "Invalid personal state table" });
        }
      }
      if (manifest.personalState.analyses.split(".")[1] !== manifest.personalState.preferences.split(".")[1]) {
        context.addIssue({ code: "custom", path: ["personalState"], message: "Use one dedicated schema" });
      }
    }
  });

export type DataAccessManifest = z.infer<typeof dataAccessSchema>;
export type DataSource = DataAccessManifest["sources"][number];

export function parseDataAccessManifest(value: unknown, requireSources = false): DataAccessManifest {
  const parsed = dataAccessSchema.safeParse(value);
  if (!parsed.success) {
    throw new ConfigurationError("Invalid data access manifest", parsed.error.flatten());
  }
  if (requireSources && parsed.data.sources.length === 0) {
    throw new ConfigurationError("At least one data source must be declared before readiness can be checked");
  }
  return parsed.data;
}

export function getDataAccessManifest(requireSources = false): DataAccessManifest {
  return parseDataAccessManifest(rawDataAccess, requireSources);
}
