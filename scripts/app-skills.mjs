#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";
import { capabilityPlan } from "./app-capabilities.mjs";
import { loadAppSpec } from "./app-spec.mjs";

export function skillEntrypointHash(text) {
  return createHash("sha256").update(text).digest("hex");
}

export async function planAgentSkills(root, { capabilityIds = ["analytics"], skillsDirectory } = {}) {
  const { skills: reviewed } = JSON.parse(await readFile(join(root, "config/appkit-compatibility.json"), "utf8"));
  const names = [...new Set([...reviewed.names, ...capabilityPlan(capabilityIds).flatMap((item) => item.skills)])];
  if (names.some((name) => !/^databricks-[a-z0-9-]+$/.test(name))) throw new Error("Invalid upstream skill name.");
  const skills = [];
  for (const name of names) {
    const entry = { name, status: "unchecked", detail: "Installation externe non examinée." };
    if (skillsDirectory) {
      try {
        const source = await readFile(join(skillsDirectory, name, "SKILL.md"), "utf8");
        const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
        if (!frontmatter || parse(frontmatter)?.name !== name) {
          entry.status = "invalid";
          entry.detail = "Entrée SKILL.md invalide ou nom différent.";
        } else if (!reviewed.entrypointSha256?.[name]) {
          entry.status = "unreviewed";
          entry.detail = "Présent ; entrée non comparée à une empreinte revue.";
        } else if (skillEntrypointHash(source) !== reviewed.entrypointSha256[name]) {
          entry.status = "changed";
          entry.detail = "L’entrée diffère de la révision revue ; examiner la mise à jour.";
        } else {
          entry.status = "match";
          entry.detail = "Entrée conforme à l’empreinte revue ; références annexes non comparées.";
        }
      } catch (error) {
        entry.status = error?.code === "ENOENT" ? "missing" : "invalid";
        entry.detail = entry.status === "missing" ? "SKILL.md absent." : "SKILL.md illisible ou invalide.";
      }
    }
    skills.push(entry);
  }
  return {
    reviewedRelease: reviewed.release,
    reviewedRevision: reviewed.reviewedRevision,
    skills,
    installCommand: `databricks aitools install --scope global --skills-only --skills ${names.join(",")}`,
    readOnly: true,
  };
}

export async function inspectAgentSkills(root, options) {
  let plan;
  try { plan = await planAgentSkills(root, options); }
  catch { return [{ status: "warn", name: "Skills externes", detail: "Registre de skills absent ou invalide.", next: "Consulter docs/appkit-maintenance.md" }]; }
  const reviewed = plan.skills.filter((skill) => skill.status === "match").length;
  return [{
    status: reviewed === plan.skills.length ? "pass" : "warn",
    name: "Skills externes",
    detail: options?.skillsDirectory
      ? `${reviewed}/${plan.skills.length} entrées conformes à l’empreinte revue. Aucun fichier installé ou modifié.`
      : `Installation non vérifiée : dossier externe non fourni. ${plan.skills.length} skills proposés.`,
    ...(reviewed === plan.skills.length ? {} : { next: "npm run app:skills -- --directory <dossier-de-skills>" }),
  }];
}

async function main() {
  const args = process.argv.slice(2);
  let skillsDirectory;
  let json = false;
  let check = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--json") json = true;
    else if (args[index] === "--check") check = true;
    else if (args[index] === "--directory" && args[index + 1] && !args[index + 1].startsWith("--")) skillsDirectory = args[++index];
    else throw new Error("Usage: npm run app:skills -- [--directory <path>] [--check] [--json]");
  }
  if (check && !skillsDirectory) throw new Error("--check requires --directory; no installation can be inferred.");
  const spec = await loadAppSpec(process.cwd(), { allowPlaceholder: true });
  const plan = await planAgentSkills(process.cwd(), { capabilityIds: spec.capabilities, skillsDirectory });
  process.stdout.write(json ? `${JSON.stringify(plan, null, 2)}\n` : [
    `Skills Databricks — référence revue ${plan.reviewedRelease} (${plan.reviewedRevision}).`,
    ...plan.skills.map((skill) => `${skill.name}: ${skill.status} — ${skill.detail}`),
    "\nInstallation proposée hors du repository (non exécutée) :",
    plan.installCommand,
    "Ajouter --agents <assistant> pour cibler un seul outil. Examiner databricks aitools install --help avant installation.",
    "Une installation peut livrer une révision plus récente. Réexaminer les écarts avant de changer les empreintes.",
    "Les skills ne sont pas des plugins runtime. Le mode démo et les checks CI fonctionnent sans eux.",
    "",
  ].join("\n"));
  if (check && plan.skills.some((skill) => skill.status !== "match")) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
