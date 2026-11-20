import type { Route } from "next";
import Link from "next/link";

import { getAdminSession } from "@/features/auth";
import { formatChileDateTime } from "@/shared/lib/chile-time";
import { CellTitle, DataTable, TEXT_ACTION } from "@/shared/ui/admin/data-table";
import { FilterBar } from "@/shared/ui/admin/filter-bar";
import { InfoNote, LiveNotice } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { AdminMuted, AdminPanel } from "@/shared/ui/admin/panel";
import { buttonClasses } from "@/shared/ui/button";
import { SelectField } from "@/shared/ui/form";

import { serviceRequestAdmin } from "../container";
import {
  filterRequests,
  parseRequestQuery,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUSES,
  requestQueryString,
  requestServiceLabel,
  requestStatusOptions,
  type AdminServiceRequest,
} from "../domain/service-request-admin";
import { SERVICES } from "../domain/services";
import { RequestFollowUpForm } from "./admin/request-follow-up-form";
import { RequestStatusBadge } from "./admin/request-status-badge";

type Params = Record<string, string | string[] | undefined>;

const NOTICES: Record<string, string> = {
  seguimiento: "Seguimiento guardado. El cambio quedó en el historial con tu rol y la fecha.",
};

const SERVICE_OPTIONS = [
  { value: "", label: "Todos los servicios" },
  ...SERVICES.map((s) => ({ value: s.id, label: s.title })),
];
const STATUS_OPTIONS = [
  { value: "", label: "Todos los estados" },
  ...REQUEST_STATUSES.map((s) => ({ value: s, label: REQUEST_STATUS_LABEL[s] })),
];

const formatDay = (iso: string) => iso.split("-").reverse().join("-");

function RequestDetail({ request }: { request: AdminServiceRequest }) {
  const facts: [string, string | null][] = [
    ["Servicio", requestServiceLabel(request.service)],
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
  const [all, session] = await Promise.all([serviceRequestAdmin.list(), getAdminSession()]);
  const isAdmin = session?.role === "admin";
  const rows = filterRequests(all, query);
  const selected = query.id ? (all.find((r) => r.id === query.id) ?? null) : null;
  const filters = requestQueryString(query);
  const filtered = filters !== "";
  const aviso = searchParams.aviso;
  const notice = typeof aviso === "string" ? NOTICES[aviso] : undefined;
  const detailHref = (id: string) =>
    `/admin/solicitudes${filters ? `${filters}&` : "?"}id=${encodeURIComponent(id)}#detalle` as Route;

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
      {query.id && !selected ? (
        <LiveNotice message="Esa solicitud no existe o ya no está disponible." tone="warning" />
      ) : null}
      <InfoNote>
        Datos de ejemplo en la memoria del servidor: se borran al reiniciar. Las solicitudes
        enviadas desde /servicios/solicitar también aparecen aquí. No se envían correos.
        {isAdmin ? "" : " La exportación es solo para el administrador."}
      </InfoNote>

      <FilterBar label="Filtrar solicitudes">
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
          rows={rows.map((request) => ({
            key: request.id,
            cells: {
              request: (
                <CellTitle
                  title={<span className="font-mono">#{request.id}</span>}
                  meta={formatChileDateTime(request.createdAt)}
                />
              ),
              customer: <CellTitle title={request.name} meta={request.email} />,
              service: requestServiceLabel(request.service),
              status: <RequestStatusBadge status={request.status} />,
              actions: (
                <Link
                  href={detailHref(request.id)}
                  className={TEXT_ACTION}
                  aria-label={`Ver solicitud ${request.id}`}
                  aria-current={selected?.id === request.id ? "true" : undefined}
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
          footer={`${rows.length} solicitud${rows.length === 1 ? "" : "es"} · Datos de demostración`}
        />
      </AdminPanel>

      {selected ? (
        <AdminPanel
          id="detalle"
          title={`Solicitud #${selected.id}`}
          description={`${selected.name} · ${requestServiceLabel(selected.service)}`}
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
                key={`${selected.id}-${selected.history.length}`}
                requestId={selected.id}
                status={selected.status}
                note={selected.note}
                options={requestStatusOptions(selected.status)}
                filters={filters.slice(1)}
              />
            </div>
          </div>

          <h3 className="mt-8 mb-3 font-extrabold">Historial</h3>
          <ol className="flex flex-col gap-3 border-l-2 border-border pl-4">
            {[...selected.history].reverse().map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="text-sm">
                <p className="font-bold">{entry.change}</p>
                <AdminMuted>
                  {formatChileDateTime(entry.at)} · {entry.actor}
                </AdminMuted>
              </li>
            ))}
          </ol>
        </AdminPanel>
      ) : (
        <AdminMuted>
          Selecciona una solicitud para consultar su mensaje y gestionar su seguimiento.
        </AdminMuted>
      )}
    </>
  );
}
