import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { parse } from "yaml";
import ts from "typescript";

const fixtureFiles = [
  "config/data-projects.json",
  "scripts/app-guide.mjs",
  "scripts/app.mjs",
  "scripts/app-spec.mjs",
  "scripts/app-capabilities.mjs",
  "config/appkit-capabilities.json",
  "scripts/data-access.mjs",
  "scripts/new-feature.mjs",
  "scripts/feature-comparison-template.mjs",
  "src/components/app-shell/app-nav.tsx",
  "src/client/routes.tsx",
  "src/server/routes.ts",
];

async function prepareFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "app-guidance-"));
  for (const file of fixtureFiles) {
    const destination = join(root, file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(file, destination);
  }
  await mkdir(join(root, "config"), { recursive: true });
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(
    join(root, "config/app-spec.yml"),
    "version: 1\napp:\n  name: __PACKAGE_NAME__\n  type: dashboard\n  audience: À confirmer\n  decision: À confirmer\n  success: À confirmer\nfeatures: []\n",
    "utf8",
  );
  await writeFile(
    join(root, "docs/product-brief.md"),
    "# Brief produit\n\n## Objectif et utilisateurs\n\n- Type : dashboard\n- Utilisateurs : À confirmer\n- Décision à faciliter : À confirmer\n- Critère de succès : À confirmer\n\n## KPI, sources et fonctionnalités\n\nÀ confirmer avec la première tranche verticale.\n\n## Accès, confidentialité et exploitation\n\nÀ confirmer avant le premier accès à des données réelles.\n\n## Backlog\n\nConstruire et faire valider une tranche à la fois.\n",
    "utf8",
  );
  await writeFile(
    join(root, "config/data-access.json"),
    JSON.stringify({
      project: "dev-dtm-media-pm",
      sources: [
        {
          name: "sales-source",
          fullName: "dev-dtm-media-pm.analytics.sales_daily",
          purpose: "Daily sales dashboard",
        },
      ],
    }),
    "utf8",
  );
  await symlink(join(process.cwd(), "node_modules"), join(root, "node_modules"), "dir");
  return root;
}

test("app guide rejects an unsupported app type", async () => {
  const root = await prepareFixture();
  const result = spawnSync(
    process.execPath,
    ["scripts/app-guide.mjs", "--non-interactive", "--type", "portal"],
    { cwd: root, encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /App type/);
});

test("comparison generation is opt-in, preserves metadata and rejects injected columns before writing", async () => {
  const root = await prepareFixture();
  const args = ["scripts/new-feature.mjs", "sales-comparison", "--non-interactive", "--source", "sales-source", "--aggregation", "sum", "--column", "amount", "--date-column", "order_date", "--breakdown-column", "channel"];
  const before = await readFile(join(root, "config/app-spec.yml"), "utf8");
  const rejected = spawnSync(process.execPath, [...args.slice(0, -1), "channel`); DROP TABLE sales;--"], { cwd: root, encoding: "utf8" });
  assert.notEqual(rejected.status, 0);
  assert.equal(await readFile(join(root, "config/app-spec.yml"), "utf8"), before);
  execFileSync(process.execPath, args, { cwd: root });
  execFileSync(process.execPath, ["scripts/app-guide.mjs", "--non-interactive"], { cwd: root });
  const spec = parse(await readFile(join(root, "config/app-spec.yml"), "utf8"));
  assert.deepEqual(spec.features[0].comparison, { dateColumn: "order_date", breakdownColumn: "channel" });
  assert.match(await readFile(join(root, "docs/product-brief.md"), "utf8"), /colonne DATE `order_date`/);
  const query = await readFile(join(root, "src/features/sales-comparison/server/queries.ts"), "utf8");
  assert.equal((query.match(/IDENTIFIER\(:source\)/g) ?? []).length, 2);
  for (const marker of ["currentStart", "currentEnd", "referenceStart", "referenceEnd"]) {
    assert.ok(query.includes(`CAST(:${marker} AS DATE)`));
  }
  assert.match(query, /LIMIT 1001/);
  const card = await readFile(join(root, "src/features/sales-comparison/sales-comparison-card.tsx"), "utf8");
  assert.match(card, /showWaterfall=\{true\}/);
  assert.doesNotMatch(card, /sharing=/);
});

test("comparison sharing requires an explicit choice and keeps that choice through the guide", async () => {
  for (const allowSegment of [false, true]) {
    const root = await prepareFixture();
    const slug = allowSegment ? "shared-segment" : "shared-periods";
    execFileSync(process.execPath, ["scripts/new-feature.mjs", slug, "--non-interactive", "--source", "sales-source",
      "--date-column", "order_date", "--share-analysis", ...(allowSegment ? ["--breakdown-column", "channel", "--share-segment"] : [])], { cwd: root });
    execFileSync(process.execPath, ["scripts/app-guide.mjs", "--non-interactive"], { cwd: root });
    execFileSync(process.execPath, ["scripts/app-guide.mjs", "--check"], { cwd: root });
    const spec = parse(await readFile(join(root, "config/app-spec.yml"), "utf8"));
    assert.deepEqual(spec.features[0].comparison, { dateColumn: "order_date",
      ...(allowSegment ? { breakdownColumn: "channel" } : {}), sharing: { allowSegment } });
    const card = await readFile(join(root, `src/features/${slug}/${slug}-card.tsx`), "utf8");
    assert.ok(card.includes(`sharing={{ key: "${slug}", allowSegment: ${allowSegment} }}`));
    const brief = await readFile(join(root, "docs/product-brief.md"), "utf8");
    assert.match(brief, /Les liens ne modifient pas les droits d’accès/);
    assert.ok(brief.includes(allowSegment ? "segment de `channel`" : "partage des sélections filtrées désactivé"));
    // The option belongs to this feature; it must not enable sharing in later simple KPIs.
    execFileSync(process.execPath, ["scripts/new-feature.mjs", "plain-kpi", "--non-interactive", "--source", "sales-source"], { cwd: root });
    const updated = parse(await readFile(join(root, "config/app-spec.yml"), "utf8"));
    assert.equal(updated.features[1].comparison, undefined);
    assert.doesNotMatch(await readFile(join(root, "src/features/plain-kpi/plain-kpi-card.tsx"), "utf8"), /sharing=/);
  }
});

test("invalid sharing flags fail before creating files or changing existing configuration", async () => {
  const root = await prepareFixture();
  const paths = ["config/app-spec.yml", "docs/product-brief.md", "src/components/app-shell/app-nav.tsx", "src/client/routes.tsx", "src/server/routes.ts"];
  const before = await Promise.all(paths.map((path) => readFile(join(root, path), "utf8")));
  const invalid = [
    ["--share-analysis"],
    ["--share-segment"],
    ["--date-column", "order_date", "--share-segment"],
    ["--date-column", "order_date", "--breakdown-column", "channel", "--share-segment"],
    ["--date-column", "order_date", "--share-analysis", "--share-segment"],
    ["--date-column", "order_date", "--share-analysis", "false"],
  ];
  for (const flags of invalid) {
    const result = spawnSync(process.execPath, ["scripts/new-feature.mjs", "invalid-sharing", "--non-interactive", "--source", "sales-source", ...flags], { cwd: root, encoding: "utf8" });
    assert.notEqual(result.status, 0, flags.join(" "));
    assert.match(result.stderr, /requires|Unknown option/);
    assert.deepEqual(await Promise.all(paths.map((path) => readFile(join(root, path), "utf8"))), before);
    await assert.rejects(readFile(join(root, "src/features/invalid-sharing/invalid-sharing-card.tsx")), { code: "ENOENT" });
  }
});

test("the specification rejects ambiguous or unsupported sharing metadata", async () => {
  const root = await prepareFixture();
  execFileSync(process.execPath, ["scripts/new-feature.mjs", "shared-periods", "--non-interactive", "--source", "sales-source", "--date-column", "order_date", "--share-analysis"], { cwd: root });
  const valid = parse(await readFile(join(root, "config/app-spec.yml"), "utf8"));
  const brief = await readFile(join(root, "docs/product-brief.md"), "utf8");
  for (const sharing of [null, [], {}, { allowSegment: "true" }, { allowSegment: false, arbitrary: true }, { allowSegment: true }]) {
    const invalid = structuredClone(valid);
    invalid.features[0].comparison.sharing = sharing;
    const serialized = JSON.stringify(invalid);
    await writeFile(join(root, "config/app-spec.yml"), serialized);
    const result = spawnSync(process.execPath, ["scripts/app-guide.mjs", "--non-interactive"], { cwd: root, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /sharing/);
    assert.equal(await readFile(join(root, "config/app-spec.yml"), "utf8"), serialized);
    assert.equal(await readFile(join(root, "docs/product-brief.md"), "utf8"), brief);
  }
});

test("sharing keys accept existing digit-prefixed slugs and bound only opted-in feature names", async () => {
  const root = await prepareFixture();
  const longSlug = "s".repeat(65);
  const args = ["scripts/new-feature.mjs", longSlug, "--non-interactive", "--source", "sales-source", "--date-column", "order_date"];
  const rejected = spawnSync(process.execPath, [...args, "--share-analysis"], { cwd: root, encoding: "utf8" });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /at most 64/);
  assert.deepEqual(parse(await readFile(join(root, "config/app-spec.yml"), "utf8")).features, []);
  execFileSync(process.execPath, args, { cwd: root });
  const longSpec = parse(await readFile(join(root, "config/app-spec.yml"), "utf8"));
  longSpec.features[0].comparison.sharing = { allowSegment: false };
  await writeFile(join(root, "config/app-spec.yml"), JSON.stringify(longSpec));
  const invalidSpec = spawnSync(process.execPath, ["scripts/app-guide.mjs", "--check"], { cwd: root, encoding: "utf8" });
  assert.notEqual(invalidSpec.status, 0);
  assert.match(invalidSpec.stderr, /at most 64/);
  delete longSpec.features[0].comparison.sharing;
  await writeFile(join(root, "config/app-spec.yml"), JSON.stringify(longSpec));
  execFileSync(process.execPath, ["scripts/new-feature.mjs", "2026-sales", "--non-interactive", "--source", "sales-source", "--date-column", "order_date", "--share-analysis"], { cwd: root });
  const card = await readFile(join(root, "src/features/2026-sales/2026-sales-card.tsx"), "utf8");
  assert.match(card, /key: "2026-sales"/);
  for (const file of ["src/features/2026-sales/2026-sales-card.tsx", "src/features/2026-sales/server/queries.ts", "src/client/routes.tsx", "src/server/routes.ts"]) {
    const result = ts.transpileModule(await readFile(join(root, file), "utf8"), {
      fileName: file, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true,
    });
    assert.deepEqual(result.diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error), [], file);
  }
});

test("CLI feature help exposes the sharing dependencies and review requirement without writes", async () => {
  const root = await prepareFixture();
  const before = await readFile(join(root, "config/app-spec.yml"), "utf8");
  const help = execFileSync(process.execPath, ["scripts/app.mjs", "feature", "--help"], { cwd: root, encoding: "utf8" });
  assert.match(help, /--share-analysis/);
  assert.match(help, /--share-segment/);
  assert.match(help, /dimension revue/);
  assert.equal(await readFile(join(root, "config/app-spec.yml"), "utf8"), before);
});

test("app guide and feature generator create one complete vertical slice", async () => {
  const root = await prepareFixture();
  execFileSync(
    process.execPath,
    [
      "scripts/app-guide.mjs",
      "--non-interactive",
      "--type", "cockpit",
      "--capabilities", "genie",
      "--audience", "Responsable commercial",
      "--decision", "Suivre les ventes",
      "--success", "Le KPI est revu chaque semaine",
    ],
    { cwd: root },
  );
  execFileSync(
    process.execPath,
    [
      "scripts/new-feature.mjs",
      "daily-sales",
      "--non-interactive",
      "--title", "Ventes quotidiennes",
      "--question", "Quel chiffre suivre aujourd’hui ?",
      "--source", "sales-source",
      "--aggregation", "sum",
      "--column", "revenue",
      "--label", "Chiffre d’affaires",
      "--unit", "EUR",
      "--demo-value", "1200",
      "--acceptance", "La valeur correspond au contrôle métier quotidien.",
    ],
    { cwd: root },
  );

  const spec = await readFile(join(root, "config/app-spec.yml"), "utf8");
  const query = await readFile(join(root, "src/features/daily-sales/server/queries.ts"), "utf8");
  const repository = await readFile(join(root, "src/features/daily-sales/server/repository.ts"), "utf8");
  const navigation = await readFile(join(root, "src/components/app-shell/app-nav.tsx"), "utf8");
  assert.match(spec, /slug: daily-sales/);
  assert.deepEqual(parse(spec).capabilities, ["genie", "analytics"]);
  assert.match(query, /SUM\(`revenue`\)/);
  assert.match(repository, /parameters: \{ source: quoteQualifiedIdentifier\(source\) \}/);
  assert.match(
    await readFile(join(root, "tests/daily-sales.test.ts"), "utf8"),
    /`dev-dtm-media-pm`\.`analytics`\.`sales_daily`/,
  );
  assert.match(navigation, /Ventes quotidiennes/);
  assert.match(await readFile(join(root, "tests/daily-sales.test.ts"), "utf8"), /deterministic demo value/);
  const removeAnalytics = spawnSync(process.execPath, ["scripts/app-guide.mjs", "--non-interactive", "--capabilities", "genie"], { cwd: root, encoding: "utf8" });
  assert.notEqual(removeAnalytics.status, 0);
  assert.match(removeAnalytics.stderr, /Existing KPI features require the analytics capability/);
  assert.equal(await readFile(join(root, "config/app-spec.yml"), "utf8"), spec);
});

test("a Genie-only app keeps its capabilities across guide runs without changing runtime resources", async () => {
  const root = await prepareFixture();
  const before = await readFile(join(root, "config/data-access.json"), "utf8");
  const run = (args: string[]) => execFileSync(process.execPath, ["scripts/app-guide.mjs", "--non-interactive", ...args], { cwd: root, encoding: "utf8" });
  const output = run(["--type", "assistant", "--capabilities", "genie"]);
  assert.doesNotMatch(output, /feature:new/);
  run(["--audience", "Équipe commerciale"]);
  const plan = JSON.parse(execFileSync(process.execPath, ["scripts/app-capabilities.mjs", "--json"], { cwd: root, encoding: "utf8" }));
  assert.deepEqual(plan.capabilities.map((item: { id: string }) => item.id), ["genie"]);
  assert.equal(plan.activatesPlugins, false);
  assert.equal(plan.capabilities[0].availability, "integrated");
  assert.equal(await readFile(join(root, "config/data-access.json"), "utf8"), before);
  const brief = await readFile(join(root, "docs/product-brief.md"), "utf8");
  assert.match(brief, /\*\*genie\*\*/);
  assert.match(brief, /Équipe commerciale/);
  execFileSync(process.execPath, ["scripts/app-guide.mjs", "--check"], { cwd: root });
});

test("invalid capability choices fail before changing the spec or brief", async () => {
  const root = await prepareFixture();
  const paths = ["config/app-spec.yml", "docs/product-brief.md"];
  const before = await Promise.all(paths.map((file) => readFile(join(root, file), "utf8")));
  for (const choice of ["unknown", "genie,genie", "analytics,,files", "analytics;echo secret"]) {
    const result = spawnSync(process.execPath, ["scripts/app-guide.mjs", "--non-interactive", "--capabilities", choice], { cwd: root, encoding: "utf8" });
    assert.notEqual(result.status, 0);
  }
  assert.deepEqual(await Promise.all(paths.map((file) => readFile(join(root, file), "utf8"))), before);
});

test("optional and beta capabilities produce a proposal and never generate a runtime plugin", async () => {
  const root = await prepareFixture();
  const before = await readFile(join(root, "src/server/routes.ts"), "utf8");
  execFileSync(process.execPath, ["scripts/app-guide.mjs", "--non-interactive", "--type", "workflow", "--capabilities", "files,serving,agents"], { cwd: root });
  const plan = JSON.parse(execFileSync(process.execPath, ["scripts/app-capabilities.mjs", "--json"], { cwd: root, encoding: "utf8" }));
  assert.equal(plan.activatesPlugins, false);
  assert.equal(plan.capabilities.every((item: { availability: string }) => item.availability === "optional"), true);
  assert.equal(plan.capabilities.find((item: { id: string }) => item.id === "agents").stability, "beta");
  assert.equal(await readFile(join(root, "src/server/routes.ts"), "utf8"), before);
  assert.match(await readFile(join(root, "docs/product-brief.md"), "utf8"), /décision explicite requise/);
});
