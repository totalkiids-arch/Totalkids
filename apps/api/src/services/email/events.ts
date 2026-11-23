import { z } from "zod";

import type { EmailEvent } from "../../generated/prisma/enums.js";

/**
 * Eventos de correo transaccional (SRS 4.4.3, RF-20) y los datos que necesita
 * cada plantilla. Los datos se guardan en `outbox_jobs.payload` en la misma
 * transacción que la operación de negocio, así que son una foto (snapshot) del
 * momento: nunca contraseñas, secretos, tokens ni datos de pago (RNF-05).
 */

export const EMAIL_EVENTS = [
  "order_received",
  "purchase_confirmed",
  "new_sale",
  "payment_rejected",
  "order_shipped",
  "order_delivered",
  "service_request",
  "password_recovery",
] as const satisfies readonly EmailEvent[];

/** Prefijo del tipo de trabajo en outbox: "email.purchase_confirmed". */
export const EMAIL_JOB_PREFIX = "email.";

export function emailJobType(event: EmailEvent): string {
  return `${EMAIL_JOB_PREFIX}${event}`;
}

export function eventFromJobType(type: string): EmailEvent | null {
  if (!type.startsWith(EMAIL_JOB_PREFIX)) return null;
  const event = type.slice(EMAIL_JOB_PREFIX.length);
  return (EMAIL_EVENTS as readonly string[]).includes(event) ? (event as EmailEvent) : null;
}

/** Largo máximo de `event_key` (VARCHAR(160) en outbox_jobs y email_log). */
export const EVENT_KEY_MAX = 160;

/**
 * Clave única del evento: `<evento>:<id del hecho>[:<variante>]`. El mismo hecho
 * nunca se encola dos veces (4.4.3). Convenciones:
 *
 * - `order_received:<orderId>`, `purchase_confirmed:<orderId>`, `new_sale:<orderId>`
 * - `payment_rejected:<paymentId>` (un pedido puede tener varios intentos de pago)
 * - `order_shipped:<orderId>`, `order_delivered:<orderId>`
 * - `service_request:<serviceRequestId>:requester` y `…:admin`
 * - `password_recovery:<userId>:<uuid>` (cada solicitud es un hecho distinto)
 */
export function emailEventKey(event: EmailEvent, ...parts: string[]): string {
  const key = [event, ...parts].join(":");
  if (key.length > EVENT_KEY_MAX) throw new Error("La clave del evento de correo es muy larga");
  return key;
}

// ── Datos por evento ──────────────────────────────────────────────────────────

const clp = z.number().int().min(0);
const text = (max: number) => z.string().trim().min(1).max(max);
const orderNumber = z.number().int().positive();

const orderLine = z.object({
  name: text(200),
  /** Variante elegida ("Roble natural, 90 cm"), si aplica. */
  variant: text(120).nullish(),
  quantity: z.number().int().positive(),
  unitPrice: clp,
  lineTotal: clp,
  /** Extras de la línea ("Armado en domicilio"). */
  extras: z.array(text(120)).max(20).default([]),
  /** Producto a pedido (UI-11): se fabrica después de pagar. */
  madeToOrder: z.boolean().default(false),
});

const amounts = {
  subtotal: clp,
  discount: clp.default(0),
  /** null = despacho a coordinar (UI-13); 0 en retiro en taller. */
  shippingCost: clp.nullable(),
  total: clp,
};

const delivery = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("shipping"),
    /** Dirección ya formateada ("Av. Siempre Viva 123, depto 4, Ñuñoa"). */
    address: text(300),
    /** Plazo informado ("5 a 7 días hábiles"), si se conoce. */
    leadTime: text(60).nullish(),
  }),
  z.object({
    method: z.literal("pickup"),
    /** Dirección y horario de retiro en el taller (settings.pickup_details). */
    pickupDetails: text(200),
    leadTime: text(60).nullish(),
  }),
]);

export const EMAIL_DATA_SCHEMAS = {
  /** Comprador: pedido pendiente de pago, con su vigencia. */
  order_received: z.object({
    orderNumber,
    buyerName: text(120),
    items: z.array(orderLine).min(1).max(100),
    ...amounts,
    /** Hasta cuándo se mantiene la reserva (ISO 8601). */
    paymentDueAt: z.iso.datetime({ offset: true }),
  }),
  /** Comprador: solo después de verificar el pago (RF-16). */
  purchase_confirmed: z.object({
    orderNumber,
    buyerName: text(120),
    items: z.array(orderLine).min(1).max(100),
    ...amounts,
    delivery,
    /** Documento tributario: la factura la emite Total Kids con folio (UI-12). */
    taxDocument: z.enum(["boleta", "factura"]),
    /** Cómo contactar al taller (teléfono o WhatsApp), si se configuró. */
    contact: text(200).nullish(),
  }),
  /** Equipo: resumen mínimo, sin datos personales del comprador. */
  new_sale: z.object({
    orderNumber,
    total: clp,
    itemCount: z.number().int().positive(),
    deliveryMethod: z.enum(["shipping", "pickup"]),
    taxDocument: z.enum(["boleta", "factura"]),
  }),
  /** Comprador: pago rechazado o anulado; puede reintentar de forma segura. */
  payment_rejected: z.object({
    orderNumber,
    buyerName: text(120),
    outcome: z.enum(["rejected", "cancelled"]),
  }),
  /**
   * Comprador. Despacho a domicilio (`method` omitido o "shipping"):
   * transportista y número de seguimiento. Retiro en taller ("pickup", LN-13):
   * el pedido está listo para retirar, con la dirección y horario del taller.
   */
  order_shipped: z.discriminatedUnion("method", [
    z.object({
      method: z.literal("shipping").optional(),
      orderNumber,
      buyerName: text(120),
      carrier: text(80),
      trackingCode: text(80).nullish(),
    }),
    z.object({
      method: z.literal("pickup"),
      orderNumber,
      buyerName: text(120),
      pickupDetails: text(200),
    }),
  ]),
  /** Comprador: confirmación y cuidados del producto. */
  order_delivered: z.object({
    orderNumber,
    buyerName: text(120),
  }),
  /** Solicitante y equipo (un correo para cada uno, con su propia clave). */
  service_request: z.object({
    audience: z.enum(["requester", "admin"]),
    requestNumber: z.number().int().positive(),
    /** Nombre visible del servicio ("Armado", "Diseño a medida"). */
    service: text(80),
    name: text(120),
    /** Plazo de respuesta configurado ("2 días hábiles"). */
    responseTime: text(60),
  }),
  /**
   * Equipo del panel: solo el id. El worker emite el token de un solo uso al
   * enviar (`issuePasswordResetToken`), así el secreto nunca queda guardado.
   */
  password_recovery: z.object({
    userId: z.uuid(),
  }),
} satisfies Record<EmailEvent, z.ZodType>;

export type EmailDataSchemas = typeof EMAIL_DATA_SCHEMAS;
/** Datos que entrega quien encola (antes de aplicar valores por defecto). */
export type EmailDataInput<E extends EmailEvent> = z.input<EmailDataSchemas[E]>;
/** Datos ya validados que recibe la plantilla. */
export type EmailData<E extends EmailEvent> = z.output<EmailDataSchemas[E]>;

/**
 * Valida los datos de un evento. El error solo nombra los campos, nunca los
 * valores (pueden ser datos personales).
 */
export function parseEmailData<E extends EmailEvent>(event: E, data: unknown): EmailData<E> {
  const parsed = EMAIL_DATA_SCHEMAS[event].safeParse(data);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "(raíz)"))];
    throw new Error(`Datos inválidos para el correo ${event}: ${fields.join(", ")}`);
  }
  return parsed.data as EmailData<E>;
}
