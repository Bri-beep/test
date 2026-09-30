import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import test from "node:test";

const scriptFiles = [
  "scripts/data-access.mjs",
  "scripts/deploy.mjs",
  "scripts/render-data-access.mjs",
];

async function prepareFixture(withSources: boolean) {
  const root = await mkdtemp(join(tmpdir(), "databricks-deploy-"));
  for (const file of scriptFiles) {
    const destination = join(root, file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(file, destination);
  }
  await mkdir(join(root, "config"), { recursive: true });
  await mkdir(join(root, "resources"), { recursive: true });
  await copyFile("config/data-projects.json", join(root, "config/data-projects.json"));
  await copyFile("config/genie-spaces.json", join(root, "config/genie-spaces.json"));
  await writeFile(
    join(root, "config/data-access.json"),
    JSON.stringify({
      project: "dev-dtm-media-pm",
      sources: withSources
        ? [
            {
              name: "dashboard-source",
              fullName: "dev-dtm-media-pm.analytics.dashboard_source",
              purpose: "Dashboard source",
            },
          ]
        : [],
    }),
    "utf8",
  );
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "sample-app" }), "utf8");
  await writeFile(
    join(root, "databricks.yml"),
    [
      "variables:",
      "  sql_warehouse_id:",
      "    default: warehouse-id",
      "targets:",
      "  prod:",
      "    workspace:",
      "      host: https://dbc.example.cloud.databricks.com",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(root, "app.yaml"),
    [
      "env:",
      "  - name: DATABRICKS_CATALOG",
      "    value: dev-dtm-media-pm",
      "  - name: DATABRICKS_SCHEMA",
      "    value: analytics",
      "  - name: DATABRICKS_GENIE_SPACE_ID_FRAIM_SALES",
      "    valueFrom: fraim-sales",
    ].join("\n"),
    "utf8",
  );
  execFileSync(process.execPath, ["scripts/render-data-access.mjs"], { cwd: root });

  const executable = join(root, "databricks");
  const log = join(root, "commands.log");
  await writeFile(
    executable,
    [
      "#!/bin/sh",
      "if [ \"$1 $2\" = \"auth describe\" ]; then",
      "  printf '  ✓ host: https://dbc.example.cloud.databricks.com (from profile)\\n'",
      "  exit 0",
      "fi",
      "printf '%s\\n' \"$*\" >> \"$DATABRICKS_TEST_LOG\"",
    ].join("\n"),
    "utf8",
  );
  await chmod(executable, 0o755);
  return { root, log };
}

test("deploy forwards the selected CLI profile to every bundle command", async () => {
  const { root, log } = await prepareFixture(true);

  const output = execFileSync(
    process.execPath,
    ["scripts/deploy.mjs", "--target", "dev", "--profile", "analytics-dev"],
    {
      cwd: root,
      env: {
        ...process.env,
        DATABRICKS_TEST_LOG: log,
        PATH: `${root}${delimiter}${process.env.PATH ?? ""}`,
      },
      encoding: "utf8",
    },
  );

  const commands = (await readFile(log, "utf8")).trim().split("\n");
  assert.deepEqual(commands, [
    "bundle validate --target dev --profile analytics-dev",
    "bundle deploy --target dev --profile analytics-dev",
    "bundle run app --target dev --profile analytics-dev",
  ]);
  assert.match(output, /Genie spaces: 1/);
  assert.match(
    output,
    /Genie - FRAIM - Sales Performance \(fraim-sales: 01f1706a44af166db267134b70dc27c8\)/,
  );
});

test("production provisioning pins the exact commit and does not start the app", async () => {
  const { root, log } = await prepareFixture(false);
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync(
    "git",
    ["-c", "user.name=Template Test", "-c", "user.email=template@example.com", "commit", "-m", "fixture"],
    { cwd: root, stdio: "ignore" },
  );
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

  execFileSync(
    process.execPath,
    ["scripts/deploy.mjs", "--target", "prod", "--profile", "analytics-prod", "--provision-only"],
    {
      cwd: root,
      env: {
        ...process.env,
        DATABRICKS_TEST_LOG: log,
        PATH: `${root}${delimiter}${process.env.PATH ?? ""}`,
      },
    },
  );

  const commands = (await readFile(log, "utf8")).trim().split("\n");
  const suffix = `--target prod --profile analytics-prod --var git_commit=${commit}`;
  assert.deepEqual(commands, [
    `bundle validate ${suffix}`,
    `bundle deploy ${suffix}`,
    `bundle summary ${suffix}`,
  ]);
});
