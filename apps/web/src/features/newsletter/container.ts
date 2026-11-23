// Raíz de composición de "newsletter": conecta los puertos con sus adaptadores actuales.
import type { ActivityEntry } from "@/features/activity";
import { chileDateTimeForCsv } from "@/shared/lib/chile-time";
import { toCsv } from "@/shared/lib/csv";

import { NewsletterUnavailableError, type NewsletterGateway } from "./application/ports";
import type { SubscriberAdmin } from "./application/subscriber-admin";
import {
  filterSubscribers,
  parseSubscriberQuery,
  SUBSCRIBER_ACTOR,
  subscribersCsvTable,
} from "./domain/subscriber";
import { parseSubscription, parseUnsubscribe } from "./domain/subscription";
import { apiNewsletterGateway } from "./infrastructure/api-newsletter-gateway";
import { demoSubscriberList } from "./infrastructure/demo-subscriber-list";

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
// DEMO hasta LN-08/LN-13 (ver infrastructure/demo-subscriber-list.ts): el mismo
// almacén recibe el formulario público y responde al panel. Solo Administrador:
// la pantalla, la acción y la exportación verifican el rol antes.
export const subscriberAdmin: SubscriberAdmin = demoSubscriberList;

/** Caso de uso: CSV de suscriptores con el filtro de la URL (RF-29, solo Administrador). */
export async function exportSubscribersCsv(
  params: Record<string, string | string[] | undefined>,
): Promise<string> {
  const rows = filterSubscribers(await subscriberAdmin.list(), parseSubscriberQuery(params).filter);
  const table = subscribersCsvTable(rows, chileDateTimeForCsv);
  return toCsv(table.header, table.rows);
}

/**
 * Caso de uso: bajas registradas por el equipo, para el historial (RF-25,
 * RF-34). Las bajas que pide el propio suscriptor no se listan aquí.
 */
export async function listActivity(): Promise<ActivityEntry[]> {
  return (await subscriberAdmin.list()).flatMap((s) =>
    s.unsubscribedAt && s.unsubscribedBy && s.unsubscribedBy !== SUBSCRIBER_ACTOR
      ? [
          {
            id: `suscriptor-${s.id}`,
            at: s.unsubscribedAt,
            actor: s.unsubscribedBy,
            area: "suscriptores" as const,
            action: `Baja del newsletter registrada para ${s.email}.`,
            reason: null,
            reference: { label: "Suscriptores", href: "/admin/suscriptores" },
          },
        ]
      : [],
  );
}
