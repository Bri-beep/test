#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { stdout } from "node:process";

import {
  loadDataContracts,
  preparationDeploymentFingerprint,
  renderDataPreparation,
  resourceKey,
} from "./data-preparation.mjs";

function parseOptions(argv) {
  const options = {
    dataset: undefined,
    target: "dev",
    profile: undefined,
    confirm: false,
    activateSchedule: false,
    runOnly: false,
    startDate: undefined,
    endDate: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--") && !options.dataset) {
      options.dataset = value;
      continue;
    }
    if (["--confirm", "--activate-schedule", "--run-only"].includes(value)) {
      const key = value === "--confirm" ? "confirm" : value === "--activate-schedule" ? "activateSchedule" : "runOnly";
      options[key] = true;
      continue;
    }
    if (!["--dataset", "--target", "--profile", "--start-date", "--end-date"].includes(value)) {
      throw new Error(`Unknown option: ${value}`);
    }
    const supplied = argv[index + 1];
    if (!supplied || supplied.startsWith("--")) throw new Error(`${value} requires a value.`);
    const key = value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    options[key] = supplied;
    index += 1;
  }
  return options;
}

function isoDate(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a valid calendar date.`);
  }
  return date;
}

function dateText(date) {
  return date.toISOString().slice(0, 10);
}

function shiftUtcDays(date, days) {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

function parisToday() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function resolveReplayWindow(contract, options) {
  if (!contract.replay) {
    if (options.runOnly || options.startDate || options.endDate) {
      throw new Error(`Data contract '${contract.name}' does not declare a bounded replay policy.`);
    }
    return undefined;
  }
  if (!options.startDate || !options.endDate) {
    throw new Error("Bounded replay commands require both --start-date and --end-date.");
  }
  const finalizedDate = shiftUtcDays(
    isoDate(parisToday(), "Current date"),
    -contract.replay.finalizationLagDays,
  );
  const requiredHistoryStartDate = shiftUtcDays(finalizedDate, -contract.replay.requiredHistoryDays + 1);
  const outputRetentionStartDate = shiftUtcDays(finalizedDate, -contract.replay.outputRetentionDays + 1);
  const end = isoDate(options.endDate, "Replay end date");
  const start = isoDate(options.startDate, "Replay start date");
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days < 1) throw new Error("Replay start date must not follow its end date.");
  if (days > contract.replay.maxDays) {
    throw new Error(`Replay window has ${days} days. The contract maximum is ${contract.replay.maxDays} days.`);
  }
  if (end > finalizedDate) {
    throw new Error(`Replay end date must not follow finalized source date ${dateText(finalizedDate)}.`);
  }
  if (start < outputRetentionStartDate) {
    throw new Error(
      `Replay start date precedes output retention boundary ${dateText(outputRetentionStartDate)}. Use a data product if deeper history is required.`,
    );
  }
  return {
    startDate: dateText(start),
    endDate: dateText(end),
    days,
    finalizedDate: dateText(finalizedDate),
    requiredHistoryStartDate: dateText(requiredHistoryStartDate),
    outputRetentionStartDate: dateText(outputRetentionStartDate),
  };
}

function readMatch(file, pattern, label) {
  const match = readFileSync(file, "utf8").match(pattern);
  if (!match) throw new Error(`Unable to determine ${label} from ${file}.`);
  return match[1];
}

function runDatabricks(args, cwd = process.cwd()) {
  const result = spawnSync("databricks", args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function workspaceHost(target, profile) {
  if (target === "prod") {
    return readMatch("data/databricks.yml", /host:\s*(https:\/\/\S+)/, "production workspace host");
  }
  const result = spawnSync("databricks", ["auth", "describe", ...(profile ? ["--profile", profile] : [])], {
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) throw new Error("Unable to determine the Databricks workspace.");
  const match = result.stdout.match(/^\s*(?:✓\s*)?host:\s+(https:\/\/\S+)/im);
  if (!match) throw new Error("Databricks authentication did not report a workspace host.");
  return match[1];
}

const options = parseOptions(process.argv.slice(2));
if (!options.dataset) throw new Error("Provide the data contract to prepare.");
if (!["dev", "prod"].includes(options.target)) throw new Error("Data preparation target must be dev or prod.");
if (options.runOnly && options.activateSchedule) {
  throw new Error("--activate-schedule requires a bundle deployment and cannot be used with --run-only.");
}
await renderDataPreparation({ root: process.cwd(), check: true });
const { project, contracts } = await loadDataContracts(process.cwd());
const contract = contracts.find((candidate) => candidate.name === options.dataset);
if (!contract) throw new Error(`Unknown data contract '${options.dataset}'.`);
if (contract.mode === "direct") throw new Error(`Data contract '${contract.name}' is direct and has nothing to run.`);
const replayWindow = resolveReplayWindow(contract, options);
const preparationCode = readFileSync(
  `data/${contract.mode === "notebook" ? "notebooks" : "pipelines"}/${contract.name}.sql`,
  "utf8",
);
const deploymentFingerprint = contract.replay
  ? preparationDeploymentFingerprint(contract, preparationCode)
  : undefined;
const host = workspaceHost(options.target, options.profile);
const warehouse = readMatch(
  "data/databricks.yml",
  /sql_warehouse_id:\s*\n\s*default:\s*([^\s]+)/,
  "SQL warehouse",
);
const schedulePauseStatus = options.activateSchedule ? "UNPAUSED" : "PAUSED";
const warehousePlan = options.runOnly
  ? `Local bundle warehouse (deployed Job not inspected): ${warehouse}`
  : `Warehouse: ${warehouse}`;
const schedulePlan = options.runOnly
  ? `Schedule: ${contract.refresh} (deployed state not inspected or changed by replay)`
  : `Schedule after deployment: ${contract.refresh} (${schedulePauseStatus})`;
stdout.write(
  [
    "Remote data preparation:",
    `Workspace: ${host}`,
    `Profile: ${options.profile ?? "environment authentication"}`,
    `Target: ${options.target}`,
    `Dataset: ${contract.name} (${contract.mode})`,
    `Source: ${contract.source.fullName}`,
    `Output: ${contract.output.fullName}`,
    `Project: ${project}`,
    warehousePlan,
    schedulePlan,
    `Timeout: ${contract.timeoutMinutes} minutes`,
    ...(contract.replay
      ? [
          `Replay strategy: ${contract.replay.strategy}`,
          `Replay date column: ${contract.replay.dateColumn}`,
          `Finalized source date: ${replayWindow.finalizedDate}`,
          `Required history: ${replayWindow.requiredHistoryStartDate} to ${replayWindow.finalizedDate} (${contract.replay.requiredHistoryDays} days)`,
          `Output retention: ${replayWindow.outputRetentionStartDate} to ${replayWindow.finalizedDate} (${contract.replay.outputRetentionDays} days)`,
          `Confirmed source retention from today: ${contract.replay.sourceRetentionDays} days`,
          `Deployment fingerprint: ${deploymentFingerprint}`,
          `Replay window: ${replayWindow.startDate} to ${replayWindow.endDate} (${replayWindow.days} days, maximum ${contract.replay.maxDays})`,
        ]
      : []),
    `Operation: ${options.runOnly ? "run deployed replay job" : "deploy and run preparation"}`,
    ...(options.runOnly
      ? ["Plan basis: local contract and bundle; deployed Job settings are not queried."]
      : []),
  ].join("\n") + "\n",
);
if (!options.confirm) {
  stdout.write("No remote change made. Review the SQL, then rerun with --confirm.\n");
  process.exit(2);
}
const profileArgs = options.profile ? ["--profile", options.profile] : [];
const variableArgs = ["--var", `schedule_pause_status=${schedulePauseStatus}`];
const common = ["--target", options.target, ...profileArgs, ...variableArgs];
if (!options.runOnly) {
  runDatabricks(["bundle", "validate", ...common], "data");
  runDatabricks(["bundle", "deploy", ...common], "data");
}
const replayArgs = replayWindow
  ? [
      "--",
      "--replay_start_date", replayWindow.startDate,
      "--replay_end_date", replayWindow.endDate,
      "--deployment_fingerprint", deploymentFingerprint,
    ]
  : [];
runDatabricks(["bundle", "run", resourceKey(contract.name), ...common, ...replayArgs], "data");
stdout.write(
  replayWindow
    ? `Replay completed for '${contract.output.fullName}'. Reconcile coverage and quality before the app uses it.\n`
    : `Preparation completed for '${contract.output.fullName}'. Validate its quality before the app uses it.\n`,
);
