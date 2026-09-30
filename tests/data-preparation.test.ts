import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import test from "node:test";
import { parse } from "yaml";

const fixtureFiles = [
  ".env.example",
  "app.yaml",
  "config/data-projects.json",
  "config/genie-spaces.json",
  "data/databricks.yml",
  "data/resources.generated.yml",
  "resources/data-access.generated.yml",
  "scripts/data-access.mjs",
  "scripts/data-preparation.mjs",
  "scripts/init-data.mjs",
  "scripts/render-data-preparation.mjs",
  "scripts/run-data-preparation.mjs",
];

async function prepareFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "data-preparation-"));
  for (const file of fixtureFiles) {
    const destination = join(root, file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(file, destination);
  }
  for (const directory of ["data/contracts", "data/notebooks", "data/pipelines", "data/tests"] ) {
    await mkdir(join(root, directory), { recursive: true });
  }
  await writeFile(
    join(root, "config/data-access.json"),
    JSON.stringify({ project: "dev-dtm-media-pm", sources: [] }),
    "utf8",
  );
  await writeFile(
    join(root, "app.yaml"),
    "env:\n  - name: DATABRICKS_CATALOG\n    value: dev-dtm-media-pm\n  - name: DATABRICKS_GENIE_SPACE_ID_FRAIM_SALES\n    valueFrom: fraim-sales\n",
    "utf8",
  );
  await writeFile(
    join(root, ".env.example"),
    "DATABRICKS_CATALOG=dev-dtm-media-pm\nDATABRICKS_GENIE_SPACE_ID_FRAIM_SALES=01f1706a44af166db267134b70dc27c8\n",
    "utf8",
  );
  await symlink(join(process.cwd(), "node_modules"), join(root, "node_modules"), "dir");
  return root;
}

test("direct data init adds no Databricks preparation resource", async () => {
  const root = await prepareFixture();
  execFile(
    root,
    [
      "scripts/init-data.mjs",
      "sales-source",
      "--non-interactive",
      "--mode", "direct",
      "--source", "dev-dtm-media-pm.analytics.sales",
      "--owner", "Analytics",
      "--purpose", "Read sales directly",
      "--grain", "Une ligne par vente",
      "--refresh", "daily",
      "--freshness-hours", "24",
    ],
  );
  assert.match(await readFile(join(root, "data/resources.generated.yml"), "utf8"), /resources: \{\}/);
  assert.equal(JSON.parse(await readFile(join(root, "config/data-access.json"), "utf8")).sources.length, 1);
});

test("data init creates a reviewed-column notebook job and runnable contract", async () => {
  const root = await prepareFixture();
  execFile(
    root,
    [
      "scripts/init-data.mjs",
      "daily-sales",
      "--non-interactive",
      "--mode", "notebook",
      "--source", "dev-dtm-media-pm.raw.sales",
      "--output", "dev-dtm-media-pm.analytics.daily_sales",
      "--columns", "sale_date,revenue",
      "--owner", "Analytics",
      "--purpose", "Prepare daily sales",
      "--grain", "Une ligne par jour",
      "--keys", "sale_date",
      "--refresh", "daily",
      "--freshness-hours", "24",
    ],
  );

  const notebook = await readFile(join(root, "data/notebooks/daily-sales.sql"), "utf8");
  const quality = await readFile(join(root, "data/tests/daily-sales.sql"), "utf8");
  const resources = await readFile(join(root, "data/resources.generated.yml"), "utf8");
  const access = JSON.parse(await readFile(join(root, "config/data-access.json"), "utf8"));
  assert.match(notebook, /CREATE OR REPLACE TABLE/);
  assert.doesNotMatch(notebook, /SELECT \*/);
  assert.match(resources, /notebook_task:/);
  assert.match(resources, /max_concurrent_runs: 1/);
  assert.match(resources, /timeout_seconds: 7200/);
  assert.match(resources, /pause_status: \$\{var\.schedule_pause_status\}/);
  assert.match(quality, /COUNT\(\*\) AS duplicate_group_count/);
  assert.doesNotMatch(quality, /This query must return no row/);
  assert.equal(typeof parse(resources).resources.jobs.prepare_daily_sales, "object");
  assert.equal(access.sources[0].fullName, "dev-dtm-media-pm.analytics.daily_sales");

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
  execFile(
    root,
    ["scripts/run-data-preparation.mjs", "daily-sales", "--profile", "analytics-dev", "--confirm"],
    { DATABRICKS_TEST_LOG: log, PATH: `${root}${delimiter}${process.env.PATH ?? ""}` },
  );
  assert.deepEqual((await readFile(log, "utf8")).trim().split("\n"), [
    "bundle validate --target dev --profile analytics-dev --var schedule_pause_status=PAUSED",
    "bundle deploy --target dev --profile analytics-dev --var schedule_pause_status=PAUSED",
    "bundle run prepare_daily_sales --target dev --profile analytics-dev --var schedule_pause_status=PAUSED",
  ]);
});

test("bounded replay replaces only a validated date window", async () => {
  const root = await prepareFixture();
  execFile(
    root,
    [
      "scripts/init-data.mjs",
      "daily-sales-history",
      "--non-interactive",
      "--mode", "notebook",
      "--source", "dev-dtm-media-pm.raw.sales",
      "--output", "dev-dtm-media-pm.analytics.daily_sales_history",
      "--columns", "sale_date,store_id,revenue",
      "--owner", "Analytics",
      "--purpose", "Prepare bounded sales history",
      "--grain", "Une ligne par jour et magasin",
      "--keys", "sale_date,store_id",
      "--refresh", "daily",
      "--freshness-hours", "24",
      "--timeout-minutes", "60",
      "--replay-strategy", "bounded-replace",
      "--date-column", "sale_date",
      "--default-lookback-days", "7",
      "--max-replay-days", "31",
      "--finalization-lag-days", "1",
      "--required-history-days", "548",
      "--output-retention-days", "548",
      "--source-retention-days", "730",
    ],
  );
  const contract = parse(await readFile(join(root, "data/contracts/daily-sales-history.yml"), "utf8"));
  const notebook = await readFile(join(root, "data/notebooks/daily-sales-history.sql"), "utf8");
  const quality = await readFile(join(root, "data/tests/daily-sales-history.sql"), "utf8");
  const resources = parse(await readFile(join(root, "data/resources.generated.yml"), "utf8"));
  const job = resources.resources.jobs.prepare_daily_sales_history;

  assert.deepEqual(contract.replay, {
    strategy: "bounded-replace",
    dateColumn: "sale_date",
    defaultLookbackDays: 7,
    maxDays: 31,
    finalizationLagDays: 1,
    requiredHistoryDays: 548,
    outputRetentionDays: 548,
    sourceRetentionDays: 730,
  });
  assert.match(notebook, /CREATE OR REPLACE TEMP TABLE replay_staging_daily_sales_history AS/);
  assert.match(notebook, /typeof\(`sale_date`\) = 'date'/);
  assert.match(notebook, /COUNT_IF\(`sale_date` IS NULL OR `store_id` IS NULL\) = 0/);
  assert.match(notebook, /Replay staging violates the declared business grain/);
  assert.match(notebook, /INSERT INTO .* BY NAME\nREPLACE WHERE/);
  assert.match(notebook, /USING DELTA\nCLUSTER BY \(`sale_date`\)/);
  assert.match(notebook, /REPLACE WHERE `sale_date` BETWEEN replay_start_date_value AND replay_end_date_value/);
  assert.match(notebook, /Replay source window is empty/);
  assert.match(notebook, /datediff\(replay_end_date_value, replay_start_date_value\) \+ 1 <= 31/);
  assert.match(notebook, /date_sub\(current_date\(\), 1\)/);
  assert.match(notebook, /DECLARE OR REPLACE VARIABLE finalized_date_value/);
  assert.match(notebook, /date_sub\(finalized_date_value, 547\)/);
  assert.match(notebook, /-- Deployment fingerprint: [0-9a-f]{64}/);
  assert.match(notebook, /trim\(:deployment_fingerprint\) = '[0-9a-f]{64}'/);
  assert.match(notebook, /Replay start date precedes the output retention boundary/);
  assert.doesNotMatch(notebook, /SELECT \*/);
  assert.match(quality, /WHERE `sale_date` BETWEEN validation_start_date AND validation_end_date/);
  assert.match(quality, /COUNT\(\*\) AS duplicate_group_count/);
  assert.match(quality, /COALESCE\(SUM\(duplicate_count - 1\), 0\) AS duplicate_row_count/);
  assert.doesNotMatch(quality, /SELECT COUNT\(\*\) AS row_count FROM/);
  assert.deepEqual(job.parameters, [
    { name: "replay_start_date", default: "" },
    { name: "replay_end_date", default: "" },
    { name: "deployment_fingerprint", default: job.parameters[2].default },
  ]);
  assert.match(job.parameters[2].default, /^[0-9a-f]{64}$/);
  assert.equal(job.max_concurrent_runs, 1);
  assert.equal(job.tasks[0].timeout_seconds, 3600);

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
  const replayResult = execFileResult(
    root,
    [
      "scripts/run-data-preparation.mjs",
      "--run-only",
      "daily-sales-history",
      "--profile", "analytics-dev",
      "--start-date", "2026-08-01",
      "--end-date", "2026-08-07",
      "--confirm",
    ],
    { DATABRICKS_TEST_LOG: log, PATH: `${root}${delimiter}${process.env.PATH ?? ""}` },
  );
  assert.equal(replayResult.status, 0, `${replayResult.stdout}\n${replayResult.stderr}`);
  assert.match(
    replayResult.stdout,
    /Local bundle warehouse \(deployed Job not inspected\): ab362e9710498a08/,
  );
  assert.match(replayResult.stdout, /deployed state not inspected or changed by replay/);
  assert.match(replayResult.stdout, /deployed Job settings are not queried/);
  assert.doesNotMatch(replayResult.stdout, /Schedule: daily \(PAUSED\)/);
  assert.match(replayResult.stdout, /Required history:/);
  assert.equal(
    (await readFile(log, "utf8")).trim(),
    `bundle run prepare_daily_sales_history --target dev --profile analytics-dev --var schedule_pause_status=PAUSED -- --replay_start_date 2026-08-01 --replay_end_date 2026-08-07 --deployment_fingerprint ${job.parameters[2].default}`,
  );

  const missingDates = execFileResult(
    root,
    ["scripts/run-data-preparation.mjs", "--run-only", "daily-sales-history", "--profile", "analytics-dev"],
    { DATABRICKS_TEST_LOG: log, PATH: `${root}${delimiter}${process.env.PATH ?? ""}` },
  );
  assert.equal(missingDates.status, 1);
  assert.match(missingDates.stderr, /require both --start-date and --end-date/);

  const oversized = execFileResult(
    root,
    [
      "scripts/run-data-preparation.mjs",
      "--run-only",
      "daily-sales-history",
      "--profile", "analytics-dev",
      "--start-date", "2026-01-01",
      "--end-date", "2026-08-07",
      "--confirm",
    ],
    { DATABRICKS_TEST_LOG: log, PATH: `${root}${delimiter}${process.env.PATH ?? ""}` },
  );
  assert.equal(oversized.status, 1);
  assert.match(oversized.stderr, /contract maximum is 31 days/);

  await writeFile(
    join(root, "data/notebooks/daily-sales-history.sql"),
    `${notebook}\n-- Reviewed business completeness assertion.\n`,
    "utf8",
  );
  const staleFingerprint = execFileResult(
    root,
    [
      "scripts/run-data-preparation.mjs",
      "--run-only",
      "daily-sales-history",
      "--profile", "analytics-dev",
      "--start-date", "2026-08-01",
      "--end-date", "2026-08-07",
    ],
    { DATABRICKS_TEST_LOG: log, PATH: `${root}${delimiter}${process.env.PATH ?? ""}` },
  );
  assert.equal(staleFingerprint.status, 1);
  assert.match(staleFingerprint.stderr, /Deployment fingerprint is stale/);

  execFile(root, ["scripts/render-data-preparation.mjs"]);
  const refreshedResources = parse(await readFile(join(root, "data/resources.generated.yml"), "utf8"));
  const refreshedFingerprint = refreshedResources.resources.jobs.prepare_daily_sales_history.parameters[2].default;
  assert.match(refreshedFingerprint, /^[0-9a-f]{64}$/);
  assert.notEqual(refreshedFingerprint, job.parameters[2].default);
});

test("bounded replay requires its date column in the business key", async () => {
  const root = await prepareFixture();
  const result = execFileResult(root, [
    "scripts/init-data.mjs",
    "invalid-history",
    "--non-interactive",
    "--mode", "notebook",
    "--source", "dev-dtm-media-pm.raw.sales",
    "--output", "dev-dtm-media-pm.analytics.invalid_history",
    "--columns", "sale_date,store_id,revenue",
    "--owner", "Analytics",
    "--purpose", "Reject an unsafe replay contract",
    "--grain", "Une ligne par jour et magasin",
    "--keys", "store_id",
    "--refresh", "daily",
    "--replay-strategy", "bounded-replace",
    "--date-column", "sale_date",
    "--required-history-days", "548",
    "--output-retention-days", "548",
    "--source-retention-days", "730",
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /replay dateColumn must be included in keys/);
});

test("bounded replay rejects source retention shorter than output retention plus finalization", async () => {
  const root = await prepareFixture();
  const result = execFileResult(root, [
    "scripts/init-data.mjs",
    "unsafe-history",
    "--non-interactive",
    "--mode", "notebook",
    "--source", "dev-dtm-media-pm.raw.sales",
    "--output", "dev-dtm-media-pm.analytics.unsafe_history",
    "--columns", "sale_date,store_id,revenue",
    "--owner", "Analytics",
    "--purpose", "Reject output retention beyond source retention",
    "--grain", "Une ligne par jour et magasin",
    "--keys", "sale_date,store_id",
    "--refresh", "daily",
    "--replay-strategy", "bounded-replace",
    "--date-column", "sale_date",
    "--default-lookback-days", "7",
    "--max-replay-days", "31",
    "--required-history-days", "548",
    "--output-retention-days", "548",
    "--source-retention-days", "395",
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Use a separate hot\/cold data product/);
});

test("prepared outputs have one owning data contract", async () => {
  const root = await prepareFixture();
  const common = [
    "--non-interactive",
    "--mode", "notebook",
    "--source", "dev-dtm-media-pm.raw.sales",
    "--output", "dev-dtm-media-pm.analytics.owned_output",
    "--columns", "sale_date,revenue",
    "--owner", "Analytics",
    "--purpose", "Prepare one owned output",
    "--grain", "Une ligne par jour",
    "--keys", "sale_date",
  ];
  execFile(root, ["scripts/init-data.mjs", "first-owner", ...common]);
  const result = execFileResult(root, ["scripts/init-data.mjs", "second-owner", ...common]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /already owned by another data contract/);
  await assert.rejects(readFile(join(root, "data/contracts/second-owner.yml"), "utf8"));
});

test("pipeline mode generates an optional Lakeflow materialized view", async () => {
  const root = await prepareFixture();
  execFile(
    root,
    [
      "scripts/init-data.mjs",
      "weekly-sales",
      "--non-interactive",
      "--mode", "pipeline",
      "--source", "dev-dtm-media-pm.raw.sales",
      "--output", "dev-dtm-media-pm.analytics.weekly_sales",
      "--columns", "week_id,revenue",
      "--owner", "Analytics",
      "--purpose", "Prepare weekly sales",
      "--grain", "Une ligne par semaine",
      "--keys", "week_id",
      "--refresh", "daily",
      "--freshness-hours", "24",
    ],
  );
  const pipeline = await readFile(join(root, "data/pipelines/weekly-sales.sql"), "utf8");
  const resources = parse(await readFile(join(root, "data/resources.generated.yml"), "utf8"));
  assert.match(pipeline, /CREATE OR REFRESH MATERIALIZED VIEW `weekly_sales`/);
  assert.equal(resources.resources.pipelines.prepare_weekly_sales.serverless, true);
  assert.equal(
    resources.resources.jobs.prepare_weekly_sales.tasks[0].pipeline_task.pipeline_id,
    "${resources.pipelines.prepare_weekly_sales.id}",
  );
});

function execFile(root: string, args: string[], environment: Record<string, string> = {}): void {
  const result = execFileResult(root, args, environment);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function execFileResult(root: string, args: string[], environment: Record<string, string> = {}) {
  return spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });
}
