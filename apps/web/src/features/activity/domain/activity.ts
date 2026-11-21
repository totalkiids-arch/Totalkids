/**
 * Historial de actividad del panel (RF-27, RF-34): quién hizo qué, cuándo y
 * por qué. Dominio puro.
 *
 * Cada feature entrega sus propias entradas en este formato (pedidos, pagos,
 * reembolsos, inventario, solicitudes, correos, suscriptores y usuarios) y la
 * página las junta. Solo se listan acciones del equipo: los eventos
 * automáticos y los del comprador se ven en el detalle de cada registro.
 */

export const ACTIVITY_AREAS = [
  "pedidos",
  "pagos",
  "reembolsos",
  "inventario",
  "solicitudes",
  "correos",
  "suscriptores",
  "usuarios",
] as const;

export type ActivityArea = (typeof ACTIVITY_AREAS)[number];

export const ACTIVITY_AREA_LABEL: Record<ActivityArea, string> = {
  pedidos: "Pedidos",
  pagos: "Pagos",
  reembolsos: "Reembolsos",
  inventario: "Inventario",
  solicitudes: "Solicitudes",
  correos: "Correos",
  suscriptores: "Suscriptores",
  usuarios: "Usuarios",
};

export interface ActivityEntry {
  /** Único dentro del historial (área + registro + fecha). */
  id: string;
  /** Fecha y hora ISO. */
  at: string;
  /** Responsable ("Administrador", "Operador"). */
  actor: string;
  area: ActivityArea;
  /** Qué se hizo, en una frase. */
  action: string;
  /** Motivo escrito por el responsable, cuando existe. */
  reason: string | null;
  /** Registro afectado, con enlace a su pantalla del panel. */
  reference: { label: string; href: string } | null;
}

export interface ActivityQuery {
  area: ActivityArea | null;
  actor: string | null;
  page: number;
}

export const PAGE_SIZE = 20;

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

const isArea = (value: string): value is ActivityArea =>
  (ACTIVITY_AREAS as readonly string[]).includes(value);

/** Lee `?area=&responsable=&pagina=` de la URL; lo desconocido se ignora. */
export function parseActivityQuery(params: Params): ActivityQuery {
  const area = first(params.area);
  const actor = first(params.responsable).slice(0, 60);
  const page = Number.parseInt(first(params.pagina), 10);
  return {
    area: isArea(area) ? area : null,
    actor: actor || null,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Parámetros de la URL para una consulta (sin los valores por defecto). */
export function toActivitySearch(query: ActivityQuery): string {
  const params = new URLSearchParams();
  if (query.area) params.set("area", query.area);
  if (query.actor) params.set("responsable", query.actor);
  if (query.page > 1) params.set("pagina", String(query.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

export interface ActivityPage {
  entries: ActivityEntry[];
  total: number;
  page: number;
  pageCount: number;
  /** Responsables que aparecen en el historial, para el filtro. */
  actors: string[];
  /** Cuántas entradas tiene cada área (sin filtrar), para el filtro. */
  byArea: Record<ActivityArea, number>;
}

/** Junta, ordena (más reciente primero), filtra y pagina el historial. */
export function buildActivityPage(
  sources: readonly (readonly ActivityEntry[])[],
  query: ActivityQuery,
): ActivityPage {
  const all = sources.flat().sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
  const byArea = Object.fromEntries(ACTIVITY_AREAS.map((a) => [a, 0])) as Record<
    ActivityArea,
    number
  >;
  for (const entry of all) byArea[entry.area] += 1;

  const filtered = all.filter(
    (e) => (!query.area || e.area === query.area) && (!query.actor || e.actor === query.actor),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  return {
    entries: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total: filtered.length,
    page,
    pageCount,
    actors: [...new Set(all.map((e) => e.actor))].sort((a, b) => a.localeCompare(b, "es")),
    byArea,
  };
}
