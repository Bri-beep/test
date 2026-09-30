import { DBSQLClient, type LogLevel } from "@databricks/sql";
import type IDBSQLClient from "@databricks/sql/dist/contracts/IDBSQLClient";

import type { DatabricksConfig } from "@/lib/config/server-config";
import { getDatabricksCliToken } from "@/lib/databricks/cli-auth";
import { DatabricksError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/logger";

const driverLogger = {
  log: (level: LogLevel, _message: string) => logger.debug({ driverLevel: level }, "Databricks SQL driver event"),
};

export async function connectDatabricks(config: DatabricksConfig): Promise<IDBSQLClient> {
  const client = new DBSQLClient({ logger: driverLogger });
  const common = {
    host: config.host,
    path: `/sql/1.0/warehouses/${config.warehouseId}`,
    userAgentEntry: "analytics-db-app-template",
    socketTimeout: config.timeoutMs,
    retryMaxAttempts: 3,
    retriesTimeout: config.timeoutMs,
    preserveBigNumericPrecision: true,
    telemetryAuthenticatedExport: false,
  } as const;

  try {
    if (config.auth.type === "pat") {
      return await client.connect({ ...common, authType: "access-token", token: config.auth.token });
    }
    if (config.auth.type === "oauth-u2m-cli") {
      const profile = config.auth.profile;
      return await client.connect({
        ...common,
        authType: "external-token",
        getToken: () => getDatabricksCliToken(profile),
      });
    }
    return await client.connect({
      ...common,
      authType: "databricks-oauth",
      oauthClientId: config.auth.clientId,
      oauthClientSecret: config.auth.clientSecret,
    });
  } catch (error) {
    await client.close().catch(() => undefined);
    throw new DatabricksError("Unable to connect to Databricks SQL", { cause: error });
  }
}
