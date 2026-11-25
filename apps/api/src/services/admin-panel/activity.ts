import { z } from "zod";

import type { AuditLog, Prisma } from "../../generated/prisma/client.js";
import { paginationQuery, pageMeta, pageWindow, type PageMeta } from "../../lib/pagination.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { isCalendarDate } from "../admin-orders/schemas.js";
import { ORDER_STATUS_LABEL, orderRef } from "../admin-orders/rules.js";

/**
 * Historial de actividad del panel (LN-16, RF-27, RF-34): quién hizo qué,
 * cuándo y por qué, leído de `audit_log`. Solo Administrador.
 *
 * - El responsable se identifica por `actor_user_id`: la respuesta trae el
 *   nombre de la persona (y su rol al momento, `actorLabel`), y el filtro
 *   `actor` es el id de la cuenta, no el rol.
 * - Áreas de `apps/web/src/features/activity/domain/activity.ts` más
 *   «catalogo», «configuracion» y «exportaciones», según el recurso afectado.
 * - Los ingresos al panel (`auth.login`) no se listan: son accesos, no cambios.
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

const EXCLUDED_ACTIONS = ["auth.login"];

const REFUND = { startsWith: "order.refund" } as const;

/** Qué filas de audit_log forman cada área. */
const AREA_WHERE: Record<ActivityArea, Prisma.AuditLogWhereInput> = {
  pedidos: { resourceType: "order", NOT: { action: REFUND } },
  reembolsos: { resourceType: "order", action: REFUND },
  pagos: { resourceType: "payment" },
  inventario: { resourceType: "product_variant" },
  catalogo: { resourceType: { in: ["product", "category", "extra"] } },
  configuracion: { resourceType: { in: ["coupon", "banner", "shipping_zone", "settings"] } },
  solicitudes: { resourceType: "service_request" },
  correos: { resourceType: "email" },
  suscriptores: { resourceType: "newsletter_subscriber" },
  usuarios: { resourceType: "user" },
  exportaciones: { resourceType: "export" },
};

export function areaOf(row: Pick<AuditLog, "resourceType" | "action">): ActivityArea | null {
  switch (row.resourceType) {
    case "order":
      return row.action.startsWith("order.refund") ? "reembolsos" : "pedidos";
    case "payment":
      return "pagos";
    case "product_variant":
      return "inventario";
    case "product":
    case "category":
    case "extra":
      return "catalogo";
    case "coupon":
    case "banner":
    case "shipping_zone":
    case "settings":
      return "configuracion";
    case "service_request":
      return "solicitudes";
    case "email":
      return "correos";
    case "newsletter_subscriber":
      return "suscriptores";
    case "user":
      return "usuarios";
    case "export":
      return "exportaciones";
    default:
      return null;
  }
}

// ── Consulta ─────────────────────────────────────────────────────────────────

const day = (message: string) => z.string().refine(isCalendarDate, message);

export const activityQuery = paginationQuery
  .extend({
    area: z.enum(ACTIVITY_AREAS, "Área inválida").optional(),
    /** Id de la cuenta del responsable. */
    actor: z.uuid("Responsable inválido").optional(),
    /** Días de Chile, ambos inclusive. */
    from: day("Fecha inválida (AAAA-MM-DD)").optional(),
    to: day("Fecha inválida (AAAA-MM-DD)").optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    path: ["to"],
    message: "La fecha final no puede ser anterior a la inicial.",
  });
export type ActivityQuery = z.output<typeof activityQuery>;

/** Medianoche de Chile del día dado, como instante (respeta el horario de verano). */
function chileMidnight(dayText: string): Date {
  // Se prueba con -03 y -04: el que, visto en Chile, sea ese mismo día a las 00:00.
  for (const offset of ["-03:00", "-04:00"]) {
    const candidate = new Date(`${dayText}T00:00:00${offset}`);
    const shown = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Santiago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(candidate);
    if (shown === `${dayText} 00:00`) return candidate;
  }
  return new Date(`${dayText}T00:00:00-03:00`);
}

const nextDay = (dayText: string) => {
  const [y, m, d] = dayText.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

function baseWhere(
  query: Omit<ActivityQuery, "area" | "page" | "pageSize">,
): Prisma.AuditLogWhereInput {
  const createdAt: Prisma.DateTimeFilter = {};
  if (query.from) createdAt.gte = chileMidnight(query.from);
  if (query.to) createdAt.lt = chileMidnight(nextDay(query.to));
  return {
    action: { notIn: EXCLUDED_ACTIONS },
    ...(query.actor ? { actorUserId: query.actor } : {}),
    ...(query.from || query.to ? { createdAt } : {}),
  };
}

// ── Descripción ──────────────────────────────────────────────────────────────

type Details = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) => (typeof v === "number" ? v : null);
const clp = (v: unknown) => (typeof v === "number" ? `$${v.toLocaleString("es-CL")}` : "");
const statusLabel = (v: unknown) =>
  typeof v === "string" && v in ORDER_STATUS_LABEL
    ? ORDER_STATUS_LABEL[v as keyof typeof ORDER_STATUS_LABEL]
    : String(v);

const ACTION_TEXT: Record<string, string | ((d: Details) => string)> = {
  "order.status_changed": (d) => `Estado del pedido: ${statusLabel(d.from)} → ${statusLabel(d.to)}`,
  "order.restock_recorded": "Reposición de stock registrada",
  "order.refund_recorded": (d) => `Reembolso registrado por ${clp(d.amount)}`,
  "order.refund_resolved": (d) =>
    `Reembolso de ${clp(d.amount)} marcado como ${d.to === "processed" ? "procesado" : "fallido"}`,
  "order.invoice_registered": (d) => `Factura registrada (folio ${str(d.folio) ?? ""})`,
  "order.invoice_replaced": (d) =>
    `Folio de factura corregido: ${str(d.from) ?? ""} → ${str(d.to) ?? ""}`,
  "payment.reconciled": "Conciliación con Flow",
  "payment.mismatch": "Los datos del pago no coinciden con Flow",
  "payment.late_review": "Pago recibido sin poder confirmar el pedido",
  "payment.double_charge": "Posible doble cobro",
  "payment.uncertain": "Pago sin respuesta segura de Flow",
  "payment.not_found": "Intento de pago que no existe en Flow, anulado",
  "inventory.adjusted": (d) => {
    const s = (d.stockPhysical ?? {}) as Details;
    return `Ajuste de stock ${str(d.sku) ?? ""}: ${String(num(s.before))} → ${String(num(s.after))}`;
  },
  "product.created": "Producto creado",
  "product.updated": "Producto editado",
  "product.deactivated": "Producto desactivado",
  "product_image.created": "Imagen agregada",
  "product_image.updated": "Imagen editada",
  "product_image.reordered": "Imágenes reordenadas",
  "product_image.deleted": "Imagen eliminada",
  "category.created": "Categoría creada",
  "category.updated": "Categoría editada",
  "category.deactivated": "Categoría desactivada",
  "coupon.created": "Cupón creado",
  "coupon.updated": "Cupón editado",
  "coupon.activated": "Cupón activado",
  "coupon.deactivated": "Cupón desactivado",
  "coupon.deleted": "Cupón eliminado",
  "banner.created": "Banner creado",
  "banner.updated": "Banner editado",
  "banner.activated": "Banner activado",
  "banner.deactivated": "Banner desactivado",
  "shipping_zone.created": "Zona de despacho creada",
  "shipping_zone.updated": "Zona de despacho editada",
  "shipping_zone.activated": "Zona de despacho activada",
  "shipping_zone.deactivated": "Zona de despacho desactivada",
  "settings.shipping_updated": "Condiciones de retiro y despacho guardadas",
  "settings.theme_changed": (d) => {
    const c = ((d.changes ?? {}) as Details).activeTheme as Details | undefined;
    return `Plantilla de la tienda: ${str(c?.before) ?? ""} → ${str(c?.after) ?? ""}`;
  },
  "service_request.updated": "Seguimiento de solicitud",
  "email.resent": "Reenvío manual de correo",
  "newsletter.unsubscribed": "Baja de suscriptor registrada",
  "user.created": "Cuenta creada",
  "user.updated": "Cuenta editada",
  "user.role_changed": "Rol cambiado",
  "user.activated": "Cuenta activada",
  "user.deactivated": "Cuenta desactivada",
  "auth.password_reset": "Contraseña restablecida",
  "export.downloaded": (d) => `Exportación CSV (${String(num(d.rows) ?? 0)} filas)`,
};

const EXPORT_LABEL: Record<string, string> = {
  orders: "Pedidos",
  sales: "Ventas",
  "service-requests": "Solicitudes",
  subscribers: "Suscriptores",
};

function describe(row: AuditLog): string {
  const details = (row.details ?? {}) as Details;
  const text = ACTION_TEXT[row.action];
  const base = typeof text === "function" ? text(details) : (text ?? row.action);
  const summary = str(details.summary);
  // Los servicios de LN-16 dejan un resumen legible ("Estado: Nueva → En gestión").
  return summary && row.action !== "user.created" ? `${base}: ${summary}` : (summary ?? base);
}

function referenceOf(row: AuditLog): { type: string; id: string; label: string } | null {
  const d = (row.details ?? {}) as Details;
  const number = num(d.number);
  switch (row.resourceType) {
    case "order":
      return {
        type: "order",
        id: row.resourceId,
        label: number ? orderRef(number) : row.resourceId,
      };
    case "service_request":
      return {
        type: "service_request",
        id: row.resourceId,
        label: str(d.reference) ?? row.resourceId,
      };
    case "product_variant":
      return {
        type: "product",
        id: str(d.productId) ?? row.resourceId,
        label: str(d.sku) ?? row.resourceId,
      };
    case "coupon":
      return { type: "coupon", id: row.resourceId, label: str(d.code) ?? row.resourceId };
    case "export":
      return {
        type: "export",
        id: row.resourceId,
        label: EXPORT_LABEL[row.resourceId] ?? row.resourceId,
      };
    case "settings":
      return null;
    default:
      return {
        type: row.resourceType,
        id: row.resourceId,
        label: str(d.name) ?? str(d.title) ?? row.resourceId,
      };
  }
}

export interface ActivityEntry {
  id: string;
  at: string;
  area: ActivityArea | null;
  areaLabel: string | null;
  action: string;
  description: string;
  reason: string | null;
  actorUserId: string | null;
  /** Nombre de la persona (cuenta actual); null en acciones del sistema. */
  actorName: string | null;
  /** Rol con que actuó, al momento ("Administrador", "Operador", "Sistema"). */
  actorLabel: string;
  resourceType: string;
  resourceId: string;
  reference: { type: string; id: string; label: string } | null;
  requestId: string | null;
}

export interface ActivityPage {
  items: ActivityEntry[];
  meta: PageMeta;
  /** Personas que aparecen en el historial, para el filtro «responsable». */
  actors: { id: string; name: string; role: string; active: boolean }[];
  /** Entradas por área con los demás filtros aplicados (sin el de área). */
  byArea: Record<ActivityArea, number>;
}

export async function listActivity(
  db: Pick<PrismaClient, "auditLog" | "user">,
  query: ActivityQuery,
): Promise<ActivityPage> {
  const base = baseWhere(query);
  const where: Prisma.AuditLogWhereInput = query.area
    ? { AND: [base, AREA_WHERE[query.area]] }
    : base;
  const [total, rows, grouped, actorIds] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      include: { actor: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...pageWindow(query),
    }),
    db.auditLog.groupBy({
      by: ["resourceType", "action"],
      where: base,
      _count: { _all: true },
    }),
    db.auditLog.findMany({
      where: { action: { notIn: EXCLUDED_ACTIONS }, actorUserId: { not: null } },
      distinct: ["actorUserId"],
      select: { actorUserId: true },
    }),
  ]);

  const byArea = Object.fromEntries(ACTIVITY_AREAS.map((a) => [a, 0])) as Record<
    ActivityArea,
    number
  >;
  for (const g of grouped) {
    const area = areaOf(g);
    if (area) byArea[area] += g._count._all;
  }

  const ids = actorIds.flatMap((a) => (a.actorUserId ? [a.actorUserId] : []));
  const people = ids.length
    ? await db.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, role: true, status: true },
      })
    : [];

  return {
    items: rows.map((row) => {
      const area = areaOf(row);
      return {
        id: row.id,
        at: row.createdAt.toISOString(),
        area,
        areaLabel: area ? ACTIVITY_AREA_LABEL[area] : null,
        action: row.action,
        description: describe(row),
        reason: row.reason,
        actorUserId: row.actorUserId,
        actorName: row.actor?.name ?? null,
        actorLabel: row.actorLabel,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        reference: referenceOf(row),
        requestId: row.requestId,
      };
    }),
    meta: pageMeta(total, query),
    actors: people
      .map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role === "admin" ? "Administrador" : "Operador",
        active: p.status === "active",
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "es") || a.id.localeCompare(b.id)),
    byArea,
  };
}
