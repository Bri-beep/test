import { DatabricksSqlExecutor } from "@/lib/databricks/sql";
import { getServerConfig } from "@/lib/config/server-config";
import { ConfigurationError } from "@/lib/errors/app-error";
import { resolveUserStateConfig } from "./config";
import { MemoryUserStateRepository, SqlUserStateRepository } from "./repository";
import { UserStateService } from "./service";

// Share only the explicit local demo within this server process.
const demoGlobal = globalThis as typeof globalThis & { userStateDemo?: MemoryUserStateRepository };
export function userStateRuntime(requestId: string) {
  const config = resolveUserStateConfig();
  const repository = config.mode === "demo"
    ? (demoGlobal.userStateDemo ??= new MemoryUserStateRepository())
    : new SqlUserStateRepository(privateExecutor(), config.appId, config.tables!, requestId);
  return { config, service: new UserStateService(repository) };
}

function privateExecutor() {
  const config = getServerConfig();
  if (config.mode !== "databricks") throw new ConfigurationError("Personal SQL requires Databricks mode");
  return new DatabricksSqlExecutor(config);
}
