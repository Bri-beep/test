"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  GenieConversationMessage,
  GenieConversationSnapshot,
  GenieDashboardContext,
  GenieMessageStatus,
  GeniePublicErrorCode,
  GenieQueryResult,
  GenieMessageResult,
} from "@/features/genie/contract";

import { queryResultFromEvent } from "@/features/genie/contract";
import { sendGenieRequest } from "@/features/genie/stream";

export type GenieClientError = {
  code: GeniePublicErrorCode;
  message: string;
  requestId?: string;
  retryable: boolean;
  submissionMayHaveStarted?: boolean;
};

export type GenieUiMessage = GenieConversationMessage & {
  serverMessageId?: string;
  trackingStopped?: boolean;
  statusHistory: GenieMessageStatus[];
  queryResults: GenieQueryResult[];
  suggestedQuestions: string[];
  context?: GenieDashboardContext;
  error?: GenieClientError;
};

export type GenieSessionConversation = {
  localId: string;
  conversationId: string | null;
  messages: GenieUiMessage[];
  trackingStopped: boolean;
  startedAt: string;
  updatedAt: string;
};

type SendMessageOptions = {
  context?: GenieDashboardContext;
};

function requiresNewConversation(session: GenieSessionConversation) {
  return session.trackingStopped || Boolean(session.messages.at(-1)?.error?.submissionMayHaveStarted);
}

function createLocalId(prefix: string) {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createEmptySession(): GenieSessionConversation {
  const createdAt = new Date().toISOString();
  return {
    localId: createLocalId("conversation"),
    conversationId: null,
    messages: [],
    trackingStopped: false,
    startedAt: createdAt,
    updatedAt: createdAt,
  };
}

function fallbackError(message: string, retryable = true): GenieClientError {
  return {
    code: "GENIE_UNAVAILABLE",
    message,
    retryable,
  };
}

export function preventGenieReplay(error: GenieClientError): GenieClientError {
  return { ...error, retryable: false, submissionMayHaveStarted: true };
}

function connectionError(error: unknown): GenieClientError {
  // AppKit connectSSE exposes the status, never the pre-stream response body.
  const status = error instanceof Error ? /^HTTP (\d{3})$/.exec(error.message)?.[1] : undefined;
  if (status === "401") return { code: "GENIE_AUTH_REQUIRED", retryable: false,
    message: "Votre session Databricks ne permet pas d’interroger Genie. Reconnectez-vous puis réessayez." };
  if (status === "403") return { code: "GENIE_PERMISSION_DENIED", retryable: false,
    message: "Vous n’avez pas l’autorisation d’utiliser cet espace Genie ou ses données." };
  return fallbackError("Impossible de terminer la réponse Genie. Vérifiez votre connexion et ouvrez une nouvelle conversation.", false);
}

export function useGenieConversation(alias: string) {
  const [initialSession] = useState(createEmptySession);
  const [sessions, setSessions] = useState<GenieSessionConversation[]>([initialSession]);
  const [activeSessionId, setActiveSessionId] = useState(initialSession.localId);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeStatus, setActiveStatus] = useState<GenieMessageStatus | null>(null);
  const [error, setError] = useState<GenieClientError | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const stoppedControllerRef = useRef<AbortController | null>(null);

  const activeSession = useMemo(
    () => sessions.find((session) => session.localId === activeSessionId) ?? sessions[0]!,
    [activeSessionId, sessions],
  );

  const updateSession = useCallback((
    sessionId: string,
    updater: (session: GenieSessionConversation) => GenieSessionConversation,
  ) => {
    setSessions((currentSessions) => currentSessions.map((session) =>
      session.localId === sessionId ? updater(session) : session,
    ));
  }, []);

  const stopTracking = useCallback(() => {
    const abortController = abortControllerRef.current;
    if (!abortController) {
      return;
    }
    stoppedControllerRef.current = abortController;
    updateSession(activeSessionId, (session) => ({
      ...session,
      trackingStopped: true,
      updatedAt: new Date().toISOString(),
      messages: session.messages.map((message, index) =>
        message.role === "assistant" && index === session.messages.length - 1
          ? { ...message, trackingStopped: true }
          : message,
      ),
    }));
    abortController.abort();
  }, [activeSessionId, updateSession]);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  const sendMessage = useCallback(async (content: string, options: SendMessageOptions = {}) => {
    const normalizedContent = content.trim();
    if (!normalizedContent || abortControllerRef.current || isStreaming || requiresNewConversation(activeSession)) {
      return;
    }

    const sessionId = activeSession.localId;
    const conversationId = activeSession.conversationId;
    const now = new Date().toISOString();
    const assistantMessageId = createLocalId("assistant");
    const userMessage: GenieUiMessage = {
      id: createLocalId("user"),
      role: "user",
      content: normalizedContent,
      statusHistory: [],
      queryResults: [],
      suggestedQuestions: [],
      context: options.context,
      createdAt: now,
    };
    const assistantMessage: GenieUiMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      status: "SUBMITTED",
      statusHistory: ["SUBMITTED"],
      queryResults: [],
      suggestedQuestions: [],
      createdAt: now,
    };

    updateSession(sessionId, (session) => ({
      ...session,
      messages: [...session.messages, userMessage, assistantMessage],
      updatedAt: now,
    }));
    setError(null);
    setActiveStatus("SUBMITTED");
    setIsStreaming(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    let streamErrorReceived = false;
    let answer: GenieMessageResult | undefined;

    function updateAssistant(updater: (message: GenieUiMessage) => GenieUiMessage) {
      updateSession(sessionId, (session) => ({
        ...session,
        messages: session.messages.map((message) => message.id === assistantMessageId ? updater(message) : message),
        updatedAt: new Date().toISOString(),
      }));
    }

    try {
      await sendGenieRequest(alias, {
        content: normalizedContent, conversationId: conversationId ?? undefined, context: options.context,
      }, abortController.signal, (event) => {
        switch (event.type) {
          case "message_start":
            updateSession(sessionId, (session) => ({
              ...session,
              conversationId: event.conversationId,
              updatedAt: new Date().toISOString(),
              messages: session.messages.map((message) => message.id === assistantMessageId
                ? { ...message, serverMessageId: event.messageId }
                : message),
            }));
            break;
          case "status":
            setActiveStatus(event.status);
            updateAssistant((message) => ({
              ...message,
              status: event.status,
              statusHistory: message.statusHistory.at(-1) === event.status
                ? message.statusHistory
                : [...message.statusHistory, event.status],
            }));
            break;
          case "message_result":
            answer = event.message;
            updateSession(sessionId, (session) => ({
              ...session,
              conversationId: event.message.conversationId,
              updatedAt: new Date().toISOString(),
              messages: session.messages.map((message) => message.id === assistantMessageId
                ? {
                    ...message,
                    serverMessageId: event.message.messageId,
                    content: event.message.attachments.map((item) => item.text?.content).filter(Boolean).join("\n\n"),
                    suggestedQuestions: event.message.attachments.flatMap((item) => item.suggestedQuestions ?? []),
                  }
                : message),
            }));
            break;
          case "query_result": {
            if (!answer) throw new Error("Genie result arrived before its message");
            const result = queryResultFromEvent(event, answer);
            updateAssistant((message) => ({
              ...message,
              queryResults: message.queryResults.some((result) => result.attachmentId === event.attachmentId)
                ? message.queryResults
                : [...message.queryResults, result],
            }));
            break;
          }
          case "error": {
            streamErrorReceived = true;
            const streamError = preventGenieReplay({
              code: event.code,
              message: event.error,
              requestId: event.requestId,
              retryable: event.retryable,
            });
            setError(streamError);
            setActiveStatus("FAILED");
            updateAssistant((message) => ({
              ...message,
              status: "FAILED",
              statusHistory: message.statusHistory.at(-1) === "FAILED"
                ? message.statusHistory
                : [...message.statusHistory, "FAILED"],
              error: streamError,
            }));
            break;
          }
        }
      });

      if (!streamErrorReceived) {
        setActiveStatus("COMPLETED");
        updateAssistant((message) => ({
          ...message,
          status: "COMPLETED",
          statusHistory: message.statusHistory.at(-1) === "COMPLETED"
            ? message.statusHistory
            : [...message.statusHistory, "COMPLETED"],
        }));
      }
    } catch (caughtError) {
      if (abortController.signal.aborted) {
        if (stoppedControllerRef.current === abortController) {
          setActiveStatus(null);
          updateAssistant((message) => ({ ...message, trackingStopped: true }));
        }
      } else {
        const clientError = preventGenieReplay(connectionError(caughtError));
        setError(clientError);
        setActiveStatus("FAILED");
        updateAssistant((message) => ({
          ...message,
          status: "FAILED",
          statusHistory: message.statusHistory.at(-1) === "FAILED"
            ? message.statusHistory
            : [...message.statusHistory, "FAILED"],
          error: clientError,
        }));
      }
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      if (stoppedControllerRef.current === abortController) {
        stoppedControllerRef.current = null;
      }
      setIsStreaming(false);
    }
  }, [activeSession, alias, isStreaming, updateSession]);

  const newConversation = useCallback(() => {
    if (abortControllerRef.current) {
      return;
    }
    const session = createEmptySession();
    setSessions((currentSessions) => [...currentSessions, session]);
    setActiveSessionId(session.localId);
    setActiveStatus(null);
    setError(null);
  }, []);

  const resumeConversation = useCallback((localId: string) => {
    if (abortControllerRef.current || !sessions.some((session) => session.localId === localId)) {
      return;
    }
    setActiveSessionId(localId);
    setActiveStatus(null);
    setError(null);
  }, [sessions]);

  const clearHistory = useCallback(() => {
    if (abortControllerRef.current) {
      return;
    }
    const session = createEmptySession();
    setSessions([session]);
    setActiveSessionId(session.localId);
    setActiveStatus(null);
    setError(null);
  }, []);

  const createSnapshot = useCallback((): GenieConversationSnapshot => ({
    alias,
    conversationId: activeSession.conversationId,
    messages: activeSession.messages.map(({ id, serverMessageId, role, content, status, queryResults, createdAt }) => ({
      id: serverMessageId ?? id,
      role,
      content,
      status,
      queryResults,
      createdAt,
    })),
    savedAt: new Date().toISOString(),
  }), [activeSession, alias]);

  return {
    messages: activeSession.messages,
    conversationId: activeSession.conversationId,
    sessions,
    activeSessionId,
    activeStatus,
    error,
    isStreaming,
    trackingStopped: activeSession.trackingStopped,
    requiresNewConversation: requiresNewConversation(activeSession),
    sendMessage,
    stopTracking,
    newConversation,
    resumeConversation,
    clearHistory,
    createSnapshot,
  };
}
