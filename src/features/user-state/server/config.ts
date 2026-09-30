import { getDataAccessManifest, type DataAccessManifest } from "@/lib/config/data-access";
import { AppError, ConfigurationError } from "@/lib/errors/app-error";

export type UserStateConfig = {
  mode: "demo" | "databricks";
  appId: string;
  origin: string;
  tables?: { analyses: string; preferences: string };
};

export function userStateEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.USER_STATE_ENABLED === "true";
}

export function resolveUserStateConfig(
  env: NodeJS.ProcessEnv = process.env,
  manifest?: DataAccessManifest,
): UserStateConfig {
  if (!userStateEnabled(env)) {
    throw new AppError("Personal state disabled", "USER_STATE_DISABLED", 404,
      "Les analyses personnelles ne sont pas activées dans cette application.");
  }
  const demo = env.APP_MODE === "demo" && !env.DATABRICKS_APP_NAME
    && ["development", "test"].includes(env.NODE_ENV ?? "");
  if (!demo && (env.APP_MODE !== "databricks" || !env.DATABRICKS_APP_NAME)) {
    throw new ConfigurationError("Personal state requires the Databricks Apps identity proxy");
  }
  const origin = env.USER_STATE_ORIGIN;
  try {
    const url = new URL(origin ?? "");
    if (url.origin !== origin || (!demo && url.protocol !== "https:")
      || (demo && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error();
  } catch {
    throw new ConfigurationError("USER_STATE_ORIGIN must be an exact app origin (HTTPS in Databricks)");
  }
  if (demo) return { mode: "demo", appId: "local-demo", origin: origin! };
  const namespace = env.USER_STATE_NAMESPACE;
  if (!namespace || !/^[a-zA-Z0-9_-]{1,64}$/.test(namespace)) {
    throw new ConfigurationError("USER_STATE_NAMESPACE is required");
  }
  const tables = (manifest ?? getDataAccessManifest()).personalState;
  if (!tables) throw new ConfigurationError("Declare personalState with npm run user-state:init first");
  return { mode: "databricks", appId: `${env.DATABRICKS_APP_NAME}:${namespace}`, origin: origin!, tables };
}
