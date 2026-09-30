#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { stdout } from "node:process";
import { pathToFileURL } from "node:url";

import { loadAppSpec, renderProductBrief } from "./app-spec.mjs";
import { renderDataAccess } from "./data-access.mjs";
import { renderDataPreparation } from "./data-preparation.mjs";
import { inspectAppKitCompatibility } from "./appkit-compatibility.mjs";
import { capabilityPlan } from "./app-capabilities.mjs";
import { inspectAgentSkills } from "./app-skills.mjs";
import { inspectTemplateVersion } from "./template-status.mjs";

function result(status, name, detail, next) {
  return { status, name, detail, ...(next ? { next } : {}) };
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return undefined;
    throw error;
  }
}

function commandAvailable(command, args, execute) {
  const commandResult = execute(command, args, { encoding: "utf8" });
  return !commandResult.error && commandResult.status === 0;
}

export async function inspectApp(root, { execute = spawnSync, nodeVersion = process.versions.node, skillsDirectory } = {}) {
  const results = [];
  let spec;
  let accessManifest;
  let framingIncomplete = false;
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const isTemplate = packageJson.name === "__PACKAGE_NAME__";
  results.push(
    isTemplate
      ? result("warn", "Initialisation", "Le checkout est encore le template.", "npm run init-app -- <nom>")
      : result("pass", "Initialisation", `Application '${packageJson.name}' initialisée.`),
  );

  const templateManifest = await readOptional(join(root, "template/manifest.yml"));
  if (!templateManifest) {
    results.push(
      result(
        "warn",
        "Version du template",
        "Cette app est antérieure au suivi de version du template.",
        "Consulter docs/template-upgrades.md",
      ),
    );
  } else {
    try {
      const templateStatus = await inspectTemplateVersion(root);
      const missingCapabilities = templateStatus.capabilities.filter((capability) => !capability.ok);
      if (templateStatus.instance.kind === "legacy") {
        results.push(
          result(
            "warn",
            "Version du template",
            "Le manifeste est présent, mais .valiuz-template.yml ne déclare pas la baseline de cette app.",
            "npm run template:status",
          ),
        );
      } else if (missingCapabilities.length > 0) {
        results.push(
          result(
            "fail",
            "Version du template",
            `${missingCapabilities.length} capability(s) déclarée(s) ne sont pas vérifiées.`,
            "npm run template:status",
          ),
        );
      } else if (templateStatus.instance.behind) {
        results.push(
          result(
            "warn",
            "Version du template",
            `Version ${templateStatus.instance.version}; ${templateStatus.template.currentVersion} est disponible.`,
            "npm run template:status",
          ),
        );
      } else {
        results.push(
          result(
            "pass",
            "Version du template",
            `Version ${templateStatus.instance.effectiveVersion}; toutes les capabilities déclarées sont présentes.`,
          ),
        );
      }
    } catch (error) {
      results.push(
        result(
          "fail",
          "Version du template",
          error instanceof Error ? error.message : "Suivi de version invalide.",
          "npm run template:status",
        ),
      );
    }
  }

  results.push(...await inspectAppKitCompatibility(root, { execute }));

  const major = Number(nodeVersion.split(".")[0]);
  results.push(
    major === 22
      ? result("pass", "Node.js", `Version ${nodeVersion}.`)
      : result("warn", "Node.js", `Version ${nodeVersion}; le template attend Node.js 22.`, "nvm use"),
  );

  try {
    spec = await loadAppSpec(root, { allowPlaceholder: true });
    const currentBrief = await readFile(join(root, "docs/product-brief.md"), "utf8");
    if (currentBrief !== renderProductBrief(spec)) throw new Error("le brief produit n’est pas synchronisé");
    framingIncomplete = [spec.app.audience, spec.app.decision, spec.app.success].some((value) => value === "À confirmer");
    results.push(
      framingIncomplete
        ? result("warn", "Cadrage", "Le public, la décision ou le succès attendu reste à confirmer.")
        : result("pass", "Cadrage", `${spec.features.length} tranche(s) décrite(s).`),
    );
    if (spec.features.length === 0 && spec.capabilities.includes("analytics")) {
      results.push(result("warn", "Première tranche", "Aucune feature métier n’est encore définie."));
    }
    const optional = capabilityPlan(spec.capabilities).filter((item) => item.availability === "optional");
    results.push(result(optional.length || !spec.capabilities.length ? "warn" : "pass", "Capacités envisagées",
      `${spec.capabilities.join(", ") || "Aucune"}. Choix de cadrage ; ce contrôle ne prouve pas leur activation.${optional.length ? ` Intégration à examiner : ${optional.map((item) => item.id).join(", ")}.` : ""}`,
      "npm run app:capabilities"));
  } catch (error) {
    results.push(result("fail", "Cadrage", error instanceof Error ? error.message : "Spécification invalide.", "npm run app:guide"));
  }

  results.push(...await inspectAgentSkills(root, { capabilityIds: spec?.capabilities, skillsDirectory }));

  try {
    accessManifest = await renderDataAccess({ root, check: true, allowPlaceholder: true });
    results.push(result("pass", "Accès aux données", `${accessManifest.sources.length} source(s) déclarée(s) dans ${accessManifest.project}.`));
    if (accessManifest.sources.length === 0 && spec?.capabilities.includes("analytics")) {
      results.push(result("warn", "Première source", "Aucune table ou vue n’est déclarée."));
    }
  } catch (error) {
    results.push(result("fail", "Accès aux données", error instanceof Error ? error.message : "Manifeste invalide.", "npm run data:access:render"));
  }

  if (spec && accessManifest) {
    const missing = spec.features.filter(
      (feature) => !accessManifest.sources.some((source) => source.name === feature.source),
    );
    results.push(
      missing.length === 0
        ? result("pass", "Features et sources", "Chaque feature utilise une source déclarée.")
        : result(
            "fail",
            "Features et sources",
            `Sources manquantes: ${missing.map((feature) => feature.source).join(", ")}.`,
            "npm run data:init -- <nom>",
          ),
    );
  }

  try {
    const contracts = await renderDataPreparation({ root, check: true, allowPlaceholder: true });
    const prepared = contracts.filter((contract) => contract.mode !== "direct");
    results.push(
      result(
        "pass",
        "Préparation data",
        prepared.length === 0
          ? "Aucune ressource de préparation nécessaire."
          : `${prepared.length} préparation(s) optionnelle(s) déclarée(s).`,
      ),
    );
    if (prepared.length > 0) {
      results.push(
        result(
          "warn",
          "Sorties préparées",
          "Le contrôle local ne prouve ni leur présence distante ni leur fraîcheur.",
          "npm run app:doctor -- --remote",
        ),
      );
    }
  } catch (error) {
    results.push(result("fail", "Préparation data", error instanceof Error ? error.message : "Contrat invalide.", "npm run data:prepare:render"));
  }

  const envLocal = await readOptional(join(root, ".env.local"));
  if (!envLocal) {
    results.push(result("warn", "Développement réel", ".env.local est absent; le mode démo reste disponible.", "cp .env.example .env.local"));
  } else if (/^APP_MODE=databricks\s*$/m.test(envLocal) && /^DATABRICKS_CONFIG_PROFILE=\S+\s*$/m.test(envLocal)) {
    results.push(result("pass", "Développement réel", "Un profil CLI OAuth est sélectionné sans afficher sa valeur."));
  } else {
    results.push(result("warn", "Développement réel", ".env.local n’active pas un profil CLI OAuth.", "Configurer APP_MODE et DATABRICKS_CONFIG_PROFILE"));
  }

  results.push(
    commandAvailable("databricks", ["--version"], execute)
      ? result("pass", "Databricks CLI", "CLI disponible.")
      : result("warn", "Databricks CLI", "CLI non disponible; le mode démo fonctionne sans lui.", "Installer Databricks CLI"),
  );

  const git = execute("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  if (git.error || git.status !== 0) {
    results.push(result("warn", "Git", "Statut Git indisponible."));
  } else if (git.stdout.trim()) {
    results.push(result("warn", "Git", "Le worktree contient des changements non commités.", "Relire git status --short"));
  } else {
    results.push(result("pass", "Git", "Worktree propre."));
  }

  const firstFailure = results.find((item) => item.status === "fail" && item.next);
  let next = "npm run check";
  if (firstFailure) next = firstFailure.next;
  else if (isTemplate) next = "npm run init-app -- <nom>";
  else if (framingIncomplete || !spec || !spec.capabilities.length) next = "npm run app:guide";
  else if (!spec.capabilities.includes("analytics")) next = "npm run app:capabilities";
  else if (!accessManifest || accessManifest.sources.length === 0) next = "npm run data:init -- <nom>";
  else if (spec.features.length === 0) next = "npm run feature:new -- <slug>";
  const nextStatus = firstFailure ? "fail" : next === "npm run check" ? "pass" : "warn";
  results.push(result(nextStatus, "Étape recommandée", "Continuer avec une seule action.", next));

  return results;
}

function parseOptions(argv) {
  const options = { remote: false, json: false, profile: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--remote" || value === "--json") {
      options[value.slice(2)] = true;
      continue;
    }
    if (!["--profile", "--skills-dir"].includes(value)) throw new Error(`Unknown option: ${value}`);
    const supplied = argv[index + 1];
    if (!supplied || supplied.startsWith("--")) throw new Error(`${value} requires a value.`);
    options[value === "--profile" ? "profile" : "skillsDirectory"] = supplied;
    index += 1;
  }
  return options;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const results = await inspectApp(process.cwd(), { skillsDirectory: options.skillsDirectory });
  if (options.json) {
    stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  } else {
    const symbols = { pass: "✓", warn: "!", fail: "✗" };
    for (const item of results) {
      stdout.write(`${symbols[item.status]} ${item.name}: ${item.detail}${item.next ? `\n  Prochaine action: ${item.next}` : ""}\n`);
    }
  }
  if (results.some((item) => item.status === "fail")) process.exit(1);
  if (options.remote) {
    stdout.write("\nContrôle distant en lecture seule:\n");
    const environment = { ...process.env, ...(options.profile ? { DATABRICKS_CONFIG_PROFILE: options.profile } : {}) };
    const remote = spawnSync(
      process.execPath,
      ["--env-file-if-exists=.env.local", "--import", "tsx", "scripts/check-databricks.ts"],
      { cwd: process.cwd(), env: environment, stdio: "inherit" },
    );
    if (remote.error) throw remote.error;
    if (remote.status !== 0) process.exit(remote.status ?? 1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
