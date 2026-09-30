import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

type ReleaseAssessment = {
  required: boolean;
  bump: "none" | "patch" | "minor" | "major";
  addedCapabilities: string[];
  removedCapabilities: string[];
  relevantFiles: string[];
  errors: string[];
};

const {
  assessTemplateRelease,
  changedFilesSince,
  checkTemplateRelease,
  classifyVersionBump,
  isExactVersionIncrement,
  isReleaseRelevantPath,
} = await import(pathToFileURL(join(process.cwd(), "scripts/check-template-release.mjs")).href) as {
  assessTemplateRelease: (input: Record<string, unknown>) => ReleaseAssessment;
  changedFilesSince: (root: string, baseCommit: string) => string[];
  checkTemplateRelease: (
    root: string,
    options?: { base?: string },
  ) => Promise<{ skipped: boolean; reason?: string }>;
  classifyVersionBump: (from: string, to: string) => "none" | "patch" | "minor" | "major";
  isExactVersionIncrement: (from: string, to: string, bump?: string) => boolean;
  isReleaseRelevantPath: (path: string) => boolean;
};

const baseCommit = "a".repeat(40);
const releaseFiles = [
  "scripts/feature.ts",
  "README.md",
  "docs/template-upgrades.md",
  "template/upgrades/1.1.0-to-1.2.0.yml",
];

function assess(overrides: Record<string, unknown> = {}) {
  return assessTemplateRelease({
    baseVersion: "1.1.0",
    currentVersion: "1.2.0",
    baseCommit,
    baseCapabilities: ["existing"],
    currentCapabilities: ["existing", "new-capability"],
    currentRelease: {
      sourceCommit: baseCommit,
      extends: "1.1.0",
      capabilities: ["new-capability"],
    },
    upgradeReference: {
      from: "1.1.0",
      to: "1.2.0",
      path: "template/upgrades/1.1.0-to-1.2.0.yml",
    },
    upgradePath: "template/upgrades/1.1.0-to-1.2.0.yml",
    changedFiles: releaseFiles,
    ...overrides,
  });
}

test("classifies only exact semantic-version increments", () => {
  assert.equal(classifyVersionBump("1.1.0", "1.1.1"), "patch");
  assert.equal(classifyVersionBump("1.1.0", "1.2.0"), "minor");
  assert.equal(classifyVersionBump("1.1.0", "2.0.0"), "major");
  assert.equal(isExactVersionIncrement("1.1.0", "1.1.1"), true);
  assert.equal(isExactVersionIncrement("1.1.0", "1.2.0"), true);
  assert.equal(isExactVersionIncrement("1.1.0", "2.0.0"), true);
  assert.equal(isExactVersionIncrement("1.1.0", "1.3.0"), false);
  assert.equal(isExactVersionIncrement("1.1.0", "2.1.0"), false);
});

test("does not require a release for documentation and tests only", () => {
  const result = assess({
    currentVersion: "1.1.0",
    currentCapabilities: ["existing"],
    changedFiles: ["README.md", "docs/architecture.md", "tests/feature.test.ts"],
  });
  assert.equal(result.required, false);
  assert.deepEqual(result.errors, []);
});

test("rejects feature behavior without a version bump", () => {
  const result = assess({
    currentVersion: "1.1.0",
    currentCapabilities: ["existing"],
    changedFiles: ["scripts/feature.ts"],
  });
  assert.equal(result.required, true);
  assert.match(result.errors.join("\n"), /without increasing currentVersion/);
});

test("rejects incompatible capability and version decisions", () => {
  const patchWithCapability = assess({
    currentVersion: "1.1.1",
    currentRelease: { sourceCommit: baseCommit, extends: "1.1.0", capabilities: ["new-capability"] },
    upgradeReference: { from: "1.1.0", to: "1.1.1", path: "template/upgrades/1.1.0-to-1.1.1.yml" },
    upgradePath: "template/upgrades/1.1.0-to-1.1.1.yml",
    changedFiles: [...releaseFiles.slice(0, 3), "template/upgrades/1.1.0-to-1.1.1.yml"],
  });
  assert.match(patchWithCapability.errors.join("\n"), /patch release cannot add capabilities/);

  const minorWithoutCapability = assess({ currentCapabilities: ["existing"] });
  assert.match(minorWithoutCapability.errors.join("\n"), /minor release must add/);

  const removedWithoutMajor = assess({
    baseCapabilities: ["existing", "removed"],
    currentCapabilities: ["existing", "new-capability"],
  });
  assert.match(removedWithoutMajor.errors.join("\n"), /Removing capabilities requires a major release/);

  const skippedMinor = assess({ currentVersion: "1.3.0" });
  assert.match(skippedMinor.errors.join("\n"), /not the next minor increment/);
});

test("accepts a complete compatible minor release", () => {
  const result = assess();
  assert.equal(result.required, true);
  assert.equal(result.bump, "minor");
  assert.deepEqual(result.addedCapabilities, ["new-capability"]);
  assert.deepEqual(result.errors, []);
});

test("treats agent skills and deleted implementation files as release relevant", async () => {
  assert.equal(isReleaseRelevantPath(".agents/skills/example/SKILL.md"), true);
  assert.equal(isReleaseRelevantPath("template/manifest.yml"), true);
  assert.equal(isReleaseRelevantPath("OPERATIONS.md"), true);
  assert.equal(isReleaseRelevantPath("docs/example.md"), false);
  assert.equal(isReleaseRelevantPath("tests/example.test.ts"), false);

  const root = await mkdtemp(join(tmpdir(), "template-release-files-"));
  await mkdir(join(root, "scripts"), { recursive: true });
  await writeFile(join(root, "scripts/existing.mjs"), "export {};\n", "utf8");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: root });
  execFileSync("git", ["add", "--all"], { cwd: root });
  execFileSync(
    "git",
    ["-c", "user.name=Release Test", "-c", "user.email=release@example.invalid", "commit", "--quiet", "-m", "base"],
    { cwd: root },
  );
  const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  await rm(join(root, "scripts/existing.mjs"));
  await writeFile(join(root, "scripts/untracked.mjs"), "export {};\n", "utf8");
  assert.deepEqual(changedFilesSince(root, base), ["scripts/existing.mjs", "scripts/untracked.mjs"]);
});

test("skips version bumps for initialized apps and rejects an explicit missing base", async () => {
  const root = await mkdtemp(join(tmpdir(), "template-release-app-"));
  await mkdir(join(root, "template"), { recursive: true });
  await copyFile("template/manifest.yml", join(root, "template/manifest.yml"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "initialized-app" }), "utf8");
  const skipped = await checkTemplateRelease(root);
  assert.deepEqual(skipped, { skipped: true, reason: "initialized-app" });

  const sourceRoot = await mkdtemp(join(tmpdir(), "template-release-source-"));
  await mkdir(join(sourceRoot, "template"), { recursive: true });
  await copyFile("template/manifest.yml", join(sourceRoot, "template/manifest.yml"));
  await writeFile(join(sourceRoot, "package.json"), JSON.stringify({ name: "__PACKAGE_NAME__" }), "utf8");
  await assert.rejects(
    checkTemplateRelease(sourceRoot, { base: "definitely-missing-release-base" }),
    /Unable to resolve the requested template release base/,
  );
  assert.match(await readFile("README.md", "utf8"), /template:release:check/);
});
