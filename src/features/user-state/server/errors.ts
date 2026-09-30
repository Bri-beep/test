import { AppError } from "@/lib/errors/app-error";

export function unavailable(): AppError {
  return new AppError("Personal state unavailable", "USER_STATE_UNAVAILABLE", 503,
    "Vos données personnelles sont indisponibles. Rechargez la page avant de réessayer une modification.");
}
export function notFound(): AppError {
  return new AppError("Personal analysis not found", "USER_STATE_NOT_FOUND", 404,
    "Cette analyse est introuvable ou n’est plus disponible.");
}
