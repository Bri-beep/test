import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { build } from "vite";

test("the browser build rejects transitive server imports before emitting assets", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "valiuz-browser-boundary-"));
  try {
    await mkdir(join(fixture, "src/lib/config"), { recursive: true });
    await writeFile(join(fixture, "index.html"), '<script type="module" src="/src/client.ts"></script>');
    await writeFile(join(fixture, "src/client.ts"), 'import { value } from "./bridge"; document.title = value;');
    await writeFile(join(fixture, "src/bridge.ts"), 'export { value } from "./lib/config/private";');
    await writeFile(join(fixture, "src/lib/config/private.ts"), 'export const value = "synthetic-private-value";');
    await assert.rejects(build({
      configFile: resolve("vite.config.ts"), root: fixture, logLevel: "silent", build: { write: false },
    }), /browser module imports server code/);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
