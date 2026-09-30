import type { Request } from "express";
import type { GenieRuntimeConfiguration } from "@/features/genie/server/config";
import { GenieError } from "@/features/genie/server/errors";
import { extractForwardedGenieIdentity } from "@/features/genie/server/identity";
import { getDatabricksCliToken } from "@/lib/databricks/cli-auth";

export type GenieRequestIdentity = {
  accessToken: string;
  userId: string;
  authType: "obo" | "oauth-u2m-cli" | "pat";
};

type Dependencies = {
  getCliToken?: (profile: string) => Promise<string>;
};

export async function resolveGenieRequestIdentity(
  request: Request,
  configuration: Extract<GenieRuntimeConfiguration, { mode: "databricks" }>,
  dependencies: Dependencies = {},
): Promise<GenieRequestIdentity> {
  if (configuration.runtime === "databricks-app") {
    const forwardedIdentity = extractForwardedGenieIdentity(request.headers);
    if (!forwardedIdentity) {
      throw new GenieError(
        "Databricks Apps did not forward the user identity and access token",
        "GENIE_AUTH_REQUIRED",
        401,
        false,
      );
    }
    return { ...forwardedIdentity, authType: "obo" };
  }

  if (configuration.localAuth?.type === "oauth-u2m-cli") {
    return {
      userId: `local-profile:${configuration.localAuth.profile}`,
      accessToken: await (dependencies.getCliToken ?? getDatabricksCliToken)(configuration.localAuth.profile),
      authType: "oauth-u2m-cli",
    };
  }
  if (configuration.localAuth?.type === "pat") {
    return {
      userId: "local-pat",
      accessToken: configuration.localAuth.token,
      authType: "pat",
    };
  }
  throw new GenieError("Local Genie authentication is not configured", "GENIE_AUTH_REQUIRED", 401, false);
}
