#!/usr/bin/env node

import { renderDataPreparation } from "./data-preparation.mjs";

const check = process.argv.includes("--check");
const allowPlaceholder = process.argv.includes("--allow-placeholder");
const contracts = await renderDataPreparation({ root: process.cwd(), check, allowPlaceholder });
process.stdout.write(`${check ? "Validated" : "Rendered"} ${contracts.length} data preparation contract(s).\n`);
