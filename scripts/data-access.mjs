import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import dataProjects from "../config/data-projects.json" with { type: "json" };

const PROJECT_PLACEHOLDER = "__DATABRICKS_CATALOG__";
const GENIE_MANIFEST_VERSION = 1;
const MAX_GENIE_SPACES = 20;
const MAX_ALIASES_PER_GENIE_SPACE = 10;
const MAX_GENIE_ENVIRONMENT_VARIABLE_LENGTH = 128;
const identifierPattern = /^[A-Za-z0-9_-]+$/;
const sourceNamePattern = /^[a-z0-9][a-z0-9-]*$/;
const genieKeyPattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const genieEnvironmentVariablePattern = /^DATABRICKS_GENIE_SPACE_ID_[A-Z0-9](?:[A-Z0-9_]*[A-Z0-9])?$/;
const genieSpaceIdPattern = /^[0-9a-f]{32}$/;

function yamlString(value) {
  return JSON.stringify(value);
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function assertKnownKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${label} contains unsupported field '${unknown[0]}'.`);
  }
}

function readJson(text, path) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Unable to parse ${path} as JSON.`, { cause: error });
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateFullName(fullName, project) {
  const parts = fullName.split(".");
  if (parts.length !== 3 || parts.some((part) => !identifierPattern.test(part))) {
    throw new Error(`Source '${fullName}' must use the project.schema.object format.`);
  }
  if (parts[0] !== project) {
    throw new Error(`Source '${fullName}' must belong to data project '${project}'.`);
  }
}

export function validateDataAccessManifest(value, { allowPlaceholder = false, requireSources = false } = {}) {
  assertObject(value, "Data access manifest");
  const project = value.project;
  if (typeof project !== "string") throw new Error("Data access project must be a string.");
  const projectAllowed = dataProjects.allowed.includes(project);
  if (!projectAllowed && !(allowPlaceholder && project === PROJECT_PLACEHOLDER)) {
    throw new Error(`Data project must be one of: ${dataProjects.allowed.join(", ")}.`);
  }
  if (!Array.isArray(value.sources)) throw new Error("Data access sources must be an array.");
  if (requireSources && value.sources.length === 0) {
    throw new Error("Register at least one table or view in config/data-access.json before deployment.");
  }
  if (value.sources.length > 50) throw new Error("Data access is limited to 50 declared sources.");

  const names = new Set();
  const fullNames = new Set();
  const sources = value.sources.map((source, index) => {
    assertObject(source, `Source ${index + 1}`);
    const { name, fullName, purpose } = source;
    if (typeof name !== "string" || !sourceNamePattern.test(name)) {
      throw new Error(`Source ${index + 1} name must use lowercase letters, numbers and hyphens.`);
    }
    if (names.has(name)) throw new Error(`Source name '${name}' is duplicated.`);
    names.add(name);
    if (typeof fullName !== "string") throw new Error(`Source '${name}' fullName must be a string.`);
    validateFullName(fullName, project);
    if (fullNames.has(fullName)) throw new Error(`Source '${fullName}' is duplicated.`);
    fullNames.add(fullName);
    if (typeof purpose !== "string" || purpose.trim().length < 3 || purpose.length > 200) {
      throw new Error(`Source '${name}' purpose must contain between 3 and 200 characters.`);
    }
    return { name, fullName, purpose: purpose.trim() };
  });

  let personalState;
  if (value.personalState !== undefined) {
    assertObject(value.personalState, "Personal state");
    assertKnownKeys(value.personalState, ["analyses", "preferences"], "Personal state");
    personalState = {};
    for (const [kind, table] of [["analyses", "saved_analyses_v1"], ["preferences", "user_preferences_v1"]]) {
      const fullName = value.personalState[kind];
      if (typeof fullName !== "string") throw new Error(`Missing personal state table: ${kind}.`);
      validateFullName(fullName, project);
      if (fullName.split(".")[2] !== table || fullNames.has(fullName)) {
        throw new Error(`Personal state ${kind} must use a dedicated ${table} table.`);
      }
      personalState[kind] = fullName;
    }
    if (personalState.analyses.split(".")[1] !== personalState.preferences.split(".")[1]) {
      throw new Error("Personal state tables must use one dedicated schema.");
    }
  }
  return { project, sources, ...(personalState ? { personalState } : {}) };
}

export async function loadDataAccessManifest(root, options) {
  const manifestPath = join(root, "config/data-access.json");
  let content;
  try {
    content = await readFile(manifestPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${manifestPath}.`, { cause: error });
  }
  const parsed = readJson(content, manifestPath);
  return validateDataAccessManifest(parsed, options);
}

export function validateGenieSpacesManifest(value) {
  assertObject(value, "Genie spaces manifest");
  assertKnownKeys(value, ["version", "spaces"], "Genie spaces manifest");
  if (value.version !== GENIE_MANIFEST_VERSION) {
    throw new Error(`Genie spaces manifest version must be ${GENIE_MANIFEST_VERSION}.`);
  }
  if (!Array.isArray(value.spaces)) throw new Error("Genie spaces must be an array.");
  if (value.spaces.length === 0) throw new Error("Declare at least one Genie space.");
  if (value.spaces.length > MAX_GENIE_SPACES) {
    throw new Error(`Genie spaces are limited to ${MAX_GENIE_SPACES} entries.`);
  }

  const keys = new Set();
  const displayNames = new Set();
  const aliases = new Set();
  const environmentVariables = new Set();
  const spaceIds = new Set();
  const spaces = value.spaces.map((space, index) => {
    const label = `Genie space ${index + 1}`;
    assertObject(space, label);
    assertKnownKeys(
      space,
      ["key", "displayName", "aliases", "environmentVariable", "spaceId"],
      label,
    );
    const { key, displayName, environmentVariable, spaceId } = space;
    if (typeof key !== "string" || !genieKeyPattern.test(key)) {
      throw new Error(`${label} key must contain 1 to 64 lowercase letters, numbers or hyphens.`);
    }
    if (keys.has(key)) throw new Error(`Genie resource key '${key}' is duplicated.`);
    keys.add(key);

    if (typeof displayName !== "string" || displayName.trim().length < 3 || displayName.trim().length > 120) {
      throw new Error(`Genie space '${key}' displayName must contain between 3 and 120 characters.`);
    }
    const normalizedDisplayName = displayName.trim();
    const comparableDisplayName = normalizedDisplayName.toLocaleLowerCase("en-US");
    if (displayNames.has(comparableDisplayName)) {
      throw new Error(`Genie display name '${normalizedDisplayName}' is duplicated.`);
    }
    displayNames.add(comparableDisplayName);

    if (!Array.isArray(space.aliases) || space.aliases.length === 0) {
      throw new Error(`Genie space '${key}' must declare at least one alias.`);
    }
    if (space.aliases.length > MAX_ALIASES_PER_GENIE_SPACE) {
      throw new Error(`Genie space '${key}' is limited to ${MAX_ALIASES_PER_GENIE_SPACE} aliases.`);
    }
    const normalizedAliases = space.aliases.map((alias, aliasIndex) => {
      if (typeof alias !== "string" || !genieKeyPattern.test(alias)) {
        throw new Error(
          `Genie space '${key}' alias ${aliasIndex + 1} must contain 1 to 64 lowercase letters, numbers or hyphens.`,
        );
      }
      if (aliases.has(alias)) throw new Error(`Genie alias '${alias}' is duplicated.`);
      aliases.add(alias);
      return alias;
    });
    if (!normalizedAliases.includes(key)) {
      throw new Error(`Genie space '${key}' aliases must include its stable key.`);
    }

    if (
      typeof environmentVariable !== "string"
      || environmentVariable.length > MAX_GENIE_ENVIRONMENT_VARIABLE_LENGTH
      || !genieEnvironmentVariablePattern.test(environmentVariable)
    ) {
      throw new Error(
        `Genie space '${key}' environmentVariable must contain at most ${MAX_GENIE_ENVIRONMENT_VARIABLE_LENGTH} characters, start with DATABRICKS_GENIE_SPACE_ID_ and use uppercase letters, numbers or underscores.`,
      );
    }
    if (environmentVariables.has(environmentVariable)) {
      throw new Error(`Genie environment variable '${environmentVariable}' is duplicated.`);
    }
    environmentVariables.add(environmentVariable);

    if (typeof spaceId !== "string" || !genieSpaceIdPattern.test(spaceId)) {
      throw new Error(`Genie space '${key}' spaceId must contain exactly 32 lowercase hexadecimal characters.`);
    }
    const normalizedSpaceId = spaceId.toLowerCase();
    if (spaceIds.has(normalizedSpaceId)) throw new Error(`Genie space ID '${spaceId}' is duplicated.`);
    spaceIds.add(normalizedSpaceId);

    return {
      key,
      displayName: normalizedDisplayName,
      aliases: normalizedAliases,
      environmentVariable,
      spaceId: normalizedSpaceId,
    };
  });

  return { version: GENIE_MANIFEST_VERSION, spaces };
}

export async function loadGenieSpacesManifest(root) {
  const manifestPath = join(root, "config/genie-spaces.json");
  let content;
  try {
    content = await readFile(manifestPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${manifestPath}.`, { cause: error });
  }
  return validateGenieSpacesManifest(readJson(content, manifestPath));
}

function validateResourceNames(dataAccessManifest, genieSpacesManifest) {
  const resourceNames = new Set(["sql-warehouse"]);
  for (const source of dataAccessManifest.sources) resourceNames.add(`data-${source.name}`);
  for (const kind of Object.keys(dataAccessManifest.personalState ?? {})) {
    resourceNames.add(`user-state-${kind}`);
  }
  for (const space of genieSpacesManifest.spaces) {
    if (resourceNames.has(space.key)) {
      throw new Error(`Genie resource key '${space.key}' conflicts with another app resource.`);
    }
    resourceNames.add(space.key);
  }
}

async function readOptional(root, file) {
  try {
    return await readFile(join(root, file), "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function validateGenieEnvironmentReferences(root, genieSpacesManifest) {
  const appManifest = await readOptional(root, "app.yaml");
  if (appManifest !== undefined) {
    for (const space of genieSpacesManifest.spaces) {
      const reference = new RegExp(
        `-\\s+name:\\s*["']?${escapeRegExp(space.environmentVariable)}["']?\\s*\\n\\s*valueFrom:\\s*["']?${escapeRegExp(space.key)}["']?(?:\\s|$)`,
      );
      if (!reference.test(appManifest)) {
        throw new Error(
          `app.yaml must bind ${space.environmentVariable} with valueFrom: ${space.key}.`,
        );
      }
    }
  }

  const localEnvironment = await readOptional(root, ".env.example");
  if (localEnvironment !== undefined) {
    for (const space of genieSpacesManifest.spaces) {
      const reference = new RegExp(
        `^${escapeRegExp(space.environmentVariable)}=["']?${escapeRegExp(space.spaceId)}["']?\\s*$`,
        "m",
      );
      if (!reference.test(localEnvironment)) {
        throw new Error(
          `.env.example must set ${space.environmentVariable} to the configured non-secret Genie space ID.`,
        );
      }
    }
  }
}

export function renderDataAccessBundle(manifest, genieSpacesManifest = { version: 1, spaces: [] }) {
  const lines = [
    "# Generated by npm run data:access:render. Do not edit directly.",
    "resources:",
    "  apps:",
    "    app:",
    "      name: ${var.app_name}",
    "      description: ${var.app_description}",
    "      compute_size: MEDIUM",
    "      user_api_scopes:",
    "        - genie",
    "      permissions:",
    "        - group_name: ${var.can_manage_group}",
    "          level: CAN_MANAGE",
    "        - group_name: ${var.can_use_group}",
    "          level: CAN_USE",
    "      resources:",
    "        - name: sql-warehouse",
    "          sql_warehouse:",
    "            id: ${var.sql_warehouse_id}",
    "            permission: CAN_USE",
  ];

  for (const space of genieSpacesManifest.spaces) {
    lines.push(
      `        - name: ${yamlString(space.key)}`,
      "          genie_space:",
      `            name: ${yamlString(space.displayName)}`,
      `            space_id: ${yamlString(space.spaceId)}`,
      "            permission: CAN_RUN",
    );
  }

  for (const source of manifest.sources) {
    lines.push(
      `        - name: ${yamlString(`data-${source.name}`)}`,
      "          uc_securable:",
      `            securable_full_name: ${yamlString(source.fullName)}`,
      "            securable_type: TABLE",
      "            permission: SELECT",
    );
  }
  for (const [kind, fullName] of Object.entries(manifest.personalState ?? {})) {
    // An Apps MODIFY binding also grants SELECT; do not bind the same table twice.
    lines.push(
      `        - name: ${yamlString(`user-state-${kind}`)}`,
      "          uc_securable:",
      `            securable_full_name: ${yamlString(fullName)}`,
      "            securable_type: TABLE",
      "            permission: MODIFY",
    );
  }
  return `${lines.join("\n")}\n`;
}

async function validateProjectReference(root, file, pattern, project) {
  let content;
  try {
    content = await readFile(join(root, file), "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return;
    throw error;
  }
  const match = content.match(pattern);
  if (!match) throw new Error(`Unable to locate the data project in ${file}.`);
  if (match[1] !== project) {
    throw new Error(`${file} data project '${match[1]}' must match '${project}' from config/data-access.json.`);
  }
}

export async function renderDataAccess({ root, check = false, allowPlaceholder = false }) {
  const manifest = await loadDataAccessManifest(root, { allowPlaceholder });
  const genieSpacesManifest = await loadGenieSpacesManifest(root);
  validateResourceNames(manifest, genieSpacesManifest);
  await validateGenieEnvironmentReferences(root, genieSpacesManifest);
  await validateProjectReference(
    root,
    "app.yaml",
    /name:\s*DATABRICKS_CATALOG\s*\n\s*value:\s*"?([^"\s]+)"?/,
    manifest.project,
  );
  await validateProjectReference(
    root,
    ".env.example",
    /^DATABRICKS_CATALOG=([^\s]+)$/m,
    manifest.project,
  );
  const metadataPath = join(root, "config/appkit-resources.generated.json");
  const metadata = JSON.stringify({
    schemaVersion: 1,
    warehouse: { binding: "sql-warehouse", environmentVariable: "DATABRICKS_SQL_WAREHOUSE_ID", appkitEnvironmentVariable: "DATABRICKS_WAREHOUSE_ID", permission: "CAN_USE" },
    project: manifest.project,
    sources: manifest.sources.map((source) => ({ fullName: source.fullName, permission: "SELECT" })),
    personalState: Object.entries(manifest.personalState ?? {}).map(([kind, fullName]) => ({ kind, fullName, permission: "MODIFY" })),
    genie: genieSpacesManifest.spaces.map((space) => ({ key: space.key, aliases: space.aliases, environmentVariable: space.environmentVariable, permission: "CAN_RUN" })),
  }, null, 2) + "\n";
  if (check) {
    const existing = await readFile(metadataPath, "utf8").catch(() => "");
    if (existing !== metadata) throw new Error("AppKit resource metadata is stale. Run npm run data:access:render.");
  } else await writeFile(metadataPath, metadata, "utf8");
  const outputPath = join(root, "resources/data-access.generated.yml");
  const rendered = renderDataAccessBundle(manifest, genieSpacesManifest);
  if (check) {
    let existing;
    try {
      existing = await readFile(outputPath, "utf8");
    } catch (error) {
      throw new Error(`Missing generated bundle file ${outputPath}.`, { cause: error });
    }
    if (existing !== rendered) {
      throw new Error("Data access bundle is stale. Run npm run data:access:render and commit the result.");
    }
    return manifest;
  }
  await writeFile(outputPath, rendered, "utf8");
  return manifest;
}

export { PROJECT_PLACEHOLDER };
