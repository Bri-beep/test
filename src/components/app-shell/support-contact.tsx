export function SupportContact({ name, slackUrl }: { name: string; slackUrl: string }) {
  return (
    <a
      href={slackUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex min-h-12 w-full shrink-0 items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand hover:bg-accent-soft hover:shadow-floating md:w-auto"
      aria-label={`Contacter ${name} sur Slack`}
    >
      <span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-brand-ink" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M7 17.5 3.5 20v-4.8A7.5 7.5 0 0 1 3 12.5C3 8.36 7.03 5 12 5s9 3.36 9 7.5S16.97 20 12 20a10.7 10.7 0 0 1-5-.5Z" />
          <path d="M8 12h.01M12 12h.01M16 12h.01" strokeLinecap="round" />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-light text-muted">Besoin d’aide ?</span>
        <span className="block truncate text-sm font-semibold text-ink group-hover:text-brand-ink">
          {name} sur Slack
          <span className="ml-1" aria-hidden="true">↗</span>
        </span>
      </span>
    </a>
  );
}
