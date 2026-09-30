#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { loadDataAccessManifest, loadGenieSpacesManifest, renderDataAccess } from "./data-access.mjs";

function parseOptions(argv) {
  const options = { target: "dev", profile: undefined, provisionOnly: false, validateOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--provision-only") {
      options.provisionOnly = true;
      continue;
    }
    if (flag === "--validate-only") {
      options.validateOnly = true;
      continue;
    }
    if (flag !== "--target" && flag !== "--profile") {
      throw new Error(`Unknown option: ${flag}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
    if (flag === "--target") options.target = value;
    if (flag === "--profile") options.profile = value;
    index += 1;
  }
  if (options.provisionOnly && options.validateOnly) {
    throw new Error("--provision-only and --validate-only cannot be used together.");
  }
  return options;
}

function databricks(args) {
  const result = spawnSync("databricks", args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function gitCommit() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error("Unable to determine the Git commit to deploy.");
  const commit = result.stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("Git returned an invalid commit hash.");
  return commit;
}

function readMatch(file, pattern, label) {
  const match = readFileSync(file, "utf8").match(pattern);
  if (!match) throw new Error(`Unable to determine ${label} from ${file}.`);
  return match[1];
}

function workspaceHost(target, profile) {
  if (target === "prod") {
    return readMatch("databricks.yml", /host:\s*(https:\/\/\S+)/, "workspace host");
  }
  const args = ["auth", "describe", ...(profile ? ["--profile", profile] : [])];
  const result = spawnSync("databricks", args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error("Unable to determine the development workspace from Databricks authentication.");
  }
  const match = result.stdout.match(/^\s*(?:✓\s*)?host:\s+(https:\/\/\S+)/im);
  if (!match) throw new Error("Databricks authentication did not report a development workspace host.");
  return match[1];
}

const { target, profile, provisionOnly, validateOnly } = parseOptions(process.argv.slice(2));
if (!/^[a-z0-9][a-z0-9-]*$/.test(target)) throw new Error("Target name is invalid.");
await renderDataAccess({ root: process.cwd(), check: true });
const manifest = await loadDataAccessManifest(process.cwd(), {
  requireSources: !provisionOnly && !validateOnly,
});
const genieSpacesManifest = await loadGenieSpacesManifest(process.cwd());
const appName = JSON.parse(readFileSync("package.json", "utf8")).name;
if (typeof appName !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(appName)) {
  throw new Error("package.json contains an invalid app name.");
}
const workspace = workspaceHost(target, profile);
const warehouse = readMatch("databricks.yml", /sql_warehouse_id:\s*\n\s*default:\s*([^\s]+)/, "SQL warehouse");
const schema = readMatch(
  "app.yaml",
  /name:\s*DATABRICKS_SCHEMA\s*\n\s*value:\s*"?([^"\s]+)"?/,
  "Databricks schema",
);
const commit = target === "prod" ? gitCommit() : undefined;
const mode = provisionOnly ? "provision" : validateOnly ? "validate" : "deploy";

process.stdout.write(
  [
    `Mode: ${mode}`,
    `Workspace: ${workspace}`,
    `Profile: ${profile ?? "environment authentication"}`,
    `Target: ${target}`,
    `App: ${appName}`,
    `Git commit: ${commit ?? "local checkout"}`,
    `Warehouse: ${warehouse}`,
    `Data project: ${manifest.project}`,
    `Schema: ${schema}`,
    `Genie spaces: ${genieSpacesManifest.spaces.length}`,
    ...genieSpacesManifest.spaces.map(
      (space) => `- ${space.displayName} (${space.key}: ${space.spaceId})`,
    ),
    `Declared sources: ${manifest.sources.length}`,
    ...manifest.sources.map((source) => `- ${source.fullName}`),
    ...Object.values(manifest.personalState ?? {}).map((table) => `Personal state (MODIFY + SELECT): ${table}`),
  ].join("\n") + "\n",
);

const profileArgs = profile ? ["--profile", profile] : [];
const variableArgs = commit ? ["--var", `git_commit=${commit}`] : [];
const bundleArgs = (operation) => ["bundle", operation, "--target", target, ...profileArgs, ...variableArgs];

databricks(bundleArgs("validate"));
if (validateOnly) process.exit(0);
databricks(bundleArgs("deploy"));
if (provisionOnly) {
  databricks(["bundle", "summary", "--target", target, ...profileArgs, ...variableArgs]);
  process.stdout.write(
    "Application resources are provisioned. Configure the app service principal Git credential before deployment.\n",
  );
  process.exit(0);
}
databricks(["bundle", "run", "app", "--target", target, ...profileArgs, ...variableArgs]);
