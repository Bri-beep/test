import { checkConnection } from "../src/features/connection-check/server/service";
import { checkReadiness } from "../src/features/readiness/server/service";
import { getServerConfig } from "../src/lib/config/server-config";

async function main(): Promise<void> {
  const config = getServerConfig();
  if (config.mode !== "databricks") {
    throw new Error("Set APP_MODE=databricks and configure local Databricks credentials first.");
  }
  const connection = await checkConnection("cli-connection-check");
  const readiness = await checkReadiness("cli-readiness-check");
  process.stdout.write(
    `${JSON.stringify({
      status: readiness.status,
      connected: connection.connected,
      sourceCount: readiness.sourceCount,
      checkedAt: readiness.checkedAt,
    }, null, 2)}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`Connection check failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
