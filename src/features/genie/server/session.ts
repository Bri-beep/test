import type { Request } from "express";
import { genieSessionSchema } from "../contract";
import { resolveGenieRuntimeConfiguration } from "./config";
import { resolveGenieRequestIdentity } from "./obo-auth";

export async function getGenieSession(request: Request, alias: string) {
  const configuration = resolveGenieRuntimeConfiguration(alias);
  if (configuration.mode === "demo") return genieSessionSchema.parse({ mode: "demo", label: "Démo synthétique · aucune connexion" });
  const identity = await resolveGenieRequestIdentity(request, configuration);
  return genieSessionSchema.parse({ mode: identity.authType,
    label: identity.authType === "obo" ? `Identité transmise par Databricks : ${identity.userId}`
      : identity.authType === "oauth-u2m-cli" ? "Identité du profil OAuth local" : "Identité du jeton local",
  });
}
