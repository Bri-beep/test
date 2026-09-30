import { Button, Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@databricks/appkit-ui/react";
import { useId, useRef, useState } from "react";
import type { ComparisonResult } from "./contract";
import type { PeriodSelection } from "./periods";
import { comparisonShareLink, comparisonShareSummary, type ComparisonSharingOptions } from "./sharing";

const buttonClass = "min-h-11 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40";
const fieldClass = "mt-2 w-full min-w-0 resize-y rounded-xl border border-line bg-canvas p-3 text-sm leading-6 text-ink";

export function ComparisonSharing({ result, selection, consultedAt, options, disabled }: {
  result: ComparisonResult; selection: PeriodSelection; consultedAt: string; options: ComparisonSharingOptions; disabled: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [copying, setCopying] = useState(false);
  const linkField = useRef<HTMLTextAreaElement>(null);
  const summaryField = useRef<HTMLTextAreaElement>(null);
  const segmentBlocked = Boolean(selection.segment && !options.allowSegment);
  const empty = result.current.value === null && result.reference.value === null;
  let link = "";
  if (!segmentBlocked) {
    try { link = comparisonShareLink(window.location.href, selection, options); } catch { /* Invalid app configuration stays closed. */ }
  }
  const unavailable = disabled || segmentBlocked || empty || !link;
  const summary = link ? comparisonShareSummary(result, consultedAt, link) : "";

  async function copy(kind: "link" | "summary") {
    if (unavailable || copying) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(kind === "link" ? link : summary);
      setFeedback(kind === "link" ? "Lien copié." : "Synthèse copiée.");
    } catch {
      setFeedback("La copie automatique est indisponible. Sélectionnez le texte puis copiez-le.");
      const field = kind === "link" ? linkField.current : summaryField.current;
      field?.focus();
      field?.select();
    } finally { setCopying(false); }
  }

  return <div className="mt-5 space-y-2">
    <Dialog open={open && !unavailable} onOpenChange={(value) => { setOpen(value); setFeedback(""); }}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className={buttonClass} disabled={unavailable}
          aria-describedby={segmentBlocked || empty || !link ? `${id}-unavailable` : undefined}>Partager cette analyse</Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}
        className="fixed left-1/2 top-1/2 z-50 grid max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-2xl border border-line bg-surface p-5 text-ink shadow-floating sm:max-w-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <DialogTitle className="text-xl font-bold leading-7 text-ink">Partager cette analyse</DialogTitle>
          <DialogClose asChild><Button type="button" variant="outline" className={buttonClass}>Fermer</Button></DialogClose>
        </div>
        <DialogDescription className="text-sm leading-6 text-muted">
          Le lien restaure les périodes et filtres appliqués. Les données sont recalculées à l’ouverture et peuvent évoluer.
          Il ne donne aucun droit d’accès supplémentaire.
        </DialogDescription>
        <div>
          <label htmlFor={`${id}-link`} className="text-sm font-semibold">Lien de l’analyse</label>
          <textarea id={`${id}-link`} ref={linkField} readOnly value={link} rows={3} spellCheck={false} className={fieldClass}
            onFocus={(event) => event.currentTarget.select()} />
          <Button type="button" variant="outline" className={`mt-2 ${buttonClass}`} disabled={copying} onClick={() => void copy("link")}>Copier le lien</Button>
        </div>
        <div>
          <label htmlFor={`${id}-summary`} className="text-sm font-semibold">Synthèse à partager</label>
          <textarea id={`${id}-summary`} ref={summaryField} readOnly value={summary} rows={10} spellCheck={false} className={fieldClass}
            onFocus={(event) => event.currentTarget.select()} />
          <Button type="button" variant="outline" className={`mt-2 ${buttonClass}`} disabled={copying} onClick={() => void copy("summary")}>Copier la synthèse</Button>
        </div>
        <p className="text-xs leading-5 text-muted">La synthèse reprend les chiffres consultés, leur source et leurs réserves.
          Partagez-la avec les destinataires autorisés. La date de consultation ne mesure pas la fraîcheur des données.</p>
        <p role="status" className="text-sm leading-6 text-ink">{feedback}</p>
      </DialogContent>
    </Dialog>
    {segmentBlocked || empty || !link ? <p id={`${id}-unavailable`} className="text-sm text-muted">
      {segmentBlocked ? "Le partage de ce segment n’est pas activé pour cette analyse. Revenez à tous les segments ou faites valider cette dimension par le mainteneur."
        : empty ? "Aucune valeur disponible à partager sur ces périodes." : "Le partage n’est pas configuré pour cette vue."}
    </p> : null}
  </div>;
}
