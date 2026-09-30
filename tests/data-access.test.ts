import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { parse } from "yaml";

import { parseDataAccessManifest } from "../src/lib/config/data-access";

const supportFiles = [
  "config/data-projects.json",
  "config/genie-spaces.json",
  "scripts/data-access.mjs",
  "scripts/render-data-access.mjs",
];

test("validates a source inside an approved data project", () => {
  const manifest = parseDataAccessManifest({
    project: "dev-dtm-insight-sharing",
    sources: [
      {
        name: "shared-insights",
        fullName: "dev-dtm-insight-sharing.analytics.shared_insights",
        purpose: "Shared insight dashboard",
      },
    ],
  }, true);

  assert.equal(manifest.project, "dev-dtm-insight-sharing");
  assert.equal(manifest.sources.length, 1);
});

test("rejects a source from another project", () => {
  assert.throws(
    () =>
      parseDataAccessManifest({
        project: "dev-dtm-myvaliuz",
        sources: [
          {
            name: "foreign-source",
            fullName: "dev-dtm-media-pm.analytics.foreign_source",
            purpose: "Invalid cross-project source",
          },
        ],
      }),
    /Invalid data access manifest/,
  );
});

test("renders least-privilege Unity Catalog app resources and detects drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "databricks-data-access-"));
  for (const file of supportFiles) {
    const destination = join(root, file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(file, destination);
  }
  await mkdir(join(root, "resources"), { recursive: true });
  await writeFile(
    join(root, "config/data-access.json"),
    JSON.stringify({
      project: "dev-dtm-media-pm",
      sources: [
        {
          name: "campaign-performance",
          fullName: "dev-dtm-media-pm.analytics.campaign_performance",
          purpose: "Campaign cockpit",
        },
      ],
    }),
    "utf8",
  );

  execFileSync(process.execPath, ["scripts/render-data-access.mjs"], { cwd: root });
  const rendered = await readFile(join(root, "resources/data-access.generated.yml"), "utf8");
  assert.match(rendered, /name: \$\{var\.app_name\}/);
  assert.match(rendered, /level: CAN_MANAGE/);
  assert.deepEqual(parse(rendered).resources.apps.app.user_api_scopes, ["genie"]);
  assert.deepEqual(parse(rendered).resources.apps.app.resources[1], {
    name: "fraim-sales",
    genie_space: {
      name: "Genie - FRAIM - Sales Performance",
      space_id: "01f1706a44af166db267134b70dc27c8",
      permission: "CAN_RUN",
    },
  });
  assert.match(rendered, /uc_securable:/);
  assert.match(rendered, /dev-dtm-media-pm\.analytics\.campaign_performance/);
  assert.match(rendered, /permission: SELECT/);
  execFileSync(process.execPath, ["scripts/render-data-access.mjs", "--check"], { cwd: root });

  const metadataPath = join(root, "config/appkit-resources.generated.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  assert.deepEqual(metadata.sources, [{ fullName: "dev-dtm-media-pm.analytics.campaign_performance", permission: "SELECT" }]);
  assert.equal(metadata.warehouse.binding, "sql-warehouse");
  assert.equal(metadata.genie[0].permission, "CAN_RUN");
  metadata.sources[0].permission = "MODIFY";
  await writeFile(metadataPath, JSON.stringify(metadata), "utf8");
  assert.throws(
    () => execFileSync(process.execPath, ["scripts/render-data-access.mjs", "--check"], { cwd: root, stdio: "pipe" }),
    /AppKit resource metadata is stale/,
  );
  execFileSync(process.execPath, ["scripts/render-data-access.mjs"], { cwd: root });

  await writeFile(join(root, "resources/data-access.generated.yml"), "stale\n", "utf8");
  assert.throws(
    () => execFileSync(process.execPath, ["scripts/render-data-access.mjs", "--check"], { cwd: root, stdio: "pipe" }),
    /Command failed/,
  );
});

test("rejects invalid or ambiguous named Genie space configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "databricks-genie-spaces-"));
  for (const file of supportFiles) {
    const destination = join(root, file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(file, destination);
  }
  await mkdir(join(root, "resources"), { recursive: true });
  await writeFile(
    join(root, "config/data-access.json"),
    JSON.stringify({ project: "dev-dtm-media-pm", sources: [] }),
    "utf8",
  );
  const manifestPath = join(root, "config/genie-spaces.json");
  const baseManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const assertInvalid = async (manifest: Record<string, unknown>, pattern: RegExp) => {
    await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    const result = spawnSync(process.execPath, ["scripts/render-data-access.mjs"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, pattern);
  };

  const invalidKey = structuredClone(baseManifest);
  invalidKey.spaces[0].key = "Invalid key";
  await assertInvalid(invalidKey, /key must contain 1 to 64 lowercase/);

  const invalidAlias = structuredClone(baseManifest);
  invalidAlias.spaces[0].aliases = ["Sales Alias"];
  await assertInvalid(invalidAlias, /alias 1 must contain 1 to 64 lowercase/);

  const missingStableAlias = structuredClone(baseManifest);
  missingStableAlias.spaces[0].aliases = ["sales"];
  await assertInvalid(missingStableAlias, /aliases must include its stable key/);

  const invalidEnvironmentVariable = structuredClone(baseManifest);
  invalidEnvironmentVariable.spaces[0].environmentVariable = "GENIE_SPACE_ID";
  await assertInvalid(invalidEnvironmentVariable, /must contain at most 128 characters/);

  const invalidDisplayName = structuredClone(baseManifest);
  invalidDisplayName.spaces[0].displayName = "x";
  await assertInvalid(invalidDisplayName, /displayName must contain between 3 and 120/);

  const invalidId = structuredClone(baseManifest);
  invalidId.spaces[0].spaceId = "not-a-space-id";
  await assertInvalid(invalidId, /exactly 32 lowercase hexadecimal characters/);

  const uppercaseId = structuredClone(baseManifest);
  uppercaseId.spaces[0].spaceId = "01F1706A44AF166DB267134B70DC27C8";
  await assertInvalid(uppercaseId, /exactly 32 lowercase hexadecimal characters/);

  const duplicateAlias = structuredClone(baseManifest);
  duplicateAlias.spaces.push({
    key: "another-space",
    displayName: "Another sales space",
    aliases: ["sales"],
    environmentVariable: "DATABRICKS_GENIE_SPACE_ID_ANOTHER_SALES",
    spaceId: "11f1706a44af166db267134b70dc27c8",
  });
  await assertInvalid(duplicateAlias, /Genie alias 'sales' is duplicated/);

  const tooManySpaces = {
    version: 1,
    spaces: Array.from({ length: 21 }, (_, index) => ({
      key: `space-${index}`,
      displayName: `Genie space ${index}`,
      aliases: [`space-${index}`],
      environmentVariable: `DATABRICKS_GENIE_SPACE_ID_SPACE_${index}`,
      spaceId: (index + 1).toString(16).padStart(32, "0"),
    })),
  };
  await assertInvalid(tooManySpaces, /limited to 20 entries/);
});

test("defines the app resource in one included bundle file", async () => {
  const bundle = parse(await readFile("databricks.yml", "utf8"));
  const generated = parse(await readFile("resources/data-access.generated.yml", "utf8"));

  assert.equal(bundle.resources?.apps?.app, undefined);
  assert.equal(generated.resources.apps.app.name, "${var.app_name}");
  assert.equal(generated.resources.apps.app.compute_size, "MEDIUM");
  assert.deepEqual(generated.resources.apps.app.user_api_scopes, ["genie"]);
  assert.equal(generated.resources.apps.app.permissions.length, 2);
  assert.equal(generated.resources.apps.app.resources[1].genie_space.permission, "CAN_RUN");
});
