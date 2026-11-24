import "server-only";

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
 *  - Solo alimenta el panel (/admin/suscriptores). El formulario público ya
 *    usa la API (LN-08), así que las altas reales no aparecen aquí.
 *  - LN-13 lo reemplaza por un adaptador de GET /admin/newsletter con la misma
 *    interfaz SubscriberAdmin.
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

/** Implementa el puerto del panel sobre datos de demostración. */
export const demoSubscriberList: SubscriberAdmin = {
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
