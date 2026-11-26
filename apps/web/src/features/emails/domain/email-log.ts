/**
 * Registro de correos transaccionales (RF-20, RF-21, SRS 4.4.3). Dominio puro.
 *
 * - Cada correo nace de un evento de negocio con una clave única (la API no
 *   registra dos veces el mismo evento).
 * - Envío inicial y hasta tres reintentos automáticos. Un timeout es resultado
 *   INCIERTO (no se sabe si llegó), no un fallo.
 * - Reenvío manual (solo Administrador, solo fallido o incierto): la API crea
 *   un registro nuevo vinculado al original y hace un único intento, que queda
 *   registrado con quien lo pidió. Nunca toca el pedido ni la solicitud.
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
  "newsletter_unsubscribe",
  "payment_review_alert",
  "email_quota_alert",
] as const;
export type EmailEvent = (typeof EMAIL_EVENTS)[number];

export const EMAIL_EVENT_LABEL: Record<EmailEvent, string> = {
  order_received: "Pedido recibido",
  purchase_confirmed: "Compra confirmada",
  new_sale: "Nueva venta",
  payment_rejected: "Pago rechazado o anulado",
  order_shipped: "Pedido despachado",
  order_delivered: "Pedido entregado",
  service_request: "Solicitud de servicio",
  password_recovery: "Recuperación de contraseña",
  newsletter_unsubscribe: "Baja del newsletter",
  payment_review_alert: "Alerta de pago en revisión",
  email_quota_alert: "Alerta de límite diario de correos",
};

export const EMAIL_STATUSES = ["pending", "sent", "failed", "uncertain"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

export const EMAIL_STATUS_LABEL: Record<EmailStatus, string> = {
  pending: "Pendiente",
  sent: "Enviado",
  failed: "Fallido",
  uncertain: "Incierto",
};

export const ATTEMPT_RESULTS = ["sent", "failed", "timeout"] as const;
export type AttemptResult = (typeof ATTEMPT_RESULTS)[number];

export interface EmailAttempt {
  at: string;
  kind: "automatic" | "manual";
  result: AttemptResult;
  /** Texto del resultado («Aceptado por el proveedor», «Sin respuesta (incierto)»…). */
  resultLabel: string;
  /** Rol y nombre de quien reenvió (solo intentos manuales). */
  actorLabel: string | null;
  actorName: string | null;
  /** Último error depurado, sin datos sensibles. */
  detail: string | null;
}

/**
 * Pedido o solicitud del correo: `label` es el número visible ("TK-1048", "SOL-1002").
 * "sample": correo de muestra (`email:preview --to`), no es un correo real.
 */
export type EmailReference = {
  kind: "order" | "request" | "sample";
  id: string;
  label: string;
} | null;

export interface EmailSummary {
  id: string;
  event: EmailEvent;
  recipient: string;
  status: EmailStatus;
  reference: EmailReference;
  attemptsCount: number;
  lastAttemptAt: string | null;
  /** Si es un reenvío manual, el registro original. */
  resendOf: string | null;
  /** El Administrador puede reenviarlo (fallido o incierto, sin otro reenvío en curso). */
  canResend: boolean;
  createdAt: string;
}

export interface EmailDetail extends EmailSummary {
  /** Clave única del evento. */
  eventKey: string;
  attempts: EmailAttempt[];
  /** Reenvíos manuales creados desde este registro. */
  resends: { id: string; status: EmailStatus; createdAt: string }[];
}

export type ResendOutcome =
  | { ok: true; resendId: string }
  | { ok: false; reason: "not-allowed" | "not-found" }
  | { ok: false; reason: "rate-limited"; retryAfterSeconds: number | null };

export function isEmailEvent(value: unknown): value is EmailEvent {
  return typeof value === "string" && (EMAIL_EVENTS as readonly string[]).includes(value);
}

export function isEmailStatus(value: unknown): value is EmailStatus {
  return typeof value === "string" && (EMAIL_STATUSES as readonly string[]).includes(value);
}

// ── Listado: filtros de la URL ───────────────────────────────────────────────

export const EMAILS_PAGE_SIZE = 20;

export interface EmailQuery {
  event: EmailEvent | null;
  status: EmailStatus | null;
  /** Número de pedido ("TK-1048"). */
  order: string | null;
  /** Referencia de solicitud ("SOL-1002"). */
  request: string | null;
  page: number;
  /** Registro abierto en el detalle (UUID). */
  id: string | null;
}

export interface EmailPage {
  rows: EmailSummary[];
  counts: Record<EmailStatus, number>;
  total: number;
  page: number;
  pageCount: number;
}

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?evento=&estado=&pedido=&solicitud=&pagina=&id=`. Un valor desconocido se ignora. */
export function parseEmailQuery(params: Params): EmailQuery {
  const event = first(params.evento);
  const status = first(params.estado);
  const order = first(params.pedido).toUpperCase();
  const request = first(params.solicitud).toUpperCase();
  const page = Number(first(params.pagina));
  const id = first(params.id).toLowerCase();
  return {
    event: isEmailEvent(event) ? event : null,
    status: isEmailStatus(status) ? status : null,
    order: /^TK-\d{1,10}$/.test(order) ? order : null,
    request: /^SOL-[A-Z0-9]{1,20}$/.test(request) ? request : null,
    page: Number.isInteger(page) && page > 1 ? page : 1,
    id: UUID.test(id) ? id : null,
  };
}

export function emailQueryString(query: Partial<EmailQuery>): string {
  const params = new URLSearchParams();
  if (query.event) params.set("evento", query.event);
  if (query.status) params.set("estado", query.status);
  if (query.order) params.set("pedido", query.order);
  if (query.request) params.set("solicitud", query.request);
  if (query.page && query.page > 1) params.set("pagina", String(query.page));
  if (query.id) params.set("id", query.id);
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Parámetros de GET /admin/emails. */
export function toApiEmailSearch(query: EmailQuery, pageSize = EMAILS_PAGE_SIZE): string {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(pageSize) });
  if (query.event) params.set("event", query.event);
  if (query.status) params.set("status", query.status);
  if (query.order) params.set("order", query.order);
  if (query.request) params.set("request", query.request);
  return params.toString();
}

/**
 * Texto de la referencia ("Pedido #TK-1048", "Solicitud #SOL-1002", "Muestra (no es
 * un correo real)" o "Sin referencia").
 */
export function referenceLabel(reference: EmailReference): string {
  if (!reference) return "Sin referencia";
  if (reference.kind === "sample") return "Muestra (no es un correo real)";
  return `${reference.kind === "order" ? "Pedido" : "Solicitud"} #${reference.label}`;
}

// ── Vista previa de plantilla (RF-21) ───────────────────────────────────────

export interface EmailPreview {
  subject: string;
  heading: string;
  body: string;
  /** Llamado a la acción; sin enlaces reales ni identificadores predecibles. */
  action: string | null;
}

/**
 * Contenido mínimo de cada evento (SRS 4.4.3). Es texto plano: la plantilla
 * escapa todo lo que muestra. "Nueva venta" no repite datos del comprador y la
 * recuperación nunca incluye la contraseña ni el enlace real.
 */
export function emailPreview(record: Pick<EmailSummary, "event" | "reference">): EmailPreview {
  const ref = record.reference?.label ?? "";
  switch (record.event) {
    case "order_received":
      return {
        subject: `Recibimos tu pedido #${ref}`,
        heading: "¡Recibimos tu pedido!",
        body: `Tu pedido #${ref} está pendiente de pago. Te mostramos los productos, el total y hasta cuándo se mantiene la reserva.`,
        action: "Continuar con el pago",
      };
    case "purchase_confirmed":
      return {
        subject: `Tu compra #${ref} está confirmada`,
        heading: "Pago confirmado",
        body: `Tu pedido #${ref} está confirmado. Incluye el detalle, los extras, la dirección o el retiro, el plazo y cómo contactarnos.`,
        action: "Ver mi pedido",
      };
    case "new_sale":
      return {
        subject: `Nueva venta #${ref}`,
        heading: "Nueva venta",
        body: `Se confirmó el pago del pedido #${ref}. Revisa el detalle en el panel.`,
        action: "Abrir el panel",
      };
    case "payment_rejected":
      return {
        subject: `No pudimos confirmar el pago del pedido #${ref}`,
        heading: "Tu pago no se completó",
        body: `El pago del pedido #${ref} fue rechazado o anulado. Puedes intentarlo de nuevo de forma segura.`,
        action: "Reintentar el pago",
      };
    case "order_shipped":
      return {
        subject: `Tu pedido #${ref} va en camino`,
        heading: "Tu pedido va en camino",
        body: `Despachamos tu pedido #${ref}. Te indicamos la empresa de transporte y el número de seguimiento.`,
        action: "Seguir mi pedido",
      };
    case "order_delivered":
      return {
        subject: `Tu pedido #${ref} fue entregado`,
        heading: "Pedido entregado",
        body: `Tu pedido #${ref} fue entregado. Te dejamos algunos cuidados para que tus muebles duren más.`,
        action: "Ver mi pedido",
      };
    case "service_request":
      return {
        subject: `Recibimos tu solicitud #${ref}`,
        heading: "Recibimos tu solicitud",
        body: `Tu solicitud #${ref} quedó registrada. Te responderemos dentro del plazo informado.`,
        action: "Ir a la tienda",
      };
    case "password_recovery":
      return {
        subject: "Define tu contraseña del panel Total Kids",
        heading: "Define tu contraseña",
        body: "Usa el enlace para definir una contraseña nueva. Vence a los 30 minutos y solo sirve una vez.",
        action: "Definir contraseña",
      };
    case "newsletter_unsubscribe":
      return {
        subject: "Confirma tu baja del newsletter",
        heading: "Confirma tu baja",
        body: "Confirma la baja con el enlace. Si no la pediste, ignora este correo.",
        action: "Confirmar baja",
      };
    case "payment_review_alert":
      return {
        subject: `Revisar pago del pedido #${ref}`,
        heading: "Pago en revisión",
        body: `El pedido #${ref} quedó en revisión (pago tardío sin stock, doble cobro, datos distintos o Flow sin respuesta). Resuélvelo en Pagos y conciliación.`,
        action: "Revisar en el panel",
      };
    case "email_quota_alert":
      return {
        subject: "Correos en pausa: se alcanzó el límite diario",
        heading: "Límite diario de correos",
        body: "Se alcanzó el límite diario de envíos del plan de Brevo. Los correos pendientes quedan en la cola y salen solos al día siguiente (hora de Chile).",
        action: "Ver los correos en el panel",
      };
  }
}
