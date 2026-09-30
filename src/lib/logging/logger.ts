import pino, { type DestinationStream, type Logger } from "pino";

const redactedPaths = [
  "authorization",
  "cookie",
  "token",
  "accessToken",
  "forwardedAccessToken",
  "xForwardedAccessToken",
  "['x-forwarded-access-token']",
  "['X-Forwarded-Access-Token']",
  "clientSecret",
  "DATABRICKS_TOKEN",
  "DATABRICKS_CLIENT_SECRET",
  "headers.authorization",
  "headers.cookie",
  "headers.forwardedAccessToken",
  "headers.xForwardedAccessToken",
  "headers['x-forwarded-access-token']",
  "headers['X-Forwarded-Access-Token']",
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers.forwardedAccessToken",
  "req.headers.xForwardedAccessToken",
  "req.headers['x-forwarded-access-token']",
  "req.headers['X-Forwarded-Access-Token']",
  "config.auth.token",
  "config.auth.clientSecret",
];

export function createLogger(stream?: DestinationStream): Logger {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      redact: { paths: redactedPaths, censor: "[REDACTED]" },
      base: undefined,
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    stream,
  );
}

export const logger = createLogger();
