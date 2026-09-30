#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { stdout } from "node:process";

import { loadDataContracts } from "./data-preparation.mjs";

function parseOptions(argv) {
  const options = { target: "dev", profile: undefined, app: undefined, prepareData: false, confirm: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--prepare-data" || value === "--confirm") {
      options[value === "--prepare-data" ? "prepareData" : "confirm"] = true;
      continue;
    }
    if (!["--target", "--profile", "--app"].includes(value)) throw new Error(`Unknown option: ${value}`);
    const supplied = argv[index + 1];
    if (!supplied || supplied.startsWith("--")) throw new Error(`${value} requires a value.`);
    options[value.slice(2)] = supplied;
    index += 1;
  }
  return options;
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const options = parseOptions(process.argv.slice(2));
if (options.target !== "dev") throw new Error("preview:real is limited to the dev target.");
const packageName = JSON.parse(readFileSync("package.json", "utf8")).name;
const app = options.app ?? packageName;
if (!/^[a-z0-9][a-z0-9-]*$/.test(app)) throw new Error("Provide an initialized app name with --app.");
const { project, contracts } = await loadDataContracts(process.cwd());
const prepared = contracts.filter((contract) => contract.mode !== "direct");
const bounded = prepared.filter((contract) => contract.replay);
stdout.write(
  [
    "Real-data preview plan:",
    `Target: ${options.target}`,
    `Profile: ${options.profile ?? "environment authentication"}`,
    `App: ${app}`,
    `Data project: ${project}`,
    `Prepared datasets: ${prepared.length}`,
    `Bounded datasets requiring explicit dates: ${bounded.length}`,
    `Run preparation now: ${options.prepareData ? "yes" : "no"}`,
  ].join("\n") + "\n",
);
if (options.prepareData && bounded.length > 0) {
  throw new Error(
    `preview:real cannot choose replay dates for bounded datasets: ${bounded.map((contract) => contract.name).join(", ")}. Run data:prepare for each dataset first.`,
  );
}
run(process.execPath, ["scripts/app-doctor.mjs"]);
if (!options.confirm) {
  stdout.write("No remote change made. Rerun with --confirm after reviewing this plan.\n");
  process.exit(2);
}
if (options.prepareData) {
  for (const contract of prepared) {
    run(process.execPath, [
      "scripts/run-data-preparation.mjs",
      contract.name,
      "--target",
      options.target,
      ...(options.profile ? ["--profile", options.profile] : []),
      "--confirm",
    ]);
  }
}
run(process.execPath, ["scripts/app-doctor.mjs", "--remote", ...(options.profile ? ["--profile", options.profile] : [])]);
run(process.execPath, ["scripts/deploy.mjs", "--target", options.target, ...(options.profile ? ["--profile", options.profile] : [])]);
run(process.execPath, ["scripts/smoke-deployed-app.mjs", "--app", app, ...(options.profile ? ["--profile", options.profile] : [])]);
stdout.write("Real-data preview is ready and smoke-checked.\n");
