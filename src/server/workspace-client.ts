import { createWorkspaceClient, type WorkspaceClient } from "@databricks/appkit";
import type { ServerConfig } from "@/lib/config/server-config";
import { getDatabricksCliToken } from "@/lib/databricks/cli-auth";
import { analyticsExecution } from "@/lib/databricks/appkit-executor";

// Keep upstream SQL errors out of upstream logs, and cancel known statements at our deadline.
export function guardStatementClient(client: WorkspaceClient): WorkspaceClient {
  return new Proxy(client, {
    get(target, key) {
      if (key !== "statementExecution") return Reflect.get(target, key, target);
      const service = target.statementExecution;
      return new Proxy(service, {
        get(api, method) {
          const operation = Reflect.get(api, method, api);
          if (typeof operation !== "function") return operation;
          return async (...args: unknown[]) => {
            try {
              const response = await operation.apply(api, args);
              const execution = analyticsExecution.getStore();
              if (method === "executeStatement" && response?.statement_id && execution) {
                const cancel = () => { void service.cancelExecution({ statement_id: response.statement_id }).catch(() => undefined); };
                if (execution.signal.aborted) cancel();
                else {
                  execution.signal.addEventListener("abort", cancel, { once: true });
                  execution.onFinish.push(() => execution.signal.removeEventListener("abort", cancel));
                }
              }
              if (response?.status?.error) {
                return { ...response, status: { ...response.status, error: { message: "SQL execution failed" } } };
              }
              if (response?.manifest?.truncated) throw new Error("SQL result was truncated");
              // Statement Execution omits data_array on successful zero-row results.
              // Give AppKit its expected array only when the manifest proves emptiness.
              if (response?.status?.state === "SUCCEEDED" && response.manifest?.format === "JSON_ARRAY"
                && response.manifest.total_row_count === 0 && response.manifest.total_chunk_count === 0
                && Array.isArray(response.manifest.schema?.columns) && response.manifest.schema.columns.length > 0
                && response.result?.data_array === undefined && response.result?.data === undefined
                && response.result?.next_chunk_index === undefined) {
                return { ...response, result: { ...response.result, data_array: [] } };
              }
              return response;
            } catch { throw new Error("Databricks SQL request failed"); }
          };
        },
      });
    },
  });
}

export function createRuntimeClient(config: ServerConfig): WorkspaceClient {
  if (config.mode === "demo") {
    // AppKit resolves these two startup metadata calls even without data plugins.
    // No fake credentials or remote transport exist in this demo client.
    return new Proxy({
      currentUser: { me: async () => ({ id: "local-demo" }) },
      apiClient: { request: async () => ({ "x-databricks-org-id": "local-demo" }) },
    }, {
      get(target, key) {
        if (key in target) return target[key as keyof typeof target];
        throw new Error("Databricks is disabled in demo mode");
      },
    }) as unknown as WorkspaceClient;
  }
  if (config.auth.type === "oauth-u2m-cli") {
    const profile = config.auth.profile;
    // 0.76.1 ignores profile when host is also supplied. Resolve the named profile
    // through the existing CLI token provider for every call, including refresh.
    return guardStatementClient(new Proxy({}, {
      get(_target, service) {
        return new Proxy({}, {
          get(_api, method) {
            return async (...args: unknown[]) => {
              const client = createWorkspaceClient({ host: `https://${config.host}`, token: await getDatabricksCliToken(profile) });
              const api = Reflect.get(client, service, client);
              return Reflect.get(api, method, api).apply(api, args);
            };
          },
        });
      },
    }) as WorkspaceClient);
  }
  return guardStatementClient(createWorkspaceClient({
    host: `https://${config.host}`,
    ...(config.auth.type === "pat" ? { token: config.auth.token } : {}),
  }));
}
