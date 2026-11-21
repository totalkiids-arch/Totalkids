import type { Route } from "next";
import Link from "next/link";

import { adminNav } from "@/shared/config/routes";
import { CellTitle, DataTable, TEXT_ACTION } from "@/shared/ui/admin/data-table";
import { InfoNote, LiveNotice } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { AdminPanel } from "@/shared/ui/admin/panel";
import { ActiveBadge, StatusBadge } from "@/shared/ui/admin/status-badge";
import { ButtonLink } from "@/shared/ui/button";
import { PlusIcon } from "@/shared/ui/icons";

import { userAdmin } from "../container";
import {
  ADMIN_ROLE_LABEL,
  ADMIN_ROLES,
  ADMIN_SECTIONS,
  canAccessSection,
  type AdminSection,
} from "../domain/admin-role";
import { LAST_ADMIN, sortUsers } from "../domain/internal-user";
import { UserForm } from "./user-form";
import type { SaveUserAction, ToggleUserAction } from "./user-form-handlers";

type Params = Record<string, string | string[] | undefined>;

const param = (params: Params, name: string) => {
  const value = params[name];
  return (Array.isArray(value) ? value[0] : value) ?? "";
};

const NOTICES: Record<string, { message: string; tone: "success" | "warning" }> = {
  creado: { message: "Usuario agregado.", tone: "success" },
  guardado: { message: "Cambios guardados.", tone: "success" },
  activado: { message: "Cuenta activada.", tone: "success" },
  desactivado: {
    message: "Cuenta desactivada: ya no podrá ingresar al panel. Su historial se conserva.",
    tone: "success",
  },
  "ultimo-admin": { message: LAST_ADMIN, tone: "warning" },
  "no-existe": { message: "Esa cuenta ya no existe.", tone: "warning" },
};

const isSection = (value: string): value is AdminSection =>
  (ADMIN_SECTIONS as readonly string[]).includes(value);

/**
 * Matriz de permisos: sale de la misma regla que arma el menú y protege cada
 * pantalla (canAccessSection), así no puede desalinearse con lo que se ve.
 */
const PERMISSION_ROWS = [
  ...adminNav.flatMap((item) =>
    isSection(item.section)
      ? [
          {
            key: item.section,
            label: item.label,
            allowed: (role: (typeof ADMIN_ROLES)[number]) =>
              canAccessSection(role, item.section as AdminSection),
          },
        ]
      : [],
  ),
  {
    key: "exportar",
    label: "Exportar CSV (pedidos, ventas, solicitudes, suscriptores)",
    allowed: (role: (typeof ADMIN_ROLES)[number]) => role === "admin",
  },
];

/** Panel administrativo · Usuarios y roles (RF-31). */
export async function UsersScreen({
  searchParams = {},
  saveAction,
  toggleAction,
}: {
  searchParams?: Params;
  /** Server Actions con la sesión; las arma la página (users no depende de auth). */
  saveAction: SaveUserAction;
  toggleAction: ToggleUserAction;
}) {
  const users = sortUsers(await userAdmin.list());
  const editing = users.find((u) => u.id === param(searchParams, "editar")) ?? null;
  const notice = NOTICES[param(searchParams, "aviso")];
  const activeAdmins = users.filter((u) => u.active && u.role === "admin").length;

  return (
    <>
      <AdminPageHeading
        title="Usuarios y roles"
        description="Cuentas internas del panel y qué puede hacer cada rol."
        actions={
          <ButtonLink href={"/admin/usuarios#editor" as Route}>
            <PlusIcon size={18} />
            Agregar usuario
          </ButtonLink>
        }
      />
      {notice ? <LiveNotice message={notice.message} tone={notice.tone} /> : null}
      <InfoNote>
        Datos de ejemplo: los cambios se borran al reiniciar el sistema. El ingreso al panel sigue
        siendo por rol de demostración; las cuentas reales y sus contraseñas llegan con LN-04.
      </InfoNote>

      <AdminPanel
        flush
        title="Cuentas internas"
        description={`${users.length} cuenta${users.length === 1 ? "" : "s"} · ${activeAdmins} Administrador${activeAdmins === 1 ? "" : "es"} activo${activeAdmins === 1 ? "" : "s"}.`}
      >
        <DataTable
          caption="Cuentas internas"
          columns={[
            { key: "name", label: "Nombre" },
            { key: "role", label: "Rol" },
            { key: "status", label: "Estado" },
            { key: "actions", label: "Acciones" },
          ]}
          rows={users.map((user) => ({
            key: user.id,
            cells: {
              name: <CellTitle title={user.name} meta={user.email} />,
              role: (
                <StatusBadge tone={user.role === "admin" ? "blue" : "neutral"}>
                  {ADMIN_ROLE_LABEL[user.role]}
                </StatusBadge>
              ),
              status: <ActiveBadge active={user.active} feminine />,
              actions: (
                <span className="flex flex-wrap items-center gap-1">
                  <Link
                    href={`/admin/usuarios?editar=${encodeURIComponent(user.id)}#editor` as Route}
                    className={TEXT_ACTION}
                    aria-label={`Editar ${user.name}`}
                  >
                    Editar
                  </Link>
                  <form action={toggleAction}>
                    <input type="hidden" name="id" value={user.id} />
                    <input type="hidden" name="active" value={user.active ? "0" : "1"} />
                    <button
                      type="submit"
                      className={TEXT_ACTION}
                      aria-label={`${user.active ? "Desactivar" : "Activar"} ${user.name}`}
                    >
                      {user.active ? "Desactivar" : "Activar"}
                    </button>
                  </form>
                </span>
              ),
            },
          }))}
          empty="Todavía no hay cuentas internas."
          footer={`${users.length} cuenta${users.length === 1 ? "" : "s"} · Las cuentas no se eliminan: se desactivan · Datos de demostración`}
        />
      </AdminPanel>

      <AdminPanel
        flush
        title="Permisos por rol"
        description="Lo que ve cada rol en el panel. La autorización real la aplicará el backend en cada operación (LN-04)."
      >
        <DataTable
          caption="Permisos por rol"
          columns={[
            { key: "section", label: "Sección" },
            ...ADMIN_ROLES.map((role) => ({ key: role, label: ADMIN_ROLE_LABEL[role] })),
          ]}
          rows={PERMISSION_ROWS.map((row) => ({
            key: row.key,
            cells: {
              section: row.label,
              ...Object.fromEntries(
                ADMIN_ROLES.map((role) => [
                  role,
                  row.allowed(role) ? (
                    <StatusBadge tone="green">Acceso</StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">Sin acceso</StatusBadge>
                  ),
                ]),
              ),
            },
          }))}
          footer="El Operador que abre una sección sin acceso ve un aviso de acceso restringido."
        />
      </AdminPanel>

      <AdminPanel
        id="editor"
        title={editing ? `Editar «${editing.name}»` : "Nuevo usuario"}
        description="Los cambios quedan en el historial de actividad."
      >
        {/* key: al cambiar de cuenta el formulario parte con sus datos. */}
        <UserForm key={editing?.id ?? "nuevo"} editing={editing} action={saveAction} />
      </AdminPanel>
    </>
  );
}
