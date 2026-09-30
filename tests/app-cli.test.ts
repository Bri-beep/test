import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { parse, stringify } from "yaml";

const cli = join(process.cwd(), "scripts/app.mjs");

async function temporaryApp(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "valiuz cli app "));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function run(args: string[], cwd = process.cwd()) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8", env: { ...process.env, PATH: "" } });
}

async function write(root: string, path: string, content: string) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

async function snapshot(root: string): Promise<string> {
  const hash = createHash("sha256");
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    hash.update(entry.name);
    if (entry.isDirectory()) hash.update(await snapshot(join(root, entry.name)));
    else if (entry.isFile()) hash.update(await readFile(join(root, entry.name)));
  }
  return hash.digest("hex");
}

test("CLI starts a complete workflow without choosing a role and preserves optional focuses without side effects", async (t) => {
  const root = await temporaryApp(t);
  const help = run([], root);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /init <nom>/);
  assert.match(help.stdout, /migrate --app-dir/);
  for (const role of [undefined, "full-cycle", "data-analyst", "analytics-engineer", "data-engineer"]) {
    const result = run(["prompt", ...(role ? ["--role", role] : []), "--idea", "Suivi commandes $(touch unexpected) `touch unexpected`", "--json"], root);
    assert.equal(result.status, 0, result.stderr);
    const prompt = JSON.parse(result.stdout);
    assert.equal(prompt.role, role ?? "full-cycle");
    assert.equal(prompt.readOnly, true);
    assert.match(prompt.prompt, /create-analytics-dbx-app/);
    assert.match(prompt.prompt, /sans la réinitialiser/);
    assert.match(prompt.prompt, /chargement\/vide\/erreur/);
    assert.match(prompt.prompt, /\$\(touch unexpected\)/);
    assert.match(prompt.prompt, /lecture directe/);
    assert.match(prompt.prompt, /données réelles/);
  }
  for (const command of ["init", "guide", "data", "feature", "dev", "check", "next", "doctor", "skills", "capabilities", "migrate", "prompt"]) {
    assert.equal(run([command, "--help"], root).status, 0);
  }
  assert.deepEqual(await readdir(root), []);
});

test("CLI rejects unknown commands and incomplete options before any action", async (t) => {
  const root = await temporaryApp(t);
  for (const args of [["deploy"], ["toString"], ["prompt", "--role", "unknown"], ["prompt", "--role"], ["migrate"], ["migrate", "--app-dir"]]) {
    const result = run(args, root);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.length);
  }
  assert.deepEqual(await readdir(root), []);
});

test("CLI delegates literal arguments to existing commands and preserves their failure status", async (t) => {
  const root = await temporaryApp(t);
  await write(root, "scripts/new-feature.mjs", "process.stdout.write(JSON.stringify(process.argv.slice(2))); process.exitCode = 7;\n");
  const args = ["sales", "--title", "Ventes $(touch unexpected)", "--demo-value", "0"];
  const result = run(["feature", ...args], root);
  assert.equal(result.status, 7);
  assert.deepEqual(JSON.parse(result.stdout), args);
  assert.deepEqual(await readdir(root), ["scripts"]);
});

async function oldApp(t: TestContext, version: string) {
  const root = await temporaryApp(t);
  const manifest = parse(await readFile("template/manifest.yml", "utf8"));
  await write(root, "package.json", JSON.stringify({ name: "analytics_dbx_app_orders", scripts: { preinstall: "touch unexpected" }, dependencies: { next: "16.0.0" } }));
  await write(root, ".valiuz-template.yml", stringify({ schemaVersion: 1, template: { id: manifest.template.id, repository: manifest.template.repository, version }, capabilities: [], appliedUpgrades: [] }));
  // An old app has no knowledge of 2.0. The target checkout supplies the guides.
  await write(root, "template/manifest.yml", stringify({ ...manifest, template: { ...manifest.template, currentVersion: version }, upgrades: [] }));
  await write(root, "src/app/orders/[id]/page.tsx", 'import Link from "next/link";\nexport default async function Page() { return null; }\n');
  await write(root, "src/app/layout.tsx", 'import { headers } from "next/headers";\n');
  await write(root, "src/app/api/orders/route.ts", 'import { NextResponse } from "next/server";\n');
  await write(root, "src/features/orders/actions.ts", '"use server";\nexport async function save() {}\n');
  await write(root, "src/features/orders/client.tsx", '"use client";\nconst label = process.env.NEXT_PUBLIC_LABEL;\n');
  await write(root, "pages/legacy.tsx", 'export default function Page() { return null; }\n');
  await write(root, "src/middleware.ts", 'import { NextRequest } from "next/server";\n');
  await write(root, "next.config.mjs", 'export default {};\n');
  await write(root, ".env.example", 'NEXT_PUBLIC_TITLE=EXAMPLE_VALUE_NEVER_PRINTED\nDATABRICKS_TOKEN=PRIVATE_VALUE_NEVER_PRINTED\n');
  await write(root, ".env.local", 'NEXT_PUBLIC_PRIVATE_LOCAL=LOCAL_VALUE_NEVER_PRINTED\n');
  await write(root, "node_modules/excluded.ts", 'import "next/ignored";\n');
  return root;
}

test("migration inventories 1.4 and 1.5 apps and orders target guides without mutating or executing the app", async (t) => {
  for (const version of ["1.4.0", "1.5.0"]) {
    const root = await oldApp(t, version);
    const before = await snapshot(root);
    const result = run(["migrate", "--app-dir", root, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.readOnly, true);
    assert.equal(plan.app.from, version);
    assert.equal(plan.app.versionEvidence, "declared-not-verified");
    assert.equal(plan.verification.status, "not-run");
    assert.deepEqual(plan.upgrades.map((step: { id: string }) => step.id), version === "1.4.0" ? ["1.4.0-to-1.5.0", "1.5.0-to-2.0.0", "2.0.0-to-2.0.1"] : ["1.5.0-to-2.0.0", "2.0.0-to-2.0.1"]);
    assert.deepEqual(plan.inventory.pages, ["src/app/orders/[id]/page.tsx"]);
    assert.deepEqual(plan.inventory.apiHandlers, ["src/app/api/orders/route.ts"]);
    assert.deepEqual(plan.inventory.pagesRouter, ["pages/legacy.tsx"]);
    assert.ok(plan.inventory.serverCandidates.includes("src/features/orders/actions.ts"));
    assert.ok(plan.inventory.configuration.includes("src/middleware.ts"));
    assert.deepEqual(plan.inventory.publicEnvironmentNames, ["NEXT_PUBLIC_LABEL", "NEXT_PUBLIC_TITLE"]);
    assert.doesNotMatch(result.stdout, /VALUE_NEVER_PRINTED|NEXT_PUBLIC_PRIVATE_LOCAL|next\/ignored/);
    assert.equal(await snapshot(root), before);
  }
});

test("migration refuses conflicting, unknown or absent versions instead of guessing or downgrading", async (t) => {
  const root = await oldApp(t, "1.4.0");
  for (const args of [["--from", "1.5.0"], ["--to", "9.0.0"], ["--to", "1.3.0"]]) {
    assert.equal(run(["migrate", "--app-dir", root, ...args]).status, 1);
  }
  await rm(join(root, ".valiuz-template.yml"));
  const unknown = run(["migrate", "--app-dir", root]);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Version non suivie/);
  assert.equal(run(["migrate", "--app-dir", root, "--from", "__proto__", "--to", "__proto__"]).status, 1);
  const explicit = run(["migrate", "--app-dir", root, "--from", "1.4.0", "--json"]);
  assert.equal(explicit.status, 0, explicit.stderr);
  assert.equal(JSON.parse(explicit.stdout).app.versionEvidence, "provided-not-verified");
});

test("migration skips symlinked sources and environment examples", async (t) => {
  const root = await oldApp(t, "1.5.0");
  const external = await temporaryApp(t);
  await write(external, "secret.ts", 'import "next/outside"; const label = process.env.NEXT_PUBLIC_EXTERNAL;\n');
  await symlink(external, join(root, "src/external"), "dir");
  await rm(join(root, ".env.example"));
  await symlink(join(root, ".env.local"), join(root, ".env.example"));
  const result = run(["migrate", "--app-dir", root, "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /NEXT_PUBLIC_PRIVATE_LOCAL|NEXT_PUBLIC_EXTERNAL|next\/outside/);
});
