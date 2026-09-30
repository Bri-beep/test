import { Plugin, toPlugin, type PluginManifest } from "@databricks/appkit";

// Explicit registration replaces AppKit's automatic development recorder.
// That recorder writes local files through HTTP, outside the feature contracts.
class DisabledVariants extends Plugin {
  static manifest: PluginManifest<"uiVariants"> = {
    name: "uiVariants", displayName: "Disabled variant recorder", description: "No generic mutation routes",
    resources: { required: [], optional: [] }, devOnly: true,
  };
  injectRoutes() {}
}
export const disabledVariants = toPlugin(DisabledVariants);
