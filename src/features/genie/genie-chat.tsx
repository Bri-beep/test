"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import type {
  GenieConversationSnapshot,
  GenieDashboardContext,
  GenieMessageStatus,
  PinnedGenieInsight,
} from "@/features/genie/contract";
import {
  AlertIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  DatabaseIcon,
  LockIcon,
  PlusIcon,
  SaveIcon,
  SendIcon,
  SparklesIcon,
  StopIcon,
} from "@/features/genie/genie-icons";
import { GenieMarkdown } from "@/features/genie/genie-markdown";
import { GenieIdentity } from "@/features/genie/genie-identity";
import { GenieResultRenderer } from "@/features/genie/genie-result-renderer";
import { createPinnedGenieAnswer } from "@/features/genie/pinning";
import {
  useGenieConversation,
  type GenieClientError,
  type GenieSessionConversation,
  type GenieUiMessage,
} from "@/features/genie/use-genie-conversation";

export type GenieChatVariant = "standalone" | "embedded" | "panel" | "floating";

export type GenieChatProps = {
  alias: string;
  context?: GenieDashboardContext;
  initialQuestion?: string;
  height?: number | string;
  variant?: GenieChatVariant;
  onPin?: (insight: PinnedGenieInsight) => void | Promise<void>;
  onSave?: (conversation: GenieConversationSnapshot) => void | Promise<void>;
};

const emptySuggestions = [
  "Quels sont les principaux écarts de performance sur la période ?",
  "Quels produits contribuent le plus au chiffre d’affaires ?",
  "Montre-moi la tendance des ventes et les ruptures importantes.",
];

const statusCopy: Record<GenieMessageStatus, { label: string; detail: string }> = {
  SUBMITTED: { label: "Question reçue", detail: "La demande a été transmise à Genie." },
  FETCHING_METADATA: { label: "Lecture du modèle", detail: "Genie consulte les métadonnées autorisées du space." },
  FILTERING_CONTEXT: { label: "Application du contexte", detail: "Les filtres du dashboard sont pris en compte." },
  ASKING_AI: { label: "Analyse en cours", detail: "Genie prépare une réponse à partir du modèle métier." },
  PENDING_WAREHOUSE: { label: "Moteur SQL en attente", detail: "La capacité de calcul se prépare." },
  EXECUTING_QUERY: { label: "Requête en cours", detail: "La requête générée s’exécute avec vos droits Databricks." },
  COMPLETED: { label: "Réponse prête", detail: "Le traitement est terminé." },
  FAILED: { label: "Traitement interrompu", detail: "Genie n’a pas pu terminer cette demande." },
  CANCELLED: { label: "Traitement annulé", detail: "Genie a signalé l’annulation du traitement." },
  QUERY_RESULT_EXPIRED: { label: "Résultat expiré", detail: "Les données de cette réponse ne sont plus disponibles." },
};

function formatContextValue(value: GenieDashboardContext["filters"] extends Record<string, infer TValue> | undefined ? TValue : never) {
  if (Array.isArray(value)) {
    return value.map((item) => item === null ? "non défini" : String(item)).join(", ");
  }
  return value === null ? "non défini" : String(value);
}

function getContextChips(context?: GenieDashboardContext) {
  if (!context) {
    return [];
  }

  const chips: { id: string; label: string }[] = [];
  if (context.page?.title) {
    chips.push({ id: "page", label: context.page.title });
  }
  if (context.dateRange) {
    const range = context.dateRange.label
      ?? [context.dateRange.start, context.dateRange.end].filter(Boolean).join(" → ");
    if (range) {
      chips.push({ id: "date-range", label: range });
    }
  }
  if (context.comparison) chips.push({ id: "reference-period",
    label: `Référence : ${context.comparison.referencePeriod.start} → ${context.comparison.referencePeriod.end}` });
  Object.entries(context.filters ?? {}).forEach(([name, value]) => {
    chips.push({ id: `filter-${name}`, label: `${name} : ${formatContextValue(value)}` });
  });
  context.selectedMetrics?.forEach((metric) => chips.push({ id: `selected-${metric}`, label: `KPI : ${metric}` }));
  context.visibleMetrics?.forEach((metric) => chips.push({ id: `visible-${metric}`, label: `Visible : ${metric}` }));
  context.activeTables?.forEach((table) => chips.push({ id: `table-${table}`, label: `Table : ${table}` }));
  return chips;
}

function ContextChips({ context, compact = false }: { context?: GenieDashboardContext; compact?: boolean }) {
  const chips = useMemo(() => getContextChips(context), [context]);
  const visibleChips = compact ? chips.slice(0, 3) : chips.slice(0, 6);

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Contexte transmis avec la question">
      {visibleChips.map((chip) => (
        <span
          key={chip.id}
          title={chip.label}
          className="inline-flex max-w-56 items-center gap-1.5 truncate rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-muted"
        >
          <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
          <span className="truncate">{chip.label}</span>
        </span>
      ))}
      {chips.length > visibleChips.length ? (
        <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-muted">
          +{chips.length - visibleChips.length}
        </span>
      ) : null}
    </div>
  );
}

function GenieStatusTrace({ message }: { message: GenieUiMessage }) {
  const status = message.status ?? message.statusHistory.at(-1) ?? "SUBMITTED";
  const trackingStopped = message.trackingStopped === true;
  const isWorking = !trackingStopped && !["COMPLETED", "FAILED", "CANCELLED", "QUERY_RESULT_EXPIRED"].includes(status);

  return (
    <details className="group rounded-xl border border-line bg-canvas" open={isWorking}>
      <summary className="flex min-h-11 list-none items-center justify-between gap-3 px-3.5 py-2 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
        <span className="inline-flex min-w-0 items-center gap-2.5">
          {trackingStopped ? (
            <StopIcon className="size-4 shrink-0 text-muted" />
          ) : isWorking ? (
            <span className="relative flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
              <span className="absolute size-4 animate-ping rounded-full bg-brand opacity-25" />
              <span className="size-2 rounded-full bg-brand" />
            </span>
          ) : status === "COMPLETED" ? (
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-positive-soft text-positive-ink" aria-hidden="true">
              <CheckIcon className="size-3.5" />
            </span>
          ) : (
            <AlertIcon className="size-4 shrink-0 text-negative-ink" />
          )}
          <span className="truncate">{trackingStopped ? "Suivi arrêté dans cette page" : statusCopy[status].label}</span>
        </span>
        <span className="text-xs text-muted transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
      </summary>
      <ol className="space-y-2 border-t border-line px-3.5 py-3">
        {message.statusHistory.map((historyStatus, index) => {
          const copy = statusCopy[historyStatus];
          const isCurrent = index === message.statusHistory.length - 1;
          return (
            <li key={`${historyStatus}-${index}`} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2.5 text-xs">
              <span className={`mt-1 size-2 rounded-full ${trackingStopped ? "bg-data-neutral" : isCurrent && isWorking ? "bg-brand" : "bg-positive"}`} aria-hidden="true" />
              <span>
                <span className="block font-semibold text-ink">{copy.label}</span>
                <span className="mt-0.5 block font-light leading-5 text-muted">{copy.detail}</span>
              </span>
            </li>
          );
        })}
        {trackingStopped ? (
          <li className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2.5 text-xs">
            <span className="mt-1 size-2 rounded-full bg-brand" aria-hidden="true" />
            <span>
              <span className="block font-semibold text-ink">Suivi local arrêté</span>
              <span className="mt-0.5 block font-light leading-5 text-muted">Le traitement Databricks peut continuer en arrière-plan.</span>
            </span>
          </li>
        ) : null}
      </ol>
    </details>
  );
}

function ProgressiveAnswer({ content, animate }: { content: string; animate: boolean }) {
  const prefersReducedMotion = useReducedMotion();
  const [visibleLength, setVisibleLength] = useState(0);
  const shouldAnimate = animate && !prefersReducedMotion;

  useEffect(() => {
    if (!shouldAnimate || content.length === 0) {
      return;
    }
    const chunkSize = Math.max(4, Math.ceil(content.length / 48));
    const interval = window.setInterval(() => {
      setVisibleLength((length) => {
        const nextLength = Math.min(content.length, length + chunkSize);
        if (nextLength >= content.length) {
          window.clearInterval(interval);
        }
        return nextLength;
      });
    }, 24);
    return () => window.clearInterval(interval);
  }, [content.length, shouldAnimate]);

  const visibleContent = shouldAnimate ? content.slice(0, visibleLength) : content;
  return (
    <div aria-live="off">
      <GenieMarkdown content={visibleContent} />
      {shouldAnimate && visibleLength < content.length ? (
        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse rounded-full bg-brand align-middle" aria-hidden="true" />
      ) : null}
    </div>
  );
}

function CopyAnswerButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copyAnswer}
      className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-xs font-semibold text-muted transition-colors hover:bg-neutral-soft hover:text-ink"
    >
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      {copied ? "Copié" : "Copier"}
    </button>
  );
}

function PinAnswerButton({
  alias,
  answer,
  context,
  provenance,
  onPin,
}: {
  alias: string;
  answer: string;
  context?: GenieDashboardContext;
  provenance?: PinnedGenieInsight["provenance"];
  onPin?: GenieChatProps["onPin"];
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  if (!onPin || !provenance) {
    return null;
  }
  const pinProvenance = provenance;
  const pinCallback = onPin;

  async function pinAnswer() {
    setState("saving");
    try {
      await pinCallback(createPinnedGenieAnswer({ alias, answer, context, provenance: pinProvenance }));
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <button
      type="button"
      onClick={pinAnswer}
      disabled={state === "saving" || state === "saved"}
      className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-xs font-semibold transition-colors disabled:cursor-default ${
        state === "saved"
          ? "bg-positive-soft text-positive-ink"
          : state === "error"
            ? "bg-negative-soft text-negative-ink"
            : "text-muted hover:bg-neutral-soft hover:text-ink"
      }`}
    >
      {state === "saved" ? <CheckIcon className="size-3.5" /> : <PlusIcon className="size-3.5" />}
      {state === "saving" ? "Ajout…" : state === "saved" ? "Épinglé" : state === "error" ? "Réessayer" : "Épingler la synthèse"}
    </button>
  );
}

export function GenieErrorCard({ error, onRetry }: { error: GenieClientError; onRetry?: () => void }) {
  const permissionDenied = error.code === "GENIE_PERMISSION_DENIED" || error.code === "GENIE_AUTH_REQUIRED";
  const authenticationRequired = error.code === "GENIE_AUTH_REQUIRED";
  const unknownSpace = error.code === "UNKNOWN_SPACE";
  const title = authenticationRequired
    ? "Session Databricks requise"
    : permissionDenied
      ? "Accès aux ressources Databricks requis"
      : unknownSpace
        ? "Space Genie non configuré"
        : "Genie n’a pas pu répondre";

  return (
    <div role="alert" className="rounded-2xl border border-negative-border bg-negative-soft p-4 text-negative-ink">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-negative-border bg-surface">
          {permissionDenied ? <LockIcon className="size-5" /> : <AlertIcon className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink">{title}</p>
          <p className="mt-1 text-sm font-light leading-6 text-negative-ink">{error.message}</p>
          {error.requestId ? (
            <p className="mt-2 text-xs font-medium text-muted">Référence support : {error.requestId}</p>
          ) : null}
          {permissionDenied ? (
            <p className="mt-3 text-xs font-light leading-5 text-muted">
              Vérifiez votre session et le consentement Databricks. Si nécessaire, demandez l’accès au Space Genie,
              au SQL warehouse et aux données Unity Catalog requises, puis actualisez la page.
            </p>
          ) : null}
          {error.submissionMayHaveStarted ? (
            <p className="mt-3 text-xs font-light leading-5 text-muted">
              La question a pu être créée dans Databricks. Pour éviter un doublon, démarrez une nouvelle conversation au lieu de la renvoyer.
            </p>
          ) : null}
          {error.retryable && onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-negative-border bg-surface px-3 text-sm font-semibold text-ink transition hover:shadow-panel"
            >
              Réessayer
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function TrackingStoppedNotice({ onNewConversation }: { onNewConversation?: () => void }) {
  return (
    <div role="status" className="rounded-2xl border border-line bg-canvas px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface text-muted" aria-hidden="true">
          <StopIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink">Suivi arrêté dans cette page</p>
          <p className="mt-1 text-sm font-light leading-6 text-muted">
            Le traitement Databricks peut continuer. Démarrez une nouvelle conversation avant d’envoyer une autre question.
          </p>
          {onNewConversation ? (
            <button
              type="button"
              onClick={onNewConversation}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-canvas transition hover:shadow-floating"
            >
              <PlusIcon className="size-4" />
              Nouvelle conversation
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PostStartErrorNotice({
  onNewConversation,
  disabled = false,
}: {
  onNewConversation: () => void;
  disabled?: boolean;
}) {
  return (
    <div role="status" className="rounded-2xl border border-line bg-canvas px-4 py-4">
      <p className="font-bold text-ink">Cette conversation ne peut pas continuer</p>
      <p className="mt-1 text-sm font-light leading-6 text-muted">
        La question a pu être créée dans Databricks, mais son suivi a échoué. Démarrez une nouvelle conversation pour éviter un envoi en double.
      </p>
      <button
        type="button"
        onClick={onNewConversation}
        disabled={disabled}
        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-canvas transition hover:shadow-floating disabled:cursor-not-allowed disabled:opacity-45"
      >
        <PlusIcon className="size-4" />
        Nouvelle conversation
      </button>
    </div>
  );
}

function getSessionTitle(session: GenieSessionConversation) {
  const firstQuestion = session.messages.find((message) => message.role === "user")?.content;
  return firstQuestion ?? "Nouvelle conversation";
}

function ConversationHistory({
  sessions,
  activeSessionId,
  disabled,
  onResume,
  onClear,
}: {
  sessions: GenieSessionConversation[];
  activeSessionId: string;
  disabled: boolean;
  onResume: (localId: string) => void;
  onClear: () => void;
}) {
  const conversations = [...sessions].filter((session) => session.messages.length > 0).reverse();
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (disabled && detailsRef.current) {
      detailsRef.current.open = false;
    }
  }, [disabled]);

  return (
    <details ref={detailsRef} className="group relative">
      <summary
        aria-label="Ouvrir l’historique des conversations"
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : undefined}
        onClick={(event) => {
          if (disabled) {
            event.preventDefault();
          }
        }}
        onKeyDown={(event) => {
          if (disabled && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
          }
        }}
        className={`grid size-11 list-none place-items-center rounded-xl border border-line bg-surface text-muted transition hover:text-ink hover:shadow-panel [&::-webkit-details-marker]:hidden ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        <ClockIcon className="size-4.5" />
      </summary>
      <div className="absolute right-0 top-12 z-30 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-floating">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm font-bold text-ink">Historique de la session</p>
          {conversations.length > 0 ? (
            <button
              type="button"
              onClick={onClear}
              disabled={disabled}
              className="min-h-9 rounded-lg px-2 text-xs font-semibold text-muted hover:bg-neutral-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
            >
              Effacer
            </button>
          ) : null}
        </div>
        {conversations.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm font-light text-muted">Aucune conversation pour le moment.</p>
        ) : (
          <ul className="max-h-80 overflow-y-auto p-2">
            {conversations.map((session) => {
              const isActive = session.localId === activeSessionId;
              return (
                <li key={session.localId}>
                  <button
                    type="button"
                    onClick={() => onResume(session.localId)}
                    disabled={disabled}
                    aria-current={isActive ? "true" : undefined}
                    className={`w-full rounded-xl px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${isActive ? "bg-accent-soft" : "hover:bg-neutral-soft"}`}
                  >
                    <span className="block truncate text-sm font-semibold text-ink">{getSessionTitle(session)}</span>
                    <span className="mt-1 block text-xs text-muted">
                      {new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(session.updatedAt))}
                      {session.trackingStopped ? " · suivi arrêté" : ""}
                      {isActive ? " · active" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}

function EmptyConversation({
  context,
  onSuggestion,
}: {
  context?: GenieDashboardContext;
  onSuggestion: (question: string) => void;
}) {
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center px-4 py-10 text-center">
      <div className="relative grid size-16 place-items-center rounded-[1.25rem] border border-line bg-surface shadow-panel">
        <span className="absolute -inset-4 -z-10 rounded-full bg-brand opacity-10 blur-2xl" aria-hidden="true" />
        <SparklesIcon className="size-7 text-brand-ink" />
      </div>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.15em] text-brand-ink">Genie · Analytics conversationnelle</p>
      <h3 className="mt-2 text-2xl font-black tracking-[-0.035em] text-ink">Interrogez les données autorisées</h3>
      <p className="mt-3 max-w-xl text-sm font-light leading-6 text-muted">
        Posez une question métier en langage naturel. Genie peut expliquer sa réponse, exécuter une requête et joindre le résultat.
      </p>
      {context ? (
        <div className="mt-4 rounded-2xl border border-line bg-canvas px-4 py-3 text-left">
          <p className="mb-2 text-xs font-semibold text-muted">Contexte prêt à être joint</p>
          <ContextChips context={context} compact />
        </div>
      ) : null}
      <div className="mt-7 grid w-full gap-2 sm:grid-cols-3" aria-label="Questions suggérées">
        {emptySuggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSuggestion(suggestion)}
            className="min-h-20 rounded-2xl border border-line bg-surface px-4 py-3 text-left text-sm font-medium leading-5 text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-brand hover:shadow-panel"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function AssistantMessage({
  alias,
  conversationId,
  message,
  question,
  context,
  isLatest,
  isStreaming,
  onSuggestion,
  onRetry,
  onPin,
}: {
  alias: string;
  conversationId: string | null;
  message: GenieUiMessage;
  question: string;
  context?: GenieDashboardContext;
  isLatest: boolean;
  isStreaming: boolean;
  onSuggestion: (question: string) => void;
  onRetry: () => void;
  onPin?: GenieChatProps["onPin"];
}) {
  const isActive = isLatest && isStreaming;
  const showStatus = message.statusHistory.length > 0;
  const hasAnswer = message.content.trim().length > 0;
  const canPin = Boolean(conversationId && message.serverMessageId);
  const provenance = canPin ? {
    conversationId: conversationId!,
    messageId: message.serverMessageId!,
    question,
  } : undefined;

  return (
    <article className="flex items-start gap-3" aria-label="Réponse de Genie">
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface text-brand-ink shadow-sm" aria-hidden="true">
        <SparklesIcon className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <p className="text-xs text-muted">Réponse à vérifier avec les sources et les définitions métier avant partage.</p>
        {showStatus ? <GenieStatusTrace message={message} /> : null}
        {message.error ? <GenieErrorCard error={message.error} onRetry={message.error.retryable && !message.trackingStopped ? onRetry : undefined} /> : null}
        {message.status === "CANCELLED" && !hasAnswer ? (
          <div className="rounded-2xl border border-line bg-canvas px-4 py-3 text-sm font-light text-muted">Genie a signalé l’annulation du traitement. Démarrez une nouvelle conversation avant de reformuler la question.</div>
        ) : null}
        {hasAnswer ? (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="rounded-[1.25rem] border border-line bg-surface px-4 py-4 shadow-sm sm:px-5"
          >
            <ProgressiveAnswer content={message.content} animate={isLatest} />
            <div className="mt-3 flex flex-wrap justify-end gap-1 border-t border-line pt-2">
              <PinAnswerButton
                alias={alias}
                answer={message.content}
                context={context}
                provenance={provenance}
                onPin={onPin}
              />
              <CopyAnswerButton content={message.content} />
            </div>
          </motion.div>
        ) : null}
        {message.queryResults.map((result) => (
          <GenieResultRenderer
            key={result.attachmentId}
            alias={alias}
            result={result}
            answer={hasAnswer ? message.content : null}
            context={context}
            provenance={provenance}
            onPin={canPin ? onPin : undefined}
          />
        ))}
        {!isActive && message.status === "COMPLETED" && !hasAnswer && message.queryResults.length === 0 ? (
          <div className="rounded-2xl border border-line bg-canvas px-4 py-3 text-sm font-light text-muted">
            Genie a terminé le traitement sans produire de contenu affichable. Essayez une question plus précise.
          </div>
        ) : null}
        {!isActive && !message.trackingStopped && !message.error?.submissionMayHaveStarted && message.suggestedQuestions.length > 0 ? (
          <div className="flex flex-wrap gap-2" aria-label="Questions de suivi suggérées">
            {message.suggestedQuestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onSuggestion(suggestion)}
                className="min-h-11 rounded-full border border-line bg-surface px-3.5 text-left text-xs font-semibold text-ink transition hover:border-brand hover:bg-accent-soft"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function GenieChat({
  alias,
  context,
  height,
  initialQuestion = "",
  variant = "standalone",
  onPin,
  onSave,
}: GenieChatProps) {
  const prefersReducedMotion = useReducedMotion();
  const [draft, setDraft] = useState(initialQuestion);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const {
    messages,
    conversationId,
    sessions,
    activeSessionId,
    activeStatus,
    isStreaming,
    trackingStopped,
    requiresNewConversation,
    sendMessage,
    stopTracking,
    newConversation,
    resumeConversation,
    clearHistory,
    createSnapshot,
  } = useGenieConversation(alias);

  const defaultHeight = variant === "embedded" ? 680 : variant === "floating" ? 620 : 760;
  const chatStyle: CSSProperties = {
    height: typeof height === "number" ? `${height}px` : height ?? `${defaultHeight}px`,
    minHeight: 440,
  };
  const surfaceClass = variant === "floating"
    ? "border-line bg-surface-glass shadow-floating backdrop-blur-xl"
    : variant === "panel"
      ? "border-line bg-surface shadow-panel"
      : "border-line bg-surface shadow-panel";
  const contextChips = useMemo(() => getContextChips(context), [context]);

  useEffect(() => {
    if (!stickToBottomRef.current) {
      return;
    }
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    container.scrollTo({ top: container.scrollHeight, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }, [activeStatus, messages, prefersReducedMotion]);

  function handleScroll() {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    stickToBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
  }

  async function submitQuestion(question: string, questionContext = context) {
    if (!question.trim() || isStreaming || requiresNewConversation) {
      return;
    }
    setDraft("");
    stickToBottomRef.current = true;
    await sendMessage(question, { context: questionContext });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitQuestion(draft);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submitQuestion(draft);
    }
  }

  async function saveConversation() {
    if (!onSave || messages.length === 0) {
      return;
    }
    setSaveState("saving");
    try {
      await onSave(createSnapshot());
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 2_000);
    } catch {
      setSaveState("error");
    }
  }

  const statusAnnouncement = isStreaming && activeStatus
    ? statusCopy[activeStatus].label
    : messages.at(-1)?.status === "COMPLETED"
      ? "Réponse Genie prête"
      : "";
  const latestError = messages.at(-1)?.error;
  const accessError = latestError?.code === "GENIE_PERMISSION_DENIED" || latestError?.code === "GENIE_AUTH_REQUIRED";
  const availability = trackingStopped
    ? { label: "Suivi arrêté", className: "bg-neutral-soft text-muted", dot: "bg-data-neutral" }
    : isStreaming
      ? { label: "En cours", className: "bg-accent-soft text-brand-ink", dot: "bg-brand" }
      : accessError
        ? { label: "Accès requis", className: "bg-negative-soft text-negative-ink", dot: "bg-negative" }
        : latestError?.submissionMayHaveStarted
          ? { label: "Suivi interrompu", className: "bg-negative-soft text-negative-ink", dot: "bg-negative" }
          : latestError
            ? { label: "À réessayer", className: "bg-negative-soft text-negative-ink", dot: "bg-negative" }
            : { label: "Prêt", className: "bg-positive-soft text-positive-ink", dot: "bg-positive" };

  return (
    <section
      aria-label={`Conversation Genie, space ${alias}`}
      style={chatStyle}
      className={`flex min-w-0 flex-col overflow-hidden rounded-[1.5rem] border ${surfaceClass}`}
    >
      <span className="sr-only" aria-live="polite" aria-atomic="true">{statusAnnouncement}</span>

      <header className="relative z-20 border-b border-line bg-surface px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-ink text-brand shadow-sm" aria-hidden="true">
              <span className="absolute inset-x-0 top-0 h-0.5 [background:var(--brand-gradient)]" />
              <SparklesIcon className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-base font-bold tracking-[-0.02em] text-ink">Assistant Genie</h2>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${availability.className}`}>
                  <span className={`size-1.5 rounded-full ${availability.dot}`} aria-hidden="true" />
                  {availability.label}
                </span>
              </div>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
                <LockIcon className="size-3.5 shrink-0" />
                <span className="truncate">{alias} · accès gouverné côté serveur</span>
              </p>
              <GenieIdentity alias={alias} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <ConversationHistory
              sessions={sessions}
              activeSessionId={activeSessionId}
              disabled={isStreaming}
              onResume={resumeConversation}
              onClear={clearHistory}
            />
            {onSave ? (
              <button
                type="button"
                onClick={saveConversation}
                disabled={messages.length === 0 || isStreaming || requiresNewConversation || saveState === "saving"}
                aria-label="Enregistrer cette conversation"
                className={`grid size-11 place-items-center rounded-xl border border-line bg-surface transition disabled:cursor-not-allowed disabled:opacity-45 ${saveState === "saved" ? "text-positive-ink" : saveState === "error" ? "text-negative-ink" : "text-muted hover:text-ink hover:shadow-panel"}`}
              >
                {saveState === "saved" ? <CheckIcon className="size-4.5" /> : <SaveIcon className="size-4.5" />}
              </button>
            ) : null}
            <button
              type="button"
              onClick={newConversation}
              disabled={isStreaming}
              aria-label="Démarrer une nouvelle conversation"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-3 text-sm font-semibold text-canvas transition hover:-translate-y-0.5 hover:shadow-floating disabled:cursor-not-allowed disabled:opacity-45"
            >
              <PlusIcon className="size-4" />
              <span className="hidden sm:inline">Nouveau</span>
            </button>
          </div>
        </div>
        {contextChips.length > 0 ? (
          <div className="mt-3 flex items-start gap-2 border-t border-line pt-3">
            <DatabaseIcon className="mt-1 size-3.5 shrink-0 text-muted" />
            <ContextChips context={context} />
          </div>
        ) : null}
      </header>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-canvas-subtle px-3 py-4 sm:px-5 sm:py-5"
      >
        {messages.length === 0 ? (
          <EmptyConversation context={context} onSuggestion={(question) => void submitQuestion(question)} />
        ) : (
          <div className="mx-auto max-w-4xl space-y-6">
            <AnimatePresence initial={false}>
              {messages.map((message, index) => {
                const precedingUserMessage = message.role === "assistant"
                  ? messages.slice(0, index).reverse().find((candidate) => candidate.role === "user")
                  : undefined;
                return message.role === "user" ? (
                  <motion.article
                    key={message.id}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="ml-auto max-w-[90%] sm:max-w-[78%]"
                    aria-label="Votre question"
                  >
                    <div className="rounded-[1.25rem] rounded-br-md bg-ink px-4 py-3 text-[0.95rem] font-light leading-6 text-canvas shadow-sm">
                      {message.content}
                    </div>
                    {message.context ? <div className="mt-2 flex justify-end"><ContextChips context={message.context} compact /></div> : null}
                  </motion.article>
                ) : (
                  <motion.div
                    key={message.id}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22 }}
                  >
                    <AssistantMessage
                      alias={alias}
                      conversationId={conversationId}
                      message={message}
                      question={precedingUserMessage?.content ?? "Question Genie"}
                      context={precedingUserMessage?.context}
                      isLatest={index === messages.length - 1}
                      isStreaming={isStreaming}
                      onSuggestion={(question) => void submitQuestion(question)}
                      onRetry={() => precedingUserMessage ? void submitQuestion(precedingUserMessage.content, precedingUserMessage.context) : undefined}
                      onPin={onPin}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      <footer className="relative z-10 border-t border-line bg-surface px-3 py-3 sm:px-5 sm:py-4">
        {requiresNewConversation ? (
          <div className="mx-auto max-w-4xl">
            {trackingStopped ? (
              <TrackingStoppedNotice onNewConversation={newConversation} />
            ) : (
              <PostStartErrorNotice onNewConversation={newConversation} disabled={isStreaming} />
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mx-auto max-w-4xl">
            <div className="flex items-end gap-2 rounded-2xl border border-line bg-canvas p-2 shadow-inner transition focus-within:border-brand focus-within:bg-surface focus-within:shadow-panel">
              <textarea
                autoFocus={Boolean(initialQuestion)}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                disabled={isStreaming || requiresNewConversation}
                rows={1}
                maxLength={10_000}
                aria-label="Question pour Genie"
                placeholder={isStreaming ? "Genie traite votre question…" : "Posez une question sur vos données…"}
                className="max-h-36 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-[0.95rem] leading-6 text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed"
              />
              {isStreaming ? (
                <button
                  type="button"
                  onClick={stopTracking}
                  aria-label="Arrêter le suivi"
                  className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-ink transition hover:bg-neutral-soft"
                >
                  <StopIcon className="size-4" />
                  <span className="sm:hidden">Arrêter</span>
                  <span className="hidden sm:inline">Arrêter le suivi</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  aria-label="Envoyer la question"
                  className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-on-brand shadow-sm transition hover:-translate-y-0.5 hover:shadow-floating disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <SendIcon className="size-4.5" />
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between gap-4 px-1 text-[0.68rem] font-light text-muted">
              <span>{isStreaming ? "Arrêter le suivi ferme ce flux. Le traitement Databricks peut continuer." : "Entrée pour envoyer · Maj + Entrée pour une nouvelle ligne"}</span>
              <span className={draft.length > 9_000 ? "font-semibold text-negative-ink" : ""}>{draft.length.toLocaleString("fr-FR")}/10 000</span>
            </div>
            <p className="mt-1 text-center text-[0.68rem] font-light text-muted">
              Vérifiez les définitions métier et la requête SQL avant de partager une conclusion.
            </p>
          </form>
        )}
      </footer>
    </section>
  );
}
