import "server-only";

import type { DemoOrderPanel } from "../application/admin-order-panel";
import type { OrderRepository } from "../application/ports";
import { orderTotal, type Order } from "../domain/order";
import {
  applyReconciliation,
  applyRefund,
  applyStatusChange,
  chileDate,
  registerInvoice,
  resolveRefund,
  type AdminOrderRecord,
  type FieldErrors,
  type PaymentAttempt,
  type WorkflowResult,
} from "../domain/order-workflow";
import { demoOrderRepository } from "./demo-orders";

type PanelResult = { ok: true; record: AdminOrderRecord } | { ok: false; errors: FieldErrors };

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ALMACÉN DE DEMOSTRACIÓN — NO ES PERSISTENCIA REAL
 * ═══════════════════════════════════════════════════════════════════════════
 *  - Vive en la memoria del proceso de Next.js en el servidor. SE PIERDE AL
 *    REINICIAR o redesplegar, y no se comparte entre instancias.
 *  - Se siembra con los pedidos de ejemplo de demo-orders.ts (sin modificarlos)
 *    y les suma lo que solo conoce el panel: intentos de pago en Flow,
 *    reembolsos manuales e historial con actor, fecha y motivo. Los intentos
 *    son FICTICIOS y deterministas (salen del estado del pedido).
 *  - También responde como OrderRepository: el listado del panel, el CSV y el
 *    seguimiento del comprador leen de aquí y reflejan los cambios.
 *  - No mueve stock ni dinero: la reposición y los reembolsos solo se registran.
 *  - LN-09 (pedidos) y LN-16 (pagos y reembolsos) lo reemplazan por un adaptador
 *    de la API con la misma interfaz; la API aplica las mismas reglas y la
 *    autorización real.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface DemoState {
  records: AdminOrderRecord[] | null;
  sequence: number;
}

const SYSTEM_ACTOR = "Sistema (demo)";

// En desarrollo, Next.js recarga módulos al editar: el estado se guarda en
// globalThis para que la demo no se reinicie con cada cambio de código.
const holder = globalThis as typeof globalThis & { __tkDemoAdminOrders?: DemoState };
const state = (holder.__tkDemoAdminOrders ??= { records: null, sequence: 0 });

const clone = <T>(value: T): T => structuredClone(value);
const plusMinutes = (iso: string, minutes: number) =>
  new Date(Date.parse(iso) + minutes * 60_000).toISOString();

/** Fecha del evento del historial que coincide con el texto, si existe. */
function eventAt(order: Order, text: string): string | null {
  return order.history.find((e) => e.label.includes(text))?.at ?? null;
}

/** Intentos de pago de ejemplo según el estado sembrado del pedido. */
function seedAttempts(order: Order): PaymentAttempt[] {
  const amount = orderTotal(order);
  const number = Number(order.id.replace(/\D/g, ""));
  const attempt = (n: number, status: PaymentAttempt["status"], minutes: number) => ({
    commerceOrder: `${order.id}-${n}`,
    flowOrder: status === "paid" ? 880_000 + number * 10 + n : null,
    amount,
    status,
    createdAt: plusMinutes(order.createdAt, minutes),
    lastCheckedAt: null as string | null,
  });

  switch (order.status) {
    case "pending_payment":
      // Un intento rechazado y uno nuevo pendiente (RN-06: el anterior ya no es pagable).
      return [
        { ...attempt(1, "rejected", 1), lastCheckedAt: plusMinutes(order.createdAt, 3) },
        attempt(2, "pending", 5),
      ];
    case "in_review":
      return [
        {
          ...attempt(1, "in_review", 1),
          lastCheckedAt: eventAt(order, "Flow") ?? plusMinutes(order.createdAt, 4),
        },
      ];
    case "confirmed":
    case "preparing":
    case "shipped":
    case "delivered":
      return [
        {
          ...attempt(1, "paid", 1),
          lastCheckedAt: eventAt(order, "Pago confirmado") ?? plusMinutes(order.createdAt, 2),
        },
      ];
    case "expired":
    case "cancelled":
      // Sin cobro: el intento caducó sin pagarse.
      return [
        {
          ...attempt(1, "expired", 1),
          lastCheckedAt: order.history.at(-1)?.at ?? null,
        },
      ];
  }
}

function seedRecord(order: Order): AdminOrderRecord {
  return {
    order: clone(order),
    attempts: seedAttempts(order),
    refunds: [],
    audit: order.history.map((event) => ({
      at: event.at,
      actor: SYSTEM_ACTOR,
      kind: "system" as const,
      from: null,
      to: null,
      reason: null,
      detail: event.label,
    })),
    restockRecordedAt: null,
  };
}

async function records(): Promise<AdminOrderRecord[]> {
  state.records ??= (await demoOrderRepository.listAll()).map(seedRecord);
  return state.records;
}

async function find(id: string): Promise<AdminOrderRecord | null> {
  return (await records()).find((r) => r.order.id === id) ?? null;
}

/** Guarda el resultado si es válido y devuelve una copia. */
async function commit(
  id: string,
  apply: (record: AdminOrderRecord) => WorkflowResult,
): Promise<PanelResult> {
  const current = await find(id);
  if (!current) return { ok: false, errors: { form: "El pedido ya no existe." } };
  const result = apply(current);
  if (!result.ok) return result;
  state.records = (await records()).map((r) => (r.order.id === id ? result.record : r));
  return { ok: true, record: clone(result.record) };
}

const now = () => new Date().toISOString();

export const demoAdminOrderPanel: DemoOrderPanel & OrderRepository = {
  async list() {
    return clone(await records());
  },

  async get(id) {
    const record = await find(id);
    return record ? clone(record) : null;
  },

  async changeStatus(id, input, actor) {
    return commit(id, (record) => applyStatusChange(record, input, { actor, at: now() }));
  },

  async registerRefund(id, input, actor) {
    state.sequence += 1;
    const refundId = `reembolso-${state.sequence}`;
    return commit(id, (record) =>
      applyRefund(
        record,
        { ...input, responsible: actor },
        { actor, at: now(), id: refundId, today: chileDate(now()) },
      ),
    );
  },

  async resolveRefund(id, input, actor) {
    return commit(id, (record) => resolveRefund(record, input, { actor, at: now() }));
  },

  async registerInvoice(id, input, actor) {
    return commit(id, (record) => registerInvoice(record, input, { actor, at: now() }));
  },

  async reconcile(id, input, actor) {
    return commit(id, (record) => applyReconciliation(record, input, { actor, at: now() }));
  },

  // ── OrderRepository: el resto de la feature ve el pedido con sus cambios ──
  async listAll() {
    return (await records()).map((r) => clone(r.order));
  },

  async findById(id) {
    const record = await find(id);
    return record ? clone(record.order) : null;
  },
};
