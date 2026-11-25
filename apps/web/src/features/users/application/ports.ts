import type { FieldErrors, InternalUser, UserInput } from "../domain/internal-user";

export type SaveUserResult =
  | {
      ok: true;
      user: InternalUser;
      /** Al crear: se encoló el correo para definir la contraseña. */
      invitationSent: boolean;
      /** Al editar: sesiones de la cuenta revocadas por cambiar rol o estado (RNF-01). */
      sessionsRevoked: number;
    }
  | { ok: false; errors: FieldErrors };

export type SetActiveResult =
  | { ok: true; user: InternalUser; sessionsRevoked: number }
  /** `conflict`: la API lo impide (último Administrador o la propia cuenta); `message` lo explica. */
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "conflict"; message: string };

export interface UserList {
  /** Administradores primero, luego activas, luego por nombre (orden de la API). */
  users: InternalUser[];
  activeAdmins: number;
}

/**
 * Puerto: cuentas internas del panel (RF-31). Lo implementa la API
 * (/admin/users, solo Administrador), que valida, protege al último
 * Administrador, envía la invitación al crear y registra cada cambio con quien
 * lo hizo (lo toma de la sesión).
 */
export interface UserAdmin {
  list(): Promise<UserList>;
  /** id null crea una cuenta nueva. */
  save(id: string | null, input: UserInput): Promise<SaveUserResult>;
  setActive(id: string, active: boolean): Promise<SetActiveResult>;
}
