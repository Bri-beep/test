import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, lstat, mkdir, readlink, stat, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function findRepositoryRoot(cwd = process.cwd()): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
  });
  const root = stdout.trim();
  assert.ok(root, "The fixture must run from a Git checkout.");
  return root;
}

export async function copyTrackedFiles(
  sourceRoot: string,
  fixtureRoot: string,
  additionalFiles: string[] = [],
): Promise<void> {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
    cwd: sourceRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const files = [...new Set([...stdout.split("\0").filter(Boolean), ...additionalFiles])];
  assert.ok(files.length > 0, "The fixture must contain tracked files.");

  for (const file of files) {
    const source = join(sourceRoot, file);
    const destination = join(fixtureRoot, file);
    await mkdir(dirname(destination), { recursive: true });
    const metadata = await lstat(source);
    if (metadata.isSymbolicLink()) {
      await symlink(await readlink(source), destination);
      continue;
    }
    await copyFile(source, destination);
  }
}

export async function linkRepositoryNodeModules(sourceRoot: string, fixtureRoot: string): Promise<void> {
  const nodeModules = join(sourceRoot, "node_modules");
  const metadata = await stat(nodeModules).catch(() => undefined);
  assert.ok(metadata?.isDirectory(), "Run npm ci before creating a fixture that shares dependencies.");
  await symlink(nodeModules, join(fixtureRoot, "node_modules"), "dir");
}
