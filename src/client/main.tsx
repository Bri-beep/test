import { Component, StrictMode, Suspense, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useRoutes } from "react-router-dom";
import "@fontsource-variable/outfit";

import { AppShell } from "@/components/app-shell/app-shell";
import { LoadingState } from "@/components/states/loading-state";
import { ErrorState } from "@/components/states/error-state";
import { publicAppConfigSchema, type PublicAppConfig } from "@/shared/app-config";
import { AppConfigContext } from "./app-config";
import { appRoutes } from "./routes";
import "./globals.css";

class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <ErrorState title="Page indisponible" message="La page n’a pas pu être affichée." onRetry={() => window.location.reload()} />
      : this.props.children;
  }
}

function Pages() {
  return useRoutes(appRoutes);
}

function Application({ config }: { config: PublicAppConfig }) {
  return (
    <AppConfigContext.Provider value={config}>
      <BrowserRouter>
        <AppShell appName={config.appName} appDescription={config.appDescription}
          supportName={config.supportContact.name} supportSlackUrl={config.supportContact.slackUrl}
          personalStateEnabled={config.personalStateEnabled}>
          <PageErrorBoundary>
            <Suspense fallback={<LoadingState label="Chargement de la page…" />}><Pages /></Suspense>
          </PageErrorBoundary>
        </AppShell>
      </BrowserRouter>
    </AppConfigContext.Provider>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<LoadingState label="Chargement de l’application…" />);
async function start() {
  try {
    const response = await fetch("/api/config", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error("Display configuration unavailable");
    const config = publicAppConfigSchema.parse(await response.json());
    document.title = config.appName;
    document.querySelector('meta[name="description"]')?.setAttribute("content", config.appDescription);
    root.render(<StrictMode><Application config={config} /></StrictMode>);
  } catch {
    root.render(<ErrorState title="Application indisponible" message="La configuration n’a pas pu être chargée."
      onRetry={() => window.location.reload()} />);
  }
}
void start();
