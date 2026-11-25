import { z } from "zod";

import type { Prisma } from "../../generated/prisma/client.js";
import type {
  EmailAttemptKind,
  EmailAttemptResult,
  EmailEvent,
  EmailStatus,
  UserRole,
} from "../../generated/prisma/enums.js";
import { errors } from "../../lib/errors.js";
import { paginationQuery, pageMeta, pageWindow, type PageMeta } from "../../lib/pagination.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { orderRef } from "../admin-orders/rules.js";
import { parseOrderRef } from "../admin-orders/schemas.js";
import { parseRequestRef } from "../admin-desk/schemas.js";
import { EMAIL_EVENTS } from "../email/events.js";
import { requestReference } from "../service-requests.js";

/**
 * Registro de correos transaccionales en el panel (LN-16, RF-20, RF-21, SRS
 * 4.4.3). Lectura para Administrador y Operador (la pantalla «Correos» es de
 * ambos); el reenvío sigue siendo solo del Administrador (LN-14).
 *
 * El Operador no ve los correos de recuperación de contraseña ni los de baja
 * del newsletter: son de cuentas del panel y de suscriptores (solo Administrador).
 */

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
  payment_review: "Pago por revisar",
};

export const EMAIL_STATUS_LABEL: Record<EmailStatus, string> = {
  pending: "Pendiente",
  sent: "Enviado",
  failed: "Fallido",
  uncertain: "Incierto",
};

export const ATTEMPT_RESULT_LABEL: Record<EmailAttemptResult, string> = {
  sent: "Aceptado por el proveedor",
  failed: "Rechazado",
  timeout: "Sin respuesta (incierto)",
};

const ADMIN_ONLY_EVENTS: readonly EmailEvent[] = ["password_recovery", "newsletter_unsubscribe"];
const EMAIL_STATUSES = ["pending", "sent", "failed", "uncertain"] as const;

const refText = <T>(parse: (v: string) => T | null, message: string) =>
  z.string().transform((value, ctx): T => {
    const ref = parse(value);
    if (!ref) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return ref;
  });

export const emailListQuery = paginationQuery.extend({
  event: z.enum(EMAIL_EVENTS, "Evento inválido").optional(),
  status: z.enum(EMAIL_STATUSES, "Estado inválido").optional(),
  /** Pedido: "TK-1048", "1048" o su uuid. */
  order: refText(parseOrderRef, "Pedido inválido").optional(),
  /** Solicitud: "SOL-1002", "1002" o su uuid. */
  request: refText(parseRequestRef, "Solicitud inválida").optional(),
});
export type EmailListQuery = z.output<typeof emailListQuery>;

export interface EmailReference {
  kind: "order" | "request";
  id: string;
  /** "TK-1048" o "SOL-1002". */
  label: string;
}

export interface AdminEmailSummary {
  id: string;
  event: EmailEvent;
  eventLabel: string;
  recipient: string;
  status: EmailStatus;
  statusLabel: string;
  reference: EmailReference | null;
  attemptsCount: number;
  lastAttemptAt: string | null;
  resendOfId: string | null;
  /** Fallido o incierto (y no es una recuperación de contraseña): el Administrador puede reenviarlo. */
  canResend: boolean;
  createdAt: string;
  updatedAt: string;
}

const include = {
  order: { select: { number: true } },
  serviceRequest: { select: { number: true } },
  attempts: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { actor: { select: { name: true } } },
  },
  resends: { select: { id: true, status: true, createdAt: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.EmailLogInclude;

type Row = Prisma.EmailLogGetPayload<{ include: typeof include }>;

function referenceOf(row: Row): EmailReference | null {
  if (row.orderId && row.order) {
    return { kind: "order", id: row.orderId, label: orderRef(row.order.number) };
  }
  if (row.serviceRequestId && row.serviceRequest) {
    return {
      kind: "request",
      id: row.serviceRequestId,
      label: requestReference(row.serviceRequest.number),
    };
  }
  return null;
}

function summaryOf(row: Row): AdminEmailSummary {
  const last = row.attempts.at(-1);
  return {
    id: row.id,
    event: row.event,
    eventLabel: EMAIL_EVENT_LABEL[row.event],
    recipient: row.recipient,
    status: row.status,
    statusLabel: EMAIL_STATUS_LABEL[row.status],
    reference: referenceOf(row),
    attemptsCount: row.attempts.length,
    lastAttemptAt: last ? last.createdAt.toISOString() : null,
    resendOfId: row.resendOfId,
    canResend:
      (row.status === "failed" || row.status === "uncertain") && row.event !== "password_recovery",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function visibleTo(role: UserRole): Prisma.EmailLogWhereInput {
  return role === "admin" ? {} : { event: { notIn: [...ADMIN_ONLY_EVENTS] } };
}

/** Más recientes primero, con el conteo por estado (con los demás filtros). */
export async function listAdminEmails(
  db: Pick<PrismaClient, "emailLog">,
  query: EmailListQuery,
  role: UserRole,
): Promise<{ items: AdminEmailSummary[]; meta: PageMeta; counts: Record<EmailStatus, number> }> {
  const base: Prisma.EmailLogWhereInput = {
    ...visibleTo(role),
    ...(query.event ? { event: query.event } : {}),
    ...(query.order
      ? "id" in query.order
        ? { orderId: query.order.id }
        : { order: { number: query.order.number } }
      : {}),
    ...(query.request
      ? "id" in query.request
        ? { serviceRequestId: query.request.id }
        : { serviceRequest: { number: query.request.number } }
      : {}),
  };
  if (query.event && role !== "admin" && ADMIN_ONLY_EVENTS.includes(query.event)) {
    base.id = { in: [] };
  }
  const where = { ...base, ...(query.status ? { status: query.status } : {}) };
  const [total, rows, grouped] = await Promise.all([
    db.emailLog.count({ where }),
    db.emailLog.findMany({
      where,
      include,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...pageWindow(query),
    }),
    db.emailLog.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
  ]);
  const counts: Record<EmailStatus, number> = { pending: 0, sent: 0, failed: 0, uncertain: 0 };
  for (const g of grouped) counts[g.status] = g._count._all;
  return { items: rows.map(summaryOf), meta: pageMeta(total, query), counts };
}

export interface AdminEmailDetail extends AdminEmailSummary {
  eventKey: string;
  providerMessageId: string | null;
  attempts: {
    id: string;
    at: string;
    kind: EmailAttemptKind;
    result: EmailAttemptResult;
    resultLabel: string;
    actorUserId: string | null;
    actorLabel: string | null;
    actorName: string | null;
    detail: string | null;
  }[];
  /** Reenvíos manuales creados a partir de este correo. */
  resends: { id: string; status: EmailStatus; createdAt: string }[];
}

export async function getAdminEmail(
  db: Pick<PrismaClient, "emailLog">,
  id: string,
  role: UserRole,
): Promise<AdminEmailDetail> {
  const row = await db.emailLog.findFirst({ where: { id, ...visibleTo(role) }, include });
  if (!row) throw errors.notFound("Ese correo no existe.");
  return {
    ...summaryOf(row),
    eventKey: row.eventKey,
    providerMessageId: row.providerMessageId,
    attempts: row.attempts.map((a) => ({
      id: a.id,
      at: a.createdAt.toISOString(),
      kind: a.kind,
      result: a.result,
      resultLabel: ATTEMPT_RESULT_LABEL[a.result],
      actorUserId: a.actorUserId,
      actorLabel: a.actorLabel,
      actorName: a.actor?.name ?? null,
      detail: a.detail,
    })),
    resends: row.resends.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
