import { isServiceId, type ServiceId } from "./services";

/**
 * Gestión de solicitudes de servicio en el panel (RF-24, RF-29). Dominio puro.
 *
 * - Estados: Nueva → En gestión → Resuelta. Se puede resolver directo desde
 *   Nueva y reabrir una resuelta (vuelve a En gestión); nunca se vuelve a Nueva.
 *   Los estados que se pueden elegir los entrega la API (`statusOptions`).
 * - La nota interna es solo para el personal (máx. NOTE_MAX caracteres) y se
 *   puede guardar sin cambiar el estado.
 * - Cada cambio queda en el historial de la API con quién, cuándo y qué cambió.
 */

export const REQUEST_STATUSES = ["new", "in_progress", "resolved"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  new: "Nueva",
  in_progress: "En gestión",
  resolved: "Resuelta",
};

export const NOTE_MAX = 1000;
export const QUERY_MAX = 80;
export const REQUESTS_PAGE_SIZE = 20;

export function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === "string" && (REQUEST_STATUSES as readonly string[]).includes(value);
}

/** Una fila del listado. */
export interface AdminRequestSummary {
  /** Referencia visible ("SOL-1002"). */
  reference: string;
  service: ServiceId;
  serviceLabel: string;
  name: string;
  email: string;
  commune: string | null;
  /** AAAA-MM-DD. */
  preferredDate: string | null;
  status: RequestStatus;
  hasNote: boolean;
  createdAt: string;
}

export interface RequestHistoryEntry {
  at: string;
  /** Rol con que actuó, o «Solicitante». */
  actor: string;
  /** Nombre de la persona del equipo; null si fue el solicitante. */
  actorName: string | null;
  change: string;
}

export interface RequestEmail {
  /** Id del registro de correo (para abrirlo en Correos). */
  id: string;
  event: string;
  recipient: string;
  status: string;
  createdAt: string;
}

export interface AdminRequestDetail extends AdminRequestSummary {
  phone: string | null;
  ages: string | null;
  message: string;
  note: string;
  /** El estado actual primero y luego los permitidos. */
  statusOptions: RequestStatus[];
  /** Del más antiguo al más reciente. */
  history: RequestHistoryEntry[];
  emails: RequestEmail[];
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

export const NO_CHANGES = "No hay cambios para guardar.";

/**
 * Valida el seguimiento contra la solicitud actual y devuelve solo lo que
 * cambia (cuerpo de PATCH /admin/service-requests/{ref}). La API vuelve a
 * aplicar las reglas.
 */
export function validateFollowUp(
  current: Pick<AdminRequestDetail, "status" | "note" | "statusOptions">,
  input: FollowUpInput,
):
  | { ok: true; changes: { status?: RequestStatus; note?: string } }
  | { ok: false; errors: FollowUpErrors } {
  const errors: FollowUpErrors = {};
  const note = input.note.trim();
  if (!isRequestStatus(input.status) || !current.statusOptions.includes(input.status)) {
    errors.status = "Elige un estado de la lista.";
  }
  if (note.length > NOTE_MAX) errors.note = `Usa como máximo ${NOTE_MAX} caracteres.`;
  if (errors.status || errors.note) return { ok: false, errors };

  const changes: { status?: RequestStatus; note?: string } = {};
  if (input.status !== current.status) changes.status = input.status as RequestStatus;
  if (note !== current.note) changes.note = note;
  if (Object.keys(changes).length === 0) return { ok: false, errors: { form: NO_CHANGES } };
  return { ok: true, changes };
}

// ── Listado: filtros de la URL ───────────────────────────────────────────────

export interface RequestQuery {
  service: ServiceId | null;
  status: RequestStatus | null;
  /** Búsqueda por referencia, nombre o correo. */
  q: string;
  page: number;
  /** Solicitud abierta en el detalle ("SOL-1002"). */
  id: string | null;
}

export interface RequestPage {
  rows: AdminRequestSummary[];
  /** Solicitudes por estado, con los demás filtros (para las pestañas). */
  counts: Record<RequestStatus, number>;
  total: number;
  page: number;
  pageCount: number;
}

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

/** `?servicio=&estado=&q=&pagina=&id=`. Un valor desconocido se ignora (sin filtro). */
export function parseRequestQuery(params: Params): RequestQuery {
  const service = first(params.servicio);
  const status = first(params.estado);
  const id = first(params.id).toUpperCase();
  const page = Number(first(params.pagina));
  return {
    service: isServiceId(service) ? service : null,
    status: isRequestStatus(status) ? status : null,
    q: first(params.q).replace(/\s+/g, " ").slice(0, QUERY_MAX),
    page: Number.isInteger(page) && page > 1 ? page : 1,
    id: /^SOL-[A-Z0-9]{1,20}$/.test(id) ? id : null,
  };
}

/** Parámetros de la URL para conservar los filtros (enlaces y exportación). Sin página ni detalle. */
export function requestQueryString(
  query: Pick<RequestQuery, "service" | "status" | "q"> & { page?: number },
): string {
  const params = new URLSearchParams();
  if (query.service) params.set("servicio", query.service);
  if (query.status) params.set("estado", query.status);
  if (query.q) params.set("q", query.q);
  if (query.page && query.page > 1) params.set("pagina", String(query.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Filtros de GET /admin/service-requests y de la exportación (sin página). */
export function toApiRequestFilters(query: Pick<RequestQuery, "service" | "status" | "q">) {
  const params = new URLSearchParams();
  if (query.service) params.set("service", query.service);
  if (query.status) params.set("status", query.status);
  if (query.q) params.set("q", query.q);
  return params;
}

/** Parámetros de GET /admin/service-requests. */
export function toApiRequestSearch(query: RequestQuery, pageSize = REQUESTS_PAGE_SIZE): string {
  const params = toApiRequestFilters(query);
  params.set("page", String(query.page));
  params.set("pageSize", String(pageSize));
  return params.toString();
}
