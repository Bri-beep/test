import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";

import { assertTemplateJourneyDoctor } from "../scripts/validate-template-journey";

function doctorOutput(recommendedStep = "npm run check"): unknown[] {
  return [
    { status: "pass", name: "Initialisation" },
    { status: "pass", name: "Version du template" },
    { status: "pass", name: "Cadrage" },
    { status: "pass", name: "Accès aux données" },
    { status: "pass", name: "Features et sources" },
    { status: "warn", name: "Développement réel" },
    { status: "pass", name: "Étape recommandée", next: recommendedStep },
  ];
}

test("accepts the completed template consumer journey", () => {
  assert.doesNotThrow(() => assertTemplateJourneyDoctor(doctorOutput()));
});

test("rejects a failing doctor check or an incomplete journey", () => {
  const failing = doctorOutput();
  failing.splice(4, 0, { status: "fail", name: "Accès aux données" });
  assert.throws(() => assertTemplateJourneyDoctor(failing), /must not report a failing check/);
  assert.throws(() => assertTemplateJourneyDoctor(doctorOutput("npm run feature:new -- <slug>")), /npm run check/);
});

test("runs the clean consumer journey after the standard CI checks", async () => {
  const ci = parse(await readFile(".github/workflows/ci.yml", "utf8"));
  const journey = ci.jobs["template-consumer-journey"];
  assert.equal(journey.needs, "check");
  assert.equal(journey.if, "needs.check.outputs.template_source == 'true'");
  assert.equal(journey["timeout-minutes"], 20);
  assert.equal(
    journey.steps.some((step: { run?: string }) => step.run === "npm run template:journey"),
    true,
  );

  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(packageJson.scripts["template:journey"], "node --import tsx scripts/validate-template-journey.ts");
  assert.equal(
    ci.jobs.check.steps.some((step: { run?: string }) => step.run?.includes("npm run template:check")),
    true,
  );
  assert.equal(
    ci.jobs.check.steps.some((step: { run?: string }) => step.run === "npm run template:release:check"),
    true,
  );
  assert.equal(
    ci.jobs.check.steps.find(
      (step: { uses?: string; with?: Record<string, unknown> }) => step.uses === "actions/checkout@v4",
    )?.with?.["fetch-depth"],
    0,
  );
  assert.equal(packageJson.scripts["template:release:check"], "node scripts/check-template-release.mjs");
});
