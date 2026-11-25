// Raíz de composición de "newsletter": conecta los puertos con sus adaptadores.
import { forwardExport } from "@/shared/infrastructure/panel-export";

import { NewsletterUnavailableError, type NewsletterGateway } from "./application/ports";
import type { SubscriberAdmin } from "./application/subscriber-admin";
import {
  parseSubscriberQuery,
  toApiSubscriberFilters,
  toSubscriberSearch,
} from "./domain/subscriber";
import { parseSubscription, parseUnsubscribe } from "./domain/subscription";
import { apiNewsletterGateway } from "./infrastructure/api-newsletter-gateway";
import { apiSubscriberAdmin } from "./infrastructure/api-subscriber-admin";

const gateway: NewsletterGateway = apiNewsletterGateway;

/** La API no aceptó el envío: mensaje general para el formulario. */
export type FormFailure = { ok: false; errors: Record<string, never>; formError: string };

async function guarded<T>(run: () => Promise<T>): Promise<T | FormFailure> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof NewsletterUnavailableError) {
      return { ok: false, errors: {}, formError: error.message };
    }
    throw error;
  }
}

/** Caso de uso: suscribirse con consentimiento explícito (RF-25). */
export async function subscribe(input: Partial<Record<string, unknown>>) {
  const result = parseSubscription(input, new Date().toISOString());
  if (!result.ok) return result;
  return guarded(async () => {
    await gateway.subscribe(result.email, result.consent);
    return result;
  });
}

/** Caso de uso: pedir el enlace de baja por correo (RF-35). No revela si estaba suscrito. */
export async function unsubscribe(input: Partial<Record<string, unknown>>) {
  const result = parseUnsubscribe(input);
  if (!result.ok) return result;
  return guarded(async () => {
    await gateway.requestUnsubscribeLink(result.email);
    return result;
  });
}

/** Caso de uso: confirmar la baja con el token del enlace del correo (RF-35). */
export async function confirmUnsubscribe(
  token: string,
): Promise<{ ok: true } | { ok: false; reason: "invalid" } | FormFailure> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return { ok: false, reason: "invalid" };
  return guarded(async () =>
    (await gateway.confirmUnsubscribe(token))
      ? ({ ok: true } as const)
      : ({ ok: false, reason: "invalid" } as const),
  );
}

// ── Panel: suscriptores (UI-14) ──────────────────────────────────────────────
// Solo Administrador: la pantalla, la acción y la exportación verifican el rol,
// y la API lo vuelve a exigir.
export const subscriberAdmin: SubscriberAdmin = apiSubscriberAdmin;

/** Caso de uso: CSV de suscriptores con los filtros de la URL (RF-29), armado por la API. */
export function exportSubscribers(
  params: Record<string, string | string[] | undefined>,
): Promise<Response> {
  const query = parseSubscriberQuery(params);
  return forwardExport(
    "subscribers",
    toApiSubscriberFilters(query),
    `/admin/suscriptores${toSubscriberSearch({ filter: query.filter, q: query.q })}`,
  );
}
