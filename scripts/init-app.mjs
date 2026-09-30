#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import dataProjects from "../config/data-projects.json" with { type: "json" };
import { loadAppSpec, syncProductBrief } from "./app-spec.mjs";
import { renderDataAccess } from "./data-access.mjs";
import { renderDataPreparation } from "./data-preparation.mjs";
import { loadTemplateManifest, writeTemplateState } from "./template-manifest.mjs";

const DEFAULT_DATABRICKS_HOST = "https://3070470996474403.3.gcp.databricks.com";
const DEFAULT_SQL_WAREHOUSE_ID = "ab362e9710498a08";
const DEFAULT_SUPPORT_NAME = "Alexis";
const DEFAULT_SUPPORT_SLACK_URL = "https://valiuz.slack.com/team/U01C3FT98HE";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  stdout.write(`Usage: npm run init-app -- <name> [--non-interactive] [options]

Initialise une nouvelle copie du template. Sans --non-interactive, les valeurs manquantes sont demandées.
Options : --description, --support-name, --support-slack-url, --data-project (alias --catalog),
          --schema, --host, --warehouse, --repository-url, --can-use-group, --can-manage-group.
Chaque option attend une valeur. --help affiche cette aide sans modifier de fichier.
Le mode démo fonctionne sans credentials. Confirmer les valeurs distantes avant tout accès réel.
`);
  process.exit(0);
}
const existingPackage = JSON.parse(await readFile("package.json", "utf8"));
const existingState = await lstat(".valiuz-template.yml").catch((error) => {
  if (error.code === "ENOENT") return null;
  throw error;
});
if (existingPackage.name !== "__PACKAGE_NAME__" || existingState) {
  throw new Error("Cette app est déjà initialisée. Reprendre avec npm run app -- next ; pour une migration, suivre docs/migration-2.0.md depuis le template cible. Aucun fichier modifié.");
}
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const positionalName = args.find((arg, index) => !arg.startsWith("--") && (index === 0 || !args[index - 1].startsWith("--")));
const nonInteractive = args.includes("--non-interactive");
const catalogOption = option("catalog");
const dataProjectOption = option("data-project");
if (catalogOption && dataProjectOption && catalogOption !== dataProjectOption) {
  throw new Error("--catalog and --data-project must use the same value when both are provided.");
}

function inferRepositoryUrl() {
  try {
    const remote = execFileSync("git", ["config", "--get", "remote.origin.url"], { encoding: "utf8" }).trim();
    if (remote.startsWith("git@github.com:")) return `https://github.com/${remote.slice("git@github.com:".length).replace(/\.git$/, "")}`;
    return remote.replace(/\.git$/, "");
  } catch {
    return "https://github.com/your-org/your-repository";
  }
}

function slug(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function escapePlaceholderValue(value) {
  if (value.includes("\n") || value.includes("\r")) throw new Error("Values must stay on one line.");
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

const prompts = [
  ["name", positionalName ?? option("name"), "Application name", "my-databricks-app"],
  ["description", option("description"), "Description", "Analytics Databricks App"],
  ["supportName", option("support-name"), "Support contact displayed in the app", DEFAULT_SUPPORT_NAME],
  ["supportSlackUrl", option("support-slack-url"), "Slack profile or channel URL", DEFAULT_SUPPORT_SLACK_URL],
  ["warehouse", option("warehouse"), "SQL Warehouse ID", DEFAULT_SQL_WAREHOUSE_ID],
  [
    "catalog",
    dataProjectOption ?? catalogOption,
    `Data project / Unity Catalog catalog (${dataProjects.allowed.join(", ")})`,
    dataProjects.allowed[0],
  ],
  ["schema", option("schema"), "Default schema", "app"],
  ["host", option("host"), "Production workspace URL", DEFAULT_DATABRICKS_HOST],
  ["canUseGroup", option("can-use-group"), "CAN_USE group", "users"],
  ["canManageGroup", option("can-manage-group"), "CAN_MANAGE group", "admins"],
];

const answers = {};
const readline = nonInteractive ? undefined : createInterface({ input: stdin, output: stdout });
try {
  for (const [key, supplied, label, fallback] of prompts) {
    answers[key] = supplied ?? (readline ? (await readline.question(`${label} [${fallback}]: `)).trim() || fallback : fallback);
  }
} finally {
  readline?.close();
}

answers.name = slug(answers.name);
if (!answers.name) throw new Error("Application name must contain at least one letter or number.");
if (!dataProjects.allowed.includes(answers.catalog)) {
  throw new Error(`Data project must be one of: ${dataProjects.allowed.join(", ")}.`);
}
if (!/^[A-Za-z0-9_-]+$/.test(answers.schema)) {
  throw new Error("schema must contain only letters, numbers, '_' or '-'.");
}
answers.supportName = answers.supportName.trim();
if (answers.supportName.length < 1 || answers.supportName.length > 100) {
  throw new Error("Support contact must contain between 1 and 100 characters.");
}
const supportSlackUrl = new URL(answers.supportSlackUrl);
if (
  supportSlackUrl.protocol !== "https:"
  || supportSlackUrl.hostname !== "valiuz.slack.com"
  || supportSlackUrl.port !== ""
  || supportSlackUrl.username !== ""
  || supportSlackUrl.password !== ""
) {
  throw new Error("Slack support URL must use HTTPS on valiuz.slack.com.");
}
answers.supportSlackUrl = supportSlackUrl.href;

const replacements = {
  __PACKAGE_NAME__: answers.name,
  __APP_NAME__: answers.name,
  __APP_DESCRIPTION__: answers.description,
  __APP_SUPPORT_NAME__: answers.supportName,
  __APP_SUPPORT_SLACK_URL__: answers.supportSlackUrl,
  __DATABRICKS_WAREHOUSE_ID__: answers.warehouse,
  __DATABRICKS_CATALOG__: answers.catalog,
  __DATABRICKS_SCHEMA__: answers.schema,
  __DATABRICKS_HOST__: answers.host,
  __GIT_REPOSITORY_URL__: option("repository-url") ?? inferRepositoryUrl(),
  __CAN_USE_GROUP__: answers.canUseGroup,
  __CAN_MANAGE_GROUP__: answers.canManageGroup,
  __DATABRICKS_PROD_ROOT_PATH__: `/Workspace/Shared/.bundle/${answers.name}/prod`,
};

const prefilledReplacements = {
  [DEFAULT_DATABRICKS_HOST]: answers.host,
  [DEFAULT_SQL_WAREHOUSE_ID]: answers.warehouse,
};

const files = [
  "package.json",
  "package-lock.json",
  ".env.example",
  "app.yaml",
  "databricks.yml",
  "data/databricks.yml",
  "config/app-spec.yml",
  "config/data-access.json",
  ".github/workflows/deploy.yml",
];
for (const file of files) {
  let content = await readFile(file, "utf8");
  for (const [placeholder, rawValue] of Object.entries(replacements)) {
    content = content.replaceAll(placeholder, escapePlaceholderValue(rawValue));
  }
  for (const [prefilledValue, rawValue] of Object.entries(prefilledReplacements)) {
    content = content.replaceAll(prefilledValue, escapePlaceholderValue(rawValue));
  }
  await writeFile(file, content);
}

await renderDataAccess({ root: process.cwd() });
await renderDataPreparation({ root: process.cwd() });
await syncProductBrief(process.cwd(), await loadAppSpec(process.cwd()));
await writeTemplateState(process.cwd(), await loadTemplateManifest(process.cwd()));

stdout.write(
  `Initialized ${answers.name} with data project ${answers.catalog}. Next: npm run app:guide.\n`,
);
