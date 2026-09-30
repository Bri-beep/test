#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

function parseOptions(argv) {
  const options = { app: undefined, profile: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag !== "--app" && flag !== "--profile") throw new Error(`Unknown option: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
    if (flag === "--app") options.app = value;
    if (flag === "--profile") options.profile = value;
    index += 1;
  }
  return options;
}

function databricksJson(args, operation) {
  const result = spawnSync("databricks", args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 35_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Databricks CLI failed during ${operation}.`);
  }
  try {
    const parsed = JSON.parse(result.stdout);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // Command output can contain credentials, so it is deliberately excluded from the error.
  }
  throw new Error(`Databricks CLI returned invalid JSON during ${operation}.`);
}

function validateAppUrl(value) {
  const url = new URL(value);
  const local = url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if (!local && (url.protocol !== "https:" || !url.hostname.endsWith(".databricksapps.com"))) {
    throw new Error("Databricks returned an unexpected application URL.");
  }
  return url;
}

async function getJson(url, token) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${url.pathname} returned a non-JSON response.`);
  }
  if (!response.ok) {
    const requestId = response.headers.get("x-request-id");
    throw new Error(`${url.pathname} failed with HTTP ${response.status}${requestId ? ` (${requestId})` : ""}.`);
  }
  return body;
}

const options = parseOptions(process.argv.slice(2));
const app = options.app ?? JSON.parse(readFileSync("package.json", "utf8")).name;
if (!/^[a-z0-9][a-z0-9-]*$/.test(app)) throw new Error("App name is invalid.");
const profileArgs = options.profile ? ["--profile", options.profile] : [];
const appDetails = databricksJson(
  ["apps", "get", app, ...profileArgs, "--output", "json"],
  "apps get",
);
if (appDetails.app_status?.state !== "RUNNING") throw new Error("Application is not RUNNING.");
if (typeof appDetails.url !== "string") throw new Error("Application URL is missing.");
const appUrl = validateAppUrl(appDetails.url);
const tokenResponse = databricksJson(
  ["auth", "token", ...profileArgs, "--output", "json"],
  "auth token",
);
if (typeof tokenResponse.access_token !== "string" || tokenResponse.access_token.length < 8) {
  throw new Error("Databricks CLI returned an invalid access token.");
}

const health = await getJson(new URL("/api/health", appUrl), tokenResponse.access_token);
if (health.status !== "ok") throw new Error("Application health contract is invalid.");
const readiness = await getJson(new URL("/api/readiness", appUrl), tokenResponse.access_token);
if (readiness.status !== "ok" || readiness.ready !== true || !Number.isInteger(readiness.sourceCount)) {
  throw new Error("Application readiness contract is invalid.");
}

process.stdout.write(
  `Remote smoke passed for ${app} at ${appUrl.origin}: health ok, runtime SQL access verified on ${readiness.sourceCount} source(s).\n`,
);
