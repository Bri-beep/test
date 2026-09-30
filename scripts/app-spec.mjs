import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { parse, stringify } from "yaml";
import { capabilityPlan, validateCapabilities } from "./app-capabilities.mjs";

const APP_NAME_PLACEHOLDER = "__PACKAGE_NAME__";
const appTypes = ["dashboard", "cockpit", "suivi", "assistant", "workflow"];
const featureSlugPattern = /^[a-z0-9][a-z0-9-]*$/;
const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function requiredText(value, label, { min = 2, max = 300 } = {}) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    throw new Error(`${label} must contain between ${min} and ${max} characters.`);
  }
  return value.trim();
}

function jsxText(value, label, options) {
  const validated = requiredText(value, label, options);
  if (/[<>{}]/.test(validated)) throw new Error(`${label} cannot contain JSX control characters.`);
  return validated;
}

function validateMetric(value, slug) {
  assertObject(value, `Feature '${slug}' metric`);
  const aggregation = value.aggregation;
  if (!["count", "sum", "avg"].includes(aggregation)) {
    throw new Error(`Feature '${slug}' metric aggregation must be count, sum or avg.`);
  }
  const column = aggregation === "count" && !value.column ? "*" : value.column;
  if (column !== "*" && (typeof column !== "string" || !identifierPattern.test(column))) {
    throw new Error(`Feature '${slug}' metric column must be a simple column identifier.`);
  }
  if (aggregation !== "count" && column === "*") {
    throw new Error(`Feature '${slug}' must name a metric column for ${aggregation}.`);
  }
  const demoValue = Number(value.demoValue ?? 0);
  if (!Number.isFinite(demoValue)) throw new Error(`Feature '${slug}' demoValue must be a finite number.`);
  return {
    label: requiredText(value.label, `Feature '${slug}' metric label`, { max: 100 }),
    aggregation,
    column,
    unit: requiredText(value.unit ?? "valeur", `Feature '${slug}' metric unit`, { min: 1, max: 30 }),
    demoValue,
  };
}

function validateComparison(value, slug) {
  assertObject(value, `Feature '${slug}' comparison`);
  for (const key of Object.keys(value)) {
    if (!["dateColumn", "breakdownColumn", "sharing"].includes(key)) throw new Error(`Unknown comparison option '${key}'.`);
  }
  if (!value.dateColumn) throw new Error(`Feature '${slug}' comparison requires a DATE column.`);
  for (const key of ["dateColumn", "breakdownColumn"]) {
    const column = value[key];
    if (column === undefined && key === "breakdownColumn") continue;
    if (typeof column !== "string" || !identifierPattern.test(column)) throw new Error(`Feature '${slug}' comparison ${key} must be a simple column identifier.`);
  }
  if (value.sharing !== undefined) {
    if (slug.length > 64) throw new Error(`Feature '${slug}' comparison sharing requires a slug of at most 64 characters.`);
    assertObject(value.sharing, `Feature '${slug}' comparison sharing`);
    if (Object.keys(value.sharing).some((key) => key !== "allowSegment") || typeof value.sharing.allowSegment !== "boolean") {
      throw new Error(`Feature '${slug}' comparison sharing requires only an allowSegment boolean.`);
    }
    if (value.sharing.allowSegment && !value.breakdownColumn) {
      throw new Error(`Feature '${slug}' comparison sharing allowSegment requires a breakdownColumn.`);
    }
  }
  return { dateColumn: value.dateColumn, ...(value.breakdownColumn ? { breakdownColumn: value.breakdownColumn } : {}),
    ...(value.sharing !== undefined ? { sharing: { allowSegment: value.sharing.allowSegment } } : {}) };
}

function validateFeature(value, index) {
  assertObject(value, `Feature ${index + 1}`);
  const slug = value.slug;
  if (typeof slug !== "string" || !featureSlugPattern.test(slug)) {
    throw new Error(`Feature ${index + 1} slug must use lowercase letters, numbers and hyphens.`);
  }
  const metric = validateMetric(value.metric, slug);
  return {
    slug,
    title: jsxText(value.title, `Feature '${slug}' title`, { max: 100 }),
    question: jsxText(value.question, `Feature '${slug}' question`),
    source: requiredText(value.source, `Feature '${slug}' source`, { max: 80 }),
    metric,
    ...(value.comparison ? { comparison: validateComparison(value.comparison, slug) } : {}),
    acceptance: requiredText(value.acceptance, `Feature '${slug}' acceptance`),
  };
}

export function validateAppSpec(value, { allowPlaceholder = false } = {}) {
  assertObject(value, "App specification");
  if (value.version !== 1) throw new Error("App specification version must be 1.");
  assertObject(value.app, "App specification app");
  const name = value.app.name;
  if (
    typeof name !== "string" ||
    (!/^[a-z0-9][a-z0-9-]*$/.test(name) && !(allowPlaceholder && name === APP_NAME_PLACEHOLDER))
  ) {
    throw new Error("App name must use lowercase letters, numbers and hyphens.");
  }
  if (!appTypes.includes(value.app.type)) {
    throw new Error(`App type must be one of: ${appTypes.join(", ")}.`);
  }
  if (!Array.isArray(value.features)) throw new Error("App specification features must be an array.");
  const features = value.features.map(validateFeature);
  const slugs = new Set();
  for (const feature of features) {
    if (slugs.has(feature.slug)) throw new Error(`Feature '${feature.slug}' is duplicated.`);
    slugs.add(feature.slug);
  }
  const selectedCapabilities = validateCapabilities(value.capabilities);
  if (features.length && !selectedCapabilities.includes("analytics")) {
    throw new Error("Existing KPI features require the analytics capability. Keep it while these features exist.");
  }
  return {
    version: 1,
    app: {
      name,
      type: value.app.type,
      audience: requiredText(value.app.audience, "App audience"),
      decision: requiredText(value.app.decision, "App decision"),
      success: requiredText(value.app.success, "App success criterion"),
    },
    capabilities: selectedCapabilities,
    features,
  };
}

export async function loadAppSpec(root, options) {
  const path = join(root, "config/app-spec.yml");
  try {
    return validateAppSpec(parse(await readFile(path, "utf8")), options);
  } catch (error) {
    throw new Error(`Unable to read ${path}: ${error instanceof Error ? error.message : "unknown error"}`, {
      cause: error,
    });
  }
}

export async function writeAppSpec(root, spec) {
  const validated = validateAppSpec(spec, { allowPlaceholder: true });
  const path = join(root, "config/app-spec.yml");
  await writeFile(path, stringify(validated, { lineWidth: 120 }), "utf8");
  return validated;
}

export function renderProductBrief(spec) {
  const selected = capabilityPlan(spec.capabilities);
  const capabilitySections = selected.length
    ? selected.map((item) => `- **${item.id}** : ${item.label}. ${item.stability === "beta" ? "Bêta : décision explicite requise avant intégration. " : ""}Guide : [${item.guide}](../${item.guide}).`).join("\n")
    : "Aucune capacité choisie ; préciser le besoin avant de construire la première tranche.";
  const featureSections = spec.features.length
    ? spec.features
        .map(
          (feature) => `### ${feature.title}\n\n- Question : ${feature.question}\n- Source : \`${feature.source}\`\n- KPI : ${feature.metric.label} (${feature.metric.aggregation}${feature.metric.column === "*" ? "" : ` de \`${feature.metric.column}\``}, ${feature.metric.unit})${feature.comparison ? `\n- Comparaison : colonne DATE \`${feature.comparison.dateColumn}\`${feature.comparison.breakdownColumn ? ` ; contributions par \`${feature.comparison.breakdownColumn}\`` : ""}. Calendrier et complétude à valider.` : ""}${feature.comparison?.sharing ? `\n- Partage de la comparaison : liens activés pour les périodes${feature.comparison.sharing.allowSegment ? ` et le segment de \`${feature.comparison.breakdownColumn}\` (dimension explicitement autorisée dans les liens ; revue à documenter)` : " ; partage des sélections filtrées désactivé"}. Les liens ne modifient pas les droits d’accès.` : ""}\n- Critère d’acceptation : ${feature.acceptance}`,
        )
        .join("\n\n")
    : "Aucun KPI généré. La première tranche suit les capacités et le critère de succès ci-dessus.";
  return `# Brief produit\n\n## Objectif et utilisateurs\n\n- Type : ${spec.app.type}\n- Utilisateurs : ${spec.app.audience}\n- Décision à faciliter : ${spec.app.decision}\n- Critère de succès : ${spec.app.success}\n\n## Capacités envisagées\n\nCes choix cadrent le besoin ; ils n’activent ni plugin, ni ressource, ni droit.\n\n${capabilitySections}\n\n## KPI, sources et fonctionnalités\n\n${featureSections}\n\n## Accès, confidentialité et exploitation\n\nÀ confirmer avant le premier accès à des données réelles.\n\n## Backlog\n\nConstruire et faire valider une tranche à la fois.\n`;
}

export async function syncProductBrief(root, spec) {
  await writeFile(join(root, "docs/product-brief.md"), renderProductBrief(spec), "utf8");
}

export { APP_NAME_PLACEHOLDER, appTypes, featureSlugPattern, identifierPattern };
