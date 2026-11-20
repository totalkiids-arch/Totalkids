import { z } from "zod";

/**
 * Suscripción y baja del newsletter (RF-25, RF-35). Dominio puro.
 *
 * - Suscribirse exige consentimiento explícito: la casilla NO viene marcada y
 *   se guarda la versión del texto aceptado y la fecha (para el panel, RF-29).
 * - Darse de baja solo pide el correo y no revela si estaba suscrito.
 */

/** Nombres de los campos (los mismos que usa el formulario de la portada). */
export const SUBSCRIPTION_FIELDS = { email: "correo", consent: "consentimiento" } as const;

/**
 * Versión del texto de consentimiento. Provisional hasta que el cliente apruebe
 * la política de privacidad (CL-02); al cambiar el texto, cambia la versión.
 */
export const CONSENT_VERSION = "v1-provisional";

export const CONSENT_TEXT =
  "Quiero recibir ofertas y novedades de Total Kids por correo. Puedo darme de baja cuando quiera.";

export interface Consent {
  version: string;
  /** Fecha y hora ISO en que se aceptó. */
  acceptedAt: string;
}

export type SubscriptionResult =
  | { ok: true; email: string; consent: Consent }
  | { ok: false; errors: { correo?: string; consentimiento?: string } };

export type UnsubscribeResult =
  { ok: true; email: string } | { ok: false; errors: { correo?: string } };

type Input = Partial<Record<string, unknown>>;

const email = z
  .string("Ingresa tu correo.")
  .trim()
  .min(1, "Ingresa tu correo.")
  .max(254, "Usa como máximo 254 caracteres.")
  .pipe(z.email("Escribe un correo válido, por ejemplo nombre@correo.cl."))
  .transform((v) => v.toLowerCase());

/** El formulario de la portada envía "si"; el de esta pantalla, "on". */
export function isConsentGiven(value: unknown): boolean {
  return value === "on" || value === "si" || value === "true";
}

function parseEmail(value: unknown) {
  const parsed = email.safeParse(typeof value === "string" ? value : undefined);
  return parsed.success
    ? ({ ok: true, email: parsed.data } as const)
    : ({ ok: false, error: parsed.error.issues[0]?.message ?? "Revisa tu correo." } as const);
}

/**
 * @param now Fecha y hora ISO actual (la entrega quien llama, para que la regla
 *   sea pura): queda como fecha del consentimiento.
 */
export function parseSubscription(input: Input, now: string): SubscriptionResult {
  const F = SUBSCRIPTION_FIELDS;
  const errors: { correo?: string; consentimiento?: string } = {};
  const parsed = parseEmail(input[F.email]);
  if (!parsed.ok) errors.correo = parsed.error;
  if (!isConsentGiven(input[F.consent])) {
    errors.consentimiento = "Marca la casilla si quieres recibir nuestras novedades.";
  }
  if (!parsed.ok || errors.consentimiento) return { ok: false, errors };
  return { ok: true, email: parsed.email, consent: { version: CONSENT_VERSION, acceptedAt: now } };
}

export function parseUnsubscribe(input: Input): UnsubscribeResult {
  const parsed = parseEmail(input[SUBSCRIPTION_FIELDS.email]);
  return parsed.ok
    ? { ok: true, email: parsed.email }
    : { ok: false, errors: { correo: parsed.error } };
}
