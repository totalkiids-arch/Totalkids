import type { Route } from "next";
import Link from "next/link";

import { getAdminSession } from "@/features/auth";
import { formatChileDateTime } from "@/shared/lib/chile-time";
import { CellTitle, DataTable, TEXT_ACTION } from "@/shared/ui/admin/data-table";
import { ExportNotice } from "@/shared/ui/admin/export-notice";
import { FilterBar } from "@/shared/ui/admin/filter-bar";
import { LiveNotice } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { PaginationNav } from "@/shared/ui/admin/pagination-nav";
import { AdminMuted, AdminPanel } from "@/shared/ui/admin/panel";
import { StatCard, StatGrid } from "@/shared/ui/admin/stat-card";
import { buttonClasses } from "@/shared/ui/button";
import { SelectField, TextField } from "@/shared/ui/form";

import { serviceRequestAdmin } from "../container";
import {
  parseRequestQuery,
  QUERY_MAX,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUSES,
  requestQueryString,
  type AdminRequestDetail,
} from "../domain/service-request-admin";
import { SERVICES } from "../domain/services";
import { RequestFollowUpForm } from "./admin/request-follow-up-form";
import { RequestStatusBadge } from "./admin/request-status-badge";

type Params = Record<string, string | string[] | undefined>;

const NOTICES: Record<string, string> = {
  seguimiento: "Seguimiento guardado. El cambio quedó en el historial con tu nombre y la fecha.",
};

const SERVICE_OPTIONS = [
  { value: "", label: "Todos los servicios" },
  ...SERVICES.map((s) => ({ value: s.id, label: s.title })),
];
const STATUS_OPTIONS = [
  { value: "", label: "Todos los estados" },
  ...REQUEST_STATUSES.map((s) => ({ value: s, label: REQUEST_STATUS_LABEL[s] })),
];

/** Estados del registro de correos (los textos del panel de Correos). */
const EMAIL_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  sent: "Enviado",
  failed: "Fallido",
  uncertain: "Incierto",
};

const formatDay = (iso: string) => iso.split("-").reverse().join("-");

function RequestDetail({ request }: { request: AdminRequestDetail }) {
  const facts: [string, string | null][] = [
    ["Servicio", request.serviceLabel],
    ["Correo", request.email],
    ["Teléfono", request.phone],
    ["Comuna", request.commune],
    ["Edad de los niños", request.ages],
    ["Fecha preferida", request.preferredDate ? formatDay(request.preferredDate) : null],
    ["Recibida", formatChileDateTime(request.createdAt)],
  ];
  return (
    <>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="font-extrabold text-text-secondary">{label}</dt>
            <dd className="min-w-0 break-words">{value ?? "No indicado"}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mt-5 mb-2 font-extrabold">Mensaje</h3>
      {/* Texto del público: React lo escapa; se conservan los saltos de línea. */}
      <p className="rounded-lg bg-background px-4 py-3 break-words whitespace-pre-line">
        {request.message}
      </p>
    </>
  );
}

/** Panel administrativo · Solicitudes (RF-24, RF-29). Administrador y Operador. */
export async function ServiceRequestsScreen({ searchParams = {} }: { searchParams?: Params }) {
  const query = parseRequestQuery(searchParams);
  const [result, selected, session] = await Promise.all([
    serviceRequestAdmin.list(query),
    query.id ? serviceRequestAdmin.get(query.id) : Promise.resolve(null),
    getAdminSession(),
  ]);
  const isAdmin = session?.role === "admin";
  // Filtros sin página (exportación y «Ver todas»); con página (volver al mismo listado).
  const filters = requestQueryString({ service: query.service, status: query.status, q: query.q });
  const withPage = requestQueryString(query);
  const filtered = filters !== "";
  const aviso = searchParams.aviso;
  const notice = typeof aviso === "string" ? NOTICES[aviso] : undefined;
  const detailHref = (reference: string) =>
    `/admin/solicitudes${withPage ? `${withPage}&` : "?"}id=${encodeURIComponent(reference)}#detalle` as Route;

  return (
    <>
      <AdminPageHeading
        title="Solicitudes"
        description="Armado, diseño, personalización, instituciones, regalos y garantía."
        actions={
          isAdmin ? (
            // Enlace normal (no <Link>): la respuesta es un archivo, no una página.
            <a
              href={`/admin/solicitudes/exportar${filters}`}
              className={buttonClasses({ variant: "outline" })}
            >
              Exportar CSV
            </a>
          ) : null
        }
      />
      {notice ? <LiveNotice message={notice} /> : null}
      <ExportNotice aviso={aviso} />
      {query.id && !selected ? (
        <LiveNotice message="Esa solicitud no existe o ya no está disponible." tone="warning" />
      ) : null}

      <StatGrid label="Solicitudes por estado">
        {REQUEST_STATUSES.map((status) => (
          <StatCard
            key={status}
            label={REQUEST_STATUS_LABEL[status]}
            value={result.counts[status]}
            note={filtered ? "Con los filtros actuales" : "Todas las solicitudes"}
          />
        ))}
      </StatGrid>

      <FilterBar label="Filtrar solicitudes">
        <TextField
          label="Buscar"
          name="q"
          type="search"
          defaultValue={query.q}
          maxLength={QUERY_MAX}
          placeholder="SOL-1002, nombre o correo"
          className="min-w-0 flex-1 basis-60 sm:max-w-105"
        />
        <SelectField
          label="Servicio"
          name="servicio"
          defaultValue={query.service ?? ""}
          options={SERVICE_OPTIONS}
        />
        <SelectField
          label="Estado"
          name="estado"
          defaultValue={query.status ?? ""}
          options={STATUS_OPTIONS}
        />
      </FilterBar>

      <AdminPanel flush>
        <DataTable
          caption="Solicitudes de servicio"
          columns={[
            { key: "request", label: "Solicitud" },
            { key: "customer", label: "Cliente" },
            { key: "service", label: "Servicio" },
            { key: "status", label: "Estado" },
            { key: "actions", label: "Acción" },
          ]}
          rows={result.rows.map((request) => ({
            key: request.reference,
            cells: {
              request: (
                <CellTitle
                  title={<span className="font-mono">#{request.reference}</span>}
                  meta={formatChileDateTime(request.createdAt)}
                />
              ),
              customer: <CellTitle title={request.name} meta={request.email} />,
              service: (
                <CellTitle
                  title={request.serviceLabel}
                  meta={request.hasNote ? "Con nota interna" : undefined}
                />
              ),
              status: <RequestStatusBadge status={request.status} />,
              actions: (
                <Link
                  href={detailHref(request.reference)}
                  className={TEXT_ACTION}
                  aria-label={`Ver solicitud ${request.reference}`}
                  aria-current={selected?.reference === request.reference ? "true" : undefined}
                >
                  Ver solicitud
                </Link>
              ),
            },
          }))}
          empty={
            filtered ? (
              <>
                No hay solicitudes con esos filtros.{" "}
                <Link
                  href="/admin/solicitudes"
                  className="font-extrabold text-brand-blue underline"
                >
                  Ver todas
                </Link>
              </>
            ) : (
              "Todavía no hay solicitudes."
            )
          }
          footer={`${result.total} solicitud${result.total === 1 ? "" : "es"} · página ${result.page} de ${result.pageCount}`}
        />
        <PaginationNav
          label="Páginas de solicitudes"
          page={result.page}
          pageCount={result.pageCount}
          hrefFor={(page) => `/admin/solicitudes${requestQueryString({ ...query, page })}` as Route}
        />
      </AdminPanel>

      {selected ? (
        <AdminPanel
          id="detalle"
          title={`Solicitud #${selected.reference}`}
          description={`${selected.name} · ${selected.serviceLabel}`}
          actions={<RequestStatusBadge status={selected.status} />}
        >
          <div className="grid min-w-0 gap-8 lg:grid-cols-2">
            <div className="min-w-0">
              <RequestDetail request={selected} />
            </div>
            <div className="min-w-0">
              <h3 className="mb-3 font-extrabold">Seguimiento</h3>
              {/* key: al guardar, el formulario parte con los datos nuevos. */}
              <RequestFollowUpForm
                key={`${selected.reference}-${selected.history.length}`}
                requestId={selected.reference}
                status={selected.status}
                note={selected.note}
                options={selected.statusOptions}
                filters={withPage.slice(1)}
              />
            </div>
          </div>

          <h3 className="mt-8 mb-3 font-extrabold">Historial</h3>
          <ol className="flex flex-col gap-3 border-l-2 border-border pl-4">
            {[...selected.history].reverse().map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="text-sm">
                <p className="font-bold">{entry.change}</p>
                <AdminMuted>
                  {formatChileDateTime(entry.at)} ·{" "}
                  {entry.actorName ? `${entry.actorName} (${entry.actor})` : entry.actor}
                </AdminMuted>
              </li>
            ))}
          </ol>

          <h3 className="mt-8 mb-3 font-extrabold">Correos</h3>
          {selected.emails.length === 0 ? (
            <AdminMuted>Esta solicitud no tiene correos registrados.</AdminMuted>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {selected.emails.map((email) => (
                <li key={email.id}>
                  <Link
                    href={`/admin/correos?id=${encodeURIComponent(email.id)}#detalle` as Route}
                    className="font-bold text-brand-blue underline-offset-4 hover:underline"
                  >
                    {email.recipient}
                  </Link>{" "}
                  · {EMAIL_STATUS_LABEL[email.status] ?? email.status} ·{" "}
                  {formatChileDateTime(email.createdAt)}
                </li>
              ))}
            </ul>
          )}
        </AdminPanel>
      ) : (
        <AdminMuted>
          Selecciona una solicitud para consultar su mensaje y gestionar su seguimiento.
        </AdminMuted>
      )}
    </>
  );
}
