import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("remote smoke verifies health and runtime data readiness without leaking the token", async () => {
  const root = await mkdtemp(join(tmpdir(), "databricks-app-smoke-"));
  const executable = join(root, "databricks");
  const token = "synthetic-secret-token";
  await writeFile(
    executable,
    [
      "#!/bin/sh",
      "if [ \"$1 $2\" = \"apps get\" ]; then",
      "  printf '{\"url\":\"%s\",\"app_status\":{\"state\":\"RUNNING\"}}' \"$APP_TEST_URL\"",
      "else",
      `  printf '{"access_token":"${token}"}'`,
      "fi",
    ].join("\n"),
    "utf8",
  );
  await chmod(executable, 0o755);

  const seenPaths: string[] = [];
  const server = createServer((request, response) => {
    seenPaths.push(request.url ?? "");
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/health") {
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }
    response.end(JSON.stringify({ status: "ok", ready: true, sourceCount: 2 }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const result = await execFileAsync(
      process.execPath,
      ["scripts/smoke-deployed-app.mjs", "--app", "sample-app"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          APP_TEST_URL: `http://127.0.0.1:${address.port}`,
          PATH: `${root}${delimiter}${process.env.PATH ?? ""}`,
        },
      },
    );
    assert.match(result.stdout, /runtime SQL access verified on 2 source/);
    assert.match(result.stdout, new RegExp(`http://127\\.0\\.0\\.1:${address.port}`));
    assert.doesNotMatch(result.stdout, new RegExp(token));
    assert.deepEqual(seenPaths, ["/api/health", "/api/readiness"]);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
