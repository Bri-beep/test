import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import { parse, stringify } from "yaml";
import { z } from "zod";

export const TEMPLATE_MANIFEST_PATH = "template/manifest.yml";
export const TEMPLATE_STATE_PATH = ".valiuz-template.yml";

const versionSchema = z.string().regex(/^\d+\.\d+\.\d+$/, "Expected a semantic version such as 1.1.0.");
const commitSchema = z.string().regex(/^[0-9a-f]{40}$/, "Expected a full Git commit SHA.");
const safePathSchema = z.string().min(1).refine(
  (value) => (
    !isAbsolute(value)
    && !/^[\\/]/.test(value)
    && !/^[A-Za-z]:[\\/]/.test(value)
    && !value.split(/[\\/]/).includes("..")
  ),
  "Paths must stay inside the application root.",
);

const probeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("fileAnyOf"), paths: z.array(safePathSchema).min(1), text: z.string().optional() }).strict(),
  z.object({ type: z.literal("file"), path: safePathSchema }).strict(),
  z.object({ type: z.literal("fileContains"), path: safePathSchema, text: z.string().min(1) }).strict(),
  z.object({ type: z.literal("fileNotContains"), path: safePathSchema, text: z.string().min(1) }).strict(),
  z.object({
    type: z.literal("packageScript"),
    name: z.string().min(1),
    command: z.string().min(1),
  }).strict(),
]);

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  template: z.object({
    id: z.string().min(1),
    repository: z.url(),
    currentVersion: versionSchema,
  }).strict(),
  requirements: z.object({
    node: z.string().min(1),
    databricksCli: z.string().min(1),
  }).strict(),
  versions: z.record(versionSchema, z.object({
    sourceCommit: commitSchema,
    summary: z.string().min(1),
    extends: versionSchema.optional(),
    capabilities: z.array(z.string().min(1)),
  }).strict()),
  capabilities: z.record(z.string().min(1), z.object({
    since: versionSchema,
    description: z.string().min(1),
    probes: z.array(probeSchema).min(1),
  }).strict()),
  upgrades: z.array(z.object({
    from: versionSchema,
    to: versionSchema,
    path: safePathSchema,
  }).strict()),
}).strict();

const stateSchema = z.object({
  schemaVersion: z.literal(1),
  template: z.object({
    id: z.string().min(1),
    repository: z.url(),
    version: versionSchema,
  }).strict(),
  capabilities: z.array(z.string().min(1)),
  appliedUpgrades: z.array(z.string().min(1)),
}).strict();

const upgradeSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  from: versionSchema,
  to: versionSchema,
  summary: z.string().min(1),
  changes: z.array(z.object({
    id: z.string().min(1),
    mode: z.enum(["automatic", "guided", "manual"]),
    title: z.string().min(1),
    description: z.string().min(1),
    paths: z.array(safePathSchema).min(1),
    instructions: z.array(z.string().min(1)).min(1),
  }).strict()).min(1),
  validation: z.array(z.string().min(1)).min(1),
}).strict();

async function readYaml(path, schema, label) {
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      throw new Error(`${label} is missing at ${path}.`);
    }
    throw error;
  }
  let value;
  try {
    value = parse(content);
  } catch (error) {
    throw new Error(`${label} is not valid YAML: ${error instanceof Error ? error.message : "parse error"}`);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${label} is invalid: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export async function loadTemplateManifest(root) {
  const manifest = await readYaml(join(root, TEMPLATE_MANIFEST_PATH), manifestSchema, "Template manifest");
  validateManifestReferences(manifest);
  return manifest;
}

function validateManifestReferences(manifest) {
  const versions = new Set(Object.keys(manifest.versions));
  if (!versions.has(manifest.template.currentVersion)) {
    throw new Error(`Template manifest current version '${manifest.template.currentVersion}' is not declared.`);
  }
  for (const [version, release] of Object.entries(manifest.versions)) {
    if (release.extends && !versions.has(release.extends)) {
      throw new Error(`Template version '${version}' extends unknown version '${release.extends}'.`);
    }
    for (const capability of release.capabilities) {
      if (!manifest.capabilities[capability]) {
        throw new Error(`Template version '${version}' references unknown capability '${capability}'.`);
      }
    }
  }
  for (const [capability, contract] of Object.entries(manifest.capabilities)) {
    if (!versions.has(contract.since)) {
      throw new Error(`Template capability '${capability}' starts at unknown version '${contract.since}'.`);
    }
  }
  for (const upgrade of manifest.upgrades) {
    if (!versions.has(upgrade.from) || !versions.has(upgrade.to)) {
      throw new Error(`Template upgrade '${upgrade.from}' to '${upgrade.to}' references an unknown version.`);
    }
  }
  for (const version of versions) resolveVersionCapabilities(manifest, version);
}

export function resolveVersionCapabilities(manifest, version, stack = []) {
  const release = manifest.versions[version];
  if (!release) throw new Error(`Unknown template version '${version}'.`);
  if (stack.includes(version)) {
    throw new Error(`Template version inheritance contains a cycle: ${[...stack, version].join(" -> ")}.`);
  }
  const inherited = release.extends
    ? resolveVersionCapabilities(manifest, release.extends, [...stack, version])
    : [];
  return [...new Set([...inherited, ...release.capabilities])];
}

export async function loadTemplateState(root) {
  try {
    return await readYaml(join(root, TEMPLATE_STATE_PATH), stateSchema, "Template state");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Template state is missing")) return undefined;
    throw error;
  }
}

export async function writeTemplateState(root, manifest, version = manifest.template.currentVersion) {
  const capabilities = resolveVersionCapabilities(manifest, version);
  const state = {
    schemaVersion: 1,
    template: {
      id: manifest.template.id,
      repository: manifest.template.repository,
      version,
    },
    capabilities,
    appliedUpgrades: [],
  };
  await writeFile(join(root, TEMPLATE_STATE_PATH), stringify(state, { lineWidth: 0 }), "utf8");
  return state;
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function probeTemplateCapabilities(root, manifest, version) {
  const packageJsonContent = await readOptional(join(root, "package.json"));
  let packageJson;
  try {
    packageJson = packageJsonContent ? JSON.parse(packageJsonContent) : undefined;
  } catch {
    packageJson = undefined;
  }
  const capabilityIds = resolveVersionCapabilities(manifest, version);
  const results = [];
  for (const id of capabilityIds) {
    const capability = manifest.capabilities[id];
    const failures = [];
    for (const probe of capability.probes) {
      if (probe.type === "packageScript") {
        const actual = packageJson?.scripts?.[probe.name];
        if (actual !== probe.command) failures.push(`package script '${probe.name}' does not match`);
        continue;
      }
      if (probe.type === "fileAnyOf") {
        const contents = await Promise.all(probe.paths.map((path) => readOptional(join(root, path))));
        if (!contents.some((content) => content !== undefined && (!probe.text || content.includes(probe.text)))) {
          failures.push(`missing compatible file among '${probe.paths.join("', '")}'`);
        }
        continue;
      }
      const content = await readOptional(join(root, probe.path));
      if (probe.type === "file" && content === undefined) failures.push(`missing file '${probe.path}'`);
      if (probe.type === "fileContains" && !content?.includes(probe.text)) {
        failures.push(`'${probe.path}' does not contain the expected marker`);
      }
      if (probe.type === "fileNotContains" && content?.includes(probe.text)) {
        failures.push(`'${probe.path}' still contains an obsolete marker`);
      }
    }
    results.push({ id, since: capability.since, description: capability.description, ok: failures.length === 0, failures });
  }
  return results;
}

export async function loadTemplateUpgrade(root, manifest, from, to) {
  const reference = manifest.upgrades.find((upgrade) => upgrade.from === from && upgrade.to === to);
  if (!reference) throw new Error(`No template upgrade is declared from ${from} to ${to}.`);
  const upgrade = await readYaml(join(root, reference.path), upgradeSchema, "Template upgrade");
  if (upgrade.from !== from || upgrade.to !== to) {
    throw new Error(`Template upgrade '${reference.path}' does not match ${from} to ${to}.`);
  }
  return { ...upgrade, path: reference.path };
}

export function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}
