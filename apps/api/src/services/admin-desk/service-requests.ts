import type { Prisma, ServiceRequest } from "../../generated/prisma/client.js";
import type {
  EmailEvent,
  EmailStatus,
  ServiceRequestStatus,
} from "../../generated/prisma/enums.js";
import { errors } from "../../lib/errors.js";
import { pageMeta, pageWindow, type PageMeta } from "../../lib/pagination.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { Issues } from "../admin-catalog/common.js";
import { writeAudit, type Actor } from "../audit.js";
import { dateOnly } from "../cart/chile-date.js";
import { requestReference, SERVICES, type ServiceId } from "../service-requests.js";
import {
  NOTE_MAX,
  type FollowUpInput,
  type RequestFilters,
  type RequestListQuery,
  type RequestRef,
} from "./schemas.js";

/**
 * Seguimiento de solicitudes de servicio en el panel (LN-16, RF-24, RF-29).
 * Administrador y Operador. Reglas y textos de
 * `apps/web/src/features/services/domain/service-request-admin.ts` (UI-14):
 *
 * - Nueva → En gestión → Resuelta; se puede resolver directo desde Nueva y
 *   reabrir una resuelta (vuelve a En gestión); nunca se vuelve a Nueva.
 * - Nota interna de hasta 1000 caracteres, solo para el equipo; se puede
 *   guardar sin cambiar el estado.
 * - Cada cambio queda en audit_log (`service_request.updated`) con actor, fecha
 *   y qué cambió; ese es el historial (el modelo no tiene otra tabla). El texto
 *   de la nota no se copia a la auditoría: solo «Nota interna actualizada».
 */

export const REQUEST_STATUS_LABEL: Record<ServiceRequestStatus, string> = {
  new: "Nueva",
  in_progress: "En gestión",
  resolved: "Resuelta",
};

const TRANSITIONS: Record<ServiceRequestStatus, readonly ServiceRequestStatus[]> = {
  new: ["in_progress", "resolved"],
  in_progress: ["resolved"],
  resolved: ["in_progress"],
};

export const REQUESTER_ACTOR = "Solicitante";
export const NO_CHANGES = "No hay cambios para guardar.";
export const REQUEST_NOT_FOUND = "Esa solicitud ya no existe.";

/** Mantener el estado siempre se permite (para guardar solo la nota). */
export function canChangeRequestStatus(
  from: ServiceRequestStatus,
  to: ServiceRequestStatus,
): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

/** Opciones del selector: el actual primero y luego los permitidos. */
export function requestStatusOptions(current: ServiceRequestStatus): ServiceRequestStatus[] {
  return [current, ...TRANSITIONS[current]];
}

export const serviceLabel = (service: string) => SERVICES[service as ServiceId] ?? service;

// ── Listado ──────────────────────────────────────────────────────────────────

export function requestWhere(filters: RequestFilters): Prisma.ServiceRequestWhereInput {
  const where: Prisma.ServiceRequestWhereInput = {};
  if (filters.service) where.service = filters.service;
  if (filters.status) where.status = filters.status;
  if (filters.q) {
    const ref = /^(?:sol-?)?(\d{1,9})$/i.exec(filters.q);
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { email: { contains: filters.q.toLowerCase() } },
      ...(ref ? [{ number: Number(ref[1]) }] : []),
    ];
  }
  return where;
}

export interface AdminRequestSummary {
  id: string;
  number: number;
  /** "SOL-1002". */
  reference: string;
  service: string;
  serviceLabel: string;
  name: string;
  email: string;
  commune: string | null;
  preferredDate: string | null;
  status: ServiceRequestStatus;
  statusLabel: string;
  hasNote: boolean;
  createdAt: string;
  updatedAt: string;
}

function summaryOf(r: ServiceRequest): AdminRequestSummary {
  return {
    id: r.id,
    number: r.number,
    reference: requestReference(r.number),
    service: r.service,
    serviceLabel: serviceLabel(r.service),
    name: r.name,
    email: r.email,
    commune: r.commune,
    preferredDate: r.preferredDate ? dateOnly(r.preferredDate) : null,
    status: r.status,
    statusLabel: REQUEST_STATUS_LABEL[r.status],
    hasNote: r.internalNote !== "",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Más recientes primero, con el conteo por estado (sin filtrar por estado) para los filtros. */
export async function listAdminRequests(
  db: Pick<PrismaClient, "serviceRequest">,
  query: RequestListQuery,
): Promise<{
  items: AdminRequestSummary[];
  meta: PageMeta;
  counts: Record<ServiceRequestStatus, number>;
}> {
  const where = requestWhere(query);
  const { status: _status, ...withoutStatus } = query;
  const [total, rows, grouped] = await Promise.all([
    db.serviceRequest.count({ where }),
    db.serviceRequest.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { number: "desc" }],
      ...pageWindow(query),
    }),
    db.serviceRequest.groupBy({
      by: ["status"],
      where: requestWhere(withoutStatus),
      _count: { _all: true },
    }),
  ]);
  const counts: Record<ServiceRequestStatus, number> = { new: 0, in_progress: 0, resolved: 0 };
  for (const g of grouped) counts[g.status] = g._count._all;
  return { items: rows.map(summaryOf), meta: pageMeta(total, query), counts };
}

// ── Detalle ──────────────────────────────────────────────────────────────────

export interface RequestHistoryEntry {
  at: string;
  /** Rol ("Administrador", "Operador") o «Solicitante». */
  actor: string;
  /** Nombre de la persona del equipo; null para el solicitante. */
  actorName: string | null;
  actorUserId: string | null;
  change: string;
}

export interface AdminRequestDetail extends AdminRequestSummary {
  phone: string | null;
  childrenAges: string | null;
  message: string;
  privacyAcceptedAt: string;
  privacyVersion: string;
  note: string;
  /** Estados que se pueden elegir ahora (el actual primero). */
  statusOptions: ServiceRequestStatus[];
  history: RequestHistoryEntry[];
  emails: {
    id: string;
    event: EmailEvent;
    recipient: string;
    status: EmailStatus;
    resendOfId: string | null;
    createdAt: string;
  }[];
}

type DetailDb = Pick<Prisma.TransactionClient, "serviceRequest" | "auditLog" | "emailLog">;

function refWhere(ref: RequestRef): Prisma.ServiceRequestWhereUniqueInput {
  return "id" in ref ? { id: ref.id } : { number: ref.number };
}

async function detailOf(db: DetailDb, r: ServiceRequest): Promise<AdminRequestDetail> {
  const [audit, emails] = await Promise.all([
    db.auditLog.findMany({
      where: { resourceType: "service_request", resourceId: r.id },
      include: { actor: { select: { name: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    db.emailLog.findMany({
      where: { serviceRequestId: r.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);
  const history: RequestHistoryEntry[] = [
    {
      at: r.createdAt.toISOString(),
      actor: REQUESTER_ACTOR,
      actorName: null,
      actorUserId: null,
      change: "Solicitud recibida",
    },
    ...audit.map((a) => {
      const details = (a.details ?? {}) as { summary?: unknown };
      return {
        at: a.createdAt.toISOString(),
        actor: a.actorLabel,
        actorName: a.actor?.name ?? null,
        actorUserId: a.actorUserId,
        change: typeof details.summary === "string" ? details.summary : a.action,
      };
    }),
  ];
  return {
    ...summaryOf(r),
    phone: r.phone,
    childrenAges: r.childrenAges,
    message: r.message,
    privacyAcceptedAt: r.privacyAcceptedAt.toISOString(),
    privacyVersion: r.privacyVersion,
    note: r.internalNote,
    statusOptions: requestStatusOptions(r.status),
    history,
    emails: emails.map((e) => ({
      id: e.id,
      event: e.event,
      recipient: e.recipient,
      status: e.status,
      resendOfId: e.resendOfId,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

export async function getAdminRequest(db: DetailDb, ref: RequestRef): Promise<AdminRequestDetail> {
  const r = await db.serviceRequest.findUnique({ where: refWhere(ref) });
  if (!r) throw errors.notFound(REQUEST_NOT_FOUND);
  return detailOf(db, r);
}

// ── Seguimiento ──────────────────────────────────────────────────────────────

/**
 * Cambia estado y/o nota interna con la fila bloqueada (FOR UPDATE): dos
 * personas que guardan a la vez se aplican una tras otra y la segunda valida
 * contra el estado ya confirmado.
 */
export function followUpRequest(
  prisma: Pick<PrismaClient, "$transaction">,
  ref: RequestRef,
  input: FollowUpInput,
  actor: Actor,
  requestId?: string,
): Promise<AdminRequestDetail> {
  return prisma.$transaction(async (tx) => {
    const rows =
      "id" in ref
        ? await tx.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "service_requests" WHERE "id" = ${ref.id}::uuid FOR UPDATE`
        : await tx.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "service_requests" WHERE "number" = ${ref.number} FOR UPDATE`;
    const id = rows[0]?.id;
    const current = id ? await tx.serviceRequest.findUnique({ where: { id } }) : null;
    if (!current) throw errors.notFound(REQUEST_NOT_FOUND);

    const status = input.status ?? current.status;
    const note = input.note === undefined ? current.internalNote : input.note.trim();
    const issues = new Issues();
    if (note.length > NOTE_MAX)
      issues.add("note", `Usa como máximo ${String(NOTE_MAX)} caracteres.`);
    issues.throwIfAny();
    if (!canChangeRequestStatus(current.status, status)) {
      throw errors.conflict(
        `Una solicitud ${REQUEST_STATUS_LABEL[current.status].toLowerCase()} no puede pasar a «${REQUEST_STATUS_LABEL[status]}».`,
        { field: "status" },
      );
    }

    const changes: string[] = [];
    if (status !== current.status) {
      changes.push(
        `Estado: ${REQUEST_STATUS_LABEL[current.status]} → ${REQUEST_STATUS_LABEL[status]}`,
      );
    }
    if (note !== current.internalNote) {
      changes.push(note ? "Nota interna actualizada" : "Nota interna borrada");
    }
    if (changes.length === 0) {
      throw errors.validation(NO_CHANGES, {
        issues: [{ location: "body", path: "", message: NO_CHANGES }],
      });
    }

    const updated = await tx.serviceRequest.update({
      where: { id: current.id },
      data: { status, internalNote: note },
    });
    await writeAudit(
      tx,
      actor,
      {
        action: "service_request.updated",
        resourceType: "service_request",
        resourceId: current.id,
        details: {
          reference: requestReference(current.number),
          summary: changes.join(" · "),
          ...(status !== current.status
            ? { status: { before: current.status, after: status } }
            : {}),
          noteChanged: note !== current.internalNote,
        },
      },
      requestId,
    );
    return detailOf(tx, updated);
  });
}
