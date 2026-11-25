/**
 * Suscriptores del newsletter en el panel (RF-25, RF-29, RF-35). Dominio puro.
 *
 * - Cada suscriptor guarda el correo, la fecha del consentimiento y la versión
 *   del texto aceptado (CONSENT_VERSION al suscribirse).
 * - La baja no borra el registro: cambia el estado y deja la fecha de baja y
 *   quién la registró (el propio suscriptor o el rol del equipo).
 * - La API filtra, pagina y registra la baja; aquí solo viven los tipos y los
 *   filtros de la URL.
 */

export const SUBSCRIBER_STATUSES = ["active", "unsubscribed"] as const;
export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number];

export const SUBSCRIBER_STATUS_LABEL: Record<SubscriberStatus, string> = {
  active: "Activo",
  unsubscribed: "Dado de baja",
};

export interface Subscriber {
  id: string;
  /** En minúsculas. */
  email: string;
  consentedAt: string;
  consentVersion: string;
  status: SubscriberStatus;
  unsubscribedAt: string | null;
  /** «Suscriptor» o el rol que la registró. */
  unsubscribedBy: string | null;
}

export type UnsubscribeResult =
  { ok: true } | { ok: false; reason: "already-unsubscribed" | "not-found" };

// ── Listado: filtros de la URL ───────────────────────────────────────────────

/** Valor del filtro en la URL (`?estado=activos|bajas`). */
export const SUBSCRIBER_FILTERS = { activos: "active", bajas: "unsubscribed" } as const;
export type SubscriberFilter = keyof typeof SUBSCRIBER_FILTERS;

export const SUBSCRIBERS_PAGE_SIZE = 20;
export const QUERY_MAX = 80;

export interface SubscriberQuery {
  filter: SubscriberFilter | null;
  /** Búsqueda en el correo. */
  q: string;
  page: number;
  /** Suscriptor cuya baja se está confirmando (`?baja=<id>`). */
  confirm: string | null;
}

export interface SubscriberPage {
  rows: Subscriber[];
  counts: Record<SubscriberStatus, number>;
  total: number;
  page: number;
  pageCount: number;
}

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

export function parseSubscriberQuery(params: Params): SubscriberQuery {
  const filter = first(params.estado);
  const confirm = first(params.baja);
  const page = Number(first(params.pagina));
  return {
    filter: Object.hasOwn(SUBSCRIBER_FILTERS, filter) ? (filter as SubscriberFilter) : null,
    q: first(params.q).replace(/\s+/g, " ").slice(0, QUERY_MAX),
    page: Number.isInteger(page) && page > 1 ? page : 1,
    confirm: /^[\w-]{1,40}$/.test(confirm) ? confirm : null,
  };
}

/** "?estado=bajas&q=ana&pagina=2" (con `extra` al final); "" si no hay nada. */
export function toSubscriberSearch(
  query: Partial<Pick<SubscriberQuery, "filter" | "q" | "page">>,
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams();
  if (query.filter) params.set("estado", query.filter);
  if (query.q) params.set("q", query.q);
  if (query.page && query.page > 1) params.set("pagina", String(query.page));
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Filtros de GET /admin/newsletter y de la exportación (sin página). */
export function toApiSubscriberFilters(query: Pick<SubscriberQuery, "filter" | "q">) {
  const params = new URLSearchParams();
  if (query.filter) params.set("status", SUBSCRIBER_FILTERS[query.filter]);
  if (query.q) params.set("q", query.q);
  return params;
}

/** Parámetros de GET /admin/newsletter. */
export function toApiSubscriberSearch(
  query: SubscriberQuery,
  pageSize = SUBSCRIBERS_PAGE_SIZE,
): string {
  const params = toApiSubscriberFilters(query);
  params.set("page", String(query.page));
  params.set("pageSize", String(pageSize));
  return params.toString();
}
