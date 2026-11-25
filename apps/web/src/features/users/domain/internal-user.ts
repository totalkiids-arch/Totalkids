import { z } from "zod";

import { isAdminRole, type AdminRole } from "./admin-role";

/**
 * Cuentas internas del panel (RF-31). Dominio puro.
 *
 * Regla principal: siempre debe quedar al menos un Administrador activo, para
 * que nadie pierda el acceso a usuarios y configuración, y nadie se quita el
 * rol ni se desactiva a sí mismo. La API aplica esas reglas (responde 409 con
 * el motivo). Las cuentas no se eliminan: se desactivan, así su historial sigue
 * teniendo sentido.
 */

export interface InternalUser {
  id: string;
  name: string;
  /** En minúsculas; único entre las cuentas internas. */
  email: string;
  role: AdminRole;
  active: boolean;
  /** Último ingreso al panel (ISO); null si nunca ingresó. */
  lastLoginAt: string | null;
  /** Es la cuenta de quien consulta. */
  isSelf: boolean;
}

export interface UserInput {
  name: string;
  email: string;
  role: string;
  active: boolean;
}

export type UserDraft = Pick<InternalUser, "name" | "email" | "role" | "active">;

export type FieldErrors = Partial<Record<"name" | "email" | "role" | "form", string>>;

export type UserValidation = { ok: true; draft: UserDraft } | { ok: false; errors: FieldErrors };

export const NAME_MAX = 120;

export const LAST_ADMIN =
  "Debe quedar al menos un Administrador activo. Asigna o activa otro antes de este cambio.";

const EmailSchema = z.email();

/**
 * Valida una cuenta nueva (`existing` null) o la edición de una existente.
 * `users` son todas las cuentas actuales (incluida la que se edita). La regla
 * del último Administrador la aplica la API.
 */
export function validateUser(
  input: UserInput,
  users: readonly InternalUser[],
  existing: InternalUser | null,
): UserValidation {
  const errors: FieldErrors = {};
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();

  if (!name) errors.name = "Ingresa el nombre.";
  else if (name.length > NAME_MAX) errors.name = `Usa como máximo ${NAME_MAX} caracteres.`;

  if (!email) errors.email = "Ingresa el correo.";
  else if (email.length > 254 || !EmailSchema.safeParse(email).success) {
    errors.email = "Escribe un correo válido, por ejemplo nombre@totalkids.cl.";
  } else if (users.some((u) => u.id !== existing?.id && u.email === email)) {
    errors.email = "Ya existe una cuenta con ese correo.";
  }

  if (!isAdminRole(input.role)) errors.role = "Elige un rol.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, draft: { name, email, role: input.role as AdminRole, active: input.active } };
}
