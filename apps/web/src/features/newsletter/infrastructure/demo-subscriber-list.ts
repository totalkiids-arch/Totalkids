import "server-only";

import type { NewsletterGateway } from "../application/ports";
import type { SubscriberAdmin } from "../application/subscriber-admin";
import {
  registerUnsubscribe,
  SUBSCRIBER_ACTOR,
  subscribeWithConsent,
  type Subscriber,
} from "../domain/subscriber";
import { CONSENT_VERSION } from "../domain/subscription";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ALMACÉN DE DEMOSTRACIÓN — NO ES PERSISTENCIA REAL
 * ═══════════════════════════════════════════════════════════════════════════
 *  - Vive en la memoria del servidor de Next.js: se pierde al reiniciar o
 *    redesplegar y no se comparte entre instancias.
 *  - Recibe las altas y bajas del formulario público (/suscripcion y la
 *    portada) y las muestra en el panel (/admin/suscriptores). No envía correos.
 *  - LN-08/LN-13 lo reemplazan por adaptadores que llaman a la API
 *    (POST /newsletter, /newsletter/unsubscribe y GET /admin/newsletter), con
 *    las mismas interfaces NewsletterGateway y SubscriberAdmin.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface DemoState {
  subscribers: Subscriber[];
  sequence: number;
}

const active = (id: string, email: string, consentedAt: string): Subscriber =>
  subscribeWithConsent(null, id, email, { version: CONSENT_VERSION, acceptedAt: consentedAt });

function seed(): DemoState {
  const subscribers: Subscriber[] = [
    active("SUB-1001", "camila@example.com", "2026-10-02T10:20:00-03:00"),
    active("SUB-1002", "fernanda@example.com", "2026-11-15T09:30:00-03:00"),
    active("SUB-1003", "direccion.lospeques@example.com", "2026-11-16T10:10:00-03:00"),
    {
      ...active("SUB-1004", "pablo@example.com", "2026-10-20T19:00:00-03:00"),
      status: "unsubscribed",
      unsubscribedAt: "2026-11-05T08:45:00-03:00",
      unsubscribedBy: SUBSCRIBER_ACTOR,
    },
    active("SUB-1005", "daniela@example.com", "2026-11-12T18:50:00-03:00"),
    {
      ...active("SUB-1006", "rebote@example.com", "2026-09-14T13:00:00-03:00"),
      status: "unsubscribed",
      unsubscribedAt: "2026-11-01T11:00:00-03:00",
      unsubscribedBy: "Administrador",
    },
  ];
  return { subscribers, sequence: 1006 };
}

// globalThis para que la demo no se reinicie con cada cambio de código.
const holder = globalThis as typeof globalThis & { __tkDemoSubscribers?: DemoState };
const state = () => (holder.__tkDemoSubscribers ??= seed());

/** Implementa el puerto del formulario público y el del panel sobre los mismos datos. */
export const demoSubscriberList: NewsletterGateway & SubscriberAdmin = {
  async subscribe(email, consent) {
    const s = state();
    const index = s.subscribers.findIndex((x) => x.email === email);
    const existing = s.subscribers[index] ?? null;
    if (!existing) s.sequence += 1;
    const next = subscribeWithConsent(existing, `SUB-${s.sequence}`, email, consent);
    if (existing) s.subscribers[index] = next;
    else s.subscribers.push(next);
  },

  // Formulario público. Igual que la API: no informa si el correo estaba en la lista.
  async unsubscribe(email) {
    const s = state();
    const index = s.subscribers.findIndex((x) => x.email === email);
    const current = s.subscribers[index];
    if (!current) return;
    const result = registerUnsubscribe(current, SUBSCRIBER_ACTOR, new Date().toISOString());
    if (result.ok) s.subscribers[index] = result.subscriber;
  },

  async registerUnsubscribe(id, actor) {
    const s = state();
    const index = s.subscribers.findIndex((x) => x.id === id);
    const current = s.subscribers[index];
    if (!current) return { ok: false, reason: "not-found" };
    const result = registerUnsubscribe(current, actor, new Date().toISOString());
    if (result.ok) s.subscribers[index] = result.subscriber;
    return result.ok ? { ok: true, subscriber: { ...result.subscriber } } : result;
  },

  async list() {
    return state().subscribers.map((x) => ({ ...x }));
  },
};
