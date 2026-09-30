import { createApp, type WorkspaceClient } from "@databricks/appkit";
import { withGenieClient } from "../../src/features/genie/server/appkit-client";
import { configureGenie } from "../../src/features/genie/server/service";
import { privateGenie } from "../../src/server/genie-plugin";

export async function startTestGenie(spaces: Record<string, string>) {
  process.env.DATABRICKS_GENIE_SPACE_ID_FRAIM_SALES = "a".repeat(32);
  const client = new Proxy({} as WorkspaceClient, {
    get(_target, key) {
      if (key === "currentUser") return { me: async () => ({ id: "offline" }) };
      if (key === "apiClient") return { request: async () => ({ "x-databricks-org-id": "offline" }) };
      throw new Error("Unexpected remote access");
    },
  });
  const app = await createApp({
    plugins: [privateGenie(spaces)], client: withGenieClient(client), cache: { enabled: false }, disableInternalTelemetry: true,
  });
  configureGenie((...args) => app.genie.sendMessage(...args));
  return app;
}
