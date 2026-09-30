import { lstat, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareVersions, loadTemplateManifest, loadTemplateState, loadTemplateUpgrade } from "./template-manifest.mjs";

const templateRoot = fileURLToPath(new URL("../", import.meta.url));

function upgradePath(manifest, from, to) {
  if (!Object.hasOwn(manifest.versions, from) || !Object.hasOwn(manifest.versions, to)) throw new Error(`Version inconnue : ${from} ou ${to}. Consulter template/manifest.yml dans le template cible.`);
  if (compareVersions(from, to) > 0) throw new Error("Ce bilan ne planifie pas un downgrade. Utiliser la révision précédente pour le rollback.");
  const queue = [{ version: from, steps: [] }];
  const visited = new Set();
  while (queue.length) {
    const item = queue.shift();
    if (item.version === to) return item.steps;
    if (visited.has(item.version)) continue;
    visited.add(item.version);
    for (const step of manifest.upgrades.filter((entry) => entry.from === item.version
      && compareVersions(entry.from, entry.to) < 0 && compareVersions(entry.to, to) <= 0)) {
      queue.push({ version: step.to, steps: [...item.steps, step] });
    }
  }
  throw new Error(`Aucun chemin de migration déclaré de ${from} vers ${to}.`);
}

async function directoryEntries(path) {
  try { return (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name)); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}

async function sourceFiles(root, directory) {
  const metadata = await lstat(join(root, directory)).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
  if (!metadata?.isDirectory()) return [];
  const files = [];
  for (const entry of await directoryEntries(join(root, directory))) {
    const path = `${directory}/${entry.name}`;
    // Do not follow symlinks or read dependencies, generated files or environment files.
    if (entry.isDirectory() && !entry.name.startsWith(".") && !["node_modules", "dist", "coverage"].includes(entry.name)) files.push(...await sourceFiles(root, path));
    else if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name)) files.push(path);
  }
  return files;
}

async function inventoryApp(appRoot) {
  const files = (await Promise.all(["src", "app", "pages"].map((directory) => sourceFiles(appRoot, directory)))).flat();
  const inventory = { pages: [], layouts: [], apiHandlers: [], pagesRouter: [], nextImports: [], serverCandidates: [], publicEnvironmentNames: [], configuration: [] };
  const publicNames = new Set();
  for (const path of files) {
    const text = await readFile(join(appRoot, path), "utf8");
    const appFile = /^(?:src\/)?app\//.test(path);
    if (appFile && /\/page\.[jt]sx?$/.test(path)) inventory.pages.push(path);
    if (appFile && /\/layout\.[jt]sx?$/.test(path)) inventory.layouts.push(path);
    if (appFile && /\/route\.[jt]sx?$/.test(path)) inventory.apiHandlers.push(path);
    if (/^(?:src\/)?pages\//.test(path)) inventory.pagesRouter.push(path);
    const modules = [...new Set([...text.matchAll(/\b(?:from\s*|import\s*\(?\s*|require\s*\(\s*)["'](next(?:\/[^"']*)?)["']/g)].map((match) => match[1]))].sort();
    if (modules.length) inventory.nextImports.push({ path, modules });
    if (/^[\t ]*["']use server["'];?/m.test(text)
      || (appFile && /\/(?:page|layout)\.[jt]sx?$/.test(path) && !/^[\t ]*["']use client["'];?/m.test(text))) inventory.serverCandidates.push(path);
    for (const match of text.matchAll(/\bNEXT_PUBLIC_[A-Z0-9_]+\b/g)) publicNames.add(match[0]);
  }
  const entries = await directoryEntries(appRoot);
  for (const entry of entries) {
    if (entry.isFile() && /^(next\.config\.|next-env\.|middleware\.|instrumentation\.)/.test(entry.name)) inventory.configuration.push(entry.name);
  }
  inventory.configuration.push(...files.filter((file) => /^src\/(?:middleware|instrumentation)\.[jt]s$/.test(file)));
  // Read only the example's key names, never .env, .env.local or an OAuth profile.
  if (entries.some((entry) => entry.isFile() && entry.name === ".env.example")) {
    const example = await readFile(join(appRoot, ".env.example"), "utf8");
    for (const match of example.matchAll(/^\s*(?:export\s+)?(NEXT_PUBLIC_[A-Z0-9_]+)\s*=/gm)) publicNames.add(match[1]);
  }
  inventory.publicEnvironmentNames = [...publicNames].sort();
  return inventory;
}

export async function planMigration(appRoot, { from, to, sourceRoot = templateRoot } = {}) {
  const root = resolve(appRoot);
  const manifest = await loadTemplateManifest(sourceRoot);
  // Parse data only: never run package scripts or import modules from the app being inspected.
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  if (pkg.name === "__PACKAGE_NAME__") throw new Error("Choisir une application initialisée avec --app-dir, pas le repository source du template.");
  const state = await loadTemplateState(root);
  if (state && (state.template.id !== manifest.template.id || state.template.repository !== manifest.template.repository)) throw new Error("L'application déclare un autre template. Vérifier son origine avant de planifier la migration.");
  if (state && from && state.template.version !== from) throw new Error(`--from ${from} contredit la version déclarée ${state.template.version}. Vérifier l'état avant de poursuivre.`);
  const sourceVersion = state?.template.version ?? from;
  if (!sourceVersion) throw new Error("Version non suivie : examiner l'app, puis fournir --from 1.4.0 ou --from 1.5.0. Aucune version n'est déduite des dépendances.");
  const targetVersion = to ?? manifest.template.currentVersion;
  const steps = upgradePath(manifest, sourceVersion, targetVersion);
  const upgrades = [];
  for (const step of steps) upgrades.push(await loadTemplateUpgrade(sourceRoot, manifest, step.from, step.to));
  return {
    schemaVersion: 1,
    readOnly: true,
    app: { directory: root, name: pkg.name, from: sourceVersion, versionEvidence: state ? "declared-not-verified" : "provided-not-verified" },
    target: { version: targetVersion, templateDirectory: sourceRoot },
    status: steps.length ? "review-required" : "already-declared",
    upgrades,
    inventory: await inventoryApp(root),
    preserve: ["src/features (requêtes, contrats et logique métier)", "config/data-access.json", "config/genie-spaces.json", "config/app-spec.yml", "data/", "app.yaml et variables métier", "tables personnelles et namespaces existants", "branding et URLs publiques"],
    notes: [
      "React reste présent. Porter le runtime Next.js, le routage et les chargements serveur vers AppKit/Express, Vite et React Router.",
      "Depuis 1.4 : intégrer les contrats 1.5 avant le portage 2.0. L'état personnel peut rester désactivé ; aucune table ni permission à créer pour migrer.",
      "Les guides proviennent du template cible ; une ancienne copie du manifeste ne connaît pas les releases futures.",
      "Cet inventaire statique n'est pas exhaustif : examiner aussi middleware, authentification, URLs dynamiques, rewrites et loaders personnalisés.",
      "Aucun fichier, package, état de version ou ressource n'est modifié. Aucun test n'est exécuté.",
    ],
    verification: { status: "not-run", guide: "docs/migration-2.0.md", steps: [
      "Conserver la révision de production et les résultats des tests existants avant de porter l'app sur une branche dédiée.",
      "Valider les étapes du guide, les tests métier, les parcours E2E et le bundle ; déclarer la version seulement après succès.",
      "Effectuer un déploiement dev explicitement autorisé et une recette distante avant adoption en production.",
    ] },
  };
}

export async function runMigrationPlan(args) {
  const options = {};
  let appDirectory;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") json = true;
    else if (["--app-dir", "--from", "--to"].includes(arg) && args[index + 1] && !args[index + 1].startsWith("--")) {
      const value = args[++index];
      if (arg === "--app-dir") appDirectory = value;
      else options[arg.slice(2)] = value;
    } else throw new Error("Usage : npm run app -- migrate --app-dir <ancienne app> [--from <version>] [--to <version>] [--json]");
  }
  if (!appDirectory) throw new Error("Indiquer --app-dir <ancienne app>. Lancer ce bilan depuis un checkout du template cible.");
  const plan = await planMigration(appDirectory, options);
  if (json) { process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`); return plan; }
  const inventory = plan.inventory;
  const labels = { pages: "Pages App Router", layouts: "Layouts", apiHandlers: "Handlers API", pagesRouter: "Fichiers Pages Router", nextImports: "Imports Next.js", serverCandidates: "Chargements ou actions serveur à examiner", publicEnvironmentNames: "Variables publiques à examiner", configuration: "Configuration Next.js" };
  process.stdout.write([
    `Migration ${plan.app.name} : ${plan.app.from} → ${plan.target.version} — lecture seule`,
    `Version ${plan.app.versionEvidence === "declared-not-verified" ? "déclarée dans .valiuz-template.yml" : "fournie avec --from"} ; compatibilité à vérifier.`,
    ...plan.upgrades.map((step) => `${step.from} → ${step.to} : ${join(plan.target.templateDirectory, step.path)}`),
    ...Object.entries(inventory).flatMap(([kind, entries]) => [
      `${labels[kind]} (${entries.length})${entries.length ? " :" : " : aucun détecté"}`,
      ...entries.map((entry) => `  ${typeof entry === "string" ? entry : `${entry.path} [${entry.modules.join(", ")}]`}`),
    ]),
    ...plan.notes,
    `Guide : ${join(plan.target.templateDirectory, plan.verification.guide)}`,
    "Ajouter --json pour les instructions et validations de chaque étape.",
    "",
  ].join("\n"));
  return plan;
}
