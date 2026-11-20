import type { Route } from "next";
import Link from "next/link";

import { getAdminSession } from "@/features/auth";
import { formatChileDateTime } from "@/shared/lib/chile-time";
import { CellTitle, DataTable, TEXT_ACTION } from "@/shared/ui/admin/data-table";
import { FilterBar } from "@/shared/ui/admin/filter-bar";
import { InfoNote, LiveNotice } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { AdminMuted, AdminPanel } from "@/shared/ui/admin/panel";
import { SelectField, TextField } from "@/shared/ui/form";

import { emailLog } from "../container";
import {
  ATTEMPT_RESULT_LABEL,
  canResend,
  EMAIL_EVENT_LABEL,
  EMAIL_EVENTS,
  EMAIL_STATUS_LABEL,
  EMAIL_STATUSES,
  emailPreview,
  emailQueryString,
  filterEmails,
  parseEmailQuery,
  referenceLabel,
  type EmailQuery,
  type EmailRecord,
  type EmailReference,
} from "../domain/email-log";
import { resendEmailAction } from "./email-actions";
import { EmailStatusBadge } from "./email-status-badge";
import { EmailTemplatePreview } from "./email-template-preview";

type Params = Record<string, string | string[] | undefined>;

const NOTICES: Record<string, { message: string; tone: "success" | "warning" }> = {
  reenviado: {
    message:
      "Reenvío simulado y registrado: se sumó un intento manual y un registro vinculado. No se envió un correo real y el pedido no cambió.",
    tone: "success",
  },
  "no-permitido": {
    message: "Solo se reenvía un correo fallido o con resultado incierto.",
    tone: "warning",
  },
  "sin-permiso": { message: "Solo el Administrador puede reenviar correos.", tone: "warning" },
  ilegible: { message: "No pudimos leer el formulario. Recarga la página.", tone: "warning" },
};

const EVENT_OPTIONS = [
  { value: "", label: "Todos los eventos" },
  ...EMAIL_EVENTS.map((e) => ({ value: e, label: EMAIL_EVENT_LABEL[e] })),
];
const STATUS_OPTIONS = [
  { value: "", label: "Todos los estados" },
  ...EMAIL_STATUSES.map((s) => ({ value: s, label: EMAIL_STATUS_LABEL[s] })),
];

/** Plantilla que se muestra si no hay un correo abierto (la de la maqueta). */
const DEFAULT_PREVIEW = {
  event: "purchase_confirmed",
  reference: { kind: "order", id: "TK-1048" },
} as const;

const filtersOf = (query: EmailQuery) => ({
  event: query.event,
  status: query.status,
  order: query.order,
});

/** Enlace a la ficha de la referencia en el panel. El correo no la modifica. */
function referenceHref(reference: EmailReference): Route | null {
  if (!reference) return null;
  return reference.kind === "order"
    ? (`/admin/pedidos/${reference.id}` as Route)
    : (`/admin/solicitudes?id=${reference.id}#detalle` as Route);
}

function ResendForm({ record, query }: { record: EmailRecord; query: EmailQuery }) {
  return (
    <form action={resendEmailAction}>
      <input type="hidden" name="id" value={record.id} />
      {query.event ? <input type="hidden" name="evento" value={query.event} /> : null}
      {query.status ? <input type="hidden" name="estado" value={query.status} /> : null}
      {query.order ? <input type="hidden" name="pedido" value={query.order} /> : null}
      <button
        type="submit"
        className={TEXT_ACTION}
        aria-label={`Simular reenvío de ${EMAIL_EVENT_LABEL[record.event]} a ${record.recipient}`}
      >
        Simular reenvío
      </button>
    </form>
  );
}

function AttemptHistory({
  record,
  detailHref,
}: {
  record: EmailRecord;
  detailHref: (id: string) => Route;
}) {
  if (record.attempts.length === 0) {
    return <AdminMuted>Todavía no hay intentos: el correo está en la cola.</AdminMuted>;
  }
  return (
    <ol className="flex flex-col gap-3 border-l-2 border-border pl-4">
      {record.attempts.map((attempt, index) => (
        <li key={`${attempt.at}-${index}`} className="text-sm">
          <p className="font-bold">
            Intento {index + 1} · {attempt.kind === "manual" ? "Reenvío manual" : "Automático"}:{" "}
            {ATTEMPT_RESULT_LABEL[attempt.result]}
          </p>
          <AdminMuted>
            {formatChileDateTime(attempt.at)}
            {attempt.actor ? ` · ${attempt.actor}` : " · Sistema"}
            {attempt.detail ? ` · ${attempt.detail}` : ""}
          </AdminMuted>
          {attempt.resendRecordId ? (
            <Link href={detailHref(attempt.resendRecordId)} className={TEXT_ACTION}>
              Ver registro del reenvío #{attempt.resendRecordId}
            </Link>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** Panel administrativo · Correos (RF-20, RF-21). Administrador y Operador; reenvía solo el Administrador. */
export async function EmailsScreen({ searchParams = {} }: { searchParams?: Params }) {
  const query = parseEmailQuery(searchParams);
  const [log, session] = await Promise.all([emailLog.list(), getAdminSession()]);
  const isAdmin = session?.role === "admin";
  const rows = filterEmails(log, filtersOf(query));
  const selected = query.id ? (log.find((r) => r.id === query.id) ?? null) : null;
  const filtered = Boolean(query.event || query.status || query.order);
  const aviso = searchParams.aviso;
  const notice = typeof aviso === "string" ? NOTICES[aviso] : undefined;
  const detailHref = (id: string) =>
    `/admin/correos${emailQueryString({ ...filtersOf(query), id })}#detalle` as Route;
  const preview = selected ?? DEFAULT_PREVIEW;
  const selectedRef = selected ? referenceHref(selected.reference) : null;

  return (
    <>
      <AdminPageHeading
        title="Correos transaccionales"
        description="Consulta entregas e intentos de cada correo. Un correo fallido no cambia el estado del pedido."
      />
      {notice ? <LiveNotice message={notice.message} tone={notice.tone} /> : null}
      {query.id && !selected ? (
        <LiveNotice message="Ese registro de correo no existe." tone="warning" />
      ) : null}
      <InfoNote>
        <strong>No se envían correos reales.</strong> Registro de ejemplo en la memoria del
        servidor: se borra al reiniciar. «Simular reenvío» solo registra el intento.
        {isAdmin ? "" : " El reenvío manual es solo para el Administrador."}
      </InfoNote>

      <FilterBar label="Filtrar correos">
        <SelectField
          label="Evento"
          name="evento"
          defaultValue={query.event ?? ""}
          options={EVENT_OPTIONS}
        />
        <SelectField
          label="Estado"
          name="estado"
          defaultValue={query.status ?? ""}
          options={STATUS_OPTIONS}
        />
        <TextField
          label="Pedido"
          name="pedido"
          defaultValue={query.order ?? ""}
          placeholder="TK-1048"
          autoComplete="off"
          className="w-40"
        />
      </FilterBar>

      <AdminPanel
        flush
        title={query.order ? `Correos del pedido #${query.order}` : "Registro de correos"}
        description="Envío inicial y hasta 3 reintentos automáticos (1, 5 y 15 min). Un timeout queda como incierto."
      >
        <DataTable
          caption="Registro de correos transaccionales"
          columns={[
            { key: "event", label: "Evento / referencia" },
            { key: "recipient", label: "Destinatario" },
            { key: "status", label: "Estado" },
            { key: "attempts", label: "Intentos", align: "end" },
            { key: "actions", label: "Acción" },
          ]}
          rows={rows.map((record) => ({
            key: record.id,
            cells: {
              event: (
                <CellTitle
                  title={EMAIL_EVENT_LABEL[record.event]}
                  meta={
                    <>
                      #{record.id} · {referenceLabel(record.reference)}
                      {record.resendOf ? ` · Reenvío de #${record.resendOf}` : ""}
                    </>
                  }
                />
              ),
              recipient: <span className="break-all whitespace-normal">{record.recipient}</span>,
              status: <EmailStatusBadge status={record.status} />,
              attempts: record.attempts.length,
              actions: (
                <span className="flex flex-wrap items-center gap-1">
                  <Link
                    href={detailHref(record.id)}
                    className={TEXT_ACTION}
                    aria-label={`Ver intentos del correo ${record.id}`}
                    aria-current={selected?.id === record.id ? "true" : undefined}
                  >
                    Ver intentos
                  </Link>
                  {isAdmin && canResend(record) ? (
                    <ResendForm record={record} query={query} />
                  ) : null}
                </span>
              ),
            },
          }))}
          empty={
            filtered ? (
              <>
                No hay correos con esos filtros.{" "}
                <Link href="/admin/correos" className="font-extrabold text-brand-blue underline">
                  Ver todos
                </Link>
              </>
            ) : (
              "Todavía no hay correos registrados."
            )
          }
          footer={`${rows.length} correo${rows.length === 1 ? "" : "s"} · Datos de demostración`}
        />
      </AdminPanel>

      {selected ? (
        <AdminPanel
          id="detalle"
          title={`Correo #${selected.id}: ${EMAIL_EVENT_LABEL[selected.event]}`}
          description={`${referenceLabel(selected.reference)} · Para ${selected.recipient} · Registrado el ${formatChileDateTime(selected.createdAt)}`}
          actions={<EmailStatusBadge status={selected.status} />}
        >
          <div className="mb-4 flex flex-wrap items-center gap-1">
            {selectedRef ? (
              <Link href={selectedRef} className={TEXT_ACTION}>
                Abrir {selected.reference?.kind === "request" ? "solicitud" : "pedido"} #
                {selected.reference?.id}
              </Link>
            ) : null}
            {selected.resendOf ? (
              <Link href={detailHref(selected.resendOf)} className={TEXT_ACTION}>
                Ver correo original #{selected.resendOf}
              </Link>
            ) : null}
            {isAdmin && canResend(selected) ? <ResendForm record={selected} query={query} /> : null}
          </div>
          <h3 className="mb-3 font-extrabold">Historial de intentos</h3>
          <AttemptHistory record={selected} detailHref={detailHref} />
          <p className="mt-4 text-[13px] text-text-secondary">
            Clave del evento: <span className="font-mono break-all">{selected.eventKey}</span>. El
            reenvío no modifica el pedido ni la solicitud.
          </p>
        </AdminPanel>
      ) : null}

      <AdminPanel
        title="Vista previa de la plantilla"
        description={
          selected
            ? `${EMAIL_EVENT_LABEL[selected.event]} · ${referenceLabel(selected.reference)}`
            : "Compra confirmada · Pedido #TK-1048. Abre un correo para ver su plantilla."
        }
      >
        <EmailTemplatePreview
          preview={emailPreview(preview)}
          recipient={selected?.recipient ?? "camila@example.com"}
        />
      </AdminPanel>
    </>
  );
}
