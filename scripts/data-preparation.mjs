import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { parse } from "yaml";

import { loadDataAccessManifest } from "./data-access.mjs";

const namePattern = /^[a-z0-9][a-z0-9-]*$/;
const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const qualifiedIdentifierPattern = /^[A-Za-z0-9_-]+$/;
const modes = ["direct", "notebook", "pipeline"];
const refreshes = ["manual", "hourly", "daily"];
const replayStrategies = ["full-replace", "bounded-replace"];
const defaultTimeoutMinutes = 120;
const deploymentFingerprintPlaceholder = "__DATA_DEPLOYMENT_FINGERPRINT__";

function fingerprintContract(contract) {
  return {
    version: contract.version,
    name: contract.name,
    mode: contract.mode,
    appSource: contract.appSource,
    source: typeof contract.source === "string" ? contract.source : contract.source.fullName,
    output: typeof contract.output === "string" ? contract.output : contract.output.fullName,
    columns: contract.columns,
    owner: contract.owner,
    purpose: contract.purpose,
    grain: contract.grain,
    keys: contract.keys,
    refresh: contract.refresh,
    freshnessHours: Number(contract.freshnessHours),
    timeoutMinutes: Number(contract.timeoutMinutes ?? defaultTimeoutMinutes),
    replay: contract.replay ?? null,
  };
}

function normalizeFingerprintMarkers(code) {
  return code
    .replace(
      /(-- Deployment fingerprint: )(?:[0-9a-f]{64}|__DATA_DEPLOYMENT_FINGERPRINT__)/,
      `$1${deploymentFingerprintPlaceholder}`,
    )
    .replace(
      /(trim\(:deployment_fingerprint\) = ')(?:[0-9a-f]{64}|__DATA_DEPLOYMENT_FINGERPRINT__)(')/,
      `$1${deploymentFingerprintPlaceholder}$2`,
    );
}

export function preparationDeploymentFingerprint(contract, code) {
  return createHash("sha256")
    .update(JSON.stringify({ contract: fingerprintContract(contract), code: normalizeFingerprintMarkers(code) }))
    .digest("hex");
}

export function stampPreparationDeploymentFingerprint(contract, code) {
  if (!contract.replay) return { code, fingerprint: undefined };
  const normalized = normalizeFingerprintMarkers(code);
  const markerCount = normalized.split(deploymentFingerprintPlaceholder).length - 1;
  if (markerCount !== 2) {
    throw new Error(
      `Replay notebook '${contract.name}' must contain its deployment fingerprint comment and assertion. Regenerate the starter before deployment.`,
    );
  }
  const fingerprint = preparationDeploymentFingerprint(contract, normalized);
  return { code: normalized.replaceAll(deploymentFingerprintPlaceholder, fingerprint), fingerprint };
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
}

function text(value, label, { min = 2, max = 200 } = {}) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    throw new Error(`${label} must contain between ${min} and ${max} characters.`);
  }
  return value.trim();
}

function parseFullName(value, project, label) {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  const parts = value.split(".");
  if (parts.length !== 3 || parts.some((part) => !qualifiedIdentifierPattern.test(part))) {
    throw new Error(`${label} must use the project.schema.object format.`);
  }
  if (parts[0] !== project) throw new Error(`${label} must belong to data project '${project}'.`);
  return { fullName: value, project: parts[0], schema: parts[1], object: parts[2] };
}

function integer(value, label, { min, max }) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }
  return parsed;
}

function validateReplay(value, name, mode, columns, keys) {
  if (value === undefined) return undefined;
  assertObject(value, `Data contract '${name}' replay`);
  if (mode !== "notebook") {
    throw new Error(`Data contract '${name}' can use replay only in notebook mode.`);
  }
  if (value.strategy !== "bounded-replace") {
    throw new Error(`Data contract '${name}' replay strategy must be bounded-replace.`);
  }
  if (typeof value.dateColumn !== "string" || !identifierPattern.test(value.dateColumn)) {
    throw new Error(`Data contract '${name}' replay dateColumn must be a simple identifier.`);
  }
  if (!columns.includes(value.dateColumn)) {
    throw new Error(`Data contract '${name}' replay dateColumn must be included in columns.`);
  }
  if (!keys.includes(value.dateColumn)) {
    throw new Error(`Data contract '${name}' replay dateColumn must be included in keys.`);
  }
  const defaultLookbackDays = integer(
    value.defaultLookbackDays,
    `Data contract '${name}' replay defaultLookbackDays`,
    { min: 1, max: 366 },
  );
  const maxDays = integer(value.maxDays, `Data contract '${name}' replay maxDays`, { min: 1, max: 366 });
  const finalizationLagDays = integer(
    value.finalizationLagDays,
    `Data contract '${name}' replay finalizationLagDays`,
    { min: 0, max: 31 },
  );
  const requiredHistoryDays = integer(
    value.requiredHistoryDays,
    `Data contract '${name}' replay requiredHistoryDays`,
    { min: 1, max: 36_600 },
  );
  const outputRetentionDays = integer(
    value.outputRetentionDays,
    `Data contract '${name}' replay outputRetentionDays`,
    { min: 1, max: 36_600 },
  );
  const sourceRetentionDays = integer(
    value.sourceRetentionDays,
    `Data contract '${name}' replay sourceRetentionDays`,
    { min: 1, max: 36_600 },
  );
  if (defaultLookbackDays > maxDays) {
    throw new Error(`Data contract '${name}' replay defaultLookbackDays must not exceed maxDays.`);
  }
  if (maxDays > outputRetentionDays) {
    throw new Error(`Data contract '${name}' replay maxDays must not exceed outputRetentionDays.`);
  }
  if (requiredHistoryDays > outputRetentionDays) {
    throw new Error(`Data contract '${name}' replay requiredHistoryDays must not exceed outputRetentionDays.`);
  }
  if (outputRetentionDays + finalizationLagDays > sourceRetentionDays) {
    throw new Error(
      `Data contract '${name}' cannot use bounded-replace because output retention and finalization lag exceed source retention. Use a separate hot/cold data product.`,
    );
  }
  return {
    strategy: value.strategy,
    dateColumn: value.dateColumn,
    defaultLookbackDays,
    maxDays,
    finalizationLagDays,
    requiredHistoryDays,
    outputRetentionDays,
    sourceRetentionDays,
  };
}

export function validateDataContract(value, filename, accessManifest) {
  assertObject(value, `Data contract '${filename}'`);
  if (value.version !== 1) throw new Error(`Data contract '${filename}' version must be 1.`);
  const name = value.name;
  if (typeof name !== "string" || !namePattern.test(name)) {
    throw new Error(`Data contract '${filename}' name must use lowercase letters, numbers and hyphens.`);
  }
  if (`${name}.yml` !== filename) throw new Error(`Data contract '${filename}' must be named '${name}.yml'.`);
  if (!modes.includes(value.mode)) throw new Error(`Data contract '${name}' mode must be one of: ${modes.join(", ")}.`);
  const source = parseFullName(value.source, accessManifest.project, `Data contract '${name}' source`);
  const output = parseFullName(value.output, accessManifest.project, `Data contract '${name}' output`);
  if (value.mode === "direct" && source.fullName !== output.fullName) {
    throw new Error(`Direct data contract '${name}' output must equal its source.`);
  }
  if (value.mode !== "direct" && source.fullName === output.fullName) {
    throw new Error(`Prepared data contract '${name}' output must differ from its source.`);
  }
  if (!Array.isArray(value.columns)) throw new Error(`Data contract '${name}' columns must be an array.`);
  const columns = value.columns.map((column) => {
    if (typeof column !== "string" || !identifierPattern.test(column)) {
      throw new Error(`Data contract '${name}' columns must be simple identifiers.`);
    }
    return column;
  });
  if (value.mode !== "direct" && columns.length === 0) {
    throw new Error(`Prepared data contract '${name}' requires at least one selected column.`);
  }
  if (new Set(columns).size !== columns.length) throw new Error(`Data contract '${name}' columns are duplicated.`);
  if (!Array.isArray(value.keys)) throw new Error(`Data contract '${name}' keys must be an array.`);
  const keys = value.keys.map((key) => {
    if (typeof key !== "string" || !identifierPattern.test(key)) {
      throw new Error(`Data contract '${name}' keys must be simple identifiers.`);
    }
    return key;
  });
  if (!keys.every((key) => columns.includes(key)) && value.mode !== "direct") {
    throw new Error(`Data contract '${name}' keys must be included in columns.`);
  }
  if (!refreshes.includes(value.refresh)) {
    throw new Error(`Data contract '${name}' refresh must be one of: ${refreshes.join(", ")}.`);
  }
  const freshnessHours = Number(value.freshnessHours);
  if (!Number.isInteger(freshnessHours) || freshnessHours < 1 || freshnessHours > 720) {
    throw new Error(`Data contract '${name}' freshnessHours must be between 1 and 720.`);
  }
  const appSource = accessManifest.sources.find((candidate) => candidate.name === value.appSource);
  if (!appSource || appSource.fullName !== output.fullName) {
    throw new Error(`Data contract '${name}' output must match app source '${value.appSource}'.`);
  }
  const timeoutMinutes = integer(
    value.timeoutMinutes ?? defaultTimeoutMinutes,
    `Data contract '${name}' timeoutMinutes`,
    { min: 5, max: 480 },
  );
  const replay = validateReplay(value.replay, name, value.mode, columns, keys);
  return {
    version: 1,
    name,
    mode: value.mode,
    appSource: value.appSource,
    source,
    output,
    columns,
    owner: text(value.owner, `Data contract '${name}' owner`, { max: 100 }),
    purpose: text(value.purpose, `Data contract '${name}' purpose`),
    grain: text(value.grain, `Data contract '${name}' grain`),
    keys,
    refresh: value.refresh,
    freshnessHours,
    timeoutMinutes,
    replay,
  };
}

export async function loadDataContracts(root, { allowPlaceholder = false } = {}) {
  const accessManifest = await loadDataAccessManifest(root, { allowPlaceholder });
  const directory = join(root, "data/contracts");
  const files = (await readdir(directory)).filter((file) => file.endsWith(".yml")).sort();
  if (files.length > 10) throw new Error("Data preparation is limited to 10 contracts per internal app.");
  const contracts = [];
  for (const file of files) {
    let value;
    try {
      value = parse(await readFile(join(directory, file), "utf8"));
    } catch (error) {
      throw new Error(`Unable to read data contract '${file}'.`, { cause: error });
    }
    contracts.push(validateDataContract(value, file, accessManifest));
  }
  const preparedOutputs = new Set();
  for (const contract of contracts.filter((candidate) => candidate.mode !== "direct")) {
    if (preparedOutputs.has(contract.output.fullName)) {
      throw new Error(`Prepared output '${contract.output.fullName}' is declared by more than one data contract.`);
    }
    preparedOutputs.add(contract.output.fullName);
  }
  return { project: accessManifest.project, contracts };
}

function yamlString(value) {
  return JSON.stringify(value);
}

function resourceKey(name) {
  return `prepare_${name.replaceAll("-", "_")}`;
}

function scheduleLines(contract) {
  if (contract.refresh === "manual") return [];
  const quartz = contract.refresh === "hourly" ? "0 0 * * * ?" : "0 0 6 * * ?";
  return [
    "      schedule:",
    `        quartz_cron_expression: ${yamlString(quartz)}`,
    "        timezone_id: Europe/Paris",
    "        pause_status: ${var.schedule_pause_status}",
  ];
}

export function renderDataPreparationBundle(contracts, deploymentFingerprints = new Map()) {
  const prepared = contracts.filter((contract) => contract.mode !== "direct");
  if (prepared.length === 0) {
    return "# Generated by npm run data:prepare:render. Do not edit directly.\nresources: {}\n";
  }
  const lines = ["# Generated by npm run data:prepare:render. Do not edit directly.", "resources:"];
  const pipelines = prepared.filter((contract) => contract.mode === "pipeline");
  if (pipelines.length > 0) {
    lines.push("  pipelines:");
    for (const contract of pipelines) {
      const key = resourceKey(contract.name);
      lines.push(
        `    ${key}:`,
        `      name: ${yamlString(`\${bundle.name}-${contract.name}`)}`,
        `      catalog: ${yamlString(contract.output.project)}`,
        `      target: ${yamlString(contract.output.schema)}`,
        "      serverless: true",
        "      libraries:",
        "        - file:",
        `            path: ${yamlString(`./pipelines/${contract.name}.sql`)}`,
      );
    }
  }
  lines.push("  jobs:");
  for (const contract of prepared) {
    const key = resourceKey(contract.name);
    lines.push(
      `    ${key}:`,
      `      name: ${yamlString(`\${bundle.name}-${contract.name}`)}`,
      "      max_concurrent_runs: 1",
    );
    if (contract.replay) {
      const deploymentFingerprint = deploymentFingerprints.get(contract.name);
      if (!deploymentFingerprint) throw new Error(`Missing deployment fingerprint for replay contract '${contract.name}'.`);
      lines.push(
        "      parameters:",
        "        - name: replay_start_date",
        "          default: \"\"",
        "        - name: replay_end_date",
        "          default: \"\"",
        "        - name: deployment_fingerprint",
        `          default: ${yamlString(deploymentFingerprint)}`,
      );
    }
    lines.push("      tasks:", "        - task_key: prepare", `          timeout_seconds: ${contract.timeoutMinutes * 60}`);
    if (contract.mode === "notebook") {
      lines.push(
        "          notebook_task:",
        `            notebook_path: ${yamlString(`./notebooks/${contract.name}.sql`)}`,
        "            warehouse_id: ${var.sql_warehouse_id}",
      );
    } else {
      lines.push(
        "          pipeline_task:",
        `            pipeline_id: \${resources.pipelines.${key}.id}`,
        "            full_refresh: false",
      );
    }
    lines.push(...scheduleLines(contract));
  }
  return `${lines.join("\n")}\n`;
}

export async function renderDataPreparation({ root, check = false, allowPlaceholder = false }) {
  const { contracts } = await loadDataContracts(root, { allowPlaceholder });
  const deploymentFingerprints = new Map();
  for (const contract of contracts.filter((candidate) => candidate.mode !== "direct")) {
    const codePath = join(root, "data", contract.mode === "notebook" ? "notebooks" : "pipelines", `${contract.name}.sql`);
    let code;
    try {
      code = await readFile(codePath, "utf8");
    } catch (error) {
      throw new Error(`Missing preparation code ${codePath}.`, { cause: error });
    }
    const stamped = stampPreparationDeploymentFingerprint(contract, code);
    if (check && stamped.code !== code) {
      throw new Error(`Deployment fingerprint is stale in ${codePath}. Run npm run data:prepare:render.`);
    }
    if (!check && stamped.code !== code) await writeFile(codePath, stamped.code, "utf8");
    if (stamped.fingerprint) deploymentFingerprints.set(contract.name, stamped.fingerprint);
  }
  const path = join(root, "data/resources.generated.yml");
  const rendered = renderDataPreparationBundle(contracts, deploymentFingerprints);
  if (check) {
    const current = await readFile(path, "utf8");
    if (current !== rendered) throw new Error("Data preparation bundle is stale. Run npm run data:prepare:render.");
  } else {
    await writeFile(path, rendered, "utf8");
  }
  return contracts;
}

export {
  defaultTimeoutMinutes,
  modes,
  namePattern,
  identifierPattern,
  refreshes,
  replayStrategies,
  resourceKey,
};
