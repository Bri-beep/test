import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
type SkillPlan = {
  skills: Array<{ name: string; status: string }>;
  readOnly: boolean;
  installCommand: string;
};
const { inspectAgentSkills, planAgentSkills, skillEntrypointHash } = await import(new URL("../scripts/app-skills.mjs", import.meta.url).href) as {
  inspectAgentSkills: (root: string) => Promise<Array<{ status: string }>>;
  planAgentSkills: (root: string, options?: { skillsDirectory?: string; capabilityIds?: string[] }) => Promise<SkillPlan>;
  skillEntrypointHash: (text: string) => string;
};
const { capabilities, appkitVersion } = await import(new URL("../scripts/app-capabilities.mjs", import.meta.url).href) as {
  capabilities: Array<{ id: string; guide: string; upstreamDoc?: string; stability: string }>;
  appkitVersion: string;
};

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "valiuz-skills-"));
  const directory = join(root, "external-skills");
  for (const file of ["scripts/app-skills.mjs", "scripts/app-spec.mjs", "scripts/app-capabilities.mjs", "config/appkit-capabilities.json", "config/appkit-compatibility.json", "config/app-spec.yml"]) {
    const destination = join(root, file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(file, destination);
  }
  const record = JSON.parse(await readFile(join(root, "config/appkit-compatibility.json"), "utf8"));
  for (const name of record.skills.names) {
    const content = `---\nname: ${name}\ndescription: Synthetic guidance fixture.\n---\nReviewed fixture.\n`;
    await mkdir(join(directory, name), { recursive: true });
    await writeFile(join(directory, name, "SKILL.md"), content);
    record.skills.entrypointSha256[name] = skillEntrypointHash(content);
  }
  await writeFile(join(root, "config/appkit-compatibility.json"), JSON.stringify(record));
  await symlink(join(process.cwd(), "node_modules"), join(root, "node_modules"), "dir");
  return { root, directory, record };
}

test("skills inspection is read-only and distinguishes unexamined, matching, changed and missing entries", async () => {
  const { root, directory, record } = await fixture();
  const before = await readFile(join(root, "config/appkit-compatibility.json"), "utf8");
  assert.equal((await planAgentSkills(root)).skills.every((item) => item.status === "unchecked"), true);
  assert.equal((await inspectAgentSkills(root))[0].status, "warn");
  assert.equal((await planAgentSkills(root, { skillsDirectory: directory })).skills.every((item) => item.status === "match"), true);
  execFileSync(process.execPath, ["scripts/app-skills.mjs", "--directory", directory, "--check"], { cwd: root, env: { ...process.env, PATH: "" } });

  await writeFile(join(directory, "databricks-apps/SKILL.md"), "---\nname: databricks-apps\ndescription: Changed fixture.\n---\nChanged.\n");
  await writeFile(join(directory, "databricks-core/SKILL.md"), "---\nname: another-skill\n---\n");
  const plan = await planAgentSkills(root, { skillsDirectory: directory, capabilityIds: ["serving", "jobs"] });
  assert.equal(plan.skills.find((item) => item.name === "databricks-apps")?.status, "changed");
  assert.equal(plan.skills.find((item) => item.name === "databricks-core")?.status, "invalid");
  assert.equal(plan.skills.find((item) => item.name === "databricks-model-serving")?.status, "missing");
  assert.equal(plan.skills.find((item) => item.name === "databricks-jobs")?.status, "missing");
  assert.equal(plan.readOnly, true);
  assert.equal(new Set(plan.skills.map((item) => item.name)).size, record.skills.names.length + 2);
  assert.match(plan.installCommand, /--skills-only/);
  assert.equal(await readFile(join(root, "config/appkit-compatibility.json"), "utf8"), before);
  assert.deepEqual((await readdir(directory)).sort(), [...record.skills.names].sort());
  const check = spawnSync(process.execPath, ["scripts/app-skills.mjs", "--directory", directory, "--check", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(check.status, 1);
  assert.equal(JSON.parse(check.stdout).skills.find((item: { name: string }) => item.name === "databricks-apps").status, "changed");
});

test("capability catalog agrees with installed plugin documentation and local integration guides", async () => {
  const record = JSON.parse(await readFile("config/appkit-compatibility.json", "utf8"));
  assert.equal(appkitVersion, record.packages["@databricks/appkit"]);
  for (const item of capabilities) {
    const guide = await readFile(item.guide.split("#")[0], "utf8");
    assert.ok(guide.length > 0);
    if (!item.upstreamDoc) continue;
    const doc = await readFile(`node_modules/@databricks/appkit/docs/plugins/${item.upstreamDoc}.md`, "utf8");
    assert.equal(doc.slice(0, 300).includes("Beta plugin"), item.stability === "beta", item.id);
  }
});
