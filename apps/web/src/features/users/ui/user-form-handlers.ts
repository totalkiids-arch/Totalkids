import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { userAdmin } from "../container";
import { ADMIN_ROLE_LABEL, canAccessSection, type AdminRole } from "../domain/admin-role";
import type { FieldErrors } from "../domain/internal-user";

/*
 * Mutaciones de Usuarios y roles. Las Server Actions las arma la página
 * (/admin/usuarios) con el rol de la sesión: así "users" no depende de "auth"
 * (auth ya usa los roles de users). Cada manejador vuelve a comprobar el rol,
 * porque una acción se puede invocar sin pasar por la pantalla.
 * Sesión de DEMOSTRACIÓN; la autorización real la aplica el backend (LN-04).
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
  const result = await userAdmin.save(id || null, values, ADMIN_ROLE_LABEL[role]);
  if (!result.ok) return { values, errors: result.errors };

  revalidatePath(PATH);
  redirect(`${PATH}?aviso=${id ? "guardado" : "creado"}`);
}

const ToggleForm = z.object({ id: str(40).min(1), active: z.enum(["0", "1"]) });

export async function handleToggleUser(role: AdminRole | null, formData: FormData) {
  if (!canManage(role)) redirect("/admin");
  const parsed = ToggleForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(PATH);

  const result = await userAdmin.setActive(
    parsed.data.id,
    parsed.data.active === "1",
    ADMIN_ROLE_LABEL[role],
  );
  revalidatePath(PATH);
  if (result.ok) redirect(`${PATH}?aviso=${result.user.active ? "activado" : "desactivado"}`);
  redirect(`${PATH}?aviso=${result.reason === "last-admin" ? "ultimo-admin" : "no-existe"}`);
}
