import { analytics } from "@databricks/appkit";

export function privateAnalytics(timeout: number) {
  const definition = analytics({ timeout, telemetry: false });
  // Keep upstream execution and resource requirements; expose only Valiuz feature APIs.
  class PrivateAnalytics extends definition.plugin {
    override injectRoutes() {}
  }
  return { ...definition, plugin: PrivateAnalytics };
}
