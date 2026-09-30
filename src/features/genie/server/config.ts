import { z } from "zod";
import { ResourceType, type PluginManifest } from "@databricks/appkit";

import rawGenieSpaces from "../../../../config/genie-spaces.json";
import { GenieError } from "@/features/genie/server/errors";
import { ConfigurationError } from "@/lib/errors/app-error";

const aliasSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/);
const spaceIdSchema = z.string().regex(/^[0-9a-f]{32}$/);
const environmentVariableSchema = z.string().regex(/^[A-Z][A-Z0-9_]*$/);
const profileSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);

const genieSpacesSchema = z.object({
  version: z.literal(1),
  spaces: z.array(z.object({
    key: aliasSchema,
    displayName: z.string().trim().min(3).max(120),
    aliases: z.array(aliasSchema).min(1).max(10),
    environmentVariable: environmentVariableSchema,
    spaceId: spaceIdSchema,
  }).strict()).min(1),
}).strict().superRefine((configuration, issueContext) => {
  const aliases = new Set<string>();
  for (const [spaceIndex, space] of configuration.spaces.entries()) {
    if (!space.aliases.includes(space.key)) {
      issueContext.addIssue({
        code: "custom",
        path: ["spaces", spaceIndex, "aliases"],
        message: "aliases must include the stable space key",
      });
    }
    for (const alias of space.aliases) {
      if (aliases.has(alias)) {
        issueContext.addIssue({
          code: "custom",
          path: ["spaces", spaceIndex, "aliases"],
          message: `duplicate alias: ${alias}`,
        });
      }
      aliases.add(alias);
    }
  }
});

const workspaceUrlSchema = z.string().trim().url().transform((value, issueContext) => {
  const url = new URL(value);
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.search
    || url.hash
    || (url.pathname !== "/" && url.pathname !== "")
  ) {
    issueContext.addIssue({ code: "custom", message: "must be a root HTTPS workspace URL" });
    return z.NEVER;
  }
  return url.origin;
});

type ParsedSpaces = z.infer<typeof genieSpacesSchema>;
type SpaceDefinition = ParsedSpaces["spaces"][number];

export type ResolvedGenieSpace = {
  key: string;
  alias: string;
  displayName: string;
  spaceId: string;
};

export type GenieRuntimeConfiguration =
  | {
      mode: "demo";
      space: ResolvedGenieSpace;
    }
  | {
      mode: "databricks";
      runtime: "databricks-app" | "local";
      workspaceUrl: string;
      space: ResolvedGenieSpace;
      localAuth?:
        | { type: "oauth-u2m-cli"; profile: string }
        | { type: "pat"; token: string };
    };

function parseSpaces(): ParsedSpaces {
  const parsed = genieSpacesSchema.safeParse(rawGenieSpaces);
  if (!parsed.success) {
    throw new ConfigurationError("Invalid Genie spaces configuration", parsed.error.flatten());
  }
  return parsed.data;
}

export function resolveGeniePluginSpaces(environment: Record<string, string | undefined> = process.env): Record<string, string> {
  return Object.fromEntries(parseSpaces().spaces.flatMap((space) => space.aliases.map((alias) => [
    alias, resolveGenieRuntimeConfiguration(alias, environment).space.spaceId,
  ])));
}

export function genieResourceRequirements(): PluginManifest["resources"] {
  return { required: parseSpaces().spaces.map((space) => ({
    type: ResourceType.GENIE_SPACE, alias: space.displayName, resourceKey: space.key, permission: "CAN_RUN",
    description: "Genie Space declared by the application",
    fields: { id: { env: space.environmentVariable, description: "Declared Genie Space ID" } },
  })), optional: [] };
}

function findSpace(alias: string, spaces: ParsedSpaces): SpaceDefinition {
  const parsedAlias = aliasSchema.safeParse(alias);
  const space = parsedAlias.success
    ? spaces.spaces.find((candidate) => candidate.aliases.includes(parsedAlias.data))
    : undefined;
  if (!space) {
    throw new GenieError(`Unknown Genie space alias: ${alias}`, "UNKNOWN_SPACE", 404, false);
  }
  return space;
}

function parseWorkspaceUrl(environment: Record<string, string | undefined>): string {
  const parsed = workspaceUrlSchema.safeParse(environment.DATABRICKS_HOST);
  if (!parsed.success) {
    throw new ConfigurationError("DATABRICKS_HOST must be a root HTTPS workspace URL");
  }
  return parsed.data;
}

function resolveLocalAuth(
  environment: Record<string, string | undefined>,
): Extract<GenieRuntimeConfiguration, { mode: "databricks" }>["localAuth"] {
  const rawProfile = environment.DATABRICKS_CONFIG_PROFILE?.trim();
  const token = environment.DATABRICKS_TOKEN?.trim();
  if (rawProfile && token) {
    throw new ConfigurationError(
      "DATABRICKS_CONFIG_PROFILE and DATABRICKS_TOKEN cannot both be set for local Genie development",
    );
  }
  if (rawProfile) {
    const profile = profileSchema.safeParse(rawProfile);
    if (!profile.success) {
      throw new ConfigurationError("DATABRICKS_CONFIG_PROFILE is invalid for local Genie development");
    }
    return { type: "oauth-u2m-cli", profile: profile.data };
  }
  if (token) {
    return { type: "pat", token };
  }
  throw new ConfigurationError(
    "DATABRICKS_CONFIG_PROFILE or DATABRICKS_TOKEN is required for local Genie development",
  );
}

export function resolveGenieRuntimeConfiguration(
  alias: string,
  environment: Record<string, string | undefined> = process.env,
): GenieRuntimeConfiguration {
  const spaces = parseSpaces();
  const definition = findSpace(alias, spaces);
  const parsedMode = z.enum(["demo", "databricks"]).safeParse(environment.APP_MODE ?? "demo");
  if (!parsedMode.success) {
    throw new ConfigurationError("APP_MODE must be demo or databricks");
  }
  const mode = parsedMode.data;
  const runtime = environment.DATABRICKS_APP_NAME ? "databricks-app" : "local";
  const environmentSpaceId = environment[definition.environmentVariable]?.trim();
  const selectedSpaceId = environmentSpaceId || (runtime === "local" ? definition.spaceId : undefined);
  const parsedSpaceId = spaceIdSchema.safeParse(selectedSpaceId);

  const baseSpace = {
    key: definition.key,
    alias,
    displayName: definition.displayName,
    spaceId: definition.spaceId,
  };
  if (mode === "demo") {
    return { mode, space: baseSpace };
  }
  if (!parsedSpaceId.success) {
    throw new ConfigurationError(`Missing or invalid ${definition.environmentVariable}`);
  }

  return {
    mode,
    runtime,
    workspaceUrl: parseWorkspaceUrl(environment),
    space: { ...baseSpace, spaceId: parsedSpaceId.data },
    ...(runtime === "local" ? { localAuth: resolveLocalAuth(environment) } : {}),
  };
}
