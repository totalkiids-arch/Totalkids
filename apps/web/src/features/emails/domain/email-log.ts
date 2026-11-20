/**
 * Registro de correos transaccionales (RF-20, RF-21, SRS 4.4.3). Dominio puro.
 *
 * - Cada correo nace de un evento de negocio con una clave única: el mismo
 *   evento no se registra dos veces (`addEmailEvent`).
 * - Se permite un envío inicial y hasta tres reintentos automáticos. Un timeout
 *   es resultado INCIERTO (no se sabe si llegó), no un fallo.
 * - Reenvío manual (solo fallido o incierto): suma un intento manual al
 *   registro original, con actor, fecha y resultado, y crea un registro nuevo
 *   vinculado ("Reenvío de #…"), como pide la 4.4.3. Nunca toca el pedido.
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
};

export const EMAIL_STATUSES = ["pending", "sent", "failed", "uncertain"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

export const EMAIL_STATUS_LABEL: Record<EmailStatus, string> = {
  pending: "Pendiente",
  sent: "Enviado",
  failed: "Fallido",
  uncertain: "Incierto",
};

/** Envío inicial + 3 reintentos automáticos (SRS 4.4.3). */
export const MAX_AUTOMATIC_ATTEMPTS = 4;

export type AttemptResult = "sent" | "failed" | "timeout";

export const ATTEMPT_RESULT_LABEL: Record<AttemptResult, string> = {
  sent: "Aceptado por el proveedor",
  failed: "Rechazado",
  timeout: "Sin respuesta (incierto)",
};

export interface EmailAttempt {
  at: string;
  kind: "automatic" | "manual";
  result: AttemptResult;
  /** Quién reenvió (solo intentos manuales). */
  actor: string | null;
  /** Último error depurado, sin datos sensibles. */
  detail: string | null;
  /** Intento manual: id del registro nuevo creado por el reenvío. */
  resendRecordId: string | null;
}

export type EmailReference = { kind: "order" | "request"; id: string } | null;

export interface EmailRecord {
  id: string;
  event: EmailEvent;
  recipient: string;
  /** Pedido o solicitud; null en la recuperación de contraseña. */
  reference: EmailReference;
  /** Clave única del evento: evita duplicar el correo localmente. */
  eventKey: string;
  status: EmailStatus;
  attempts: EmailAttempt[];
  createdAt: string;
  /** Si es un reenvío manual, el registro original. */
  resendOf: string | null;
}

export function isEmailEvent(value: unknown): value is EmailEvent {
  return typeof value === "string" && (EMAIL_EVENTS as readonly string[]).includes(value);
}

export function isEmailStatus(value: unknown): value is EmailStatus {
  return typeof value === "string" && (EMAIL_STATUSES as readonly string[]).includes(value);
}

/** Estado que deja un intento: un timeout es incierto, no fallido. */
export function statusAfterAttempt(result: AttemptResult): EmailStatus {
  return result === "sent" ? "sent" : result === "timeout" ? "uncertain" : "failed";
}

/** Agrega el evento salvo que su clave ya exista (sin duplicar, SRS 4.4.3). */
export function addEmailEvent(
  log: readonly EmailRecord[],
  record: EmailRecord,
): { log: EmailRecord[]; added: boolean } {
  if (log.some((r) => r.eventKey === record.eventKey)) return { log: [...log], added: false };
  return { log: [...log, record], added: true };
}

export function canResend(record: Pick<EmailRecord, "status">): boolean {
  return record.status === "failed" || record.status === "uncertain";
}

export const RESEND_NOT_ALLOWED = "Solo se reenvía un correo fallido o con resultado incierto.";

export type ResendOutcome =
  { ok: true; original: EmailRecord; resend: EmailRecord } | { ok: false; error: string };

/**
 * Reenvío manual SIMULADO: el proveedor no se llama y el resultado es
 * "aceptado". El original suma un intento manual (con actor y vínculo) y pasa a
 * Enviado; el registro nuevo apunta al original con `resendOf`. Devuelve
 * copias nuevas: los registros recibidos no se modifican.
 */
export function resendEmail(
  original: EmailRecord,
  actor: string,
  now: string,
  newId: string,
): ResendOutcome {
  if (!canResend(original)) return { ok: false, error: RESEND_NOT_ALLOWED };
  const manual = (resendRecordId: string | null): EmailAttempt => ({
    at: now,
    kind: "manual",
    result: "sent",
    actor,
    detail: "Reenvío simulado: no se envió un correo real.",
    resendRecordId,
  });
  const resends = original.attempts.filter((a) => a.kind === "manual").length;
  return {
    ok: true,
    original: {
      ...original,
      status: "sent",
      attempts: [...original.attempts, manual(newId)],
    },
    resend: {
      id: newId,
      event: original.event,
      recipient: original.recipient,
      reference: original.reference,
      eventKey: `${original.eventKey}:reenvio-${resends + 1}`,
      status: "sent",
      attempts: [manual(null)],
      createdAt: now,
      resendOf: original.id,
    },
  };
}

// ── Listado: filtros de la URL ───────────────────────────────────────────────

export interface EmailQuery {
  event: EmailEvent | null;
  status: EmailStatus | null;
  /** Número de pedido ("TK-1048"). */
  order: string | null;
  /** Registro abierto en el detalle. */
  id: string | null;
}

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

/** `?evento=&estado=&pedido=&id=`. Un valor desconocido se ignora. */
export function parseEmailQuery(params: Params): EmailQuery {
  const event = first(params.evento);
  const status = first(params.estado);
  const order = first(params.pedido).toUpperCase();
  const id = first(params.id).toUpperCase();
  return {
    event: isEmailEvent(event) ? event : null,
    status: isEmailStatus(status) ? status : null,
    order: /^TK-\d{1,10}$/.test(order) ? order : null,
    id: /^E-\d{1,10}$/.test(id) ? id : null,
  };
}

/** Los que cumplen los filtros, del más reciente al más antiguo. */
export function filterEmails(
  log: readonly EmailRecord[],
  query: Pick<EmailQuery, "event" | "status" | "order">,
): EmailRecord[] {
  return log
    .filter((r) => !query.event || r.event === query.event)
    .filter((r) => !query.status || r.status === query.status)
    .filter(
      (r) => !query.order || (r.reference?.kind === "order" && r.reference.id === query.order),
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));
}

export function emailQueryString(query: Partial<EmailQuery>): string {
  const params = new URLSearchParams();
  if (query.event) params.set("evento", query.event);
  if (query.status) params.set("estado", query.status);
  if (query.order) params.set("pedido", query.order);
  if (query.id) params.set("id", query.id);
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Texto de la referencia ("Pedido #TK-1048", "Solicitud #SOL-1002" o "Sin referencia"). */
export function referenceLabel(reference: EmailReference): string {
  if (!reference) return "Sin referencia";
  return `${reference.kind === "order" ? "Pedido" : "Solicitud"} #${reference.id}`;
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
export function emailPreview(record: Pick<EmailRecord, "event" | "reference">): EmailPreview {
  const ref = record.reference?.id ?? "";
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
        heading: "¡Gracias por crecer con nosotros!",
        body: `Tu pedido #${ref} está confirmado. Incluye el detalle, los extras, la dirección o el retiro, el plazo y cómo contactarnos.`,
        action: "Ver mi pedido",
      };
    case "new_sale":
      return {
        subject: `Nueva venta #${ref}`,
        heading: "Nueva venta en la tienda",
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
        heading: "¡Tu pedido va en camino!",
        body: `Despachamos tu pedido #${ref}. Te indicamos la empresa de transporte y el número de seguimiento.`,
        action: "Seguir mi pedido",
      };
    case "order_delivered":
      return {
        subject: `Tu pedido #${ref} fue entregado`,
        heading: "¡Que lo disfruten!",
        body: `Tu pedido #${ref} fue entregado. Te dejamos algunos cuidados para que tus muebles duren más.`,
        action: null,
      };
    case "service_request":
      return {
        subject: `Recibimos tu solicitud #${ref}`,
        heading: "¡Recibimos tu idea!",
        body: `Tu solicitud #${ref} quedó registrada. Te responderemos dentro del plazo informado.`,
        action: null,
      };
    case "password_recovery":
      return {
        subject: "Restablece tu contraseña de Total Kids",
        heading: "Recupera tu acceso",
        body: "Usa el enlace de un solo uso para crear una contraseña nueva. Vence pronto; nunca te enviaremos tu contraseña.",
        action: "Crear contraseña nueva",
      };
  }
}
