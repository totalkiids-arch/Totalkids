import type { Route } from "next";
import Link from "next/link";

import { formatChileDateTime } from "@/shared/lib/chile-time";
import { DataTable, TEXT_ACTION } from "@/shared/ui/admin/data-table";
import { FilterBar } from "@/shared/ui/admin/filter-bar";
import { InfoNote, LiveNotice } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { AdminMuted, AdminPanel } from "@/shared/ui/admin/panel";
import { StatusBadge } from "@/shared/ui/admin/status-badge";
import { Button, buttonClasses } from "@/shared/ui/button";
import { SelectField } from "@/shared/ui/form";

import { subscriberAdmin } from "../container";
import {
  filterSubscribers,
  parseSubscriberQuery,
  SUBSCRIBER_STATUS_LABEL,
  type SubscriberFilter,
} from "../domain/subscriber";
import { CONSENT_TEXT, CONSENT_VERSION } from "../domain/subscription";
import { unsubscribeSubscriberAction } from "./admin/subscriber-actions";

type Params = Record<string, string | string[] | undefined>;

const NOTICES: Record<string, { message: string; tone: "success" | "warning" }> = {
  baja: {
    message:
      "Baja registrada. El registro se conserva con la fecha de baja y ya no recibe correos.",
    tone: "success",
  },
  "ya-de-baja": { message: "Ese suscriptor ya estaba dado de baja.", tone: "warning" },
  "no-existe": { message: "Ese suscriptor ya no existe.", tone: "warning" },
  "sin-permiso": { message: "Solo el Administrador registra bajas.", tone: "warning" },
  ilegible: { message: "No pudimos leer el formulario. Recarga la página.", tone: "warning" },
};

const FILTER_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "activos", label: "Activos" },
  { value: "bajas", label: "Dados de baja" },
];

const withFilter = (filter: SubscriberFilter | null, extra: Record<string, string> = {}) => {
  const params = new URLSearchParams(extra);
  if (filter) params.set("estado", filter);
  const text = params.toString();
  return text ? `?${text}` : "";
};

/**
 * Panel administrativo · Suscriptores (RF-25, RF-29, RF-35). Solo
 * Administrador: la página la envuelve en AdminSectionGate.
 */
export async function SubscribersScreen({ searchParams = {} }: { searchParams?: Params }) {
  const query = parseSubscriberQuery(searchParams);
  const all = await subscriberAdmin.list();
  const rows = filterSubscribers(all, query.filter);
  const activeCount = all.filter((s) => s.status === "active").length;
  const confirming = all.find((s) => s.id === query.confirm && s.status === "active") ?? null;
  const aviso = searchParams.aviso;
  const notice = typeof aviso === "string" ? NOTICES[aviso] : undefined;

  return (
    <>
      <AdminPageHeading
        title="Suscriptores"
        description="Consentimiento explícito, versión del texto y baja de suscripción."
        actions={
          // Enlace normal (no <Link>): la respuesta es un archivo, no una página.
          <a
            href={`/admin/suscriptores/exportar${withFilter(query.filter)}`}
            className={buttonClasses({ variant: "outline" })}
          >
            Exportar CSV
          </a>
        }
      />
      {notice ? <LiveNotice message={notice.message} tone={notice.tone} /> : null}
      <InfoNote>
        Datos de ejemplo en la memoria del servidor: se borran al reiniciar. Las altas y bajas del
        formulario público también aparecen aquí. Texto vigente ({CONSENT_VERSION}): «{CONSENT_TEXT}
        »
      </InfoNote>

      {confirming ? (
        <AdminPanel id="confirmar" title={`¿Registrar la baja de ${confirming.email}?`}>
          <AdminMuted>
            Dejará de recibir correos de novedades. El registro no se borra: se conserva el
            consentimiento original y la fecha de baja, con tu rol como responsable.
          </AdminMuted>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <form action={unsubscribeSubscriberAction}>
              <input type="hidden" name="id" value={confirming.id} />
              {query.filter ? <input type="hidden" name="estado" value={query.filter} /> : null}
              <Button type="submit" variant="danger">
                Registrar baja
              </Button>
            </form>
            <Link
              href={`/admin/suscriptores${withFilter(query.filter)}` as Route}
              className={buttonClasses({ variant: "outline" })}
            >
              Cancelar
            </Link>
          </div>
        </AdminPanel>
      ) : null}

      <FilterBar label="Filtrar suscriptores">
        <SelectField
          label="Estado"
          name="estado"
          defaultValue={query.filter ?? ""}
          options={FILTER_OPTIONS}
        />
      </FilterBar>

      <AdminPanel
        flush
        title="Lista del newsletter"
        description={`${activeCount} activo${activeCount === 1 ? "" : "s"} de ${all.length}.`}
      >
        <DataTable
          caption="Suscriptores del newsletter"
          columns={[
            { key: "email", label: "Correo" },
            { key: "consent", label: "Fecha de consentimiento" },
            { key: "version", label: "Versión" },
            { key: "status", label: "Estado" },
            { key: "actions", label: "Acción" },
          ]}
          rows={rows.map((subscriber) => ({
            key: subscriber.id,
            cells: {
              email: <strong className="font-extrabold break-all">{subscriber.email}</strong>,
              consent: formatChileDateTime(subscriber.consentedAt),
              version: <span className="font-mono text-xs">{subscriber.consentVersion}</span>,
              status: (
                <StatusBadge tone={subscriber.status === "active" ? "green" : "red"}>
                  {SUBSCRIBER_STATUS_LABEL[subscriber.status]}
                </StatusBadge>
              ),
              actions:
                subscriber.status === "active" ? (
                  <Link
                    href={
                      `/admin/suscriptores${withFilter(query.filter, { baja: subscriber.id })}#confirmar` as Route
                    }
                    className={TEXT_ACTION}
                    aria-label={`Registrar baja de ${subscriber.email}`}
                  >
                    Registrar baja
                  </Link>
                ) : (
                  <span className="text-[13px] whitespace-normal text-text-secondary">
                    Baja el{" "}
                    {subscriber.unsubscribedAt
                      ? formatChileDateTime(subscriber.unsubscribedAt)
                      : "—"}
                    {subscriber.unsubscribedBy ? ` · ${subscriber.unsubscribedBy}` : ""}
                  </span>
                ),
            },
          }))}
          empty={
            query.filter ? (
              <>
                No hay suscriptores con ese filtro.{" "}
                <Link
                  href="/admin/suscriptores"
                  className="font-extrabold text-brand-blue underline"
                >
                  Ver todos
                </Link>
              </>
            ) : (
              "Todavía no hay suscriptores."
            )
          }
        />
      </AdminPanel>
      <AdminMuted>
        La exportación de suscriptores está disponible únicamente para el administrador. El CSV
        incluye solo correo, fechas, versión del texto y estado.
      </AdminMuted>
    </>
  );
}
