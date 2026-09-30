import type { IncomingHttpHeaders } from "node:http";

export type ForwardedGenieIdentity = {
  userId: string;
  accessToken: string;
};

export function extractForwardedGenieIdentity(headers: IncomingHttpHeaders): ForwardedGenieIdentity | null {
  const userId = headers["x-forwarded-user"];
  const accessToken = headers["x-forwarded-access-token"];
  return typeof userId === "string" && typeof accessToken === "string" && userId.trim() && accessToken.trim()
    ? { userId: userId.trim(), accessToken: accessToken.trim() } : null;
}
