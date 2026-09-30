import { pathToFileURL } from "node:url";

import { getDataAccessManifest } from "../src/lib/config/data-access";
import { getServerConfig, type DatabricksConfig } from "../src/lib/config/server-config";
import { runDatabricksCli, type DatabricksCliRunner } from "../src/lib/databricks/cli-auth";

const MINIMUM_CLI_VERSION = [0, 295, 0] as const;

type DatabricksAccessSummary = {
  cliVersion: string;
  profile: string;
  host: string;
  identity: string;
  warehouse: string;
  warehouseState: string;
  catalog: string;
  schema: string;
  sourceCount: number;
};

function parseJsonObject(output: string, operation: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(output);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // The error below deliberately excludes command output, which may contain credentials.
  }
  throw new Error(`Databricks CLI returned invalid JSON for ${operation}`);
}

function readString(record: Record<string, unknown>, keys: readonly string[], fallback: string): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return fallback;
}

export function parseDatabricksCliVersion(output: string): [number, number, number] {
  const match = output.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new Error("Unable to determine the Databricks CLI version");
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isVersionAtLeast(
  actual: readonly [number, number, number],
  minimum: readonly [number, number, number],
): boolean {
  for (let index = 0; index < minimum.length; index += 1) {
    if (actual[index] > minimum[index]) return true;
    if (actual[index] < minimum[index]) return false;
  }
  return true;
}

export function parseDatabricksCliHost(output: string): string {
  const match = output.match(/^\s*(?:✓\s*)?host:\s+(https:\/\/\S+)/im);
  if (!match) throw new Error("Unable to determine the workspace host from the Databricks CLI profile");
  return new URL(match[1]).hostname;
}

export async function checkDatabricksAccess(
  config: DatabricksConfig,
  runner: DatabricksCliRunner = runDatabricksCli,
  sources: readonly string[] = [],
): Promise<DatabricksAccessSummary> {
  if (config.auth.type !== "oauth-u2m-cli") {
    throw new Error("DATABRICKS_CONFIG_PROFILE must be configured to run the Databricks CLI preflight");
  }

  const versionOutput = await runner(["version"]);
  const version = parseDatabricksCliVersion(versionOutput);
  if (!isVersionAtLeast(version, MINIMUM_CLI_VERSION)) {
    throw new Error("Databricks CLI 0.295.0 or newer is required");
  }

  const profile = config.auth.profile;
  const authDescription = await runner(["auth", "describe", "--profile", profile]);
  const profileHost = parseDatabricksCliHost(authDescription);
  if (profileHost !== config.host) {
    throw new Error(`Databricks CLI profile '${profile}' targets a different workspace`);
  }

  const identity = parseJsonObject(
    await runner(["current-user", "me", "--profile", profile, "--output", "json"]),
    "current-user me",
  );
  const warehouse = parseJsonObject(
    await runner(["warehouses", "get", config.warehouseId, "--profile", profile, "--output", "json"]),
    "warehouses get",
  );
  const catalog = parseJsonObject(
    await runner(["catalogs", "get", config.catalog, "--profile", profile, "--output", "json"]),
    "catalogs get",
  );
  const schema = parseJsonObject(
    await runner(["schemas", "get", `${config.catalog}.${config.schema}`, "--profile", profile, "--output", "json"]),
    "schemas get",
  );
  for (const source of sources) {
    parseJsonObject(
      await runner(["tables", "get", source, "--profile", profile, "--output", "json"]),
      "tables get",
    );
  }

  return {
    cliVersion: version.join("."),
    profile,
    host: `https://${config.host}`,
    identity: readString(identity, ["user_name", "display_name", "id"], "verified"),
    warehouse: readString(warehouse, ["name", "id"], config.warehouseId),
    warehouseState: readString(warehouse, ["state"], "unknown"),
    catalog: readString(catalog, ["name"], config.catalog),
    schema: readString(schema, ["full_name", "name"], `${config.catalog}.${config.schema}`),
    sourceCount: sources.length,
  };
}

async function main(): Promise<void> {
  const config = getServerConfig();
  if (config.mode !== "databricks") {
    throw new Error("Set APP_MODE=databricks in .env.local before running the Databricks preflight");
  }

  const dataAccess = getDataAccessManifest();
  if (dataAccess.project !== config.catalog) {
    throw new Error("config/data-access.json project must match DATABRICKS_CATALOG");
  }
  const summary = await checkDatabricksAccess(
    config,
    runDatabricksCli,
    dataAccess.sources.map((source) => source.fullName),
  );
  process.stdout.write(
    [
      `✓ Databricks CLI ${summary.cliVersion}`,
      `✓ Profile ${summary.profile} -> ${summary.host}`,
      `✓ Identity ${summary.identity}`,
      `✓ Warehouse ${summary.warehouse} (${summary.warehouseState})`,
      `✓ Unity Catalog ${summary.catalog} / ${summary.schema}`,
      `✓ Declared sources visible: ${summary.sourceCount}`,
      "No SQL statement was executed. Run npm run test:databricks to verify SELECT on declared sources.",
    ].join("\n") + "\n",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`Databricks preflight failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
  });
}
