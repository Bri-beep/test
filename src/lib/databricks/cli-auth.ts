import { execFile } from "node:child_process";

import { DatabricksError } from "@/lib/errors/app-error";

const CLI_TIMEOUT_MS = 35_000;
const CLI_MAX_BUFFER_BYTES = 1024 * 1024;

export type DatabricksCliRunner = (args: readonly string[]) => Promise<string>;

type CliToken = {
  accessToken: string;
  expiresAt: Date;
};

function operationName(args: readonly string[]): string {
  return args.slice(0, 2).join(" ") || "unknown command";
}

export function runDatabricksCli(args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "databricks",
      [...args],
      {
        encoding: "utf8",
        maxBuffer: CLI_MAX_BUFFER_BYTES,
        timeout: CLI_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          reject(new Error(`Databricks CLI command failed: ${operationName(args)}`));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

export function parseDatabricksCliToken(output: string, now = Date.now()): CliToken {
  let payload: unknown;
  try {
    payload = JSON.parse(output);
  } catch {
    throw new Error("Databricks CLI returned invalid OAuth token metadata");
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Databricks CLI returned invalid OAuth token metadata");
  }

  const { access_token: accessToken, expiry } = payload as Record<string, unknown>;
  const expiresAtMs = typeof expiry === "string" ? Date.parse(expiry) : Number.NaN;
  if (typeof accessToken !== "string" || accessToken.length === 0 || !Number.isFinite(expiresAtMs)) {
    throw new Error("Databricks CLI returned invalid OAuth token metadata");
  }
  if (expiresAtMs <= now) {
    throw new Error("Databricks CLI returned an expired OAuth token");
  }

  return { accessToken, expiresAt: new Date(expiresAtMs) };
}

export async function getDatabricksCliToken(
  profile: string,
  runner: DatabricksCliRunner = runDatabricksCli,
): Promise<string> {
  try {
    const output = await runner([
      "auth",
      "token",
      "--profile",
      profile,
      "--output",
      "json",
      "--timeout",
      "30s",
    ]);
    return parseDatabricksCliToken(output).accessToken;
  } catch {
    throw new DatabricksError(
      `Unable to obtain an OAuth token from Databricks CLI profile '${profile}'. Run databricks auth login again.`,
    );
  }
}
