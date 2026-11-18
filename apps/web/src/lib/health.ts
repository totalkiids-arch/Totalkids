import { z } from "zod";

export const healthSchema = z.object({ status: z.literal("ok") });

export type HealthState =
  { state: "loading" } | { state: "ok" } | { state: "error"; message: string };

/** Interpreta la respuesta de /api/health (ruta Next.js) en un estado para la UI. */
export function toHealthState(httpOk: boolean, body: unknown): HealthState {
  if (httpOk && healthSchema.safeParse(body).success) {
    return { state: "ok" };
  }
  const message =
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof body.message === "string"
      ? body.message
      : "La API no respondió correctamente";
  return { state: "error", message };
}
