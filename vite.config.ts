import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function serverBoundary(): Plugin {
  return {
    name: "valiuz-server-boundary",
    enforce: "pre",
    load(id) {
      const path = id.replaceAll("\\", "/").split("?")[0];
      if (/\/src\/(server\/|features\/[^/]+\/server\/|lib\/(config|databricks|http|logging)\/)/.test(path)) {
        throw new Error("A browser module imports server code: " + path);
      }
    },
  };
}

export default defineConfig({
  plugins: [serverBoundary(), react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  envPrefix: [],
  build: { outDir: "dist/client", emptyOutDir: true },
});
