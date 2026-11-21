import { z } from "zod";

import { isAdminRole, type AdminRole } from "./admin-role";

/**
 * Cuentas internas del panel (RF-31). Dominio puro.
 *
 * Regla principal: siempre debe quedar al menos un Administrador activo, para
 * que nadie pierda el acceso a usuarios y configuración. Las cuentas no se
 * eliminan: se desactivan, así su historial sigue teniendo sentido.
 */

export interface InternalUser {
  id: string;
  name: string;
  /** En minúsculas; único entre las cuentas internas. */
  email: string;
  role: AdminRole;
  active: boolean;
}

export interface UserInput {
  name: string;
  email: string;
  role: string;
  active: boolean;
}

export type UserDraft = Omit<InternalUser, "id">;

export type FieldErrors = Partial<Record<"name" | "email" | "role" | "form", string>>;

export type UserValidation = { ok: true; draft: UserDraft } | { ok: false; errors: FieldErrors };

export const NAME_MAX = 120;

export const LAST_ADMIN =
  "Debe quedar al menos un Administrador activo. Asigna o activa otro antes de este cambio.";

const EmailSchema = z.email();

/** Cuántos Administradores activos quedan sin contar `exceptId`. */
function otherActiveAdmins(users: readonly InternalUser[], exceptId: string | null): number {
  return users.filter((u) => u.id !== exceptId && u.active && u.role === "admin").length;
}

/**
 * ¿El cambio deja al panel sin Administradores activos? Solo pasa si la cuenta
 * era Administrador activo y deja de serlo (cambia de rol o se desactiva).
 */
export function removesLastAdmin(
  users: readonly InternalUser[],
  existing: InternalUser | null,
  next: Pick<InternalUser, "role" | "active">,
): boolean {
  if (!existing || existing.role !== "admin" || !existing.active) return false;
  if (next.role === "admin" && next.active) return false;
  return otherActiveAdmins(users, existing.id) === 0;
}

/**
 * Valida una cuenta nueva (`existing` null) o la edición de una existente.
 * `users` son todas las cuentas actuales (incluida la que se edita).
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
  const role = input.role as AdminRole;

  if (removesLastAdmin(users, existing, { role, active: input.active })) {
    return { ok: false, errors: { form: LAST_ADMIN } };
  }
  return { ok: true, draft: { name, email, role, active: input.active } };
}

/** Administradores primero, luego activos, luego por nombre. */
export function sortUsers(users: readonly InternalUser[]): InternalUser[] {
  return [...users].sort(
    (a, b) =>
      Number(b.role === "admin") - Number(a.role === "admin") ||
      Number(b.active) - Number(a.active) ||
      a.name.localeCompare(b.name, "es"),
  );
}

/** Cambio registrado en una cuenta interna (para el historial de actividad, RF-34). */
export interface UserChange {
  /** Fecha y hora ISO. */
  at: string;
  /** Quién hizo el cambio (rol en la demo; lo pone el servidor, nunca el formulario). */
  actor: string;
  userId: string;
  detail: string;
}

const ROLE_TEXT: Record<AdminRole, string> = { admin: "Administrador", operator: "Operador" };

/** Describe qué cambió entre la cuenta anterior y la nueva ("Rol: Operador → Administrador"). */
export function describeUserChange(before: InternalUser | null, after: InternalUser): string {
  if (!before) {
    return `Cuenta creada: ${after.name} (${after.email}), ${ROLE_TEXT[after.role]}${after.active ? "" : ", inactiva"}.`;
  }
  const parts: string[] = [];
  if (before.name !== after.name) parts.push(`nombre «${before.name}» → «${after.name}»`);
  if (before.email !== after.email) parts.push(`correo ${before.email} → ${after.email}`);
  if (before.role !== after.role) {
    parts.push(`rol ${ROLE_TEXT[before.role]} → ${ROLE_TEXT[after.role]}`);
  }
  if (before.active !== after.active) parts.push(after.active ? "activada" : "desactivada");
  return parts.length === 0
    ? `Cuenta de ${after.name} guardada sin cambios.`
    : `Cuenta de ${after.name}: ${parts.join(", ")}.`;
}
