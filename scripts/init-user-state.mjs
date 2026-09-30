#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadDataAccessManifest, renderDataAccess } from "./data-access.mjs";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--schema" || !/^[A-Za-z0-9_-]{1,80}$/.test(args[1])) {
  throw new Error("Usage: npm run user-state:init -- --schema <dedicated-schema>");
}
const root = process.cwd();
const manifest = await loadDataAccessManifest(root);
const schema = args[1];
const personalState = {
  analyses: `${manifest.project}.${schema}.saved_analyses_v1`,
  preferences: `${manifest.project}.${schema}.user_preferences_v1`,
};
if (manifest.personalState && (manifest.personalState.analyses !== personalState.analyses
  || manifest.personalState.preferences !== personalState.preferences)) {
  throw new Error("Personal state is already configured in another schema. Plan an explicit migration first.");
}
if (manifest.sources.some((source) => Object.values(personalState).includes(source.fullName))) {
  throw new Error("Personal state tables must not also appear in analytical sources.");
}
await writeFile(join(root, "config/data-access.json"), `${JSON.stringify({ ...manifest, personalState }, null, 2)}\n`);
await renderDataAccess({ root });
const quote = (name) => name.split(".").map((part) => `\`${part}\``).join(".");
const ddl = [
  "-- Generated locally. Review workspace, profile, warehouse, project and schema before running.",
  "-- Run with the maintainer identity; the app only needs SELECT and MODIFY on these tables.",
  `create schema if not exists ${quote(`${manifest.project}.${schema}`)};`,
  ...Object.values(personalState).map((name) => `
create table if not exists ${quote(name)} (
  app_id string not null,
  owner_id string not null,
  entity_id string not null,
  version_id string not null,
  updated_at string not null,
  deleted boolean not null,
  payload_json string not null
) using delta;`),
  "",
].join("\n");
await mkdir(join(root, "migrations/user-state"), { recursive: true });
await writeFile(join(root, "migrations/user-state/001_tables.generated.sql"), ddl);
process.stdout.write(`Prepared ${Object.values(personalState).join(" and ")}.\n`);
process.stdout.write("No remote change. Review migrations/user-state/001_tables.generated.sql and the generated bindings.\n");
