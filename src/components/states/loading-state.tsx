export function LoadingState({ label = "Chargement…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 rounded-xl border border-line bg-canvas p-5 text-muted">
      <span className="size-5 animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden="true" />
      <span className="font-light">{label}</span>
    </div>
  );
}
