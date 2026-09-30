import { ConnectionCheckCard } from "@/features/connection-check/connection-check-card";
import { useAppConfig } from "@/client/app-config";

export default function HomePage() {
  const config = useAppConfig();

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[1.75rem] border border-line bg-surface px-6 py-8 shadow-panel sm:px-10 sm:py-12">
        <div
          className="pointer-events-none absolute -right-20 -top-28 size-72 rounded-full opacity-[0.09] blur-3xl [background:var(--brand-gradient)]"
          aria-hidden="true"
        />
        <div className="relative max-w-4xl">
          <p className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-brand-ink">
            <span className="size-2 rounded-full bg-brand" aria-hidden="true" />
            Socle Valiuz
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[1.05] tracking-[-0.035em] sm:text-5xl">
            Un point de départ clair pour votre prochaine Databricks App
          </h1>
          <p className="mt-5 max-w-3xl text-base font-light leading-7 text-muted sm:text-lg sm:leading-8">
            Concentrez-vous sur les KPI et les usages. Le socle garde la configuration, l’accès SQL,
            les erreurs et les logs dans des couches techniques isolées.
          </p>
          <ul className="mt-7 flex flex-wrap gap-2.5" aria-label="Caractéristiques du socle">
            {["Données gouvernées", "UI accessible", "Déploiement reproductible"].map((item) => (
              <li key={item} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium">
                <svg viewBox="0 0 20 20" className="size-4 text-positive" fill="none" aria-hidden="true">
                  <path d="m5.5 10 3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <ConnectionCheckCard initialMode={config.mode} />
    </div>
  );
}
