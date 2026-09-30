import assert from "node:assert/strict";
import test from "node:test";

import { quoteQualifiedIdentifier } from "../src/lib/databricks/identifiers";

test("quotes each part of a qualified Databricks identifier", () => {
  assert.equal(
    quoteQualifiedIdentifier("dev-dtm-media-pm.analytics.campaign_performance"),
    "`dev-dtm-media-pm`.`analytics`.`campaign_performance`",
  );
});

test("rejects an invalid qualified Databricks identifier", () => {
  assert.throws(
    () => quoteQualifiedIdentifier("dev-dtm-media-pm.analytics"),
    /catalog\.schema\.object/,
  );
  assert.throws(
    () => quoteQualifiedIdentifier("dev-dtm-media-pm.analytics.campaign performance"),
    /catalog\.schema\.object/,
  );
});
