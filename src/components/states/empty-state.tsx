export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-canvas p-6 text-center sm:p-7">
      <span className="mx-auto grid size-10 place-items-center rounded-full bg-surface text-data-slate shadow-sm" aria-hidden="true">
        <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="10" cy="10" r="6.5" />
          <path d="M10 6.5v4l2.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mx-auto mt-1.5 max-w-2xl text-sm font-light leading-6 text-muted">{message}</p>
    </div>
  );
}
