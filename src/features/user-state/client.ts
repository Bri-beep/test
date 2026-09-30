import type { z } from "zod";

export async function personalRequest<T>(
  path: string, schema: z.ZodType<T>, options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, { ...options, cache: "no-store", credentials: "same-origin" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "Vos données personnelles sont indisponibles.");
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new Error("La réponse reçue est invalide. Rechargez la page.");
  return parsed.data;
}

export function jsonMutation(method: "PUT" | "DELETE", body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "L’opération a échoué. Rechargez la page avant de réessayer.";
}

export const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-canvas disabled:opacity-50";
export const inputClass = "min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink";
