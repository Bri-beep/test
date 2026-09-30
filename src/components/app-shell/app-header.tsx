import { SupportContact } from "@/components/app-shell/support-contact";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function AppHeader({
  appName,
  appDescription,
  supportName,
  supportSlackUrl,
}: {
  appName: string;
  appDescription: string;
  supportName: string;
  supportSlackUrl: string;
}) {
  return (
    <header className="brand-header-surface border-b border-line bg-surface">
      <div className="h-1 [background:var(--brand-gradient)]" aria-hidden="true" />
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between md:py-5 lg:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <img
            src="/valiuz-logo-icon.svg"
            alt="Valiuz"
            width={1781}
            height={2192}
            className="shrink-0"
            style={{ height: "3.5rem", width: "auto" }}
            fetchPriority="high"
          />
          <div className="min-w-0">
            <p className="truncate text-lg font-bold leading-tight tracking-tight">{appName}</p>
            <p className="mt-1 truncate text-sm font-light text-muted">{appDescription}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <ThemeToggle />
          <SupportContact name={supportName} slackUrl={supportSlackUrl} />
        </div>
      </div>
    </header>
  );
}
