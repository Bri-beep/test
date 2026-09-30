import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";

import { assertBundleContract } from "../scripts/validate-bundle-cli";

function bundleOutput(target: "dev" | "prod") {
  const app: Record<string, unknown> = {
    name: "ci-bundle-app",
    user_api_scopes: ["genie"],
    resources: [
      {
        name: "sql-warehouse",
        sql_warehouse: { id: "warehouse-id", permission: "CAN_USE" },
      },
      {
        name: "fraim-sales",
        genie_space: {
          name: "Genie - FRAIM - Sales Performance",
          space_id: "01f1706a44af166db267134b70dc27c8",
          permission: "CAN_RUN",
        },
      },
      {
        name: "data-bundle-source",
        uc_securable: {
          securable_full_name: "dev-dtm-operating.analytics.bundle_source",
          securable_type: "TABLE",
          permission: "SELECT",
        },
      },
      ...["analyses", "preferences"].map((kind) => ({
        name: `user-state-${kind}`,
        uc_securable: {
          securable_full_name: `dev-dtm-operating.ci_user_state.${kind === "analyses" ? "saved_analyses_v1" : "user_preferences_v1"}`,
          securable_type: "TABLE",
          permission: "MODIFY",
        },
      })),
    ],
  };
  if (target === "dev") {
    app.source_code_path = "/Workspace/Users/ci@example.com/.bundle/ci-bundle-app/dev/files";
  }
  if (target === "prod") {
    app.git_repository = {
      provider: "gitHub",
      url: "https://github.com/valiuz/analytics_dbx_app_ci_fixture",
    };
    app.git_source = { commit: "0000000000000000000000000000000000000000" };
  }
  return {
    bundle: {
      name: "ci-bundle-app",
      target,
      mode: target === "dev" ? "development" : "production",
    },
    resources: { apps: { app } },
  };
}

test("accepts the initialized dev and prod bundle contracts", () => {
  assert.doesNotThrow(() => assertBundleContract(bundleOutput("dev"), "dev"));
  assert.doesNotThrow(() => assertBundleContract(bundleOutput("prod"), "prod"));
});

test("rejects an extra app resource or a missing data binding", () => {
  const duplicateApp = bundleOutput("prod");
  const duplicateApps = duplicateApp.resources.apps as Record<string, Record<string, unknown>>;
  duplicateApps.other = {};
  assert.throws(
    () => assertBundleContract(duplicateApp, "prod"),
    /exactly one app resource/,
  );

  const missingBinding = bundleOutput("dev");
  const appResources = missingBinding.resources.apps.app.resources as Array<Record<string, unknown>>;
  appResources.pop();
  assert.throws(
    () => assertBundleContract(missingBinding, "dev"),
    /warehouse, Genie space and generated Unity Catalog binding/,
  );
});

test("tests the declared minimum and pinned deployment CLI versions", async () => {
  const ci = parse(await readFile(".github/workflows/ci.yml", "utf8"));
  const deploy = parse(await readFile(".github/workflows/deploy.yml", "utf8"));
  const compatibility = ci.jobs["bundle-compatibility"];
  assert.deepEqual(compatibility.strategy.matrix.cli_version, ["0.295.0", "1.14.1"]);
  assert.equal(compatibility.needs, "check");

  const installStep = deploy.jobs.deploy.steps.find((step: { name?: string }) => step.name === "Install Databricks CLI");
  assert.equal(installStep.with.version, "1.14.1");
});
