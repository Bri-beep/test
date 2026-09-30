#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { stdout } from "node:process";
import { pathToFileURL } from "node:url";

import { parse } from "yaml";

import {
  compareVersions,
  loadTemplateManifest,
  loadTemplateUpgrade,
  resolveVersionCapabilities,
} from "./template-manifest.mjs";

function option(args, name) {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`--${name} requires a value.`);
  return value;
}

export function parseReleaseCheckOptions(args) {
  for (const arg of args) {
    if (arg.startsWith("--") && arg !== "--base") throw new Error(`Unknown option: ${arg}`);
  }
  return { base: option(args, "base") };
}

function git(root, args, { quiet = false } = {}) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: quiet ? ["ignore", "pipe", "ignore"] : ["ignore", "pipe", "pipe"],
  }).trim();
}

function tryResolveCommit(root, reference) {
  if (!reference || /^0+$/.test(reference)) return undefined;
  try {
    return git(root, ["rev-parse", "--verify", `${reference}^{commit}`], { quiet: true });
  } catch {
    return undefined;
  }
}

function resolveBase(root, requested) {
  const explicit = requested ?? process.env.TEMPLATE_RELEASE_BASE;
  if (explicit && !/^0+$/.test(explicit)) {
    const commit = tryResolveCommit(root, explicit);
    if (!commit) throw new Error(`Unable to resolve the requested template release base '${explicit}'.`);
    return { reference: explicit, commit };
  }
  const candidates = ["origin/main", "HEAD^"];
  for (const candidate of candidates) {
    const commit = tryResolveCommit(root, candidate);
    if (commit) return { reference: candidate, commit };
  }
  if (process.env.CI === "true") throw new Error("CI requires TEMPLATE_RELEASE_BASE or a resolvable Git base.");
  return undefined;
}

export function changedFilesSince(root, baseCommit) {
  const tracked = git(root, ["diff", "--name-only", "--diff-filter=ACMRTD", "-M", baseCommit, "--"], { quiet: true });
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard"], { quiet: true });
  return [...new Set([...tracked.split("\n"), ...untracked.split("\n")].filter(Boolean))].sort();
}

export function isReleaseRelevantPath(path) {
  if (path === "AGENTS.md" || path.startsWith(".agents/skills/")) return true;
  if (path.startsWith("docs/") || path.startsWith("tests/")) return false;
  if (path === "README.md") return false;
  return true;
}

export function classifyVersionBump(from, to) {
  if (compareVersions(from, to) >= 0) return "none";
  const [fromMajor, fromMinor] = from.split(".").map(Number);
  const [toMajor, toMinor] = to.split(".").map(Number);
  if (toMajor > fromMajor) return "major";
  if (toMinor > fromMinor) return "minor";
  return "patch";
}

export function isExactVersionIncrement(from, to, bump = classifyVersionBump(from, to)) {
  const [fromMajor, fromMinor, fromPatch] = from.split(".").map(Number);
  const [toMajor, toMinor, toPatch] = to.split(".").map(Number);
  if (bump === "patch") {
    return toMajor === fromMajor && toMinor === fromMinor && toPatch === fromPatch + 1;
  }
  if (bump === "minor") {
    return toMajor === fromMajor && toMinor === fromMinor + 1 && toPatch === 0;
  }
  if (bump === "major") {
    return toMajor === fromMajor + 1 && toMinor === 0 && toPatch === 0;
  }
  return false;
}

function resolveLooseCapabilities(manifest, version, stack = []) {
  const release = manifest?.versions?.[version];
  if (!release) throw new Error(`Base template does not declare version '${version}'.`);
  if (stack.includes(version)) throw new Error(`Base template version inheritance contains a cycle at '${version}'.`);
  const inherited = release.extends
    ? resolveLooseCapabilities(manifest, release.extends, [...stack, version])
    : [];
  return [...new Set([...inherited, ...(release.capabilities ?? [])])];
}

export function assessTemplateRelease({
  baseVersion,
  currentVersion,
  baseCommit,
  baseCapabilities,
  currentCapabilities,
  currentRelease,
  upgradeReference,
  upgradePath,
  changedFiles,
}) {
  const relevantFiles = changedFiles.filter(isReleaseRelevantPath);
  const versionChanged = currentVersion !== baseVersion;
  if (relevantFiles.length === 0 && !versionChanged) {
    return { required: false, bump: "none", addedCapabilities: [], removedCapabilities: [], relevantFiles, errors: [] };
  }

  const errors = [];
  const bump = classifyVersionBump(baseVersion, currentVersion);
  const addedCapabilities = currentCapabilities.filter((capability) => !baseCapabilities.includes(capability));
  const removedCapabilities = baseCapabilities.filter((capability) => !currentCapabilities.includes(capability));

  if (bump === "none") {
    errors.push(`Template behavior changed without increasing currentVersion from ${baseVersion}.`);
  } else {
    if (!isExactVersionIncrement(baseVersion, currentVersion, bump)) {
      errors.push(`Version ${currentVersion} is not the next ${bump} increment after ${baseVersion}.`);
    }
    if (bump === "patch" && addedCapabilities.length > 0) {
      errors.push(`A patch release cannot add capabilities: ${addedCapabilities.join(", ")}.`);
    }
    if (bump === "minor" && addedCapabilities.length === 0) {
      errors.push("A minor release must add at least one compatible capability.");
    }
    if (removedCapabilities.length > 0 && bump !== "major") {
      errors.push(`Removing capabilities requires a major release: ${removedCapabilities.join(", ")}.`);
    }
    if (!currentRelease) {
      errors.push(`versions.${currentVersion} is missing from template/manifest.yml.`);
    } else {
      if (currentRelease.extends !== baseVersion) {
        errors.push(`Version ${currentVersion} must extend the base version ${baseVersion}.`);
      }
      if (currentRelease.sourceCommit !== baseCommit) {
        errors.push(`Version ${currentVersion} must use base commit ${baseCommit} as sourceCommit.`);
      }
    }
    if (!upgradeReference) {
      errors.push(`No upgrade is declared from ${baseVersion} to ${currentVersion}.`);
    } else if (!changedFiles.includes(upgradePath)) {
      errors.push(`The release must add or update its upgrade guide: ${upgradePath}.`);
    }
    if (!changedFiles.includes("README.md")) {
      errors.push("README.md must be reviewed and updated for a template release.");
    }
    if (!changedFiles.includes("docs/template-upgrades.md")) {
      errors.push("docs/template-upgrades.md must be reviewed and updated for a template release.");
    }
  }

  return {
    required: true,
    bump,
    addedCapabilities,
    removedCapabilities,
    relevantFiles,
    errors,
  };
}

export async function checkTemplateRelease(root, options = {}) {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const manifest = await loadTemplateManifest(root);
  if (packageJson.name !== "__PACKAGE_NAME__") {
    stdout.write("Initialized app: template release bump not applicable. Documentation review is still required.\n");
    return { skipped: true, reason: "initialized-app" };
  }

  const base = resolveBase(root, options.base);
  if (!base) {
    stdout.write("Template manifest is valid. No Git base was available for release-delta checks.\n");
    return { skipped: true, reason: "missing-base" };
  }

  const baseManifest = parse(git(root, ["show", `${base.commit}:template/manifest.yml`], { quiet: true }));
  const baseVersion = baseManifest?.template?.currentVersion;
  if (typeof baseVersion !== "string") throw new Error("Base template manifest has no currentVersion.");
  const currentVersion = manifest.template.currentVersion;
  const changedFiles = changedFilesSince(root, base.commit);
  const upgradeReference = manifest.upgrades.find(
    (candidate) => candidate.from === baseVersion && candidate.to === currentVersion,
  );
  const assessment = assessTemplateRelease({
    baseVersion,
    currentVersion,
    baseCommit: base.commit,
    baseCapabilities: resolveLooseCapabilities(baseManifest, baseVersion),
    currentCapabilities: resolveVersionCapabilities(manifest, currentVersion),
    currentRelease: manifest.versions[currentVersion],
    upgradeReference,
    upgradePath: upgradeReference?.path ?? `template/upgrades/${baseVersion}-to-${currentVersion}.yml`,
    changedFiles,
  });

  if (!assessment.required) {
    stdout.write(`No template release required relative to ${base.reference} (${base.commit}).\n`);
    return { skipped: false, base, assessment };
  }
  if (assessment.errors.length > 0) {
    throw new Error(`Template release review failed:\n- ${assessment.errors.join("\n- ")}`);
  }

  await loadTemplateUpgrade(root, manifest, baseVersion, currentVersion);
  const readme = await readFile(join(root, "README.md"), "utf8");
  const upgradeDocs = await readFile(join(root, "docs/template-upgrades.md"), "utf8");
  if (!readme.includes(`La version courante est \`${currentVersion}\``)) {
    throw new Error(`README.md does not declare ${currentVersion} as the current template version.`);
  }
  const versionRow = `| \`${currentVersion}\` | \`${base.commit}\` |`;
  if (!upgradeDocs.split("\n").some((line) => line.startsWith(versionRow))) {
    throw new Error(`docs/template-upgrades.md has no release row for ${currentVersion} and base ${base.commit}.`);
  }
  if (!upgradeDocs.includes(`## Passage de ${baseVersion} à ${currentVersion}`)) {
    throw new Error(`docs/template-upgrades.md has no ${baseVersion} to ${currentVersion} section.`);
  }
  if (!upgradeDocs.includes(`npm run template:diff -- --from ${baseVersion} --to ${currentVersion}`)) {
    throw new Error(`docs/template-upgrades.md has no diff command for ${baseVersion} to ${currentVersion}.`);
  }

  stdout.write(
    [
      `Template release: ${baseVersion} -> ${currentVersion} (${assessment.bump}).`,
      `Base commit: ${base.commit}.`,
      `Added capabilities: ${assessment.addedCapabilities.join(", ") || "none"}.`,
      "README.md and docs/template-upgrades.md were included in the release review.",
    ].join("\n") + "\n",
  );
  return { skipped: false, base, assessment };
}

async function main() {
  try {
    await checkTemplateRelease(process.cwd(), parseReleaseCheckOptions(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Template release check failed."}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
