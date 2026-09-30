import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";

import { createLogger } from "../src/lib/logging/logger";

test("redacts credentials from structured logs", () => {
  let output = "";
  const stream = new Writable({ write: (chunk, _encoding, callback) => { output += chunk.toString(); callback(); } });
  const testLogger = createLogger(stream);

  testLogger.info({ token: "secret-token", config: { auth: { clientSecret: "secret-client" } } }, "safe message");

  assert.doesNotMatch(output, /secret-token|secret-client/);
  assert.match(output, /\[REDACTED\]/);
  assert.match(output, /safe message/);
});

test("redacts forwarded user access token header variants", () => {
  let output = "";
  const stream = new Writable({ write: (chunk, _encoding, callback) => { output += chunk.toString(); callback(); } });
  const testLogger = createLogger(stream);

  testLogger.info(
    {
      "x-forwarded-access-token": "root-token",
      headers: {
        "x-forwarded-access-token": "lowercase-token",
        "X-Forwarded-Access-Token": "titlecase-token",
        xForwardedAccessToken: "camelcase-token",
      },
      req: { headers: { "x-forwarded-access-token": "request-token" } },
    },
    "safe forwarded header",
  );

  assert.doesNotMatch(
    output,
    /root-token|lowercase-token|titlecase-token|camelcase-token|request-token/,
  );
  assert.match(output, /safe forwarded header/);
  assert.match(output, /\[REDACTED\]/);
});
