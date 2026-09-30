#!/usr/bin/env node

import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { stringify } from "yaml";

import { loadDataAccessManifest, renderDataAccess, validateDataAccessManifest } from "./data-access.mjs";
import {
  identifierPattern,
  loadDataContracts,
  modes,
  namePattern,
  replayStrategies,
  refreshes,
  renderDataPreparation,
  stampPreparationDeploymentFingerprint,
  validateDataContract,
} from "./data-preparation.mjs";

function parseOptions(argv) {
  const options = { nonInteractive: false, name: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--") && !options.name) {
      options.name = value;
      continue;
    }
    if (value === "--non-interactive") {
      options.nonInteractive = true;
      continue;
    }
    if (![
      "--mode",
      "--source",
      "--output",
      "--columns",
      "--owner",
      "--purpose",
      "--grain",
      "--keys",
      "--refresh",
      "--freshness-hours",
      "--timeout-minutes",
      "--app-source",
      "--replay-strategy",
      "--date-column",
      "--default-lookback-days",
      "--max-replay-days",
      "--finalization-lag-days",
      "--required-history-days",
      "--output-retention-days",
      "--source-retention-days",
    ].includes(value)) {
      throw new Error(`Unknown option: ${value}`);
    }
    const supplied = argv[index + 1];
    if (!supplied || supplied.startsWith("--")) throw new Error(`${value} requires a value.`);
    options[value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = supplied;
    index += 1;
  }
  return options;
}

function qualifiedParts(value, project, label) {
  const parts = value?.split(".") ?? [];
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
    throw new Error(`${label} must use the project.schema.object format.`);
  }
  if (parts[0] !== project) throw new Error(`${label} must belong to data project '${project}'.`);
  return parts;
}

function list(value) {
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function quotedFullName(fullName) {
  return fullName.split(".").map((part) => `\`${part}\``).join(".");
}

function renderPreparationCode(contract) {
  const selected = contract.columns.map((column) => `  \`${column}\``).join(",\n");
  if (contract.mode === "notebook") {
    if (contract.replay?.strategy === "bounded-replace") {
      const dateColumn = `\`${contract.replay.dateColumn}\``;
      const stagingTable = `replay_staging_${contract.name.replaceAll("-", "_")}`;
      const finalizedDateExpression = contract.replay.finalizationLagDays === 0
        ? "current_date()"
        : `date_sub(current_date(), ${contract.replay.finalizationLagDays})`;
      const nullKeys = contract.keys.map((key) => `\`${key}\` IS NULL`).join(" OR ");
      const groupedKeys = contract.keys.map((key) => `\`${key}\``).join(", ");
      const code = `-- Databricks notebook source
-- Starter generated from data/contracts/${contract.name}.yml. Review before the first run.
-- The bundle job supplies replay_start_date and replay_end_date as parameter markers.
-- This starter requires a SQL warehouse version that supports session temporary tables.
SET TIME ZONE 'Europe/Paris';

-- COMMAND ----------

-- Deployment fingerprint: __DATA_DEPLOYMENT_FINGERPRINT__
SELECT assert_true(
  trim(:deployment_fingerprint) = '__DATA_DEPLOYMENT_FINGERPRINT__',
  'Local data contract or SQL does not match the deployed replay Job. Run data:prepare before data:replay.'
);

-- COMMAND ----------

DECLARE OR REPLACE VARIABLE finalized_date_value DATE DEFAULT ${finalizedDateExpression};

-- COMMAND ----------

DECLARE OR REPLACE VARIABLE replay_end_date_value DATE DEFAULT finalized_date_value;

-- COMMAND ----------

DECLARE OR REPLACE VARIABLE replay_start_date_value DATE DEFAULT date_sub(finalized_date_value, ${contract.replay.defaultLookbackDays - 1});

-- COMMAND ----------

SET VAR replay_end_date_value = CASE
  WHEN trim(:replay_end_date) = '' THEN finalized_date_value
  ELSE CAST(:replay_end_date AS DATE)
END;

-- COMMAND ----------

SET VAR replay_start_date_value = CASE
  WHEN trim(:replay_start_date) = '' THEN date_sub(replay_end_date_value, ${contract.replay.defaultLookbackDays - 1})
  ELSE CAST(:replay_start_date AS DATE)
END;

-- COMMAND ----------

SELECT assert_true(replay_start_date_value <= replay_end_date_value, 'Replay start date must not follow its end date.');

-- COMMAND ----------

SELECT assert_true(
  datediff(replay_end_date_value, replay_start_date_value) + 1 <= ${contract.replay.maxDays},
  'Replay window exceeds the contract maximum of ${contract.replay.maxDays} days.'
);

-- COMMAND ----------

SELECT assert_true(
  replay_end_date_value <= finalized_date_value,
  'Replay end date is later than the latest finalized source date.'
);

-- COMMAND ----------

SELECT assert_true(
  replay_start_date_value >= date_sub(finalized_date_value, ${contract.replay.outputRetentionDays - 1}),
  'Replay start date precedes the output retention boundary.'
);

-- COMMAND ----------

CREATE OR REPLACE TEMP TABLE ${stagingTable} AS
SELECT
${selected}
FROM ${quotedFullName(contract.source)}
WHERE ${dateColumn} BETWEEN replay_start_date_value AND replay_end_date_value;

-- COMMAND ----------

SELECT assert_true(
  (SELECT COUNT(*) FROM ${stagingTable}) > 0,
  'Replay source window is empty. Existing output rows were not replaced.'
);

-- COMMAND ----------

SELECT assert_true(
  typeof(${dateColumn}) = 'date',
  'Replay date column must have DATE type.'
)
FROM ${stagingTable}
LIMIT 1;

-- COMMAND ----------

SELECT assert_true(
  COUNT_IF(${nullKeys}) = 0,
  'Replay staging contains a null business key.'
)
FROM ${stagingTable};

-- COMMAND ----------

SELECT assert_true(
  COUNT(*) = 0,
  'Replay staging violates the declared business grain.'
)
FROM (
  SELECT ${groupedKeys}
  FROM ${stagingTable}
  GROUP BY ${groupedKeys}
  HAVING COUNT(*) > 1
);

-- COMMAND ----------

CREATE TABLE IF NOT EXISTS ${quotedFullName(contract.output)}
USING DELTA
CLUSTER BY (${dateColumn})
AS
SELECT
${selected}
FROM ${stagingTable}
WHERE FALSE;

-- COMMAND ----------

-- Add business completeness assertions above this command before the first run.
INSERT INTO ${quotedFullName(contract.output)} BY NAME
REPLACE WHERE ${dateColumn} BETWEEN replay_start_date_value AND replay_end_date_value
SELECT
${selected}
FROM ${stagingTable};

-- COMMAND ----------

SELECT assert_true(
  (SELECT COUNT(*)
   FROM ${quotedFullName(contract.output)}
   WHERE ${dateColumn} BETWEEN replay_start_date_value AND replay_end_date_value)
    = (SELECT COUNT(*) FROM ${stagingTable}),
  'Published output count differs from the validated staging count.'
);

-- COMMAND ----------

DELETE FROM ${quotedFullName(contract.output)}
WHERE ${dateColumn} < date_sub(finalized_date_value, ${contract.replay.outputRetentionDays - 1});

-- COMMAND ----------

SELECT
  replay_start_date_value AS replay_start_date,
  replay_end_date_value AS replay_end_date,
  finalized_date_value,
  date_sub(finalized_date_value, ${contract.replay.requiredHistoryDays - 1}) AS required_history_start_date,
  date_sub(finalized_date_value, ${contract.replay.outputRetentionDays - 1}) AS output_retention_start_date,
  COUNT(*) AS output_row_count
FROM ${quotedFullName(contract.output)}
WHERE ${dateColumn} BETWEEN replay_start_date_value AND replay_end_date_value;
`;
      return stampPreparationDeploymentFingerprint(contract, code).code;
    }
    return `-- Databricks notebook source\n-- Starter generated from data/contracts/${contract.name}.yml. Review before the first run.\nCREATE OR REPLACE TABLE ${quotedFullName(contract.output)} AS\nSELECT\n${selected}\nFROM ${quotedFullName(contract.source)};\n`;
  }
  const outputName = contract.output.split(".")[2];
  return `-- Starter generated from data/contracts/${contract.name}.yml. Review before the first run.\nCREATE OR REFRESH MATERIALIZED VIEW \`${outputName}\` AS\nSELECT\n${selected}\nFROM ${quotedFullName(contract.source)};\n`;
}

function renderQualityQueries(contract) {
  const output = quotedFullName(contract.output);
  if (contract.replay) {
    const dateColumn = `\`${contract.replay.dateColumn}\``;
    const keys = contract.keys.map((key) => `\`${key}\``).join(", ");
    const finalizedDateExpression = contract.replay.finalizationLagDays === 0
      ? "current_date()"
      : `date_sub(current_date(), ${contract.replay.finalizationLagDays})`;
    return `-- Bounded checks return aggregate counts and date bounds only. Do not commit notebook outputs.
SET TIME ZONE 'Europe/Paris';

DECLARE OR REPLACE VARIABLE validation_finalized_date DATE DEFAULT ${finalizedDateExpression};
-- Set these two defaults to the requested range when validating a historical replay.
DECLARE OR REPLACE VARIABLE validation_end_date DATE DEFAULT validation_finalized_date;
DECLARE OR REPLACE VARIABLE validation_start_date DATE DEFAULT date_sub(validation_end_date, ${contract.replay.defaultLookbackDays - 1});

SELECT
  validation_start_date,
  validation_end_date,
  COUNT(*) AS row_count,
  MIN(${dateColumn}) AS min_replay_date,
  MAX(${dateColumn}) AS max_replay_date
FROM ${output}
WHERE ${dateColumn} BETWEEN validation_start_date AND validation_end_date;

-- Both values must be zero. Business keys stay inside the subquery and are not returned.
SELECT
  COUNT(*) AS duplicate_group_count,
  COALESCE(SUM(duplicate_count - 1), 0) AS duplicate_row_count
FROM (
  SELECT ${keys}, COUNT(*) AS duplicate_count
  FROM ${output}
  WHERE ${dateColumn} BETWEEN validation_start_date AND validation_end_date
  GROUP BY ${keys}
  HAVING COUNT(*) > 1
);

-- Run this bounded reconciliation after the initial backfill.
SELECT
  date_sub(validation_finalized_date, ${contract.replay.requiredHistoryDays - 1}) AS expected_history_start_date,
  validation_finalized_date AS expected_history_end_date,
  MIN(${dateColumn}) AS actual_history_start_date,
  MAX(${dateColumn}) AS actual_history_end_date,
  COUNT(*) AS row_count
FROM ${output}
WHERE ${dateColumn} BETWEEN date_sub(validation_finalized_date, ${contract.replay.requiredHistoryDays - 1})
  AND validation_finalized_date;
`;
  }
  const keyCheck = contract.keys.length
    ? `\n-- Both values must be zero. Business keys stay inside the subquery and are not returned.\nSELECT\n  COUNT(*) AS duplicate_group_count,\n  COALESCE(SUM(duplicate_count - 1), 0) AS duplicate_row_count\nFROM (\n  SELECT ${contract.keys.map((key) => `\`${key}\``).join(", ")}, COUNT(*) AS duplicate_count\n  FROM ${output}\n  GROUP BY ${contract.keys.map((key) => `\`${key}\``).join(", ")}\n  HAVING COUNT(*) > 1\n);\n`
    : "\n-- Add a bounded uniqueness query when the business grain has a stable key.\n";
  return `-- Aggregated checks only; do not commit customer rows or notebook outputs.\nSELECT COUNT(*) AS row_count FROM ${output};\n${keyCheck}`;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const root = process.cwd();
const options = parseOptions(process.argv.slice(2));
if (!options.name || !namePattern.test(options.name)) {
  throw new Error("Provide a data contract name using lowercase letters, numbers and hyphens.");
}
const contractPath = join(root, "data/contracts", `${options.name}.yml`);
if (await exists(contractPath)) throw new Error(`Data contract '${options.name}' already exists.`);
const accessManifest = await loadDataAccessManifest(root, { allowPlaceholder: true });
const prompts = [
  ["mode", "Mode (direct, notebook, pipeline)", "direct"],
  ["source", "Table ou vue source (projet.schema.objet)", undefined],
  ["output", "Table consommée par l’app (vide = source en mode direct)", undefined],
  ["columns", "Colonnes conservées, séparées par des virgules", ""],
  ["owner", "Propriétaire de la donnée", "Analytics"],
  ["purpose", "Finalité pour l’app", `Alimenter ${options.name}`],
  ["grain", "Grain d’une ligne", "À confirmer"],
  ["keys", "Clés attendues, séparées par des virgules", ""],
  ["refresh", "Rafraîchissement (manual, hourly, daily)", "manual"],
  ["freshnessHours", "Fraîcheur maximale en heures", "24"],
  ["timeoutMinutes", "Durée maximale du Job en minutes", "120"],
  ["appSource", "Nom court utilisé par l’app", options.name],
];
const answers = {};
const readline = options.nonInteractive ? undefined : createInterface({ input: stdin, output: stdout });
try {
  for (const [key, label, fallback] of prompts) {
    answers[key] = options[key] ?? (readline ? (await readline.question(`${label}${fallback !== undefined ? ` [${fallback}]` : ""}: `)).trim() || fallback : fallback);
  }
  if (!modes.includes(answers.mode)) throw new Error(`Mode must be one of: ${modes.join(", ")}.`);
  if (answers.mode === "notebook") {
    answers.replayStrategy = options.replayStrategy
      ?? (readline ? (await readline.question("Stratégie (full-replace, bounded-replace) [full-replace]: ")).trim() || "full-replace" : "full-replace");
    if (!replayStrategies.includes(answers.replayStrategy)) {
      throw new Error(`Replay strategy must be one of: ${replayStrategies.join(", ")}.`);
    }
    if (answers.replayStrategy === "bounded-replace") {
      answers.dateColumn = options.dateColumn
        ?? (readline ? (await readline.question("Colonne DATE de reprise: ")).trim() : undefined);
      answers.defaultLookbackDays = options.defaultLookbackDays
        ?? (readline ? (await readline.question("Fenêtre quotidienne en jours [7]: ")).trim() || "7" : "7");
      answers.maxReplayDays = options.maxReplayDays
        ?? (readline ? (await readline.question("Fenêtre maximale de reprise en jours [31]: ")).trim() || "31" : "31");
      answers.finalizationLagDays = options.finalizationLagDays
        ?? (readline ? (await readline.question("Délai de finalisation en jours [1]: ")).trim() || "1" : "1");
      answers.requiredHistoryDays = options.requiredHistoryDays
        ?? (readline ? (await readline.question("Profondeur d’historique requise en jours: ")).trim() : undefined);
      answers.outputRetentionDays = options.outputRetentionDays
        ?? (readline ? (await readline.question("Rétention de la sortie en jours: ")).trim() : undefined);
      answers.sourceRetentionDays = options.sourceRetentionDays
        ?? (readline ? (await readline.question("Rétention source confirmée en jours: ")).trim() : undefined);
    }
    if (answers.replayStrategy !== "bounded-replace" && (
      options.dateColumn
      || options.defaultLookbackDays
      || options.maxReplayDays
      || options.finalizationLagDays
      || options.requiredHistoryDays
      || options.outputRetentionDays
      || options.sourceRetentionDays
    )) {
      throw new Error("Bounded replay options require the bounded-replace strategy.");
    }
  } else if (
    options.replayStrategy
    || options.dateColumn
    || options.defaultLookbackDays
    || options.maxReplayDays
    || options.finalizationLagDays
    || options.requiredHistoryDays
    || options.outputRetentionDays
    || options.sourceRetentionDays
  ) {
    throw new Error("Replay options are available only in notebook mode.");
  }
} finally {
  readline?.close();
}
if (!answers.source) throw new Error("A source is required.");
qualifiedParts(answers.source, accessManifest.project, "Source");
answers.output = answers.output || (answers.mode === "direct" ? answers.source : undefined);
if (!answers.output) throw new Error("Prepared modes require an output table.");
qualifiedParts(answers.output, accessManifest.project, "Output");
if (answers.mode !== "direct") {
  const { contracts } = await loadDataContracts(root, { allowPlaceholder: true });
  if (contracts.some((contract) => contract.mode !== "direct" && contract.output.fullName === answers.output)) {
    throw new Error(`Prepared output '${answers.output}' is already owned by another data contract.`);
  }
}
if (!refreshes.includes(answers.refresh)) throw new Error(`Refresh must be one of: ${refreshes.join(", ")}.`);
const columns = list(answers.columns);
if (columns.some((column) => !identifierPattern.test(column))) throw new Error("Columns must be simple identifiers.");
const keys = list(answers.keys);
if (keys.some((key) => !identifierPattern.test(key))) throw new Error("Keys must be simple identifiers.");
const replay = answers.replayStrategy === "bounded-replace"
  ? {
      strategy: answers.replayStrategy,
      dateColumn: answers.dateColumn,
      defaultLookbackDays: Number(answers.defaultLookbackDays),
      maxDays: Number(answers.maxReplayDays),
      finalizationLagDays: Number(answers.finalizationLagDays),
      requiredHistoryDays: Number(answers.requiredHistoryDays),
      outputRetentionDays: Number(answers.outputRetentionDays),
      sourceRetentionDays: Number(answers.sourceRetentionDays),
    }
  : undefined;
let appSource = accessManifest.sources.find((source) => source.fullName === answers.output);
if (!appSource) {
  if (!namePattern.test(answers.appSource)) throw new Error("App source name must use lowercase letters, numbers and hyphens.");
  if (accessManifest.sources.some((source) => source.name === answers.appSource)) {
    throw new Error(`App source name '${answers.appSource}' already refers to another object.`);
  }
  appSource = { name: answers.appSource, fullName: answers.output, purpose: answers.purpose };
}
const nextAccessManifest = validateDataAccessManifest(
  { ...accessManifest, sources: [...accessManifest.sources.filter((source) => source.name !== appSource.name), appSource] },
  { allowPlaceholder: true },
);
const rawContract = {
  version: 1,
  name: options.name,
  mode: answers.mode,
  appSource: appSource.name,
  source: answers.source,
  output: answers.output,
  columns,
  owner: answers.owner,
  purpose: answers.purpose,
  grain: answers.grain,
  keys,
  refresh: answers.refresh,
  freshnessHours: Number(answers.freshnessHours),
  timeoutMinutes: Number(answers.timeoutMinutes),
  ...(replay ? { replay } : {}),
};
validateDataContract(rawContract, `${options.name}.yml`, nextAccessManifest);
const codePath = answers.mode === "direct" ? undefined : join(root, "data", answers.mode === "notebook" ? "notebooks" : "pipelines", `${options.name}.sql`);
if (codePath && await exists(codePath)) throw new Error(`Refusing to overwrite ${codePath}.`);
const testPath = answers.mode === "direct" ? undefined : join(root, "data/tests", `${options.name}.sql`);
if (testPath && await exists(testPath)) throw new Error(`Refusing to overwrite ${testPath}.`);
await writeFile(join(root, "config/data-access.json"), `${JSON.stringify(nextAccessManifest, null, 2)}\n`, "utf8");
await writeFile(contractPath, stringify(rawContract, { lineWidth: 120 }), "utf8");
if (codePath) {
  await writeFile(codePath, renderPreparationCode(rawContract), "utf8");
  await writeFile(testPath, renderQualityQueries(rawContract), "utf8");
}
await renderDataAccess({ root, allowPlaceholder: true });
await renderDataPreparation({ root, allowPlaceholder: true });
stdout.write(
  answers.mode === "direct"
    ? `Registered direct source '${appSource.name}'. Next: npm run feature:new -- <slug>.\n`
    : `Created ${answers.mode} starter '${options.name}'. Review its SQL before npm run data:prepare.\n`,
);
