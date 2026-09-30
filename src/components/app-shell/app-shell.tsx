import type { ReactNode } from "react";

import { AppHeader } from "@/components/app-shell/app-header";
import { AppNav } from "@/components/app-shell/app-nav";

export function AppShell({
  appName,
  appDescription,
  supportName,
  supportSlackUrl,
  personalStateEnabled = false,
  children,
}: {
  appName: string;
  appDescription: string;
  supportName: string;
  supportSlackUrl: string;
  personalStateEnabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-50 inline-flex min-h-11 -translate-y-24 items-center rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-canvas shadow-floating transition focus:translate-y-0"
      >
        Aller au contenu principal
      </a>
      <AppHeader
        appName={appName}
        appDescription={appDescription}
        supportName={supportName}
        supportSlackUrl={supportSlackUrl}
      />
      <AppNav personalStateEnabled={personalStateEnabled} />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-8 outline-none sm:px-6 sm:py-10 lg:px-8">
        {children}
      </main>
    </div>
  );
}
