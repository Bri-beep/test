#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const catalog = JSON.parse(readFileSync(new URL("../config/appkit-capabilities.json", import.meta.url), "utf8"));
export const capabilities = catalog.capabilities;
export const appkitVersion = catalog.appkitVersion;

export function validateCapabilities(value = ["analytics"]) {
  if (!Array.isArray(value) || value.some((id) => !capabilities.some((item) => item.id === id))) {
    throw new Error(`Capabilities must be an array containing: ${capabilities.map((item) => item.id).join(", ")}.`);
  }
  if (new Set(value).size !== value.length) throw new Error("Capabilities must not contain duplicates.");
  return [...value];
}

export function parseCapabilities(value) {
  return validateCapabilities(value === "none" ? [] : value.split(",").map((id) => id.trim()));
}

export function capabilityPlan(ids) {
  return validateCapabilities(ids).map((id) => capabilities.find((item) => item.id === id));
}

export function renderCapabilityPlan(ids) {
  const availability = { integrated: "socle intégré", adapter: "adaptateur Valiuz conservé", optional: "intégration à réaliser" };
  const plan = capabilityPlan(ids);
  return [
    `Capacités envisagées — catalogue AppKit ${appkitVersion}. Ce choix n’active aucun plugin ni aucun droit.`,
    ...plan.map((item) => `\n${item.id} — ${item.label} [${item.stability}; ${availability[item.availability]}]\n  Ressources : ${item.resources}\n  Étape : ${item.next}\n  Vérifier : ${item.checks}\n  Guide : ${item.guide}`),
    ...(plan.length ? [] : ["Aucune capacité choisie ; préciser le besoin avec npm run app:guide."]),
    "\nSkills utiles : npm run app:skills. La disponibilité du socle ne prouve pas l’intégration dans votre app.",
  ].join("\n");
}

async function main() {
  const options = process.argv.slice(2);
  if (options.some((option) => !["--all", "--json"].includes(option))) {
    throw new Error("Usage: npm run app:capabilities -- [--all] [--json]");
  }
  const { loadAppSpec } = await import("./app-spec.mjs");
  const ids = options.includes("--all")
    ? capabilities.map((item) => item.id)
    : (await loadAppSpec(process.cwd(), { allowPlaceholder: true })).capabilities;
  process.stdout.write(options.includes("--json")
    ? `${JSON.stringify({ appkitVersion, activatesPlugins: false, capabilities: capabilityPlan(ids) }, null, 2)}\n`
    : `${renderCapabilityPlan(ids)}\n`);
}

// Finish module evaluation before loading the spec, which imports this catalog.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
