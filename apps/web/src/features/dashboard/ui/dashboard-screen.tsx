import type { Route } from "next";
import Link from "next/link";

import { getAdminSession } from "@/features/auth";
import {
  AdminOrderStatusBadge,
  getPanelSummary,
  ORDER_STATUS_LABEL,
  ORDER_STATUSES,
} from "@/features/orders";
import { REVIEW_REASON_LABEL, type ReviewReason } from "@/features/payments";
import { HealthStatus } from "@/features/system";
import { canAccessSection, type AdminRole, type AdminSection } from "@/features/users";
import { CellTitle, DataTable } from "@/shared/ui/admin/data-table";
import { InfoNote } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { AdminPanel } from "@/shared/ui/admin/panel";
import { StatCard, StatGrid } from "@/shared/ui/admin/stat-card";
import { buttonClasses, ButtonLink } from "@/shared/ui/button";
import { formatPrice } from "@/shared/ui/format-price";

const TODAY = new Intl.DateTimeFormat("es-CL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Santiago",
});

const DATE_TIME = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Santiago",
});

/** Accesos rápidos; cada uno se muestra solo si el rol puede ver su sección. */
const SHORTCUTS: readonly { href: Route; label: string; section: AdminSection }[] = [
  { href: "/admin/pedidos", label: "Ver pedidos", section: "pedidos" },
  { href: "/admin/pagos", label: "Revisar pagos", section: "pagos" },
  { href: "/admin/productos/nuevo", label: "Agregar producto", section: "productos" },
  { href: "/admin/inventario", label: "Gestionar stock", section: "inventario" },
  { href: "/admin/cupones", label: "Crear cupón", section: "cupones" },
  { href: "/admin/solicitudes", label: "Ver solicitudes", section: "solicitudes" },
  { href: "/admin/reportes", label: "Consultar reportes", section: "reportes" },
];

const reasonLabel = (reason: string | null) =>
  reason && reason in REVIEW_REASON_LABEL
    ? REVIEW_REASON_LABEL[reason as ReviewReason]
    : "En revisión";

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "2026-11-01" → "1 nov" (día del período, sin depender de la zona horaria). */
const formatPeriodDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
};

/**
 * Panel administrativo · Resumen (UI-14). Solo lectura, desde GET /admin/summary.
 * Los cobros del mes y el stock bajo solo llegan para el Administrador.
 */
export async function DashboardScreen() {
  const [session, overview] = await Promise.all([getAdminSession(), getPanelSummary()]);
  const role: AdminRole = session?.role ?? "operator";
  const recent = overview.recentOrders;
  const toReconcile = overview.paymentsInReview + overview.paymentsPending;
  const today = capitalize(TODAY.format(new Date()));

  return (
    <>
      <AdminPageHeading
        title="Cada pequeño pedido cuenta"
        description={`Aquí tienes el resumen de tu tienda. ${today}.`}
        actions={<ButtonLink href="/admin/pedidos">Ver pedidos</ButtonLink>}
      />

      {toReconcile > 0 && canAccessSection(role, "pagos") ? (
        <InfoNote>
          <strong>
            {toReconcile} pago{toReconcile === 1 ? "" : "s"} por conciliar
          </strong>{" "}
          · Revisa el cobro antes de liberar la reserva.{" "}
          <Link href="/admin/pagos" className="font-extrabold underline">
            Revisar pagos
          </Link>
        </InfoNote>
      ) : null}

      {overview.alerts.total > 0 ? (
        <AdminPanel title={`Alertas abiertas (${String(overview.alerts.total)})`}>
          <p className="mb-3 text-sm">
            Pedidos o pagos en revisión: no se vencen ni se confirman solos mientras pueda haber un
            cobro. Consulta Flow o resuélvelos desde el pedido.
          </p>
          <ul className="flex flex-col gap-2 text-sm">
            {overview.alerts.items.map((alert) => (
              <li key={alert.ref} className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/pedidos/${alert.ref}#pago` as Route}
                  className="font-extrabold text-brand-blue underline"
                >
                  #{alert.ref}
                </Link>
                <AdminOrderStatusBadge status={alert.status} />
                <span>{reasonLabel(alert.reason)}</span>
                <small className="text-xs text-text-secondary">
                  desde {DATE_TIME.format(new Date(alert.since))}
                </small>
              </li>
            ))}
          </ul>
          {overview.alerts.total > overview.alerts.items.length ? (
            <p className="mt-3 text-sm">
              <Link
                href="/admin/pagos?estado=in_review"
                className="font-extrabold text-brand-blue underline"
              >
                Ver todos los pagos en revisión
              </Link>
            </p>
          ) : null}
        </AdminPanel>
      ) : null}

      <StatGrid label="Indicadores de la tienda">
        {overview.sales ? (
          <StatCard
            label="Cobros del mes"
            value={formatPrice(overview.sales.charged)}
            note={`${formatPeriodDay(overview.sales.from)} al ${formatPeriodDay(overview.sales.to)} · Reembolsos: ${formatPrice(overview.sales.refunded)} · Neto: ${formatPrice(overview.sales.net)}`}
          />
        ) : (
          <StatCard
            label="Pagos pendientes"
            value={overview.paymentsPending}
            note="Esperan la respuesta de Flow"
          />
        )}
        <StatCard
          label="Pedidos por preparar"
          value={overview.byStatus.confirmed}
          note="Con pago confirmado"
        />
        <StatCard
          label="Pagos en revisión"
          value={overview.paymentsInReview}
          note={`Resultado incierto · ${overview.paymentsPending} pendiente${overview.paymentsPending === 1 ? "" : "s"}`}
        />
        {overview.lowStockVariants !== null ? (
          <StatCard
            label="Productos con stock bajo"
            value={overview.lowStockVariants}
            note={
              <Link href="/admin/inventario" className="font-bold text-brand-blue underline">
                Variantes con pocas unidades terminadas
              </Link>
            }
          />
        ) : (
          <StatCard
            label="Pedidos en preparación"
            value={overview.byStatus.preparing}
            note="Pendientes de despacho"
          />
        )}
      </StatGrid>

      <div className="grid gap-x-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <AdminPanel
          title="Últimos pedidos"
          flush
          actions={
            <Link
              href="/admin/pedidos"
              className="text-sm font-extrabold text-brand-blue underline"
            >
              Ver todos
            </Link>
          }
        >
          <DataTable
            caption="Últimos pedidos"
            columns={[
              { key: "order", label: "Pedido" },
              { key: "customer", label: "Cliente" },
              { key: "status", label: "Estado" },
              { key: "total", label: "Total", align: "end" },
            ]}
            rows={recent.map((order) => ({
              key: order.ref,
              cells: {
                order: (
                  <CellTitle
                    title={
                      <Link
                        href={`/admin/pedidos/${order.ref}` as Route}
                        className="text-brand-blue underline-offset-4 hover:underline"
                      >
                        #{order.ref}
                      </Link>
                    }
                    meta={DATE_TIME.format(new Date(order.createdAt))}
                  />
                ),
                customer: order.buyerName,
                status: <AdminOrderStatusBadge status={order.status} />,
                total: formatPrice(order.total),
              },
            }))}
            empty="Todavía no hay pedidos."
          />
        </AdminPanel>

        <AdminPanel title="Pedidos por estado">
          <ul className="flex flex-col divide-y divide-border">
            {ORDER_STATUSES.map((status) => (
              <li key={status}>
                <Link
                  href={`/admin/pedidos?estado=${status}` as Route}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-md px-1 hover:bg-background"
                >
                  <span>{ORDER_STATUS_LABEL[status]}</span>
                  <strong className="tabular-nums">{overview.byStatus[status]}</strong>
                </Link>
              </li>
            ))}
          </ul>
        </AdminPanel>
      </div>

      <AdminPanel title="Tu tienda, a mano">
        <ul className="flex flex-wrap gap-3">
          {SHORTCUTS.filter((s) => canAccessSection(role, s.section)).map((shortcut) => (
            <li key={shortcut.href}>
              <Link href={shortcut.href} className={buttonClasses({ variant: "outline" })}>
                {shortcut.label}
              </Link>
            </li>
          ))}
        </ul>
      </AdminPanel>

      <AdminPanel title="Estado del sistema">
        <HealthStatus />
      </AdminPanel>
    </>
  );
}
