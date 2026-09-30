import { createContext, useContext } from "react";
import type { PublicAppConfig } from "@/shared/app-config";

export const AppConfigContext = createContext<PublicAppConfig | null>(null);

export function useAppConfig(): PublicAppConfig {
  const config = useContext(AppConfigContext);
  if (!config) throw new Error("Application display configuration is missing");
  return config;
}
