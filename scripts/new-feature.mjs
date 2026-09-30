#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { loadAppSpec, syncProductBrief, validateAppSpec, writeAppSpec, featureSlugPattern, identifierPattern } from "./app-spec.mjs";
import { loadDataAccessManifest } from "./data-access.mjs";
import { comparisonTemplates } from "./feature-comparison-template.mjs";

function parseOptions(argv) {
  const options = { nonInteractive: false, dryRun: false, slug: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--") && !options.slug) {
      options.slug = value;
      continue;
    }
    if (["--non-interactive", "--dry-run", "--share-analysis", "--share-segment"].includes(value)) {
      options[value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = true;
      continue;
    }
    if (!["--title", "--question", "--source", "--aggregation", "--column", "--label", "--unit", "--demo-value", "--acceptance", "--date-column", "--breakdown-column"].includes(value)) {
      throw new Error(`Unknown option: ${value}`);
    }
    const supplied = argv[index + 1];
    if (!supplied || supplied.startsWith("--")) throw new Error(`${value} requires a value.`);
    options[value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = supplied;
    index += 1;
  }
  return options;
}

function names(slug) {
  const parts = (/^[0-9]/.test(slug) ? `feature-${slug}` : slug).split("-");
  const pascal = parts.map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join("");
  const camel = `${parts[0]}${parts.slice(1).map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join("")}`;
  const upper = parts.join("_").toUpperCase();
  return { pascal, camel, upper };
}

function queryExpression(aggregation, column) {
  if (aggregation === "count") return "COUNT(*)";
  return `${aggregation.toUpperCase()}(\`${column}\`)`;
}

function templates(feature, source) {
  const { slug, title, metric } = feature;
  const { pascal, camel, upper } = names(slug);
  const result = new Map();
  result.set(`src/features/${slug}/contract.ts`, `import { z } from "zod";\n\nexport const ${camel}Schema = z.object({\n  status: z.enum(["demo", "ok"]),\n  label: z.string(),\n  value: z.number().nullable(),\n  unit: z.string(),\n});\n\nexport type ${pascal}Result = z.infer<typeof ${camel}Schema>;\n`);
  result.set(`src/features/${slug}/server/queries.ts`, `export const ${upper}_QUERY = "SELECT CAST(${queryExpression(metric.aggregation, metric.column)} AS DOUBLE) AS value FROM IDENTIFIER(:source)";\n`);
  result.set(`src/features/${slug}/server/repository.ts`, `import { z } from "zod";\n\nimport { ${upper}_QUERY } from "@/features/${slug}/server/queries";\nimport { quoteQualifiedIdentifier } from "@/lib/databricks/identifiers";\nimport type { SqlExecutor } from "@/lib/databricks/types";\n\nconst rowSchema = z.object({ value: z.coerce.number().nullable() });\n\nexport async function load${pascal}(executor: SqlExecutor, source: string, requestId?: string): Promise<number | null> {\n  const rows = await executor.query({\n    name: ${JSON.stringify(`${slug}-kpi`)},\n    statement: ${upper}_QUERY,\n    parameters: { source: quoteQualifiedIdentifier(source) },\n    rowSchema,\n    requestId,\n    maxRows: 1,\n  });\n  return rows[0]?.value ?? null;\n}\n`);
  result.set(`src/features/${slug}/server/service.ts`, `import type { ${pascal}Result } from "@/features/${slug}/contract";\nimport { load${pascal} } from "@/features/${slug}/server/repository";\nimport { getServerConfig, type ServerConfig } from "@/lib/config/server-config";\nimport { getSqlExecutor } from "@/lib/databricks/sql";\nimport type { SqlExecutor } from "@/lib/databricks/types";\n\ntype Dependencies = { config?: ServerConfig; executor?: SqlExecutor };\n\nexport async function get${pascal}(requestId?: string, dependencies: Dependencies = {}): Promise<${pascal}Result> {\n  const config = dependencies.config ?? getServerConfig();\n  if (config.mode === "demo") {\n    return { status: "demo", label: ${JSON.stringify(metric.label)}, value: ${metric.demoValue}, unit: ${JSON.stringify(metric.unit)} };\n  }\n  const value = await load${pascal}(dependencies.executor ?? getSqlExecutor(), ${JSON.stringify(source.fullName)}, requestId);\n  return { status: "ok", label: ${JSON.stringify(metric.label)}, value, unit: ${JSON.stringify(metric.unit)} };\n}\n`);
  result.set(`src/server/routes/${slug}/route.ts`, `import { get${pascal} } from "@/features/${slug}/server/service";\nimport { withApiRoute } from "@/lib/http/with-api-route";\n\nexport const GET = withApiRoute((_request, context) => get${pascal}(context.requestId));\n`);
  result.set(`src/features/${slug}/${slug}-card.tsx`, `"use client";\n\nimport { useState } from "react";\n\nimport { EmptyState } from "@/components/states/empty-state";\nimport { ErrorState } from "@/components/states/error-state";\nimport { LoadingState } from "@/components/states/loading-state";\nimport { ${camel}Schema, type ${pascal}Result } from "@/features/${slug}/contract";\n\ntype State =\n  | { status: "idle" }\n  | { status: "loading" }\n  | { status: "success"; result: ${pascal}Result }\n  | { status: "error"; message: string; requestId?: string };\n\nexport function ${pascal}Card() {\n  const [state, setState] = useState<State>({ status: "idle" });\n\n  async function load(): Promise<void> {\n    setState({ status: "loading" });\n    try {\n      const response = await fetch(${JSON.stringify(`/api/${slug}`)}, { cache: "no-store" });\n      const payload: unknown = await response.json();\n      if (!response.ok) {\n        const error = payload as { error?: { message?: string; requestId?: string } };\n        setState({ status: "error", message: error.error?.message ?? "Le KPI n’est pas disponible.", requestId: error.error?.requestId });\n        return;\n      }\n      setState({ status: "success", result: ${camel}Schema.parse(payload) });\n    } catch {\n      setState({ status: "error", message: "La réponse du serveur n’est pas valide." });\n    }\n  }\n\n  return (\n    <section className="rounded-2xl border border-line bg-surface p-6 shadow-panel" aria-labelledby=${JSON.stringify(`${slug}-title`)}>\n      <div className="flex items-start justify-between gap-4">\n        <div>\n          <h2 id=${JSON.stringify(`${slug}-title`)} className="text-xl font-semibold">${title}</h2>\n          <p className="mt-2 text-sm text-muted">${feature.question}</p>\n        </div>\n        <button type="button" onClick={load} disabled={state.status === "loading"} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Actualiser</button>\n      </div>\n      <div className="mt-6">\n        {state.status === "idle" ? <EmptyState title="KPI prêt" message="Actualisez pour charger la valeur." /> : null}\n        {state.status === "loading" ? <LoadingState label="Chargement du KPI…" /> : null}\n        {state.status === "error" ? <ErrorState title="KPI indisponible" message={state.message} requestId={state.requestId} onRetry={load} /> : null}\n        {state.status === "success" && state.result.value === null ? <EmptyState title="Aucune donnée" message="Aucune valeur disponible pour ce KPI." /> : null}\n        {state.status === "success" && state.result.value !== null ? (\n          <div className="rounded-xl border border-line bg-canvas/60 p-5">\n            <p className="text-sm text-muted">{state.result.label}</p>\n            <p className="mt-2 text-3xl font-semibold">{new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(state.result.value)} <span className="text-base text-muted">{state.result.unit}</span></p>\n          </div>\n        ) : null}\n      </div>\n    </section>\n  );\n}\n`);
  result.set(`src/client/pages/${slug}/page.tsx`, `import { ${pascal}Card } from "@/features/${slug}/${slug}-card";\n\nexport default function ${pascal}Page() {\n  return <${pascal}Card />;\n}\n`);
  result.set(`tests/${slug}.test.ts`, `import assert from "node:assert/strict";\nimport test from "node:test";\n\nimport { load${pascal} } from "../src/features/${slug}/server/repository";\nimport { get${pascal} } from "../src/features/${slug}/server/service";\nimport type { DemoConfig } from "../src/lib/config/server-config";\nimport type { SqlExecutor } from "../src/lib/databricks/types";\n\ntest(${JSON.stringify(`${slug} uses its deterministic demo value`)}, async () => {\n  const config: DemoConfig = { mode: "demo", appName: "Test", appDescription: "Test", supportContact: { name: "Test", slackUrl: "https://valiuz.slack.com/" }, logLevel: "info" };\n  assert.deepEqual(await get${pascal}(undefined, { config }), { status: "demo", label: ${JSON.stringify(metric.label)}, value: ${metric.demoValue}, unit: ${JSON.stringify(metric.unit)} });\n});\n\ntest(${JSON.stringify(`${slug} repository binds the declared source`)}, async () => {\n  const executor: SqlExecutor = { query: async (options) => {\n    assert.equal(options.name, ${JSON.stringify(`${slug}-kpi`)});\n    assert.deepEqual(options.parameters, { source: ${JSON.stringify(source.fullName.split(".").map((part) => `\`${part}\``).join("."))} });\n    assert.equal(options.maxRows, 1);\n    return [{ value: 12 }] as never[];\n  } };\n  assert.equal(await load${pascal}(executor, ${JSON.stringify(source.fullName)}), 12);\n});\n`);
  return result;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const root = process.cwd();
const options = parseOptions(process.argv.slice(2));
if (!options.slug || !featureSlugPattern.test(options.slug)) {
  throw new Error("Provide a feature slug using lowercase letters, numbers and hyphens.");
}
if (options.shareAnalysis && options.slug.length > 64) throw new Error("Shared feature slugs must contain at most 64 characters.");
if (options.shareAnalysis && !options.dateColumn) throw new Error("--share-analysis requires --date-column.");
if (options.shareSegment && (!options.shareAnalysis || !options.breakdownColumn)) {
  throw new Error("--share-segment requires --share-analysis and --breakdown-column; review the segment dimension before enabling shared links.");
}
const spec = await loadAppSpec(root, { allowPlaceholder: true });
if (spec.features.some((feature) => feature.slug === options.slug)) throw new Error(`Feature '${options.slug}' already exists.`);
const accessManifest = await loadDataAccessManifest(root, { allowPlaceholder: true, requireSources: true });
const defaultSource = accessManifest.sources[0]?.name;
const prompts = [
  ["title", "Titre de la page", options.slug.replaceAll("-", " ")],
  ["question", "Question métier traitée", "À confirmer"],
  ["source", `Source déclarée (${accessManifest.sources.map((source) => source.name).join(", ")})`, defaultSource],
  ["aggregation", "Agrégation (count, sum, avg)", "count"],
  ["column", "Colonne de mesure (* pour count)", "*"],
  ["label", "Libellé du KPI", "Valeur"],
  ["unit", "Unité", "valeur"],
  ["demoValue", "Valeur de démonstration", "0"],
  ["acceptance", "Critère d’acceptation", "Le KPI est validé par son propriétaire métier."],
];
const answers = {};
const readline = options.nonInteractive ? undefined : createInterface({ input: stdin, output: stdout });
try {
  for (const [key, label, fallback] of prompts) {
    answers[key] = options[key] ?? (readline ? (await readline.question(`${label} [${fallback ?? "requis"}]: `)).trim() || fallback : fallback);
  }
} finally {
  readline?.close();
}
if (!["count", "sum", "avg"].includes(answers.aggregation)) throw new Error("Aggregation must be count, sum or avg.");
if (answers.aggregation === "count" && !answers.column) answers.column = "*";
if (answers.column !== "*" && !identifierPattern.test(answers.column)) throw new Error("Metric column must be a simple identifier.");
if (answers.aggregation !== "count" && answers.column === "*") throw new Error(`${answers.aggregation} requires a metric column.`);
const source = accessManifest.sources.find((candidate) => candidate.name === answers.source);
if (!source) throw new Error(`Source '${answers.source}' is not declared in config/data-access.json.`);
if (options.breakdownColumn && !options.dateColumn) throw new Error("--breakdown-column requires --date-column.");
const feature = {
  slug: options.slug,
  title: answers.title,
  question: answers.question,
  source: source.name,
  metric: {
    label: answers.label,
    aggregation: answers.aggregation,
    column: answers.column,
    unit: answers.unit,
    demoValue: Number(answers.demoValue),
  },
  acceptance: answers.acceptance,
  ...(options.dateColumn ? { comparison: { dateColumn: options.dateColumn, ...(options.breakdownColumn ? { breakdownColumn: options.breakdownColumn } : {}),
    ...(options.shareAnalysis ? { sharing: { allowSegment: Boolean(options.shareSegment) } } : {}) } } : {}),
};
const validatedSpec = validateAppSpec({ ...spec, capabilities: [...new Set([...spec.capabilities, "analytics"])], features: [...spec.features, feature] }, { allowPlaceholder: true });
const generated = feature.comparison ? comparisonTemplates(feature, source, names(feature.slug)) : templates(feature, source);
const conflicts = [];
for (const relativePath of generated.keys()) if (await exists(join(root, relativePath))) conflicts.push(relativePath);
if (conflicts.length > 0) throw new Error(`Refusing to overwrite existing files: ${conflicts.join(", ")}.`);
const navPath = join(root, "src/components/app-shell/app-nav.tsx");
const nav = await readFile(navPath, "utf8");
const marker = "  // feature:new inserts links above this line.";
if (!nav.includes(marker)) throw new Error("Navigation insertion marker is missing.");
const clientRoutesPath = join(root, "src/client/routes.tsx");
const serverRoutesPath = join(root, "src/server/routes.ts");
const [clientRoutes, serverRoutes] = await Promise.all([readFile(clientRoutesPath, "utf8"), readFile(serverRoutesPath, "utf8")]);
const importMarker = "// feature:new inserts imports above this line.";
const routeMarker = "  // feature:new inserts routes above this line.";
if (![clientRoutes, serverRoutes].every((text) => text.includes(importMarker) && text.includes(routeMarker))) {
  throw new Error("Client or server route insertion marker is missing.");
}
const { pascal } = names(feature.slug);
if (options.dryRun) {
  stdout.write(`Would create feature '${feature.slug}':\n${[...generated.keys()].map((path) => `- ${path}`).join("\n")}\n`);
  process.exit(0);
}
for (const [relativePath, content] of generated) {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}
await writeFile(navPath, nav.replace(marker, `  { href: ${JSON.stringify(`/${feature.slug}`)}, label: ${JSON.stringify(feature.title)} },\n${marker}`), "utf8");
await writeFile(clientRoutesPath, clientRoutes
  .replace(importMarker, `const ${pascal}Page = lazy(() => import("./pages/${feature.slug}/page"));\n${importMarker}`)
  .replace(routeMarker, `  { path: "/${feature.slug}", element: <${pascal}Page /> },\n${routeMarker}`), "utf8");
await writeFile(serverRoutesPath, serverRoutes
  .replace(importMarker, `import { GET as get${pascal} } from "./routes/${feature.slug}/route";\n${importMarker}`)
  .replace(routeMarker, `  app.get("/api/${feature.slug}", get${pascal});\n${routeMarker}`), "utf8");
const nextSpec = await writeAppSpec(root, validatedSpec);
await syncProductBrief(root, nextSpec);
stdout.write(`Created feature '${feature.slug}'. Review the generated SQL and run npm run check.\n`);
