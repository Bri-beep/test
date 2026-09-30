import type { GeniePublicErrorCode, GenieStreamEvent } from "@/features/genie/contract";
import { AppError } from "@/lib/errors/app-error";

const publicMessages: Record<GeniePublicErrorCode, string> = {
  INVALID_REQUEST: "La requête Genie n’est pas valide.",
  UNKNOWN_SPACE: "Cet espace Genie n’est pas configuré pour l’application.",
  GENIE_AUTH_REQUIRED: "Votre session Databricks ne permet pas d’interroger Genie. Reconnectez-vous puis réessayez.",
  GENIE_PERMISSION_DENIED: "Vous n’avez pas l’autorisation d’utiliser cet espace Genie ou ses données.",
  GENIE_TIMEOUT: "Genie met trop de temps à répondre. Réessayez dans quelques instants.",
  GENIE_CANCELLED: "La réponse Genie a été annulée.",
  GENIE_RESULT_EXPIRED: "Le résultat de cette requête Genie a expiré. Relancez la question.",
  GENIE_UNAVAILABLE: "Genie est temporairement indisponible. Réessayez dans quelques instants.",
  UNEXPECTED_ERROR: "Une erreur inattendue est survenue.",
};

export class GenieError extends AppError {
  readonly retryAfterMs?: number;
  readonly retryOnRead: boolean;

  constructor(
    message: string,
    code: GeniePublicErrorCode,
    status: number,
    readonly retryable: boolean,
    options?: ErrorOptions & { retryAfterMs?: number; retryOnRead?: boolean },
  ) {
    super(message, code, status, publicMessages[code], options);
    this.retryAfterMs = options?.retryAfterMs;
    this.retryOnRead = options?.retryOnRead ?? false;
  }
}

export function mapGenieHttpError(status: number, retryAfterMs?: number): GenieError {
  if (status === 401) {
    return new GenieError("Databricks Genie authentication failed", "GENIE_AUTH_REQUIRED", 401, false);
  }
  if (status === 403) {
    return new GenieError("Databricks Genie permission denied", "GENIE_PERMISSION_DENIED", 403, false);
  }
  if (status === 408 || status === 504) {
    return new GenieError("Databricks Genie request timed out", "GENIE_TIMEOUT", 504, true, {
      retryAfterMs,
      retryOnRead: true,
    });
  }
  if (status === 410) {
    return new GenieError("Databricks Genie result expired", "GENIE_RESULT_EXPIRED", 410, true);
  }

  return new GenieError(
    `Databricks Genie request failed with HTTP ${status}`,
    "GENIE_UNAVAILABLE",
    status === 429 || status >= 500 ? 503 : 502,
    status === 429 || status >= 500,
    {
      retryAfterMs,
      retryOnRead: status === 429 || status >= 500,
    },
  );
}

export function toGenieError(error: unknown): GenieError {
  if (error instanceof GenieError) {
    return error;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return new GenieError("Databricks Genie request aborted", "GENIE_CANCELLED", 409, false, { cause: error });
  }
  return new GenieError("Unexpected Genie integration failure", "UNEXPECTED_ERROR", 500, false, { cause: error });
}

export function toGenieStreamErrorEvent(error: unknown, requestId: string): GenieStreamEvent {
  const normalized = toGenieError(error);
  return {
    type: "error",
    code: normalized.code as GeniePublicErrorCode,
    error: normalized.userMessage,
    requestId,
    retryable: normalized.retryable,
  };
}
