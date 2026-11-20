import type { ServiceRequest } from "./service-request";
import { findService, isServiceId, type ServiceId } from "./services";

/**
 * Gestión de solicitudes de servicio en el panel (RF-24, RF-29). Dominio puro.
 *
 * - Estados: Nueva → En gestión → Resuelta. Se puede resolver directo desde
 *   Nueva y reabrir una resuelta (vuelve a En gestión); nunca se vuelve a Nueva.
 * - La nota interna es solo para el personal (máx. NOTE_MAX caracteres) y se
 *   puede guardar sin cambiar el estado.
 * - Cada cambio queda en el historial con actor, fecha y qué cambió.
 */

export const REQUEST_STATUSES = ["new", "in_progress", "resolved"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  new: "Nueva",
  in_progress: "En gestión",
  resolved: "Resuelta",
};

export const NOTE_MAX = 1000;

/** Actor del primer evento: la solicitud la envía el público desde la tienda. */
export const REQUESTER_ACTOR = "Solicitante";

const TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  new: ["in_progress", "resolved"],
  in_progress: ["resolved"],
  resolved: ["in_progress"],
};

export function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === "string" && (REQUEST_STATUSES as readonly string[]).includes(value);
}

/** Mantener el estado siempre está permitido (para guardar solo la nota). */
export function canChangeRequestStatus(from: RequestStatus, to: RequestStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

/** Opciones del selector de estado: el actual primero y luego los permitidos. */
export function requestStatusOptions(current: RequestStatus): RequestStatus[] {
  return [current, ...TRANSITIONS[current]];
}

export interface RequestHistoryEntry {
  at: string;
  actor: string;
  change: string;
}

export interface AdminServiceRequest extends ServiceRequest {
  /** Referencia visible ("SOL-1001"). */
  id: string;
  createdAt: string;
  status: RequestStatus;
  note: string;
  history: RequestHistoryEntry[];
}

/** Una solicitud recién recibida desde el formulario público. */
export function receiveRequest(
  id: string,
  request: ServiceRequest,
  createdAt: string,
): AdminServiceRequest {
  return {
    ...request,
    id,
    createdAt,
    status: "new",
    note: "",
    history: [{ at: createdAt, actor: REQUESTER_ACTOR, change: "Solicitud recibida" }],
  };
}

export interface FollowUpInput {
  status: string;
  note: string;
}

export interface FollowUpErrors {
  status?: string;
  note?: string;
  form?: string;
}

export type FollowUpResult =
  { ok: true; request: AdminServiceRequest } | { ok: false; errors: FollowUpErrors };

export const NO_CHANGES = "No hay cambios para guardar.";

/**
 * Seguimiento: cambia estado y/o nota interna. Devuelve una copia nueva con el
 * cambio en el historial; la original no se modifica.
 */
export function applyFollowUp(
  request: AdminServiceRequest,
  input: FollowUpInput,
  actor: string,
  now: string,
): FollowUpResult {
  const errors: FollowUpErrors = {};
  const note = input.note.trim();
  if (!isRequestStatus(input.status)) {
    errors.status = "Elige un estado de la lista.";
  } else if (!canChangeRequestStatus(request.status, input.status)) {
    errors.status = `Una solicitud ${REQUEST_STATUS_LABEL[request.status].toLowerCase()} no puede pasar a «${REQUEST_STATUS_LABEL[input.status]}».`;
  }
  if (note.length > NOTE_MAX) errors.note = `Usa como máximo ${NOTE_MAX} caracteres.`;
  if (errors.status || errors.note) return { ok: false, errors };

  const status = input.status as RequestStatus;
  const changes: string[] = [];
  if (status !== request.status) {
    changes.push(
      `Estado: ${REQUEST_STATUS_LABEL[request.status]} → ${REQUEST_STATUS_LABEL[status]}`,
    );
  }
  if (note !== request.note)
    changes.push(note ? "Nota interna actualizada" : "Nota interna borrada");
  if (changes.length === 0) return { ok: false, errors: { form: NO_CHANGES } };

  return {
    ok: true,
    request: {
      ...request,
      status,
      note,
      history: [...request.history, { at: now, actor, change: changes.join(" · ") }],
    },
  };
}

// ── Listado: filtros de la URL ───────────────────────────────────────────────

export interface RequestQuery {
  service: ServiceId | null;
  status: RequestStatus | null;
  /** Solicitud abierta en el detalle. */
  id: string | null;
}

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

/** `?servicio=&estado=&id=`. Un valor desconocido se ignora (sin filtro). */
export function parseRequestQuery(params: Params): RequestQuery {
  const service = first(params.servicio);
  const status = first(params.estado);
  const id = first(params.id).toUpperCase();
  return {
    service: isServiceId(service) ? service : null,
    status: isRequestStatus(status) ? status : null,
    id: /^SOL-[A-Z0-9]{1,20}$/.test(id) ? id : null,
  };
}

/** Las que cumplen los filtros, de la más reciente a la más antigua. */
export function filterRequests(
  requests: readonly AdminServiceRequest[],
  query: Pick<RequestQuery, "service" | "status">,
): AdminServiceRequest[] {
  return requests
    .filter((r) => !query.service || r.service === query.service)
    .filter((r) => !query.status || r.status === query.status)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Parámetros de la URL para conservar los filtros (enlaces y exportación). */
export function requestQueryString(query: Pick<RequestQuery, "service" | "status">): string {
  const params = new URLSearchParams();
  if (query.service) params.set("servicio", query.service);
  if (query.status) params.set("estado", query.status);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export const requestServiceLabel = (service: ServiceId) => findService(service).title;

/**
 * Exportación (RF-29) con datos personales mínimos: referencia, fecha, servicio,
 * estado, nombre y correo para contactar. Sin teléfono, comuna, mensaje ni
 * notas internas. `formatDate` lo entrega quien llama (hora de Chile).
 */
export function requestsCsvTable(
  requests: readonly AdminServiceRequest[],
  formatDate: (iso: string) => string,
) {
  return {
    header: ["Referencia", "Fecha", "Servicio", "Estado", "Nombre", "Correo"],
    rows: requests.map((r) => [
      r.id,
      formatDate(r.createdAt),
      requestServiceLabel(r.service),
      REQUEST_STATUS_LABEL[r.status],
      r.name,
      r.email,
    ]),
  };
}
