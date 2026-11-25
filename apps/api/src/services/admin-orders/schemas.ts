import { z } from "zod";

import { paginationQuery } from "../../lib/pagination.js";
import {
  MESSAGES,
  normalizeFolio,
  REASON_MAX,
  REASON_MIN,
  REFERENCE_MAX,
  REFERENCE_MIN,
} from "./rules.js";

/** Esquemas de entrada del panel de pedidos (LN-13). */

const ORDER_STATUSES = [
  "pending_payment",
  "in_review",
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "expired",
] as const;

const PAYMENT_FILTERS = [
  "pending",
  "paid",
  "rejected",
  "voided",
  "in_review",
  "expired",
  "refund_pending",
  "none",
] as const;

/** Referencia del pedido en la ruta: su uuid o su número visible ("TK-1048" o "1048"). */
export type OrderRef = { id: string } | { number: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMBER = /^(?:tk-?)?(\d{1,9})$/i;

export function parseOrderRef(value: string): OrderRef | null {
  const text = value.trim();
  if (UUID.test(text)) return { id: text.toLowerCase() };
  const match = NUMBER.exec(text);
  return match ? { number: Number(match[1]) } : null;
}

const orderRef = z.string().transform((value, ctx): OrderRef => {
  const ref = parseOrderRef(value);
  if (!ref) {
    ctx.addIssue({ code: "custom", message: "Pedido inválido" });
    return z.NEVER;
  }
  return ref;
});

export const orderParams = z.object({ id: orderRef });
export const refundParams = z.object({
  id: orderRef,
  refundId: z.uuid(MESSAGES.refundMissing),
});

// ── Listado ──────────────────────────────────────────────────────────────────

/** Acepta `?status=a&status=b` y `?status=a,b`. */
function multi<T extends readonly [string, ...string[]]>(values: T, message: string) {
  return z
    .union([z.string(), z.array(z.string())])
    .transform((v) =>
      (Array.isArray(v) ? v : [v])
        .flatMap((item) => item.split(","))
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(values, message)).max(values.length * 2))
    .optional();
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** AAAA-MM-DD que existe en el calendario. */
export function isCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const day = (message: string) => z.string().refine(isCalendarDate, message);

export const adminOrdersQuery = paginationQuery
  .extend({
    /** Número ("TK-1048" o "1048"), nombre o correo del comprador. */
    q: z.string().trim().max(80).optional(),
    status: multi(ORDER_STATUSES, "Estado de pedido inválido"),
    paymentStatus: multi(PAYMENT_FILTERS, "Estado de pago inválido"),
    deliveryMethod: z.enum(["shipping", "pickup"], "Método de entrega inválido").optional(),
    invoicePending: z
      .enum(["true", "false"], "Usa true o false")
      .transform((v) => v === "true")
      .optional(),
    /** Desde y hasta, en días de Chile (ambos inclusive). */
    from: day("Fecha inválida (AAAA-MM-DD)").optional(),
    to: day("Fecha inválida (AAAA-MM-DD)").optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    path: ["to"],
    message: "La fecha final no puede ser anterior a la inicial.",
  });

export type AdminOrdersQuery = z.output<typeof adminOrdersQuery>;

// ── Cambio de estado ─────────────────────────────────────────────────────────

const reason = z
  .string(MESSAGES.reasonShort)
  .trim()
  .min(REASON_MIN, MESSAGES.reasonShort)
  .max(REASON_MAX, MESSAGES.reasonLong);

/** Vacío = no viene. */
const optionalText = z
  .string()
  .max(1000)
  .transform((v) => v.trim())
  .optional();

export const statusChangeBody = z.object({
  to: z.enum(ORDER_STATUSES, MESSAGES.chooseStatus),
  reason,
  carrier: optionalText,
  code: optionalText,
  /** Las unidades vuelven a ser vendibles: registrar la reposición (RN-06). */
  restock: z.boolean().default(false),
});

export type StatusChangeInput = z.output<typeof statusChangeBody>;

// ── Reembolsos ───────────────────────────────────────────────────────────────

export const refundBody = z.object({
  amount: z
    .number(MESSAGES.refundAmount)
    .int(MESSAGES.refundAmount)
    .positive(MESSAGES.refundAmount),
  date: day(MESSAGES.refundDate),
  reference: z
    .string(MESSAGES.refundReference)
    .trim()
    .min(REFERENCE_MIN, MESSAGES.refundReference)
    .max(REFERENCE_MAX, MESSAGES.refundReferenceLong),
  status: z.enum(["requested", "processed"], MESSAGES.refundStatus),
});

export type RefundInput = z.output<typeof refundBody>;

export const refundResolutionBody = z.object({
  status: z.enum(["processed", "failed"], MESSAGES.refundResolution),
});

// ── Factura ──────────────────────────────────────────────────────────────────

export const invoiceBody = z.object({
  number: z
    .string(MESSAGES.invoiceNumber)
    .max(20, MESSAGES.invoiceNumber)
    .transform((value, ctx) => {
      const folio = normalizeFolio(value);
      if (!folio) {
        ctx.addIssue({ code: "custom", message: MESSAGES.invoiceNumber });
        return z.NEVER;
      }
      return folio;
    }),
  /** Corregir un folio ya registrado (solo Administrador, con motivo). */
  replace: z.boolean().default(false),
  reason: z.string().trim().max(REASON_MAX, MESSAGES.reasonLong).optional(),
});

export type InvoiceInput = z.output<typeof invoiceBody>;
