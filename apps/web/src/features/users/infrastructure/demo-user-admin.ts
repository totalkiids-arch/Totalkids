import "server-only";

import type { UserAdmin } from "../application/ports";
import {
  describeUserChange,
  removesLastAdmin,
  validateUser,
  type InternalUser,
  type UserChange,
} from "../domain/internal-user";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ALMACÉN DE DEMOSTRACIÓN — NO ES PERSISTENCIA REAL
 * ═══════════════════════════════════════════════════════════════════════════
 *  - Vive en la memoria del servidor de Next.js: se pierde al reiniciar.
 *  - Crear una cuenta solo agrega un registro: no envía invitaciones ni crea
 *    credenciales. El ingreso al panel sigue siendo por rol de demostración.
 *  - LN-04/LN-16 lo reemplazan por un adaptador que llama a la API
 *    (/admin/users), con la misma interfaz UserAdmin.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface DemoState {
  users: InternalUser[];
  changes: UserChange[];
  sequence: number;
}

function seed(): DemoState {
  const users: InternalUser[] = [
    {
      id: "u1",
      name: "Administración Total Kids",
      email: "admin@example.com",
      role: "admin",
      active: true,
    },
    {
      id: "u2",
      name: "Equipo de operaciones",
      email: "operador@example.com",
      role: "operator",
      active: true,
    },
  ];
  return { users, changes: [], sequence: users.length };
}

// globalThis para que la demo no se reinicie con cada cambio de código.
const holder = globalThis as typeof globalThis & { __tkDemoUsers?: DemoState };
const state = () => (holder.__tkDemoUsers ??= seed());

function record(s: DemoState, actor: string, before: InternalUser | null, after: InternalUser) {
  s.changes.unshift({
    at: new Date().toISOString(),
    actor,
    userId: after.id,
    detail: describeUserChange(before, after),
  });
}

export const demoUserAdmin: UserAdmin = {
  async list() {
    return state().users.map((u) => ({ ...u }));
  },

  async save(id, input, actor) {
    const s = state();
    const existing = id ? (s.users.find((u) => u.id === id) ?? null) : null;
    if (id && !existing) return { ok: false, errors: { form: "Esa cuenta ya no existe." } };
    const result = validateUser(input, s.users, existing);
    if (!result.ok) return result;
    if (existing) {
      const before = { ...existing };
      Object.assign(existing, result.draft);
      record(s, actor, before, existing);
      return { ok: true, user: { ...existing } };
    }
    s.sequence += 1;
    const created: InternalUser = { id: `u${s.sequence}`, ...result.draft };
    s.users.push(created);
    record(s, actor, null, created);
    return { ok: true, user: { ...created } };
  },

  async setActive(id, active, actor) {
    const s = state();
    const user = s.users.find((u) => u.id === id);
    if (!user) return { ok: false, reason: "not-found" };
    if (removesLastAdmin(s.users, user, { role: user.role, active })) {
      return { ok: false, reason: "last-admin" };
    }
    const before = { ...user };
    user.active = active;
    if (before.active !== active) record(s, actor, before, user);
    return { ok: true, user: { ...user } };
  },

  async listChanges() {
    return state().changes.map((c) => ({ ...c }));
  },
};
