import { defineManifest, genie } from "@databricks/appkit";
import { genieResourceRequirements } from "@/features/genie/server/config";

export function privateGenie(spaces: Record<string, string>) {
  // In local mode, config/genie-spaces.json may provide the reviewed default ID.
  // The deployed resolver still requires the binding before this function is called.
  const resources = genieResourceRequirements();
  for (const resource of resources.required) {
    const name = resource.fields.id?.env;
    const id = spaces[resource.resourceKey];
    if (name && id) process.env[name] = id;
  }
  const definition = genie({ spaces, timeout: 600_000, telemetry: false });
  // Only the feature route may validate identity, context, limits and error envelopes.
  class PrivateGenie extends definition.plugin {
    static override manifest = defineManifest<"genie">({ ...definition.plugin.manifest, resources });
    override injectRoutes() {}
  }
  return { ...definition, plugin: PrivateGenie };
}
