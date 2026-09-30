import { getServerConfig, type ServerConfig } from "@/lib/config/server-config";
import { getSqlExecutor } from "@/lib/databricks/sql";
import type { SqlExecutor } from "@/lib/databricks/types";
import type { ConnectionCheck } from "@/features/connection-check/contract";
import { findCurrentUser } from "@/features/connection-check/server/repository";

type Dependencies = {
  config?: ServerConfig;
  executor?: SqlExecutor;
  now?: () => Date;
};

export async function checkConnection(requestId?: string, dependencies: Dependencies = {}): Promise<ConnectionCheck> {
  const config = dependencies.config ?? getServerConfig();
  const checkedAt = (dependencies.now ?? (() => new Date()))().toISOString();

  if (config.mode === "demo") {
    return { status: "demo", connected: false, currentUser: null, checkedAt };
  }

  const currentUser = await findCurrentUser(dependencies.executor ?? getSqlExecutor(), requestId);
  return { status: "ok", connected: true, currentUser, checkedAt };
}
