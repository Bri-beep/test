import type { Readiness } from "@/features/readiness/contract";
import { verifySourceAccess } from "@/features/readiness/server/repository";
import { getDataAccessManifest, type DataAccessManifest } from "@/lib/config/data-access";
import { getServerConfig, type ServerConfig } from "@/lib/config/server-config";
import { getSqlExecutor } from "@/lib/databricks/sql";
import type { SqlExecutor } from "@/lib/databricks/types";
import { ConfigurationError } from "@/lib/errors/app-error";

type Dependencies = {
  config?: ServerConfig;
  dataAccess?: DataAccessManifest;
  executor?: SqlExecutor;
  now?: () => Date;
};

export async function checkReadiness(requestId?: string, dependencies: Dependencies = {}): Promise<Readiness> {
  const config = dependencies.config ?? getServerConfig();
  const checkedAt = (dependencies.now ?? (() => new Date()))().toISOString();

  if (config.mode === "demo") {
    return { status: "demo", ready: false, sourceCount: 0, checkedAt };
  }

  const dataAccess = dependencies.dataAccess ?? getDataAccessManifest(true);
  if (dataAccess.sources.length === 0) {
    throw new ConfigurationError("At least one data source must be declared before readiness can be checked");
  }
  if (dataAccess.project !== config.catalog) {
    throw new ConfigurationError("Data access project and DATABRICKS_CATALOG must match");
  }

  const executor = dependencies.executor ?? getSqlExecutor();
  await verifySourceAccess(executor, dataAccess.sources, requestId);

  return { status: "ok", ready: true, sourceCount: dataAccess.sources.length, checkedAt };
}
