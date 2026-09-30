import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { parse } from "yaml";

test("declares the historical baselines and the current 2.0.1 template", async () => {
  const manifest = parse(await readFile("template/manifest.yml", "utf8"));
  assert.equal(manifest.template.currentVersion, "2.0.1");
  assert.equal(manifest.versions["1.0.0"].sourceCommit, "05d914c6863c92304b1bc662e40c17e0f97b2c29");
  assert.equal(manifest.versions["1.1.0"].sourceCommit, "5df063bd0dc7b3664f1bf2cbe624119ddf5568ac");
  assert.equal(manifest.versions["1.1.0"].extends, "1.0.0");
  assert.equal(manifest.versions["1.2.0"].sourceCommit, "a1ed6bc333c8b8355641b17f74fe3ed0fb200815");
  assert.equal(manifest.versions["1.2.0"].extends, "1.1.0");
  assert.deepEqual(manifest.versions["1.2.0"].capabilities, [
    "cost-aware-data-history",
    "feature-release-governance",
  ]);
  assert.equal(manifest.versions["1.3.0"].sourceCommit, "08058f189790546146dabec88a6a0897568b55e9");
  assert.equal(manifest.versions["1.3.0"].extends, "1.2.0");
  assert.deepEqual(manifest.versions["1.3.0"].capabilities, [
    "reusable-analytics-visualizations",
  ]);
  assert.equal(manifest.versions["1.4.0"].sourceCommit, "19ade7c5882aeb3065453e0aaf3c02552a61fd6c");
  assert.equal(manifest.versions["1.4.0"].extends, "1.3.0");
  assert.deepEqual(manifest.versions["1.4.0"].capabilities, [
    "genie-natural-language-analytics",
  ]);

  assert.equal(manifest.versions["1.5.0"].sourceCommit, "26a1d0a64a9fed4d0a9cad1c7031a9d2c07eb95f");
  assert.equal(manifest.versions["1.5.0"].extends, "1.4.0");
  assert.deepEqual(manifest.versions["1.5.0"].capabilities, ["personal-user-state"]);
  assert.equal(manifest.versions["2.0.0"].sourceCommit, "8b779bcb363a7c57bdea12342964601d0acdfef4");
  assert.equal(manifest.versions["2.0.0"].extends, "1.5.0");
  assert.deepEqual(manifest.versions["2.0.0"].capabilities, ["appkit-native-runtime", "upstream-compatibility", "guided-appkit-capabilities", "period-comparison", "appkit-genie-integration", "comparison-sharing"]);
  assert.equal(manifest.versions["2.0.1"].sourceCommit, "ba98c16999674181c76a65a5efd5a4e7bdf7cd7e");
  assert.equal(manifest.versions["2.0.1"].extends, "2.0.0");
  assert.deepEqual(manifest.versions["2.0.1"].capabilities, []);
  assert.ok(manifest.capabilities["guided-appkit-capabilities"].probes.some(
    (probe: { type: string; name?: string }) => probe.type === "packageScript" && probe.name === "app:orchestrate",
  ));
  assert.ok(manifest.capabilities["guided-appkit-capabilities"].probes.some(
    (probe: { type: string; name?: string }) => probe.type === "packageScript" && probe.name === "app",
  ));
  assert.ok(manifest.capabilities["guided-appkit-capabilities"].probes.some(
    (probe: { type: string; path?: string }) => probe.type === "file" && probe.path === ".agents/skills/create-analytics-dbx-app/references/analytics-workflow.md",
  ));

  const genieProbes = JSON.stringify(manifest.capabilities["genie-natural-language-analytics"].probes);
  assert.match(genieProbes, /validateGenieEnvironmentReferences/);
  assert.doesNotMatch(genieProbes, /DATABRICKS_GENIE_SPACE_ID_FRAIM_SALES/);
});

test("verifies the source capabilities and exposes the latest upgrade by default", () => {
  const status = JSON.parse(execFileSync(process.execPath, ["scripts/template-status.mjs", "--json"], { encoding: "utf8" }));
  assert.notEqual(status.instance.kind, "legacy");
  assert.equal(status.instance.effectiveVersion, "2.0.1");
  assert.equal(status.capabilities.every((capability: { ok: boolean }) => capability.ok), true);

  const upgrade = JSON.parse(execFileSync(
    process.execPath,
    ["scripts/template-status.mjs", "--diff", "--json"],
    { encoding: "utf8" },
  ));
  assert.deepEqual(
    upgrade.changes.map((change: { id: string }) => change.id),
    [
      "confirmed-empty-sql-results",
    ],
  );
  assert.deepEqual(upgrade.validation, [
    "npm run template:status",
    "npm run template:check -- --to 2.0.1",
    "npm run template:release:check -- --base origin/main",
    "npm run app:doctor",
    "npm run check",
    "npm run test:e2e",
    "npm run bundle:compatibility",
  ]);
});

test("rejects manifest paths that leave the application root", async () => {
  const root = await mkdtemp(join(tmpdir(), "template-manifest-invalid-"));
  for (const file of [
    "scripts/template-manifest.mjs",
    "scripts/template-status.mjs",
    "template/manifest.yml",
  ]) {
    const destination = join(root, file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(file, destination);
  }
  const manifestPath = join(root, "template/manifest.yml");
  const manifest = await readFile(manifestPath, "utf8");
  await writeFile(manifestPath, manifest.replace(
    "template/upgrades/1.0.0-to-1.1.0.yml",
    "../outside.yml",
  ), "utf8");
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture" }), "utf8");
  await symlink(join(process.cwd(), "node_modules"), join(root, "node_modules"), "dir");

  const command = spawnSync(process.execPath, ["scripts/template-status.mjs", "--check"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(command.status, 1);
  assert.match(command.stderr, /Paths must stay inside the application root/);
});

test("reports a tracked 1.0.0 app and rejects missing 1.1.0 capabilities", async () => {
  const root = await mkdtemp(join(tmpdir(), "template-version-baseline-"));
  for (const file of ["scripts/template-manifest.mjs", "scripts/template-status.mjs", "template/manifest.yml"]) {
    const destination = join(root, file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(file, destination);
  }
  for (const file of [
    "scripts/init-app.mjs",
    "scripts/app-guide.mjs",
    "scripts/new-feature.mjs",
    "config/data-access.json",
    "scripts/data-access.mjs",
    "resources/data-access.generated.yml",
    "data/databricks.yml",
    "scripts/init-data.mjs",
    "scripts/data-preparation.mjs",
    "src/components/app-shell/app-shell.tsx",
    "public/valiuz-logo-icon.svg",
    "public/favicon.svg",
    "app.yaml",
    "databricks.yml",
    "scripts/deploy.mjs",
  ]) {
    const destination = join(root, file);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, "", "utf8");
  }
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "baseline-app", scripts: {} }), "utf8");
  await writeFile(
    join(root, ".valiuz-template.yml"),
    [
      "schemaVersion: 1",
      "template:",
      "  id: valiuz/analytics_dbx_app_template",
      "  repository: https://github.com/valiuz/analytics_dbx_app_template",
      "  version: 1.0.0",
      "capabilities:",
      "  - guided-app-workflow",
      "  - declared-data-access",
      "  - optional-data-preparation",
      "  - valiuz-app-shell",
      "  - databricks-app-bundle",
      "appliedUpgrades: []",
      "",
    ].join("\n"),
    "utf8",
  );
  await symlink(join(process.cwd(), "node_modules"), join(root, "node_modules"), "dir");

  const status = JSON.parse(execFileSync(process.execPath, ["scripts/template-status.mjs", "--json"], {
    cwd: root,
    encoding: "utf8",
  }));
  assert.equal(status.instance.kind, "tracked");
  assert.equal(status.instance.version, "1.0.0");
  assert.equal(status.instance.behind, true);
  assert.deepEqual(status.upgrade, {
    from: "1.0.0",
    to: "1.1.0",
    path: "template/upgrades/1.0.0-to-1.1.0.yml",
  });

  const target = spawnSync(
    process.execPath,
    ["scripts/template-status.mjs", "--check", "--to", "1.1.0"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(target.status, 1);
  assert.match(target.stderr, /3 template capability check\(s\) failed/);
});

test("offers sequential upgrades to a tracked 1.1.0 app", async () => {
  const root = await mkdtemp(join(tmpdir(), "template-version-1-1-"));
  for (const file of [
    "scripts/template-manifest.mjs",
    "scripts/template-status.mjs",
    "template/manifest.yml",
    "template/upgrades/1.1.0-to-1.2.0.yml",
    "template/upgrades/1.2.0-to-1.3.0.yml",
    "template/upgrades/1.3.0-to-1.4.0.yml",
  ]) {
    const destination = join(root, file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(file, destination);
  }
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "tracked-app", scripts: {} }), "utf8");
  await writeFile(
    join(root, ".valiuz-template.yml"),
    [
      "schemaVersion: 1",
      "template:",
      "  id: valiuz/analytics_dbx_app_template",
      "  repository: https://github.com/valiuz/analytics_dbx_app_template",
      "  version: 1.1.0",
      "capabilities:",
      "  - guided-app-workflow",
      "  - declared-data-access",
      "  - optional-data-preparation",
      "  - valiuz-app-shell",
      "  - databricks-app-bundle",
      "  - databricks-deployment-compatibility",
      "  - clean-template-consumer-journey",
      "  - template-version-tracking",
      "appliedUpgrades:",
      "  - 1.0.0-to-1.1.0",
      "",
    ].join("\n"),
    "utf8",
  );
  await symlink(join(process.cwd(), "node_modules"), join(root, "node_modules"), "dir");

  const status = JSON.parse(execFileSync(process.execPath, ["scripts/template-status.mjs", "--json"], {
    cwd: root,
    encoding: "utf8",
  }));
  assert.equal(status.instance.version, "1.1.0");
  assert.equal(status.instance.behind, true);
  assert.deepEqual(status.upgrade, {
    from: "1.1.0",
    to: "1.2.0",
    path: "template/upgrades/1.1.0-to-1.2.0.yml",
  });

  await writeFile(
    join(root, ".valiuz-template.yml"),
    [
      "schemaVersion: 1",
      "template:",
      "  id: valiuz/analytics_dbx_app_template",
      "  repository: https://github.com/valiuz/analytics_dbx_app_template",
      "  version: 1.2.0",
      "capabilities:",
      "  - guided-app-workflow",
      "  - declared-data-access",
      "  - optional-data-preparation",
      "  - valiuz-app-shell",
      "  - databricks-app-bundle",
      "  - databricks-deployment-compatibility",
      "  - clean-template-consumer-journey",
      "  - template-version-tracking",
      "  - cost-aware-data-history",
      "  - feature-release-governance",
      "appliedUpgrades:",
      "  - 1.0.0-to-1.1.0",
      "  - 1.1.0-to-1.2.0",
      "",
    ].join("\n"),
    "utf8",
  );
  const nextStatus = JSON.parse(execFileSync(process.execPath, ["scripts/template-status.mjs", "--json"], {
    cwd: root,
    encoding: "utf8",
  }));
  assert.equal(nextStatus.instance.version, "1.2.0");
  assert.deepEqual(nextStatus.upgrade, {
    from: "1.2.0",
    to: "1.3.0",
    path: "template/upgrades/1.2.0-to-1.3.0.yml",
  });

  await writeFile(
    join(root, ".valiuz-template.yml"),
    [
      "schemaVersion: 1",
      "template:",
      "  id: valiuz/analytics_dbx_app_template",
      "  repository: https://github.com/valiuz/analytics_dbx_app_template",
      "  version: 1.3.0",
      "capabilities:",
      "  - guided-app-workflow",
      "  - declared-data-access",
      "  - optional-data-preparation",
      "  - valiuz-app-shell",
      "  - databricks-app-bundle",
      "  - databricks-deployment-compatibility",
      "  - clean-template-consumer-journey",
      "  - template-version-tracking",
      "  - cost-aware-data-history",
      "  - feature-release-governance",
      "  - reusable-analytics-visualizations",
      "appliedUpgrades:",
      "  - 1.0.0-to-1.1.0",
      "  - 1.1.0-to-1.2.0",
      "  - 1.2.0-to-1.3.0",
      "",
    ].join("\n"),
    "utf8",
  );
  const latestStatus = JSON.parse(execFileSync(process.execPath, ["scripts/template-status.mjs", "--json"], {
    cwd: root,
    encoding: "utf8",
  }));
  assert.equal(latestStatus.instance.version, "1.3.0");
  assert.deepEqual(latestStatus.upgrade, {
    from: "1.3.0",
    to: "1.4.0",
    path: "template/upgrades/1.3.0-to-1.4.0.yml",
  });

  const latestDiff = JSON.parse(execFileSync(
    process.execPath,
    ["scripts/template-status.mjs", "--diff", "--json"],
    { cwd: root, encoding: "utf8" },
  ));
  assert.equal(latestDiff.id, "1.3.0-to-1.4.0");
});
