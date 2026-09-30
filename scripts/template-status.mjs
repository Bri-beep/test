#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { stdout } from "node:process";
import { pathToFileURL } from "node:url";

import {
  TEMPLATE_STATE_PATH,
  compareVersions,
  loadTemplateManifest,
  loadTemplateState,
  loadTemplateUpgrade,
  probeTemplateCapabilities,
} from "./template-manifest.mjs";

function option(args, name) {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`--${name} requires a value.`);
  return value;
}

export function parseTemplateStatusOptions(args) {
  const allowed = new Set(["--check", "--diff", "--json", "--from", "--to"]);
  for (const arg of args) {
    if (arg.startsWith("--") && !allowed.has(arg)) throw new Error(`Unknown option: ${arg}`);
  }
  const from = option(args, "from");
  const to = option(args, "to");
  return {
    check: args.includes("--check"),
    diff: args.includes("--diff"),
    json: args.includes("--json"),
    from,
    to,
  };
}

export function findNextTemplateUpgrade(manifest, from, currentVersion = manifest.template.currentVersion) {
  return manifest.upgrades
    .filter((candidate) => (
      candidate.from === from
      && compareVersions(candidate.to, from) > 0
      && compareVersions(candidate.to, currentVersion) <= 0
    ))
    .sort((left, right) => compareVersions(left.to, right.to))[0];
}

async function isTemplateSource(root) {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  return packageJson.name === "__PACKAGE_NAME__";
}

export async function inspectTemplateVersion(root, { verifyVersion } = {}) {
  const manifest = await loadTemplateManifest(root);
  const state = await loadTemplateState(root);
  const source = await isTemplateSource(root);
  if (state && state.template.id !== manifest.template.id) {
    throw new Error(`Template state id '${state.template.id}' does not match '${manifest.template.id}'.`);
  }
  if (state && state.template.repository !== manifest.template.repository) {
    throw new Error("Template state repository does not match the template manifest.");
  }
  if (state && !manifest.versions[state.template.version]) {
    throw new Error(`Template state uses unknown version '${state.template.version}'.`);
  }
  const effectiveVersion = state?.template.version ?? (source ? manifest.template.currentVersion : undefined);
  if (verifyVersion && !manifest.versions[verifyVersion]) {
    throw new Error(`Unknown template version '${verifyVersion}'.`);
  }
  const verificationVersion = verifyVersion ?? effectiveVersion ?? manifest.template.currentVersion;
  const capabilities = await probeTemplateCapabilities(root, manifest, verificationVersion);
  const expectedCapabilities = capabilities.map((capability) => capability.id);
  if (state && verificationVersion === state.template.version) {
    const declared = [...state.capabilities].sort();
    const expected = [...expectedCapabilities].sort();
    if (JSON.stringify(declared) !== JSON.stringify(expected)) {
      throw new Error(`${TEMPLATE_STATE_PATH} capabilities do not match template version ${effectiveVersion}.`);
    }
  }
  const currentVersion = manifest.template.currentVersion;
  const behind = effectiveVersion ? compareVersions(effectiveVersion, currentVersion) < 0 : false;
  const upgrade = behind ? findNextTemplateUpgrade(manifest, effectiveVersion, currentVersion) : undefined;
  return {
    template: {
      id: manifest.template.id,
      repository: manifest.template.repository,
      currentVersion,
    },
    instance: {
      kind: source ? "source" : state ? "tracked" : "legacy",
      version: state?.template.version,
      effectiveVersion,
      statePath: state ? TEMPLATE_STATE_PATH : undefined,
      behind,
    },
    verificationVersion,
    capabilities,
    upgrade,
  };
}

function printStatus(status) {
  const instance = status.instance;
  stdout.write(`Template: ${status.template.id}\n`);
  stdout.write(`Version courante: ${status.template.currentVersion}\n`);
  if (instance.kind === "source") {
    stdout.write(`Instance: source du template ${instance.effectiveVersion}\n`);
  } else if (instance.kind === "legacy") {
    stdout.write("Instance: app non suivie (copie antérieure au manifeste)\n");
  } else {
    stdout.write(`Instance: ${instance.version}${instance.behind ? ` (mise à niveau ${status.template.currentVersion} disponible)` : " (à jour)"}\n`);
  }
  if (status.verificationVersion !== instance.effectiveVersion) {
    stdout.write(`Vérification ciblée: ${status.verificationVersion}\n`);
  }
  stdout.write("Capabilities:\n");
  for (const capability of status.capabilities) {
    stdout.write(`  ${capability.ok ? "✓" : "✗"} ${capability.id} (depuis ${capability.since})\n`);
    for (const failure of capability.failures) stdout.write(`    - ${failure}\n`);
  }
  if (status.upgrade) {
    stdout.write(`Upgrade: npm run template:diff -- --from ${status.upgrade.from} --to ${status.upgrade.to}\n`);
  } else if (instance.kind === "legacy") {
    stdout.write("Adoption: créer .valiuz-template.yml à partir de la baseline réellement présente avant toute mise à niveau.\n");
  }
}

function printUpgrade(upgrade) {
  stdout.write(`Upgrade ${upgrade.from} -> ${upgrade.to}\n${upgrade.summary}\n\n`);
  for (const mode of ["automatic", "guided", "manual"]) {
    const changes = upgrade.changes.filter((change) => change.mode === mode);
    if (changes.length === 0) continue;
    stdout.write(`${mode.toUpperCase()}\n`);
    for (const change of changes) {
      stdout.write(`- ${change.title}\n  ${change.description}\n`);
      stdout.write(`  Fichiers: ${change.paths.join(", ")}\n`);
      for (const instruction of change.instructions) stdout.write(`  * ${instruction}\n`);
    }
    stdout.write("\n");
  }
  stdout.write(`Validation:\n${upgrade.validation.map((command) => `- ${command}`).join("\n")}\n`);
}

export async function runTemplateStatus(root, options) {
  const manifest = await loadTemplateManifest(root);
  if (options.diff) {
    const state = await loadTemplateState(root);
    const stateUpgrade = state
      ? findNextTemplateUpgrade(manifest, state.template.version)
      : undefined;
    const from = options.from
      ?? (stateUpgrade ? state.template.version : undefined)
      ?? manifest.versions[manifest.template.currentVersion].extends
      ?? manifest.template.currentVersion;
    const to = options.to
      ?? stateUpgrade?.to
      ?? findNextTemplateUpgrade(manifest, from)?.to
      ?? manifest.template.currentVersion;
    const upgrade = await loadTemplateUpgrade(root, manifest, from, to);
    if (options.json) stdout.write(`${JSON.stringify(upgrade, null, 2)}\n`);
    else printUpgrade(upgrade);
    return { ok: true, upgrade };
  }

  const status = await inspectTemplateVersion(root, { verifyVersion: options.to });
  if (options.json) stdout.write(`${JSON.stringify(status, null, 2)}\n`);
  else printStatus(status);
  const missing = status.capabilities.filter((capability) => !capability.ok);
  if (options.check && missing.length > 0) {
    throw new Error(`${missing.length} template capability check(s) failed.`);
  }
  return { ok: missing.length === 0, status };
}

async function main() {
  const options = parseTemplateStatusOptions(process.argv.slice(2));
  try {
    await runTemplateStatus(process.cwd(), options);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Template status failed."}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
