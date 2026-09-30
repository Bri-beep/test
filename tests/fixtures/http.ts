import assert from "node:assert/strict";
import express, { type Express, type RequestHandler } from "express";
import { expressErrorHandler } from "../../src/lib/http/with-api-route";

// Match AppKit's public server body parser; do not simulate Express requests.
export async function withHttpApp<T>(
  configure: (app: Express) => void,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const app = express();
  app.use(express.json({ limit: "64kb" }));
  configure(app);
  app.use(expressErrorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// Buffer before closing the ephemeral server. Use withHttpApp for live streams.
export async function requestHandler(
  handler: RequestHandler,
  request: Request,
  routePath?: string,
): Promise<Response> {
  const url = new URL(request.url);
  return withHttpApp((app) => app.all(routePath ?? url.pathname, handler), async (baseUrl) => {
    const response = await fetch(`${baseUrl}${url.pathname}${url.search}`, {
      method: request.method,
      headers: request.headers,
      signal: request.signal,
      ...(request.body ? { body: request.body, duplex: "half" } : {}),
    } as RequestInit);
    const body = await response.arrayBuffer();
    return new Response(request.method === "HEAD" || [204, 205, 304].includes(response.status) ? null : body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  });
}
