import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { parseDataAccessManifest } from "../src/lib/config/data-access";

test("setup produces two simple Delta tables and limits write bindings to declared personal state", async () => {
  const root = await mkdtemp(join(tmpdir(), "user-state-setup-"));
  for (const file of ["scripts/init-user-state.mjs", "scripts/data-access.mjs", "config/data-projects.json"]) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await copyFile(file, join(root, file));
  }
  await copyFile("config/genie-spaces.json", join(root, "config/genie-spaces.json"));
  await mkdir(join(root, "resources"));
  await writeFile(join(root, "config/data-access.json"), JSON.stringify({
    project: "dev-dtm-media-pm",
    sources: [{ name: "kpi", fullName: "dev-dtm-media-pm.analytics.kpis", purpose: "Read analytical KPIs" }],
  }));
  const run = () => execFileSync(process.execPath, ["scripts/init-user-state.mjs", "--schema", "my_app_state"], { cwd: root, encoding: "utf8" });
  assert.match(run(), /No remote change/);
  const ddl = await readFile(join(root, "migrations/user-state/001_tables.generated.sql"), "utf8");
  const bundle = await readFile(join(root, "resources/data-access.generated.yml"), "utf8");
  const parsed = parse(bundle);
  const resources = parsed.resources.apps.app.resources.filter((resource: { uc_securable?: unknown }) => resource.uc_securable);
  assert.deepEqual(resources.map((resource: { uc_securable: { permission: string } }) => resource.uc_securable.permission), ["SELECT", "MODIFY", "MODIFY"]);
  assert.equal((ddl.match(/create table if not exists/g) ?? []).length, 2);
  assert.doesNotMatch(ddl, /create or replace|merge into|partitioned by|grant all/i);
  assert.match(ddl, /`dev-dtm-media-pm`\.`my_app_state`\.`saved_analyses_v1`/);
  const manifest = JSON.parse(await readFile(join(root, "config/data-access.json"), "utf8"));
  assert.equal(parseDataAccessManifest(manifest).personalState?.preferences, "dev-dtm-media-pm.my_app_state.user_preferences_v1");
  run();
  assert.equal(await readFile(join(root, "resources/data-access.generated.yml"), "utf8"), bundle);
  assert.equal(await readFile(join(root, "migrations/user-state/001_tables.generated.sql"), "utf8"), ddl);
  const move = spawnSync(process.execPath, ["scripts/init-user-state.mjs", "--schema", "other_schema"], { cwd: root, encoding: "utf8" });
  assert.equal(move.status, 1);
  assert.match(move.stderr, /explicit migration/);
});

test("personal table manifests reject cross-project, arbitrary, overlapping and inconsistent targets", () => {
  const valid = {
    project: "dev-dtm-media-pm", sources: [],
    personalState: { analyses: "dev-dtm-media-pm.state.saved_analyses_v1", preferences: "dev-dtm-media-pm.state.user_preferences_v1" },
  };
  for (const analyses of ["prod-dtm-media-pm.state.saved_analyses_v1", "dev-dtm-myvaliuz.state.saved_analyses_v1", "dev-dtm-media-pm.state.kpis", "dev-dtm-media-pm.other.saved_analyses_v1", "dev-dtm-media-pm.state;drop.saved_analyses_v1"]) {
    assert.throws(() => parseDataAccessManifest({ ...valid, personalState: { ...valid.personalState, analyses } }));
  }
  assert.throws(() => parseDataAccessManifest({ ...valid, sources: [{ name: "overlap", fullName: valid.personalState.analyses, purpose: "Not an analytical source" }] }));
});
