import { z } from "zod";

import { isAllowedDataProject } from "@/lib/config/data-projects";
import { ConfigurationError } from "@/lib/errors/app-error";

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[A-Za-z0-9_-]+$/, "must contain only letters, numbers, '_' or '-'");

const profileSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, "must be a valid Databricks CLI profile name");

const dataProjectSchema = identifierSchema.refine(
  isAllowedDataProject,
  "must be an approved Valiuz data project",
);

const valiuzSlackUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:"
      && url.hostname === "valiuz.slack.com"
      && url.port === ""
      && url.username === ""
      && url.password === ""
    );
  }, "must be an HTTPS URL on valiuz.slack.com");

const rawConfigSchema = z.object({
  APP_MODE: z.enum(["demo", "databricks"]).default("demo"),
  APP_NAME: z.string().trim().min(1).default("Databricks App"),
  APP_DESCRIPTION: z.string().trim().default("A reusable Databricks App"),
  APP_SUPPORT_NAME: z.string().trim().min(1).max(100).default("Alexis"),
  APP_SUPPORT_SLACK_URL: valiuzSlackUrlSchema.default("https://valiuz.slack.com/team/U01C3FT98HE"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DATABRICKS_HOST: z.string().trim().url().optional(),
  DATABRICKS_CONFIG_PROFILE: profileSchema.optional(),
  DATABRICKS_TOKEN: z.string().trim().optional(),
  DATABRICKS_CLIENT_ID: z.string().trim().optional(),
  DATABRICKS_CLIENT_SECRET: z.string().trim().optional(),
  DATABRICKS_APP_NAME: z.string().trim().optional(),
  DATABRICKS_SQL_WAREHOUSE_ID: z.string().trim().optional(),
  DATABRICKS_CATALOG: dataProjectSchema.optional(),
  DATABRICKS_SCHEMA: identifierSchema.optional(),
  DATABRICKS_SQL_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
});

const appDisplayConfigSchema = rawConfigSchema.pick({
  APP_MODE: true,
  APP_NAME: true,
  APP_DESCRIPTION: true,
  APP_SUPPORT_NAME: true,
  APP_SUPPORT_SLACK_URL: true,
});

export type AppDisplayConfig = {
  mode: "demo" | "databricks";
  appName: string;
  appDescription: string;
  supportContact: { name: string; slackUrl: string };
};

export type DemoConfig = {
  mode: "demo";
  appName: string;
  appDescription: string;
  supportContact: { name: string; slackUrl: string };
  logLevel: string;
};

export type DatabricksConfig = {
  mode: "databricks";
  appName: string;
  appDescription: string;
  supportContact: { name: string; slackUrl: string };
  logLevel: string;
  host: string;
  warehouseId: string;
  catalog: string;
  schema: string;
  timeoutMs: number;
  auth:
    | { type: "pat"; token: string }
    | { type: "oauth-u2m-cli"; profile: string }
    | { type: "oauth-m2m"; clientId: string; clientSecret: string };
};

export type ServerConfig = DemoConfig | DatabricksConfig;

export function parseAppDisplayConfig(
  environment: Record<string, string | undefined> = process.env,
): AppDisplayConfig {
  const parsed = appDisplayConfigSchema.safeParse(environment);
  if (!parsed.success) {
    throw new ConfigurationError("Invalid application display configuration", parsed.error.flatten());
  }
  return {
    mode: parsed.data.APP_MODE,
    appName: parsed.data.APP_NAME,
    appDescription: parsed.data.APP_DESCRIPTION,
    supportContact: {
      name: parsed.data.APP_SUPPORT_NAME,
      slackUrl: parsed.data.APP_SUPPORT_SLACK_URL,
    },
  };
}

export function parseServerConfig(
  environment: Record<string, string | undefined> = process.env,
): ServerConfig {
  const parsed = rawConfigSchema.safeParse(environment);
  if (!parsed.success) {
    throw new ConfigurationError("Invalid application configuration", parsed.error.flatten());
  }

  const values = parsed.data;
  const common = {
    appName: values.APP_NAME,
    appDescription: values.APP_DESCRIPTION,
    supportContact: {
      name: values.APP_SUPPORT_NAME,
      slackUrl: values.APP_SUPPORT_SLACK_URL,
    },
    logLevel: values.LOG_LEVEL,
  };

  if (values.APP_MODE === "demo") {
    return { mode: "demo", ...common };
  }

  const missing = [
    ["DATABRICKS_HOST", values.DATABRICKS_HOST],
    ["DATABRICKS_SQL_WAREHOUSE_ID", values.DATABRICKS_SQL_WAREHOUSE_ID],
    ["DATABRICKS_CATALOG", values.DATABRICKS_CATALOG],
    ["DATABRICKS_SCHEMA", values.DATABRICKS_SCHEMA],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new ConfigurationError(`Missing required variables: ${missing.join(", ")}`);
  }

  let auth: DatabricksConfig["auth"];
  if (values.DATABRICKS_APP_NAME) {
    if (!values.DATABRICKS_CLIENT_ID || !values.DATABRICKS_CLIENT_SECRET) {
      throw new ConfigurationError(
        "Databricks Apps runtime did not provide DATABRICKS_CLIENT_ID and DATABRICKS_CLIENT_SECRET",
      );
    }
    auth = {
      type: "oauth-m2m",
      clientId: values.DATABRICKS_CLIENT_ID,
      clientSecret: values.DATABRICKS_CLIENT_SECRET,
    };
  } else {
    if (values.DATABRICKS_CONFIG_PROFILE && values.DATABRICKS_TOKEN) {
      throw new ConfigurationError(
        "DATABRICKS_CONFIG_PROFILE and DATABRICKS_TOKEN cannot both be set for local development",
      );
    }
    if (values.DATABRICKS_CONFIG_PROFILE) {
      auth = { type: "oauth-u2m-cli", profile: values.DATABRICKS_CONFIG_PROFILE };
    } else if (values.DATABRICKS_TOKEN) {
      auth = { type: "pat", token: values.DATABRICKS_TOKEN };
    } else {
      throw new ConfigurationError(
        "DATABRICKS_CONFIG_PROFILE or DATABRICKS_TOKEN is required for local development when APP_MODE=databricks",
      );
    }
  }

  return {
    mode: "databricks",
    ...common,
    host: new URL(values.DATABRICKS_HOST as string).hostname,
    warehouseId: values.DATABRICKS_SQL_WAREHOUSE_ID as string,
    catalog: values.DATABRICKS_CATALOG as string,
    schema: values.DATABRICKS_SCHEMA as string,
    timeoutMs: values.DATABRICKS_SQL_TIMEOUT_MS,
    auth,
  };
}

let cachedConfig: ServerConfig | undefined;

export function getServerConfig(): ServerConfig {
  cachedConfig ??= parseServerConfig();
  return cachedConfig;
}

export function resetServerConfigForTests(): void {
  cachedConfig = undefined;
}
