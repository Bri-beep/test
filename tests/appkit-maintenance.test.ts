import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";

const { inspectAppKitCompatibility } = await import(new URL("../scripts/appkit-compatibility.mjs", import.meta.url).href) as {
  inspectAppKitCompatibility: (root: string, options: {
    execute: (command: string, args: string[]) => { status: number; stdout: string };
  }) => Promise<Array<{ name: string; status: string }>>;
};

test("AppKit versions and prefixed CLI versions match the reviewed compatibility record", async () => {
  const record = JSON.parse(await readFile("config/appkit-compatibility.json", "utf8"));
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  assert.equal(record.packages["@databricks/appkit"], record.packages["@databricks/appkit-ui"]);
  for (const [name, version] of Object.entries(record.packages)) {
    assert.equal(pkg.dependencies[name], version);
    assert.equal(lock.packages[`node_modules/${name}`].version, version);
  }
  assert.match(record.skills.reviewedRevision, /^[a-f0-9]{40}$/);
  assert.ok(record.exceptions.every((item: { reason?: string; removeWhen?: string }) => item.reason && item.removeWhen));
  for (const prefix of ["v", ""]) {
    const results = await inspectAppKitCompatibility(process.cwd(), {
      execute: (command, args) => {
        assert.equal(command, "databricks");
        assert.deepEqual(args, ["--version"]);
        return { status: 0, stdout: `Databricks CLI ${prefix}${record.databricksCli[0]}\n` };
      },
    });
    assert.equal(results.find((item) => item.name === "Matrice CLI")?.status, "pass");
  }
  for (const response of [{ status: 0, stdout: "Databricks CLI v99.0.0" }, { status: 1, stdout: `v${record.databricksCli[0]}` }]) {
    const results = await inspectAppKitCompatibility(process.cwd(), { execute: () => response });
    assert.equal(results.find((item) => item.name === "Matrice CLI")?.status, "warn");
  }
});

test("weekly upstream review has read-only permissions and no auto-merge", async () => {
  const workflow = parse(await readFile(".github/workflows/upstream-check.yml", "utf8"));
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.equal(workflow.on.schedule.length, 1);
  const dependencies = parse(await readFile(".github/dependabot.yml", "utf8"));
  assert.equal(dependencies.updates[0].schedule.interval, "weekly");
  assert.deepEqual(dependencies.updates[0].groups.appkit.patterns, ["@databricks/appkit", "@databricks/appkit-ui"]);
});
