import { z } from "zod";

import type { Prisma } from "../../generated/prisma/client.js";
import { toCsv, type CsvValue } from "../../lib/csv.js";
import { errors } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { listAdminOrders } from "../admin-orders/query.js";
import { adminOrdersQuery } from "../admin-orders/schemas.js";
import { requestFilters, subscriberFilters } from "../admin-desk/schemas.js";
import {
  REQUEST_STATUS_LABEL,
  requestWhere,
  serviceLabel,
} from "../admin-desk/service-requests.js";
import { SUBSCRIBER_STATUS_LABEL, subscriberWhere } from "../admin-desk/subscribers.js";
import { writeAudit, type Actor } from "../audit.js";
import { chileDate } from "../cart/chile-date.js";
import { requestReference } from "../service-requests.js";
import { buildSalesReport, periodQuery, resolvePeriod } from "./sales.js";

/**
 * Exportaciones CSV del panel (LN-16, RF-29, RF-30). Solo Administrador (tabla
 * de la API de la SRS). CSV seguro (`lib/csv.ts`: BOM, ";", CRLF y fórmulas
 * neutralizadas) con los mismos filtros que el listado de cada pantalla y las
 * columnas que ya decidió el panel, con datos personales mínimos:
 *
 * - pedidos: número, fecha, nombre y correo del comprador, estado, pago y total
 *   (sin RUT, teléfono, dirección ni datos de factura);
 * - ventas: una fila por cobro del período, con los reembolsos procesados aparte;
 * - solicitudes: referencia, fecha, servicio, estado, nombre y correo (sin
 *   teléfono, comuna, mensaje ni nota interna);
 * - suscriptores: correo, consentimiento (fecha y versión), estado y baja.
 *
 * Tope de 5.000 filas por archivo (422 si los filtros traen más). Cada descarga
 * queda en audit_log (`export.downloaded`) con el recurso, los filtros y las filas.
 */

export const EXPORT_RESOURCES = ["orders", "sales", "service-requests", "subscribers"] as const;
export type ExportResource = (typeof EXPORT_RESOURCES)[number];
export const EXPORT_MAX_ROWS = 5000;

export const isExportResource = (value: string): value is ExportResource =>
  (EXPORT_RESOURCES as readonly string[]).includes(value);

// sv-SE da "AAAA-MM-DD HH:mm": ordenable y legible en una hoja de cálculo (como la web).
const SORTABLE = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Santiago",
});
export const chileDateTimeForCsv = (d: Date | string) => SORTABLE.format(new Date(d));

const spanish = z.locales.es();

function parseQuery<S extends z.ZodType>(schema: S, query: unknown): z.output<S> {
  const result = schema.safeParse(query, { error: spanish.localeError });
  if (result.success) return result.data;
  throw errors.validation("Los datos enviados no son válidos", {
    issues: result.error.issues.map((i) => ({
      location: "query",
      path: i.path.map(String).join("."),
      message: i.message,
    })),
  });
}

function tooMany(total: number, noun: string): never {
  throw errors.validation(
    `Hay ${total.toLocaleString("es-CL")} ${noun} con estos filtros; el máximo por archivo es ${EXPORT_MAX_ROWS.toLocaleString("es-CL")}. Acota los filtros.`,
    { issues: [{ location: "query", path: "", message: "Acota los filtros." }], total },
  );
}

export interface CsvExport {
  filename: string;
  csv: string;
  rows: number;
}

type Db = Pick<
  PrismaClient,
  "$queryRaw" | "$transaction" | "serviceRequest" | "newsletterSubscriber" | "auditLog"
>;

async function ordersCsv(db: Db, rawQuery: unknown, today: string) {
  const query = parseQuery(adminOrdersQuery, rawQuery);
  const { items, meta } = await listAdminOrders(db, {
    ...query,
    page: 1,
    pageSize: EXPORT_MAX_ROWS + 1,
  });
  if (meta.total > EXPORT_MAX_ROWS) tooMany(meta.total, "pedidos");
  const header = ["Pedido", "Fecha", "Cliente", "Correo", "Estado", "Pago", "Total CLP"];
  const rows: CsvValue[][] = items.map((o) => [
    o.ref,
    chileDateTimeForCsv(o.createdAt),
    o.buyerName,
    o.buyerEmail,
    o.statusLabel,
    o.paymentLabel,
    o.total,
  ]);
  const filters = Object.fromEntries(
    Object.entries(query).filter(([k, v]) => k !== "page" && k !== "pageSize" && v !== undefined),
  );
  return { filename: `total-kids-pedidos-${today}.csv`, header, rows, filters };
}

async function salesCsv(db: Db, rawQuery: unknown) {
  const period = resolvePeriod(parseQuery(periodQuery, rawQuery));
  const report = await buildSalesReport(db, period);
  if (report.sales.length > EXPORT_MAX_ROWS) tooMany(report.sales.length, "ventas");
  const header = [
    "Pedido",
    "Fecha de cobro",
    "Comprador",
    "Medio",
    "Cobro",
    "Reembolsos procesados en el período",
  ];
  const rows: CsvValue[][] = report.sales.map((s) => [
    s.orderRef,
    chileDateTimeForCsv(s.paidAt),
    s.buyerName,
    s.method,
    s.charged,
    s.refundedInPeriod,
  ]);
  return {
    filename: `total-kids-ventas-${period.from}-${period.to}.csv`,
    header,
    rows,
    filters: { ...period },
  };
}

async function requestsCsv(db: Db, rawQuery: unknown, today: string) {
  const filters = parseQuery(requestFilters, rawQuery);
  const where = requestWhere(filters);
  const total = await db.serviceRequest.count({ where });
  if (total > EXPORT_MAX_ROWS) tooMany(total, "solicitudes");
  const requests = await db.serviceRequest.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { number: "desc" }],
    select: { number: true, createdAt: true, service: true, status: true, name: true, email: true },
  });
  const header = ["Referencia", "Fecha", "Servicio", "Estado", "Nombre", "Correo"];
  const rows: CsvValue[][] = requests.map((r) => [
    requestReference(r.number),
    chileDateTimeForCsv(r.createdAt),
    serviceLabel(r.service),
    REQUEST_STATUS_LABEL[r.status],
    r.name,
    r.email,
  ]);
  return { filename: `total-kids-solicitudes-${today}.csv`, header, rows, filters };
}

async function subscribersCsv(db: Db, rawQuery: unknown, today: string) {
  const filters = parseQuery(subscriberFilters, rawQuery);
  const where = subscriberWhere(filters);
  const total = await db.newsletterSubscriber.count({ where });
  if (total > EXPORT_MAX_ROWS) tooMany(total, "suscriptores");
  const subscribers = await db.newsletterSubscriber.findMany({
    where,
    orderBy: [{ consentedAt: "desc" }, { id: "desc" }],
    select: {
      email: true,
      consentedAt: true,
      consentVersion: true,
      status: true,
      unsubscribedAt: true,
    },
  });
  const header = [
    "Correo",
    "Fecha de consentimiento",
    "Versión del texto",
    "Estado",
    "Fecha de baja",
  ];
  const rows: CsvValue[][] = subscribers.map((s) => [
    s.email,
    chileDateTimeForCsv(s.consentedAt),
    s.consentVersion,
    SUBSCRIBER_STATUS_LABEL[s.status],
    s.unsubscribedAt ? chileDateTimeForCsv(s.unsubscribedAt) : "",
  ]);
  return { filename: `total-kids-suscriptores-${today}.csv`, header, rows, filters };
}

/** Arma el CSV del recurso con los filtros de la URL y deja la descarga auditada. */
export async function exportCsv(
  db: Db,
  resource: ExportResource,
  rawQuery: unknown,
  actor: Actor,
  requestId?: string,
  now = new Date(),
): Promise<CsvExport> {
  const today = chileDate(now);
  const built =
    resource === "orders"
      ? await ordersCsv(db, rawQuery, today)
      : resource === "sales"
        ? await salesCsv(db, rawQuery)
        : resource === "service-requests"
          ? await requestsCsv(db, rawQuery, today)
          : await subscribersCsv(db, rawQuery, today);
  await writeAudit(
    db,
    actor,
    {
      action: "export.downloaded",
      resourceType: "export",
      resourceId: resource,
      details: {
        filters: JSON.parse(JSON.stringify(built.filters)) as Prisma.InputJsonValue,
        rows: built.rows.length,
      },
    },
    requestId,
  );
  return {
    filename: built.filename,
    csv: toCsv(built.header, built.rows),
    rows: built.rows.length,
  };
}
