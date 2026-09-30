#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { appTypes, loadAppSpec, renderProductBrief, syncProductBrief, writeAppSpec } from "./app-spec.mjs";
import { loadDataAccessManifest } from "./data-access.mjs";
import { capabilities, parseCapabilities, renderCapabilityPlan } from "./app-capabilities.mjs";

function parseOptions(argv) {
  const options = { nonInteractive: false, check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--non-interactive" || flag === "--check") {
      options[flag.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = true;
      continue;
    }
    if (!["--type", "--audience", "--decision", "--success", "--capabilities"].includes(flag)) {
      throw new Error(`Unknown option: ${flag}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
    options[flag.slice(2)] = value;
    index += 1;
  }
  return options;
}

const root = process.cwd();
const options = parseOptions(process.argv.slice(2));
const current = await loadAppSpec(root, { allowPlaceholder: true });

if (options.check) {
  const access = await loadDataAccessManifest(root, { allowPlaceholder: true });
  for (const feature of current.features) {
    if (!access.sources.some((source) => source.name === feature.source)) {
      throw new Error(`Feature '${feature.slug}' uses undeclared source '${feature.source}'.`);
    }
  }
  const expected = renderProductBrief(current);
  const actual = await readFile(join(root, "docs/product-brief.md"), "utf8");
  if (actual !== expected) {
    throw new Error("Product brief is stale. Run npm run app:guide -- --non-interactive.");
  }
  stdout.write(`Validated app specification with ${current.features.length} feature(s).\n`);
  process.exit(0);
}

const prompts = [
  ["type", "Type d’app", current.app.type],
  ["audience", "Qui utilise l’app ?", current.app.audience],
  ["decision", "Quelle décision doit-elle faciliter ?", current.app.decision],
  ["success", "Comment saura-t-on que la V1 est utile ?", current.app.success],
];
const answers = {};
let selected = options.capabilities ? parseCapabilities(options.capabilities) : current.capabilities;
const readline = options.nonInteractive ? undefined : createInterface({ input: stdin, output: stdout });
try {
  for (const [key, label, fallback] of prompts) {
    answers[key] = options[key] ?? (readline ? (await readline.question(`${label} [${fallback}]: `)).trim() || fallback : fallback);
  }
  if (readline && !options.capabilities) {
    stdout.write(`\nQuelles capacités servent ce besoin ?\n${capabilities.map((item) => `  ${item.id} : ${item.label}${item.stability === "beta" ? " (bêta)" : ""}`).join("\n")}\n`);
    const fallback = selected.join(",") || "none";
    const answer = (await readline.question(`Identifiants séparés par des virgules ; none pour aucun [${fallback}]: `)).trim();
    selected = parseCapabilities(answer || fallback);
  }
} finally {
  readline?.close();
}

if (!appTypes.includes(answers.type)) {
  throw new Error(`App type must be one of: ${appTypes.join(", ")}.`);
}

const next = await writeAppSpec(root, { ...current, app: { ...current.app, ...answers }, capabilities: selected });
await syncProductBrief(root, next);
stdout.write(`Spécification et brief synchronisés.\n${renderCapabilityPlan(selected)}\nProchaine action : npm run app:doctor.\n`);
