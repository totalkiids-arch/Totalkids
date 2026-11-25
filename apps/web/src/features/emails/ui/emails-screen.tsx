import type { Route } from "next";
import Link from "next/link";

import { getAdminSession } from "@/features/auth";
import { formatChileDateTime } from "@/shared/lib/chile-time";
import { CellTitle, DataTable, TEXT_ACTION } from "@/shared/ui/admin/data-table";
import { FilterBar } from "@/shared/ui/admin/filter-bar";
import { LiveNotice } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { PaginationNav } from "@/shared/ui/admin/pagination-nav";
import { AdminMuted, AdminPanel } from "@/shared/ui/admin/panel";
import { StatCard, StatGrid } from "@/shared/ui/admin/stat-card";
import { SelectField, TextField } from "@/shared/ui/form";

import { emailLog } from "../container";
import {
  EMAIL_EVENT_LABEL,
  EMAIL_EVENTS,
  EMAIL_STATUS_LABEL,
  EMAIL_STATUSES,
  emailPreview,
  emailQueryString,
  parseEmailQuery,
  referenceLabel,
  type EmailDetail,
  type EmailQuery,
  type EmailReference,
  type EmailSummary,
} from "../domain/email-log";
import { resendEmailAction } from "./email-actions";
import { EmailStatusBadge } from "./email-status-badge";
import { EmailTemplatePreview } from "./email-template-preview";

type Params = Record<string, string | string[] | undefined>;

const NOTICES: Record<string, { message: string; tone: "success" | "warning" }> = {
  reenviado: {
    message:
      "Reenvío encolado: se creó un registro vinculado y se hará un único intento, registrado con tu nombre. El pedido o la solicitud no cambian.",
    tone: "success",
  },
  "no-permitido": {
    message:
      "Este correo no se puede reenviar: solo uno fallido o incierto y sin otro reenvío en curso. La recuperación de contraseña se pide de nuevo desde el ingreso al panel.",
    tone: "warning",
  },
  "no-existe": { message: "Ese registro de correo ya no existe.", tone: "warning" },
  "sin-permiso": { message: "Solo el Administrador puede reenviar correos.", tone: "warning" },
  ilegible: { message: "No pudimos leer el formulario. Recarga la página.", tone: "warning" },
  error: {
    message: "No pudimos pedir el reenvío. Revisa tu sesión o intenta de nuevo en unos minutos.",
    tone: "warning",
  },
};

const EVENT_OPTIONS = [
  { value: "", label: "Todos los eventos" },
  ...EMAIL_EVENTS.map((e) => ({ value: e, label: EMAIL_EVENT_LABEL[e] })),
];
const STATUS_OPTIONS = [
  { value: "", label: "Todos los estados" },
  ...EMAIL_STATUSES.map((s) => ({ value: s, label: EMAIL_STATUS_LABEL[s] })),
];

/** Enlace a la ficha de la referencia en el panel. El correo no la modifica. */
function referenceHref(reference: EmailReference): Route | null {
  if (!reference) return null;
  return reference.kind === "order"
    ? (`/admin/pedidos/${encodeURIComponent(reference.label)}` as Route)
    : (`/admin/solicitudes?id=${encodeURIComponent(reference.label)}#detalle` as Route);
}

function ResendForm({ record, volver }: { record: EmailSummary; volver: string }) {
  return (
    <form action={resendEmailAction}>
      <input type="hidden" name="id" value={record.id} />
      <input type="hidden" name="volver" value={volver} />
      <button
        type="submit"
        className={TEXT_ACTION}
        aria-label={`Reenviar ${EMAIL_EVENT_LABEL[record.event]} a ${record.recipient}`}
      >
        Reenviar
      </button>
    </form>
  );
}

function AttemptHistory({ record }: { record: EmailDetail }) {
  if (record.attempts.length === 0) {
    return <AdminMuted>Todavía no hay intentos: el correo está en la cola.</AdminMuted>;
  }
  return (
    <ol className="flex flex-col gap-3 border-l-2 border-border pl-4">
      {record.attempts.map((attempt, index) => (
        <li key={`${attempt.at}-${index}`} className="text-sm">
          <p className="font-bold">
            Intento {index + 1} · {attempt.kind === "manual" ? "Reenvío manual" : "Automático"}:{" "}
            {attempt.resultLabel}
          </p>
          <AdminMuted>
            {formatChileDateTime(attempt.at)}
            {attempt.kind === "manual"
              ? ` · ${[attempt.actorName, attempt.actorLabel].filter(Boolean).join(" · ") || "Equipo"}`
              : " · Sistema"}
            {attempt.detail ? ` · ${attempt.detail}` : ""}
          </AdminMuted>
        </li>
      ))}
    </ol>
  );
}

/** Panel administrativo · Correos (RF-20, RF-21). Administrador y Operador; reenvía solo el Administrador. */
export async function EmailsScreen({ searchParams = {} }: { searchParams?: Params }) {
  const query = parseEmailQuery(searchParams);
  const [result, selected, session] = await Promise.all([
    emailLog.list(query),
    query.id ? emailLog.get(query.id) : Promise.resolve(null),
    getAdminSession(),
  ]);
  const isAdmin = session?.role === "admin";
  const filters: Partial<EmailQuery> = {
    event: query.event,
    status: query.status,
    order: query.order,
    request: query.request,
  };
  const filtered = Boolean(query.event || query.status || query.order || query.request);
  // Para volver al mismo listado (con página y detalle) después de reenviar.
  const volver = emailQueryString(query).slice(1);
  const aviso = searchParams.aviso;
  const notice = typeof aviso === "string" ? NOTICES[aviso] : undefined;
  const minutes = Number(searchParams.minutos);
  const detailHref = (id: string) =>
    `/admin/correos${emailQueryString({ ...filters, page: query.page, id })}#detalle` as Route;
  const selectedRef = selected ? referenceHref(selected.reference) : null;

  return (
    <>
      <AdminPageHeading
        title="Correos transaccionales"
        description="Consulta entregas e intentos de cada correo. Un correo fallido no cambia el estado del pedido."
      />
      {notice ? <LiveNotice message={notice.message} tone={notice.tone} /> : null}
      {aviso === "espera" ? (
        <LiveNotice
          message={`Demasiados reenvíos seguidos. Espera ${Number.isInteger(minutes) && minutes > 0 ? minutes : "unos"} minuto${minutes === 1 ? "" : "s"} e intenta de nuevo.`}
          tone="warning"
        />
      ) : null}
      {query.id && !selected ? (
        <LiveNotice message="Ese registro de correo no existe." tone="warning" />
      ) : null}
      {isAdmin ? null : <AdminMuted>El reenvío manual es solo para el Administrador.</AdminMuted>}

      <StatGrid label="Correos por estado">
        {EMAIL_STATUSES.map((status) => (
          <StatCard
            key={status}
            label={EMAIL_STATUS_LABEL[status]}
            value={result.counts[status]}
            note={filtered ? "Con los filtros actuales" : "Todo el registro"}
          />
        ))}
      </StatGrid>

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
        <TextField
          label="Solicitud"
          name="solicitud"
          defaultValue={query.request ?? ""}
          placeholder="SOL-1002"
          autoComplete="off"
          className="w-40"
        />
      </FilterBar>

      <AdminPanel
        flush
        title={
          query.order
            ? `Correos del pedido #${query.order}`
            : query.request
              ? `Correos de la solicitud #${query.request}`
              : "Registro de correos"
        }
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
          rows={result.rows.map((record) => ({
            key: record.id,
            cells: {
              event: (
                <CellTitle
                  title={EMAIL_EVENT_LABEL[record.event]}
                  meta={
                    <>
                      {formatChileDateTime(record.createdAt)} · {referenceLabel(record.reference)}
                      {record.resendOf ? " · Reenvío manual" : ""}
                    </>
                  }
                />
              ),
              recipient: <span className="break-all whitespace-normal">{record.recipient}</span>,
              status: <EmailStatusBadge status={record.status} />,
              attempts: record.attemptsCount,
              actions: (
                <span className="flex flex-wrap items-center gap-1">
                  <Link
                    href={detailHref(record.id)}
                    className={TEXT_ACTION}
                    aria-label={`Ver intentos del correo a ${record.recipient}`}
                    aria-current={selected?.id === record.id ? "true" : undefined}
                  >
                    Ver intentos
                  </Link>
                  {isAdmin && record.canResend ? (
                    <ResendForm record={record} volver={volver} />
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
          footer={`${result.total} correo${result.total === 1 ? "" : "s"} · página ${result.page} de ${result.pageCount}`}
        />
        <PaginationNav
          label="Páginas de correos"
          page={result.page}
          pageCount={result.pageCount}
          hrefFor={(page) => `/admin/correos${emailQueryString({ ...filters, page })}` as Route}
        />
      </AdminPanel>

      {selected ? (
        <AdminPanel
          id="detalle"
          title={`Correo: ${EMAIL_EVENT_LABEL[selected.event]}`}
          description={`${referenceLabel(selected.reference)} · Para ${selected.recipient} · Registrado el ${formatChileDateTime(selected.createdAt)}`}
          actions={<EmailStatusBadge status={selected.status} />}
        >
          <div className="mb-4 flex flex-wrap items-center gap-1">
            {selectedRef && selected.reference ? (
              <Link href={selectedRef} className={TEXT_ACTION}>
                Abrir {selected.reference.kind === "request" ? "solicitud" : "pedido"} #
                {selected.reference.label}
              </Link>
            ) : null}
            {selected.resendOf ? (
              <Link href={detailHref(selected.resendOf)} className={TEXT_ACTION}>
                Ver correo original
              </Link>
            ) : null}
            {isAdmin && selected.canResend ? (
              <ResendForm record={selected} volver={volver} />
            ) : null}
          </div>
          <h3 className="mb-3 font-extrabold">Historial de intentos</h3>
          <AttemptHistory record={selected} />
          {selected.resends.length > 0 ? (
            <>
              <h3 className="mt-6 mb-3 font-extrabold">Reenvíos manuales</h3>
              <ul className="flex flex-col gap-2 text-sm">
                {selected.resends.map((resend) => (
                  <li key={resend.id} className="flex flex-wrap items-center gap-2">
                    <Link href={detailHref(resend.id)} className={TEXT_ACTION}>
                      Reenvío del {formatChileDateTime(resend.createdAt)}
                    </Link>
                    <EmailStatusBadge status={resend.status} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
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
            : "Abre un correo para ver su plantilla."
        }
      >
        {selected ? (
          <EmailTemplatePreview preview={emailPreview(selected)} recipient={selected.recipient} />
        ) : (
          <AdminMuted>
            La vista previa muestra el contenido mínimo de cada evento con los datos del correo
            elegido.
          </AdminMuted>
        )}
      </AdminPanel>
    </>
  );
}
