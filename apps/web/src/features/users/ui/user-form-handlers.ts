import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { attemptPanel, isPanelFailure } from "@/shared/lib/panel-errors";

import { userAdmin } from "../container";
import { canAccessSection, type AdminRole } from "../domain/admin-role";
import { LAST_ADMIN, type FieldErrors } from "../domain/internal-user";

/*
 * Mutaciones de Usuarios y roles. Las Server Actions las arma la página
 * (/admin/usuarios) con el rol de la sesión: así "users" no depende de "auth"
 * (auth ya usa los roles de users). Cada manejador vuelve a comprobar el rol,
 * porque una acción se puede invocar sin pasar por la pantalla; la API vuelve a
 * autorizar, protege al último Administrador y registra quién hizo el cambio.
 */

const FORBIDDEN = "Tu rol no puede gestionar usuarios. Ingresa como Administrador.";
const UNREADABLE = "No pudimos leer el formulario. Recarga la página.";
const PATH = "/admin/usuarios";

const canManage = (role: AdminRole | null): role is AdminRole =>
  role !== null && canAccessSection(role, "usuarios");

export interface UserFormValues {
  name: string;
  email: string;
  role: string;
  active: boolean;
}

export interface UserFormState {
  values: UserFormValues;
  errors: FieldErrors;
}

/** Firma de la Server Action del formulario (la arma la página). */
export type SaveUserAction = (
  previous: UserFormState,
  formData: FormData,
) => Promise<UserFormState>;
export type ToggleUserAction = (formData: FormData) => Promise<void>;

const str = (max: number) => z.string().max(max);
const UserForm = z.object({ id: str(40), name: str(300), email: str(400), role: str(20) });

export async function handleSaveUser(
  role: AdminRole | null,
  previous: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  if (!canManage(role)) return { ...previous, errors: { form: FORBIDDEN } };
  const parsed = UserForm.safeParse({
    id: formData.get("id") ?? "",
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    role: formData.get("role") ?? "",
  });
  if (!parsed.success) return { ...previous, errors: { form: UNREADABLE } };

  const { id, ...rest } = parsed.data;
  const values = { ...rest, active: formData.get("active") === "1" };
  const result = await attemptPanel(() => userAdmin.save(id || null, values));
  if (isPanelFailure(result)) return { values, errors: { form: result.failed } };
  if (!result.ok) return { values, errors: result.errors };

  revalidatePath(PATH);
  if (!id) redirect(`${PATH}?aviso=${result.invitationSent ? "creado" : "creado-sin-invitacion"}`);
  redirect(`${PATH}?aviso=guardado&sesiones=${result.sessionsRevoked}`);
}

const ToggleForm = z.object({ id: str(40).min(1), active: z.enum(["0", "1"]) });

export async function handleToggleUser(role: AdminRole | null, formData: FormData) {
  if (!canManage(role)) redirect("/admin");
  const parsed = ToggleForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(PATH);

  const result = await attemptPanel(() =>
    userAdmin.setActive(parsed.data.id, parsed.data.active === "1"),
  );
  revalidatePath(PATH);
  if (isPanelFailure(result)) redirect(`${PATH}?aviso=error`);
  if (result.ok) {
    const notice = result.user.active ? "activado" : "desactivado";
    redirect(`${PATH}?aviso=${notice}&sesiones=${result.sessionsRevoked}`);
  }
  if (result.reason === "not-found") redirect(`${PATH}?aviso=no-existe`);
  redirect(`${PATH}?aviso=${result.message === LAST_ADMIN ? "ultimo-admin" : "propia-cuenta"}`);
}
