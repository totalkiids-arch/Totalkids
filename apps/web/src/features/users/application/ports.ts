import type { FieldErrors, InternalUser, UserChange, UserInput } from "../domain/internal-user";

export type SaveUserResult = { ok: true; user: InternalUser } | { ok: false; errors: FieldErrors };

export type SetActiveResult =
  { ok: true; user: InternalUser } | { ok: false; reason: "not-found" | "last-admin" };

/**
 * Puerto: cuentas internas del panel (RF-31). El adaptador valida con las
 * reglas del dominio; con la API (LN-04/LN-16, /admin/users), también las
 * aplica el backend. `actor` lo pone el servidor desde la sesión.
 */
export interface UserAdmin {
  list(): Promise<InternalUser[]>;
  /** id null crea una cuenta nueva. */
  save(id: string | null, input: UserInput, actor: string): Promise<SaveUserResult>;
  setActive(id: string, active: boolean, actor: string): Promise<SetActiveResult>;
  /** Cambios en las cuentas, del más reciente al más antiguo (historial, RF-34). */
  listChanges(): Promise<UserChange[]>;
}
