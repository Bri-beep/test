#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parse, stringify } from "yaml";
import { findRepositoryRoot } from "./repository-fixture";

// This is a disposable acceptance fixture, never an in-place migration tool.
const baselines = [
  { version: "1.4.0", revision: "26a1d0a64a9fed4d0a9cad1c7031a9d2c07eb95f" },
  { version: "1.5.0", revision: "8b779bcb363a7c57bdea12342964601d0acdfef4" },
];
const root = await findRepositoryRoot();
const environment = { ...process.env, APP_MODE: "demo", CI: "true" };
for (const key of Object.keys(environment)) {
  if (key.startsWith("DATABRICKS_") || key.startsWith("USER_STATE_") || key === "GIT_INDEX_FILE") delete environment[key as keyof typeof environment];
}
async function migrateFixture(baseline: { version: string; revision: string }) {
  const fixture = await mkdtemp(join(tmpdir(), `valiuz-${baseline.version}-migration-`));
  function run(command: string, args: string[]) {
    process.stdout.write(`> ${command} ${args.join(" ")}\n`);
    return execFileSync(command, args, { cwd: fixture, env: environment, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  }
  async function copyCurrent(file: string) {
    await mkdir(dirname(join(fixture, file)), { recursive: true });
    await cp(join(root, file), join(fixture, file));
  }
  try {
    const archive = execFileSync("git", ["archive", baseline.revision], { cwd: root, maxBuffer: 32 * 1024 * 1024 });
    execFileSync("tar", ["-x", "-C", fixture], { input: archive });
    run("git", ["init", "--quiet"]);
    run("git", ["add", "."]);
    await symlink(join(root, "node_modules"), join(fixture, "node_modules"), "dir");
    run(process.execPath, ["scripts/init-app.mjs", "migration-app", "--non-interactive", "--data-project", "dev-dtm-operating",
      "--schema", "analytics", "--support-name", "Équipe Métier", "--support-slack-url", "https://valiuz.slack.com/archives/business"]);
    run(process.execPath, ["scripts/init-data.mjs", "sales", "--mode", "direct", "--source", "dev-dtm-operating.analytics.sales", "--non-interactive"]);
    run(process.execPath, ["scripts/new-feature.mjs", "sales-kpi", "--source", "sales", "--aggregation", "sum", "--column", "amount", "--demo-value", "73", "--non-interactive"]);
    if (baseline.version === "1.5.0") run(process.execPath, ["scripts/init-user-state.mjs", "--schema", "migration_state"]);
    const oldState = parse(await readFile(join(fixture, ".valiuz-template.yml"), "utf8"));
    assert.equal(oldState.template.version, baseline.version);
    const plan = JSON.parse(run(process.execPath, [join(root, "scripts/app.mjs"), "migrate", "--app-dir", fixture, "--json"]));
    assert.equal(plan.readOnly, true);
    assert.equal(plan.app.from, baseline.version);
    assert.deepEqual(plan.upgrades.map((step: { id: string }) => step.id), baseline.version === "1.4.0"
      ? ["1.4.0-to-1.5.0", "1.5.0-to-2.0.0", "2.0.0-to-2.0.1"] : ["1.5.0-to-2.0.0", "2.0.0-to-2.0.1"]);
    assert.ok(plan.inventory.pages.includes("src/app/sales-kpi/page.tsx"));
    assert.ok(plan.inventory.apiHandlers.includes("src/app/api/sales-kpi/route.ts"));
    const preservedPaths = [
      "src/features/sales-kpi/server/queries.ts", "src/features/sales-kpi/server/repository.ts", "src/features/sales-kpi/server/service.ts",
      "config/data-access.json", "config/genie-spaces.json", "config/app-spec.yml", "app.yaml", ".env.example",
      "public/valiuz-logo-icon.svg", "public/favicon.svg",
    ];
    const before = await Promise.all(preservedPaths.map((file) => readFile(join(fixture, file), "utf8")));
    const customCss = "\n/* Business brand customization */\n.business-panel { border-radius: 19px; }\n";
    await writeFile(join(fixture, "src/app/globals.css"), (await readFile(join(fixture, "src/app/globals.css"), "utf8")) + customCss);
    const oldCss = await readFile(join(fixture, "src/app/globals.css"), "utf8");
    const tailwindPath = join(fixture, "tailwind.config.ts");
    const originalTailwind = await readFile(tailwindPath, "utf8");
    const originalContent = 'content: ["./src/**/*.{ts,tsx}"]';
    const customContent = 'content: ["./src/**/*.{ts,tsx}", "./business-widgets/**/*.{ts,tsx}"]';
    assert.ok(originalTailwind.includes(originalContent));
    const oldTailwind = originalTailwind.replace(originalContent, customContent)
      .replace("      colors: {", '      colors: {\n        "business-highlight": "#193b59",');
    assert.ok(oldTailwind.includes('"business-highlight": "#193b59"'));
    await writeFile(tailwindPath, oldTailwind);
    await mkdir(join(fixture, "business-widgets"));
    await writeFile(join(fixture, "business-widgets/panel.ts"), 'export const panelClass = "bg-business-highlight";\n');
    let oldNav = await readFile(join(fixture, "src/components/app-shell/app-nav.tsx"), "utf8");
    if (baseline.version === "1.4.0") {
      // Apply the optional 1.5 contracts before the runtime port. No personal table is declared or created.
      oldNav = oldNav.replace("export function AppNav() {", "export function AppNav({ personalStateEnabled = false }: { personalStateEnabled?: boolean }) {")
        .replace("  const pathname = usePathname();", '  const pathname = usePathname();\n  const navigation = personalStateEnabled ? [...links, { href: "/saved-analyses", label: "Mes analyses" }] : links;')
        .replace("{links.map(", "{navigation.map(");
      const optionalConfig = {
        ".env.example": "\n# Optional personal state stays disabled during migration.\nUSER_STATE_ENABLED=false\nUSER_STATE_ORIGIN=\nUSER_STATE_NAMESPACE=dev\n",
        "app.yaml": '  - name: USER_STATE_ENABLED\n    value: "false"\n  - name: USER_STATE_ORIGIN\n    value: ""\n  - name: USER_STATE_NAMESPACE\n    value: "dev"\n',
      };
      for (const [file, suffix] of Object.entries(optionalConfig)) {
        const index = preservedPaths.indexOf(file);
        // Existing configuration stays byte-identical; only the documented optional flags are appended.
        before[index] += suffix;
        await writeFile(join(fixture, file), before[index]);
      }
      oldState.capabilities.push("personal-user-state");
      oldState.appliedUpgrades.push("1.4.0-to-1.5.0");
    }
    // Apply template-owned files; business SQL gets only the explicit native binding port below.
    const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
    const templatePaths = /^(src\/(client|server|shared|lib)\/|src\/features\/(period-comparison|genie|readiness|user-state)\/|src\/components\/charts\/(waterfall-chart\.tsx|waterfall-model\.ts|time-series-chart\.tsx)$|src\/components\/data-visualization\/index\.ts$|scripts\/|template\/|tests\/|e2e\/|\.github\/|\.agents\/|docs\/|AGENTS\.md$|vite\.config\.ts$|index\.html$|tsconfig\.json$|eslint\.config\.mjs$|playwright\.config\.ts$|config\/appkit-(compatibility|capabilities)\.json$)/;
    for (const file of files.filter((file) => templatePaths.test(file))) {
      if (["docs/product-brief.md", ...preservedPaths].includes(file)) continue;
      await copyCurrent(file);
    }
    await copyCurrent("src/components/app-shell/app-header.tsx");
    await copyCurrent("src/components/app-shell/app-shell.tsx");
    // Merge this reviewed content entry only; the consuming app owns its Tailwind theme and other paths.
    const dialogContent = "./node_modules/@databricks/appkit-ui/dist/react/ui/dialog.js";
    const dialogContentEntry = `, "${dialogContent}"`;
    await writeFile(tailwindPath, oldTailwind.replace(customContent, `${customContent.slice(0, -1)}${dialogContentEntry}]`));
    // Remove remaining Next.js poison imports from older feature modules.
    for (const file of files.filter((file) => file.startsWith("src/features/") && file.endsWith(".ts"))) {
      const path = join(fixture, file);
      const text = await readFile(path, "utf8");
      await writeFile(path, text.replace('import "server-only";\n\n', ""));
    }
    // This fixture has one reviewed identifier parameter. Do not replace arbitrary SQL with a parser.
    const businessPorts = new Map<string, string>();
    const sqlPorts = [
      ["src/features/sales-kpi/server/queries.ts", "IDENTIFIER(?)", "IDENTIFIER(:source)"],
      ["src/features/sales-kpi/server/repository.ts", "parameters: [quoteQualifiedIdentifier(source)]", "parameters: { source: quoteQualifiedIdentifier(source) }"],
    ];
    for (const [file, previous, replacement] of sqlPorts) {
      const original = before[preservedPaths.indexOf(file)];
      assert.ok(original.includes(previous), `The ${baseline.version} fixture must exercise the old SQL contract`);
      const migrated = original.replace(previous, replacement);
      businessPorts.set(file, migrated);
      await writeFile(join(fixture, file), migrated);
    }
    const businessTestPath = join(fixture, "tests/sales-kpi.test.ts");
    const businessTest = await readFile(businessTestPath, "utf8");
    const sourceParameter = JSON.stringify("`dev-dtm-operating`.`analytics`.`sales`");
    const oldAssertion = `assert.deepEqual(options.parameters, [${sourceParameter}]);`;
    assert.ok(businessTest.includes(oldAssertion));
    await writeFile(businessTestPath, businessTest.replace(oldAssertion,
      `assert.deepEqual(options.parameters, { source: ${sourceParameter} });`) + `
test("migrated business endpoint serves its preserved demo through Express", async () => {
  const { GET } = await import("../src/server/routes/sales-kpi/route");
  const { requestHandler } = await import("./fixtures/http");
  const response = await requestHandler(GET, new Request("http://localhost/api/sales-kpi"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).value, 73);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.ok(response.headers.get("x-request-id"));
});
`);
    await writeFile(join(fixture, "src/client/globals.css"), oldCss);
    await writeFile(join(fixture, "src/components/app-shell/app-nav.tsx"), oldNav
      .replace('import { usePathname } from "next/navigation";', 'import { Link, useLocation } from "react-router-dom";')
      .replace("const pathname = usePathname();", "const { pathname } = useLocation();")
      .replace("<a\n", "<Link\n").replace("href={link.href}", "to={link.href}").replace("</a>", "</Link>"));
    await mkdir(join(fixture, "src/client/pages/sales-kpi"), { recursive: true });
    await rename(join(fixture, "src/app/sales-kpi/page.tsx"), join(fixture, "src/client/pages/sales-kpi/page.tsx"));
    await mkdir(join(fixture, "src/server/routes/sales-kpi"), { recursive: true });
    const api = await readFile(join(fixture, "src/app/api/sales-kpi/route.ts"), "utf8");
    await writeFile(join(fixture, "src/server/routes/sales-kpi/route.ts"), api.replace('export const dynamic = "force-dynamic";\n\n', ""));
    for (const file of ["src/app", "src/instrumentation.ts", "next.config.mjs", "next-env.d.ts", "scripts/prepare-standalone.mjs"]) {
      await rm(join(fixture, file), { recursive: true, force: true });
    }
    const clientRoutes = join(fixture, "src/client/routes.tsx");
    await writeFile(clientRoutes, (await readFile(clientRoutes, "utf8"))
      .replace("// feature:new inserts imports", 'const SalesKpiPage = lazy(() => import("./pages/sales-kpi/page"));\n// feature:new inserts imports')
      .replace("  // feature:new inserts routes", '  { path: "/sales-kpi", element: <SalesKpiPage /> },\n  // feature:new inserts routes'));
    const serverRoutes = join(fixture, "src/server/routes.ts");
    await writeFile(serverRoutes, (await readFile(serverRoutes, "utf8"))
      .replace("// feature:new inserts imports", 'import { GET as getSalesKpi } from "./routes/sales-kpi/route";\n// feature:new inserts imports')
      .replace("  // feature:new inserts routes", '  app.get("/api/sales-kpi", getSalesKpi);\n  // feature:new inserts routes'));
    const pkg = JSON.parse(await readFile(join(fixture, "package.json"), "utf8"));
    const currentPkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    Object.assign(pkg, { scripts: currentPkg.scripts, dependencies: currentPkg.dependencies, devDependencies: currentPkg.devDependencies });
    await writeFile(join(fixture, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
    // Regenerate only this disposable fixture's lockfile from the reviewed dependency set.
    await copyCurrent("package-lock.json");
    const lock = JSON.parse(await readFile(join(fixture, "package-lock.json"), "utf8"));
    lock.name = pkg.name; lock.packages[""].name = pkg.name;
    await writeFile(join(fixture, "package-lock.json"), JSON.stringify(lock, null, 2) + "\n");
    run(process.execPath, ["scripts/render-data-access.mjs"]);
    run(process.execPath, ["scripts/template-status.mjs", "--check", "--to", "2.0.1"]);
    oldState.template.version = "2.0.1";
    oldState.capabilities.push("appkit-native-runtime", "upstream-compatibility", "guided-appkit-capabilities", "period-comparison", "appkit-genie-integration", "comparison-sharing");
    oldState.appliedUpgrades.push("1.5.0-to-2.0.0", "2.0.0-to-2.0.1");
    await writeFile(join(fixture, ".valiuz-template.yml"), stringify(oldState));
    const after = await Promise.all(preservedPaths.map((file) => readFile(join(fixture, file), "utf8")));
    assert.deepEqual(after, before.map((original, index) => businessPorts.get(preservedPaths[index]) ?? original),
      "Only the reviewed SQL marker and binding may change; business logic, sources, tables and branding must survive");
    run(process.execPath, ["scripts/app-guide.mjs", "--non-interactive"]);
    const migratedSpec = parse(await readFile(join(fixture, "config/app-spec.yml"), "utf8"));
    const originalSpec = parse(before[preservedPaths.indexOf("config/app-spec.yml")]);
    assert.deepEqual(migratedSpec.app, originalSpec.app);
    assert.deepEqual(migratedSpec.features, originalSpec.features);
    assert.deepEqual(migratedSpec.capabilities, ["analytics"]);
    run(process.execPath, ["scripts/app-guide.mjs", "--check"]);
    run(process.execPath, ["scripts/template-status.mjs", "--check"]);
    const access = JSON.parse(await readFile(join(fixture, "config/data-access.json"), "utf8"));
    if (baseline.version === "1.4.0") {
      assert.equal(access.personalState, undefined, "A 1.4 app must not gain personal storage just to migrate");
      assert.doesNotMatch(await readFile(join(fixture, "resources/data-access.generated.yml"), "utf8"), /permission: MODIFY/);
    } else assert.deepEqual(access.personalState, JSON.parse(before[preservedPaths.indexOf("config/data-access.json")]).personalState);
    assert.ok((await readFile(join(fixture, "src/client/globals.css"), "utf8")).endsWith(customCss));
    const migratedTailwind = await readFile(tailwindPath, "utf8");
    assert.equal(migratedTailwind.split(dialogContent).length - 1, 1, "The Dialog content entry must be added exactly once");
    assert.equal(migratedTailwind.replace(dialogContentEntry, ""), oldTailwind,
      "Only the Dialog content entry may change; all custom Tailwind paths, theme and plugins must survive");
    assert.match(await readFile(join(fixture, "src/components/app-shell/app-nav.tsx"), "utf8"), /sales-kpi/);
    for (const script of ["typecheck", "lint", "build"]) process.stdout.write(run("npm", ["run", script]));
    const assetsPath = join(fixture, "dist/client/assets");
    const cssAssets = (await readdir(assetsPath)).filter((file) => file.endsWith(".css"));
    const builtCss = (await Promise.all(cssAssets.map((file) => readFile(join(assetsPath, file), "utf8")))).join("\n");
    assert.ok(builtCss.includes(".bg-business-highlight"), "The build must preserve the custom theme and its separate content directory");
    assert.ok(builtCss.includes(".bg-black\\/50"), "The build must include the AppKit Dialog overlay background class");
    process.stdout.write(run(process.execPath, ["--import", "tsx", "--test", "tests/sales-kpi.test.ts"]));
    process.stdout.write(`Initialized ${baseline.version} business fixture migrated to 2.0 with contracts and customizations preserved.\n`);
  } finally { await rm(fixture, { recursive: true, force: true }); }
}

for (const baseline of baselines) await migrateFixture(baseline);
