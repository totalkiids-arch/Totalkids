import type { Route } from "next";
import Link from "next/link";

import { DataTable, TEXT_ACTION } from "@/shared/ui/admin/data-table";
import { FilterBar } from "@/shared/ui/admin/filter-bar";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { PaginationNav } from "@/shared/ui/admin/pagination-nav";
import { AdminMuted, AdminPanel } from "@/shared/ui/admin/panel";
import { StatusBadge } from "@/shared/ui/admin/status-badge";
import { SelectField, TextField } from "@/shared/ui/form";

import {
  ACTIVITY_AREA_LABEL,
  ACTIVITY_AREAS,
  activityHref,
  toActivitySearch,
  type ActivityPage,
  type ActivityQuery,
} from "../domain/activity";

const DATE_TIME = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Santiago",
});

/** Panel administrativo · Historial de actividad (RF-27, RF-34). Solo Administrador. */
export function ActivityLogScreen({ page, query }: { page: ActivityPage; query: ActivityQuery }) {
  const filtered = Boolean(query.area || query.actor || query.from || query.to);
  const areaOptions = [
    { value: "", label: "Todas las áreas" },
    ...ACTIVITY_AREAS.map((area) => ({
      value: area,
      label: `${ACTIVITY_AREA_LABEL[area]} (${page.byArea[area]})`,
    })),
  ];
  const actorOptions = [
    { value: "", label: "Todos" },
    ...page.actors.map((actor) => ({
      value: actor.id,
      label: `${actor.name} · ${actor.role}${actor.active ? "" : " (inactiva)"}`,
    })),
  ];

  return (
    <>
      <AdminPageHeading
        title="Historial de actividad"
        description="Cambios hechos por el equipo en pedidos, pagos, reembolsos, catálogo, inventario, configuración, solicitudes, correos, suscriptores, usuarios y exportaciones, con responsable, fecha y motivo."
      />
      <AdminMuted>
        Los eventos automáticos y los del comprador se ven en el detalle de cada pedido o solicitud.
        Los ingresos al panel no se listan.
      </AdminMuted>

      <FilterBar label="Filtrar actividad">
        <SelectField
          label="Área"
          name="area"
          defaultValue={query.area ?? ""}
          options={areaOptions}
        />
        <SelectField
          label="Responsable"
          name="responsable"
          defaultValue={query.actor ?? ""}
          options={actorOptions}
        />
        <TextField
          label="Desde"
          name="desde"
          type="date"
          defaultValue={query.from ?? ""}
          className="w-44"
        />
        <TextField
          label="Hasta"
          name="hasta"
          type="date"
          defaultValue={query.to ?? ""}
          className="w-44"
        />
      </FilterBar>

      <AdminPanel
        flush
        title="Actividad"
        description={
          filtered
            ? `${page.total} cambio${page.total === 1 ? "" : "s"} con estos filtros.`
            : `${page.total} cambio${page.total === 1 ? "" : "s"} registrado${page.total === 1 ? "" : "s"}, del más reciente al más antiguo.`
        }
        actions={
          filtered ? (
            <Link href="/admin/actividad" className={TEXT_ACTION}>
              Quitar filtros
            </Link>
          ) : null
        }
      >
        <DataTable
          caption="Historial de actividad"
          columns={[
            { key: "date", label: "Fecha" },
            { key: "actor", label: "Responsable" },
            { key: "area", label: "Área" },
            { key: "action", label: "Acción" },
          ]}
          rows={page.entries.map((entry) => {
            const href = entry.reference ? activityHref(entry.reference) : null;
            return {
              key: entry.id,
              cells: {
                date: (
                  <time dateTime={entry.at} className="whitespace-nowrap">
                    {DATE_TIME.format(new Date(entry.at))}
                  </time>
                ),
                actor: (
                  <span className="flex flex-col">
                    <strong>{entry.actorName ?? entry.actorLabel}</strong>
                    {entry.actorName ? (
                      <span className="text-xs text-text-secondary">{entry.actorLabel}</span>
                    ) : null}
                  </span>
                ),
                area: entry.area ? (
                  <StatusBadge tone="neutral">{ACTIVITY_AREA_LABEL[entry.area]}</StatusBadge>
                ) : (
                  "—"
                ),
                action: (
                  <span className="flex min-w-64 flex-col gap-1 whitespace-normal">
                    <span>{entry.description}</span>
                    {entry.reason ? (
                      <span className="text-sm text-text-secondary">Motivo: {entry.reason}</span>
                    ) : null}
                    {entry.reference && href ? (
                      <Link
                        href={href as Route}
                        className="self-start text-sm font-extrabold text-brand-blue underline-offset-4 hover:underline"
                      >
                        Ver {entry.reference.label}
                      </Link>
                    ) : entry.reference ? (
                      <span className="text-sm text-text-secondary">{entry.reference.label}</span>
                    ) : null}
                  </span>
                ),
              },
            };
          })}
          empty={
            filtered
              ? "No hay cambios con estos filtros."
              : "Todavía no hay cambios del equipo. Aparecerán al gestionar pedidos, catálogo, configuración, solicitudes o usuarios."
          }
          footer={`Página ${page.page} de ${page.pageCount}`}
        />
      </AdminPanel>

      <PaginationNav
        page={page.page}
        pageCount={page.pageCount}
        label="Páginas del historial"
        hrefFor={(n) => `/admin/actividad${toActivitySearch({ ...query, page: n })}` as Route}
      />
    </>
  );
}
