import { Button } from "@databricks/appkit-ui/react";
import { useId, useState } from "react";
import { GenieChat, PinnedGenieInsightCard, type GenieDashboardContext, type PinnedGenieInsight } from "@/features/genie";
import type { ComparisonResult } from "./contract";
import { comparisonGenieContext, comparisonGenieQuestion } from "./genie-context";

export type ComparisonGenieOptions = { alias: string; context?: GenieDashboardContext };

export function ComparisonGenie({ result, options, disabled }: {
  result: ComparisonResult; options: ComparisonGenieOptions; disabled: boolean;
}) {
  const id = useId();
  const [opened, setOpened] = useState(false);
  const [pinned, setPinned] = useState<PinnedGenieInsight[]>([]);
  const context = comparisonGenieContext(result, options.context);
  return <div className="mt-5 space-y-4">
    <Button type="button" variant="outline" aria-expanded={opened} aria-controls={id} disabled={disabled}
      className="min-h-11 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40"
      onClick={() => setOpened((previous) => !previous)}>
      {opened ? "Fermer l’exploration Genie" : "Explorer cet écart avec Genie"}
    </Button>
    {opened ? <div id={id} className="space-y-4">
      <div className="rounded-2xl border border-line bg-surface p-5 text-sm leading-6">
        <h3 className="font-bold">Comparaison jointe à la question</h3>
        <p>{result.label} · {result.unit} · {result.filterLabel ?? "Tous les segments"}</p>
        <p>Période analysée : {result.periods.current.start} → {result.periods.current.end}</p>
        <p>Référence : {result.periods.reference.start} → {result.periods.reference.end}</p>
        <p className="mt-2 text-muted">Les valeurs affichées et les réserves ci-dessous seront transmises avec les filtres.
          Relisez la question avant de l’envoyer. Une contribution mesurée ne prouve pas une cause.</p>
        {result.warnings.length ? <ul className="mt-2 list-inside list-disc text-muted">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
      </div>
      <GenieChat alias={options.alias} context={context} initialQuestion={comparisonGenieQuestion(result)}
        variant="embedded" height={760} onPin={(insight) => setPinned((previous) => [...previous.slice(-7), insight])} />
    </div> : null}
    {pinned.length ? <section aria-label="Résultats épinglés de la comparaison" className="space-y-4">
      <h3 className="font-bold">Résultats épinglés · session courante</h3>
      <p className="text-sm text-muted">Huit cartes maximum, conservées en mémoire jusqu’au changement de comparaison ou au rechargement.</p>
      {pinned.map((insight) => <PinnedGenieInsightCard key={insight.id} insight={insight}
        onRemove={(id) => setPinned((previous) => previous.filter((item) => item.id !== id))} />)}
    </section> : null}
  </div>;
}
