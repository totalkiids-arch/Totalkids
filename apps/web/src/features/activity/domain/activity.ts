/**
 * Historial de actividad del panel (RF-27, RF-34): quién hizo qué, cuándo y
 * por qué. Dominio puro.
 *
 * Lo entrega la API (GET /admin/activity, solo Administrador) desde audit_log:
 * el responsable se identifica por su cuenta (nombre y rol con que actuó). Los
 * ingresos al panel no se listan; los eventos automáticos y los del comprador
 * se ven en el detalle de cada pedido o solicitud.
 */

export const ACTIVITY_AREAS = [
  "pedidos",
  "pagos",
  "reembolsos",
  "inventario",
  "catalogo",
  "configuracion",
  "solicitudes",
  "correos",
  "suscriptores",
  "usuarios",
  "exportaciones",
] as const;

export type ActivityArea = (typeof ACTIVITY_AREAS)[number];

export const ACTIVITY_AREA_LABEL: Record<ActivityArea, string> = {
  pedidos: "Pedidos",
  pagos: "Pagos",
  reembolsos: "Reembolsos",
  inventario: "Inventario",
  catalogo: "Catálogo",
  configuracion: "Configuración",
  solicitudes: "Solicitudes",
  correos: "Correos",
  suscriptores: "Suscriptores",
  usuarios: "Usuarios",
  exportaciones: "Exportaciones",
};

export function isActivityArea(value: unknown): value is ActivityArea {
  return typeof value === "string" && (ACTIVITY_AREAS as readonly string[]).includes(value);
}

/** Registro afectado tal como lo describe la API (`reference`). */
export interface ActivityReference {
  /** Tipo de recurso: "order", "service_request", "product", "coupon"… */
  type: string;
  id: string;
  /** Texto visible ("TK-1048", "SOL-1002", el SKU o el código del cupón). */
  label: string;
}

export interface ActivityEntry {
  id: string;
  /** Fecha y hora ISO. */
  at: string;
  area: ActivityArea | null;
  /** Qué se hizo, en una frase. */
  description: string;
  /** Motivo escrito por el responsable, cuando existe. */
  reason: string | null;
  /** Nombre de la persona; null si la cuenta ya no lo informa. */
  actorName: string | null;
  /** Rol con que actuó ("Administrador", "Operador"). */
  actorLabel: string;
  reference: ActivityReference | null;
}

export interface ActivityActor {
  id: string;
  name: string;
  role: string;
  active: boolean;
}

export const ACTIVITY_PAGE_SIZE = 20;

export interface ActivityQuery {
  area: ActivityArea | null;
  /** Id de la cuenta responsable. */
  actor: string | null;
  /** AAAA-MM-DD (días de Chile), incluidos. */
  from: string | null;
  to: string | null;
  page: number;
}

export interface ActivityPage {
  entries: ActivityEntry[];
  total: number;
  page: number;
  pageCount: number;
  /** Responsables, para el filtro. */
  actors: ActivityActor[];
  /** Cuántas entradas tiene cada área, para el filtro. */
  byArea: Record<ActivityArea, number>;
}

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Lee `?area=&responsable=&desde=&hasta=&pagina=` de la URL; lo desconocido se ignora. */
export function parseActivityQuery(params: Params): ActivityQuery {
  const area = first(params.area);
  const actor = first(params.responsable).toLowerCase();
  const from = first(params.desde);
  const to = first(params.hasta);
  const page = Number.parseInt(first(params.pagina), 10);
  return {
    area: isActivityArea(area) ? area : null,
    actor: UUID.test(actor) ? actor : null,
    from: DAY.test(from) ? from : null,
    to: DAY.test(to) ? to : null,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Parámetros de la URL para una consulta (sin los valores por defecto). */
export function toActivitySearch(query: Partial<ActivityQuery>): string {
  const params = new URLSearchParams();
  if (query.area) params.set("area", query.area);
  if (query.actor) params.set("responsable", query.actor);
  if (query.from) params.set("desde", query.from);
  if (query.to) params.set("hasta", query.to);
  if (query.page && query.page > 1) params.set("pagina", String(query.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Parámetros de GET /admin/activity. */
export function toApiActivitySearch(query: ActivityQuery, pageSize = ACTIVITY_PAGE_SIZE): string {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(pageSize) });
  if (query.area) params.set("area", query.area);
  if (query.actor) params.set("actor", query.actor);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  return params.toString();
}

const enc = encodeURIComponent;

/**
 * Pantalla del panel que abre el registro afectado. Solo rutas que existen y
 * aceptan ese parámetro; si no hay una ficha propia, la lista de la sección, y
 * null si no hay a dónde ir (exportaciones, condiciones generales).
 */
export function activityHref(reference: ActivityReference): string | null {
  switch (reference.type) {
    case "order":
      return /^TK-\d+$/.test(reference.label)
        ? `/admin/pedidos/${reference.label}`
        : "/admin/pedidos";
    case "service_request":
      return /^SOL-[A-Z0-9]+$/.test(reference.label)
        ? `/admin/solicitudes?id=${enc(reference.label)}#detalle`
        : "/admin/solicitudes";
    case "product":
      return UUID.test(reference.id) ? `/admin/productos/${reference.id}` : "/admin/productos";
    case "coupon":
      return `/admin/cupones?editar=${enc(reference.id)}#editor`;
    case "banner":
      return `/admin/banners?editar=${enc(reference.id)}#editor`;
    case "shipping_zone":
      return `/admin/despacho?editar=${enc(reference.id)}#editor`;
    case "category":
      return `/admin/categorias?editar=${enc(reference.id)}#editor`;
    case "email":
      return UUID.test(reference.id)
        ? `/admin/correos?id=${reference.id}#detalle`
        : "/admin/correos";
    case "user":
      return `/admin/usuarios?editar=${enc(reference.id)}#editor`;
    case "newsletter_subscriber":
      return "/admin/suscriptores";
    default:
      return null;
  }
}
