#!/usr/bin/env node

import { renderDataAccess } from "./data-access.mjs";

const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== "--check" && arg !== "--allow-placeholder");
if (unknown.length > 0) throw new Error(`Unknown option: ${unknown[0]}`);

const check = args.includes("--check");
const manifest = await renderDataAccess({
  root: process.cwd(),
  check,
  allowPlaceholder: args.includes("--allow-placeholder"),
});

process.stdout.write(
  `${check ? "Validated" : "Rendered"} ${manifest.sources.length} data source(s) in ${manifest.project}.\n`,
);
