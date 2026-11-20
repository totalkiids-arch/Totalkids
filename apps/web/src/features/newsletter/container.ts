// Raíz de composición de "newsletter": conecta los puertos con sus adaptadores actuales.
import { chileDateTimeForCsv } from "@/shared/lib/chile-time";
import { toCsv } from "@/shared/lib/csv";

import type { NewsletterGateway } from "./application/ports";
import type { SubscriberAdmin } from "./application/subscriber-admin";
import { filterSubscribers, parseSubscriberQuery, subscribersCsvTable } from "./domain/subscriber";
import { parseSubscription, parseUnsubscribe } from "./domain/subscription";
import { demoSubscriberList } from "./infrastructure/demo-subscriber-list";

const gateway: NewsletterGateway = demoSubscriberList;

/** Caso de uso: suscribirse con consentimiento explícito (RF-25, RF-35). */
export async function subscribe(input: Partial<Record<string, unknown>>) {
  const result = parseSubscription(input, new Date().toISOString());
  if (result.ok) await gateway.subscribe(result.email, result.consent);
  return result;
}

/** Caso de uso: darse de baja (RF-25). */
export async function unsubscribe(input: Partial<Record<string, unknown>>) {
  const result = parseUnsubscribe(input);
  if (result.ok) await gateway.unsubscribe(result.email);
  return result;
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
