import "server-only";

import type { EmailLog } from "../application/ports";
import {
  addEmailEvent,
  resendEmail,
  type AttemptResult,
  type EmailAttempt,
  type EmailEvent,
  type EmailRecord,
  type EmailReference,
  type EmailStatus,
} from "../domain/email-log";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  REGISTRO DE DEMOSTRACIÓN — NO SE ENVÍAN CORREOS REALES
 * ═══════════════════════════════════════════════════════════════════════════
 *  - Vive en la memoria del servidor de Next.js: se pierde al reiniciar o
 *    redesplegar y no se comparte entre instancias.
 *  - Los registros son de ejemplo. Los números de pedido (TK-10xx) y de
 *    solicitud (SOL-10xx) coinciden con los datos demo de orders y services,
 *    pero aquí solo se copian como texto: este registro no lee ni modifica
 *    pedidos ni solicitudes.
 *  - El reenvío no llama a ningún proveedor: solo registra el intento.
 *  - LN-14/LN-16 lo reemplazan por un adaptador que consulta la API (email_log
 *    y POST /admin/emails/{id}/resend), con la misma interfaz EmailLog.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface DemoState {
  log: EmailRecord[];
  sequence: number;
}

const STORE_INBOX = "ventas@example.com";

const plusMinutes = (iso: string, minutes: number) =>
  new Date(Date.parse(iso) + minutes * 60_000).toISOString();

const auto = (at: string, result: AttemptResult, detail: string | null = null): EmailAttempt => ({
  at,
  kind: "automatic",
  result,
  actor: null,
  detail,
  resendRecordId: null,
});

const order = (id: string): EmailReference => ({ kind: "order", id });
const request = (id: string): EmailReference => ({ kind: "request", id });

interface SeedRow {
  event: EmailEvent;
  recipient: string;
  reference: EmailReference;
  at: string;
  status: EmailStatus;
  attempts?: EmailAttempt[];
}

const sent = (row: Omit<SeedRow, "status">): SeedRow => ({
  ...row,
  status: "sent",
  attempts: [auto(row.at, "sent")],
});

const BOUNCE = "El servidor del destinatario rechazó el mensaje (buzón lleno).";
const TIMEOUT = "El proveedor no respondió a tiempo: no se sabe si el correo salió.";

// Envío inicial y reintentos a 1, 5 y 15 minutos (SRS 4.4.3).
const RETRIES = [0, 1, 6, 21];

const ROWS: SeedRow[] = [
  sent({
    event: "order_received",
    recipient: "camila@example.com",
    reference: order("TK-1048"),
    at: "2026-11-10T11:05:30-03:00",
  }),
  sent({
    event: "purchase_confirmed",
    recipient: "camila@example.com",
    reference: order("TK-1048"),
    at: "2026-11-10T11:07:30-03:00",
  }),
  sent({
    event: "new_sale",
    recipient: STORE_INBOX,
    reference: order("TK-1048"),
    at: "2026-11-10T11:07:40-03:00",
  }),
  sent({
    event: "service_request",
    recipient: "camila@example.com",
    reference: request("SOL-1001"),
    at: "2026-11-10T12:30:30-03:00",
  }),
  {
    event: "order_shipped",
    recipient: "camila@example.com",
    reference: order("TK-1048"),
    at: "2026-11-13T15:45:30-03:00",
    status: "failed",
    attempts: RETRIES.map((m) =>
      auto(plusMinutes("2026-11-13T15:45:30-03:00", m), "failed", BOUNCE),
    ),
  },
  sent({
    event: "order_received",
    recipient: "daniela@example.com",
    reference: order("TK-1049"),
    at: "2026-11-12T18:45:30-03:00",
  }),
  sent({
    event: "payment_rejected",
    recipient: "daniela@example.com",
    reference: order("TK-1049"),
    at: "2026-11-13T18:45:30-03:00",
  }),
  sent({
    event: "order_shipped",
    recipient: "fernanda@example.com",
    reference: order("TK-1050"),
    at: "2026-11-16T11:20:30-03:00",
  }),
  sent({
    event: "order_delivered",
    recipient: "fernanda@example.com",
    reference: order("TK-1050"),
    at: "2026-11-18T14:05:30-03:00",
  }),
  sent({
    event: "service_request",
    recipient: "direccion.lospeques@example.com",
    reference: request("SOL-1002"),
    at: "2026-11-16T10:05:30-03:00",
  }),
  sent({
    event: "service_request",
    recipient: STORE_INBOX,
    reference: request("SOL-1002"),
    at: "2026-11-16T10:05:40-03:00",
  }),
  sent({
    event: "order_received",
    recipient: "pablo@example.com",
    reference: order("TK-1053"),
    at: "2026-11-17T21:30:30-03:00",
  }),
  sent({
    event: "order_received",
    recipient: "javier@example.com",
    reference: order("TK-1054"),
    at: "2026-11-18T12:15:30-03:00",
  }),
  {
    event: "purchase_confirmed",
    recipient: "javier@example.com",
    reference: order("TK-1054"),
    at: "2026-11-18T12:16:30-03:00",
    status: "uncertain",
    attempts: [auto("2026-11-18T12:16:30-03:00", "timeout", TIMEOUT)],
  },
  sent({
    event: "new_sale",
    recipient: STORE_INBOX,
    reference: order("TK-1054"),
    at: "2026-11-18T12:16:40-03:00",
  }),
  sent({
    event: "purchase_confirmed",
    recipient: "invitado@example.com",
    reference: order("TK-1055"),
    at: "2026-11-18T19:42:30-03:00",
  }),
  sent({
    event: "new_sale",
    recipient: STORE_INBOX,
    reference: order("TK-1055"),
    at: "2026-11-18T19:42:40-03:00",
  }),
  sent({
    event: "order_received",
    recipient: "camila@example.com",
    reference: order("TK-1051"),
    at: "2026-11-19T16:20:30-03:00",
  }),
  {
    // Un intento rechazado y el siguiente reintento automático en cola.
    event: "password_recovery",
    recipient: "javier@example.com",
    reference: null,
    at: "2026-11-19T22:10:00-03:00",
    status: "pending",
    attempts: [
      auto(
        "2026-11-19T22:10:00-03:00",
        "failed",
        "Error temporal del proveedor (reintento programado).",
      ),
    ],
  },
];

function seed(): DemoState {
  let log: EmailRecord[] = [];
  ROWS.forEach((row, index) => {
    const id = `E-${2001 + index}`;
    const key = `${row.event}:${row.reference?.id ?? row.recipient}:${row.recipient}`;
    log = addEmailEvent(log, {
      id,
      event: row.event,
      recipient: row.recipient,
      reference: row.reference,
      // La recuperación de contraseña es por solicitud: su clave lleva el id.
      eventKey: row.reference ? key : `${key}:${id}`,
      status: row.status,
      attempts: row.attempts ?? [],
      createdAt: row.at,
      resendOf: null,
    }).log;
  });
  return { log, sequence: 2000 + ROWS.length };
}

// globalThis para que la demo no se reinicie con cada cambio de código.
const holder = globalThis as typeof globalThis & { __tkDemoEmailLog?: DemoState };
const state = () => (holder.__tkDemoEmailLog ??= seed());

const clone = <T>(value: T): T => structuredClone(value);

export const demoEmailLog: EmailLog = {
  async list() {
    return clone(state().log);
  },

  async get(id) {
    const found = state().log.find((r) => r.id === id);
    return found ? clone(found) : null;
  },

  async resend(id, actor) {
    const s = state();
    const index = s.log.findIndex((r) => r.id === id);
    const current = s.log[index];
    if (!current) return { ok: false, error: "Ese registro de correo ya no existe." };
    const result = resendEmail(current, actor, new Date().toISOString(), `E-${s.sequence + 1}`);
    if (!result.ok) return result;
    s.sequence += 1;
    s.log[index] = result.original;
    s.log.push(result.resend);
    return clone(result);
  },
};
