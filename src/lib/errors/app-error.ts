export type AppErrorCode =
  | "INVALID_CONFIGURATION"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "USER_STATE_DISABLED"
  | "USER_STATE_AUTH_REQUIRED"
  | "USER_STATE_NOT_FOUND"
  | "USER_STATE_UNAVAILABLE"
  | "DATABRICKS_UNAVAILABLE"
  | "UNKNOWN_SPACE"
  | "GENIE_AUTH_REQUIRED"
  | "GENIE_PERMISSION_DENIED"
  | "GENIE_TIMEOUT"
  | "GENIE_CANCELLED"
  | "GENIE_RESULT_EXPIRED"
  | "GENIE_UNAVAILABLE"
  | "SQL_QUERY_FAILED"
  | "UNEXPECTED_ERROR";

export class AppError extends Error {
  constructor(
    message: string,
    readonly code: AppErrorCode,
    readonly status: number,
    readonly userMessage: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(
      details ? `${message}: ${JSON.stringify(details)}` : message,
      "INVALID_CONFIGURATION",
      500,
      "La configuration de l’application est invalide.",
    );
  }
}

export class RequestValidationError extends AppError {
  constructor(message: string) {
    super(message, "INVALID_REQUEST", 400, "La requête n’est pas valide.");
  }
}

export class DatabricksError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(
      message,
      "DATABRICKS_UNAVAILABLE",
      503,
      "Databricks est temporairement indisponible. Réessayez dans quelques instants.",
      options,
    );
  }
}

export class SqlQueryError extends AppError {
  constructor(queryName: string, options?: ErrorOptions) {
    super(
      `SQL query failed: ${queryName}`,
      "SQL_QUERY_FAILED",
      502,
      "La requête de données n’a pas pu aboutir.",
      options,
    );
  }
}

export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  return new AppError(
    error instanceof Error ? error.message : "Unknown error",
    "UNEXPECTED_ERROR",
    500,
    "Une erreur inattendue est survenue.",
    { cause: error },
  );
}
