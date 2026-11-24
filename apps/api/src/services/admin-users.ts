import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { Prisma, User } from "../generated/prisma/client.js";
import type { UserRole, UserStatus } from "../generated/prisma/enums.js";
import { errors } from "../lib/errors.js";
import { hashPassword } from "../lib/passwords.js";
import type { PrismaClient } from "../lib/prisma.js";
import { randomToken } from "../lib/secrets.js";
import { changedFields, Issues, isUniqueViolation } from "./admin-catalog/common.js";
import { writeAudit, type Actor } from "./audit.js";
import { normalizeEmail, ROLE_LABEL } from "./auth.js";
import { enqueueEmail } from "./email/enqueue.js";
import { emailEventKey } from "./email/events.js";

/**
 * Usuarios y roles del panel (LN-16, RF-31, RNF-01). Solo Administrador. Reglas
 * y textos de `apps/web/src/features/users/domain/internal-user.ts` (UI-14):
 *
 * - Siempre queda al menos un Administrador activo (409 con LAST_ADMIN).
 * - Nadie se quita a sí mismo el rol de Administrador ni desactiva su cuenta.
 * - Las cuentas no se eliminan: se desactivan, así el historial sigue teniendo
 *   sentido.
 * - Al cambiar el rol o desactivar una cuenta se revocan todas sus sesiones
 *   (RNF-01): debe volver a ingresar y el permiso nuevo rige de inmediato.
 * - Alta: la cuenta nace con una contraseña aleatoria que nadie conoce y, si
 *   queda activa, se le encola `password_recovery` para que defina la suya en
 *   `/admin/restablecer?token=…` (el enlace vence a los 30 min; si vence, la
 *   persona pide otro con «Olvidé mi contraseña»).
 *
 * Un candado de transacción serializa los cambios de cuentas: dos cambios
 * simultáneos no pueden dejar el panel sin Administradores.
 */

export const NAME_MAX = 120;

export const USER_MESSAGES = {
  lastAdmin:
    "Debe quedar al menos un Administrador activo. Asigna o activa otro antes de este cambio.",
  selfRole: "No puedes quitarte el rol de Administrador. Pídeselo a otro Administrador.",
  selfDeactivate: "No puedes desactivar tu propia cuenta. Pídeselo a otro Administrador.",
  duplicateEmail: "Ya existe una cuenta con ese correo.",
  notFound: "Esa cuenta ya no existe.",
} as const;

// ── Esquemas ─────────────────────────────────────────────────────────────────

const userFields = {
  name: z.string({ error: "Ingresa el nombre." }).max(1000),
  email: z.string({ error: "Ingresa el correo." }).max(1000),
  role: z.enum(["admin", "operator"], "Elige un rol."),
  active: z.boolean("Indica si la cuenta queda activa.").optional(),
};

export const createUserBody = z.strictObject(userFields);
export type CreateUserInput = z.output<typeof createUserBody>;

export const updateUserBody = z
  .strictObject(userFields)
  .partial()
  .refine((b) => Object.keys(b).length > 0, "Envía al menos un campo para modificar.");
export type UpdateUserInput = z.output<typeof updateUserBody>;

export const roleBody = z.strictObject({ role: userFields.role });

export const userParams = z.object({ id: z.uuid("Identificador inválido") });

// ── DTO ──────────────────────────────────────────────────────────────────────

export interface AdminUserDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  status: UserStatus;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Es la cuenta de quien consulta (el panel no ofrece quitarse el rol ni desactivarse). */
  isSelf: boolean;
}

function toDto(u: User, selfId: string): AdminUserDto {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    roleLabel: ROLE_LABEL[u.role],
    status: u.status,
    active: u.status === "active",
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    isSelf: u.id === selfId,
  };
}

/** Administradores primero, luego activas, luego por nombre (como el panel). */
export async function listAdminUsers(
  db: Pick<PrismaClient, "user">,
  selfId: string,
): Promise<{ items: AdminUserDto[]; activeAdmins: number }> {
  const users = await db.user.findMany();
  users.sort(
    (a, b) =>
      Number(b.role === "admin") - Number(a.role === "admin") ||
      Number(b.status === "active") - Number(a.status === "active") ||
      a.name.localeCompare(b.name, "es"),
  );
  return {
    items: users.map((u) => toDto(u, selfId)),
    activeAdmins: users.filter((u) => u.role === "admin" && u.status === "active").length,
  };
}

// ── Reglas ───────────────────────────────────────────────────────────────────

type Tx = Prisma.TransactionClient;

async function lockUsers(tx: Tx): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('totalkids:users'))`;
}

function checkIdentity(name: string, email: string, issues: Issues): void {
  if (!name) issues.add("name", "Ingresa el nombre.");
  else if (name.length > NAME_MAX)
    issues.add("name", `Usa como máximo ${String(NAME_MAX)} caracteres.`);
  if (!email) issues.add("email", "Ingresa el correo.");
  else if (email.length > 254 || !z.email().safeParse(email).success) {
    issues.add("email", "Escribe un correo válido, por ejemplo nombre@totalkids.cl.");
  }
}

async function checkEmailFree(tx: Tx, email: string, exceptId: string | null, issues: Issues) {
  if (issues.list.some((i) => i.path === "email")) return;
  const other = await tx.user.findUnique({ where: { email }, select: { id: true } });
  if (other && other.id !== exceptId) issues.add("email", USER_MESSAGES.duplicateEmail);
}

const conflict = (message: string) => errors.conflict(message, { field: "form" });

/** Revoca todas las sesiones abiertas de la cuenta (RNF-01). Devuelve cuántas. */
async function revokeSessions(tx: Tx, userId: string, now: Date): Promise<number> {
  const { count } = await tx.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now },
  });
  return count;
}

/** «Cuenta de Ana: rol Operador → Administrador, desactivada.» (historial, RF-34). */
function describeChange(before: User | null, after: User): string {
  if (!before) {
    return `Cuenta creada: ${after.name} (${after.email}), ${ROLE_LABEL[after.role]}${after.status === "active" ? "" : ", inactiva"}.`;
  }
  const parts: string[] = [];
  if (before.name !== after.name) parts.push(`nombre «${before.name}» → «${after.name}»`);
  if (before.email !== after.email) parts.push(`correo ${before.email} → ${after.email}`);
  if (before.role !== after.role) {
    parts.push(`rol ${ROLE_LABEL[before.role]} → ${ROLE_LABEL[after.role]}`);
  }
  if (before.status !== after.status) {
    parts.push(after.status === "active" ? "activada" : "desactivada");
  }
  return `Cuenta de ${after.name}: ${parts.join(", ")}.`;
}

// ── Alta ─────────────────────────────────────────────────────────────────────

export async function createUser(
  prisma: Pick<PrismaClient, "$transaction">,
  input: CreateUserInput,
  actor: Actor,
  requestId?: string,
): Promise<AdminUserDto & { invitationSent: boolean }> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const issues = new Issues();
  checkIdentity(name, email, issues);
  issues.throwIfAny();
  // Contraseña aleatoria que nadie conoce: la persona define la suya con el enlace.
  const passwordHash = await hashPassword(randomToken());
  const status: UserStatus = input.active === false ? "inactive" : "active";

  try {
    return await prisma.$transaction(async (tx) => {
      await lockUsers(tx);
      await checkEmailFree(tx, email, null, issues);
      issues.throwIfAny();
      const user = await tx.user.create({
        data: { name, email, role: input.role, status, passwordHash },
      });
      const invitationSent = status === "active";
      if (invitationSent) {
        await enqueueEmail(tx, {
          event: "password_recovery",
          recipient: user.email,
          eventKey: emailEventKey("password_recovery", user.id, randomUUID()),
          data: { userId: user.id },
        });
      }
      await writeAudit(
        tx,
        actor,
        {
          action: "user.created",
          resourceType: "user",
          resourceId: user.id,
          details: {
            summary: describeChange(null, user),
            name,
            email,
            role: user.role,
            status,
            invitationSent,
          },
        },
        requestId,
      );
      return { ...toDto(user, actor.actorUserId), invitationSent };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw errors.validation("Los datos enviados no son válidos", {
        issues: [{ location: "body", path: "email", message: USER_MESSAGES.duplicateEmail }],
      });
    }
    throw err;
  }
}

// ── Edición, rol y estado ────────────────────────────────────────────────────

export async function updateUser(
  prisma: Pick<PrismaClient, "$transaction">,
  id: string,
  input: UpdateUserInput,
  actor: Actor,
  requestId?: string,
  now = new Date(),
): Promise<AdminUserDto & { sessionsRevoked: number }> {
  try {
    return await prisma.$transaction(async (tx) => {
      await lockUsers(tx);
      const before = await tx.user.findUnique({ where: { id } });
      if (!before) throw errors.notFound(USER_MESSAGES.notFound);

      const name = input.name === undefined ? before.name : input.name.trim();
      const email = input.email === undefined ? before.email : normalizeEmail(input.email);
      const role = input.role ?? before.role;
      const status: UserStatus =
        input.active === undefined ? before.status : input.active ? "active" : "inactive";

      const issues = new Issues();
      checkIdentity(name, email, issues);
      if (email !== before.email) await checkEmailFree(tx, email, id, issues);
      issues.throwIfAny();

      const isSelf = id === actor.actorUserId;
      if (isSelf && before.role === "admin" && role !== "admin") {
        throw conflict(USER_MESSAGES.selfRole);
      }
      if (isSelf && status !== "active") throw conflict(USER_MESSAGES.selfDeactivate);

      // ¿Deja al panel sin Administradores activos?
      const wasActiveAdmin = before.role === "admin" && before.status === "active";
      const staysActiveAdmin = role === "admin" && status === "active";
      if (wasActiveAdmin && !staysActiveAdmin) {
        const others = await tx.user.count({
          where: { role: "admin", status: "active", id: { not: id } },
        });
        if (others === 0) throw conflict(USER_MESSAGES.lastAdmin);
      }

      const changes = changedFields(
        { name: before.name, email: before.email, role: before.role, status: before.status },
        { name, email, role, status },
        ["name", "email", "role", "status"],
      );
      if (Object.keys(changes).length === 0) {
        return { ...toDto(before, actor.actorUserId), sessionsRevoked: 0 };
      }

      const after = await tx.user.update({
        where: { id },
        data: { name, email, role, status },
      });
      // RNF-01: con otro rol o desactivada, las sesiones abiertas dejan de valer.
      const sessionsRevoked =
        role !== before.role || status !== before.status ? await revokeSessions(tx, id, now) : 0;

      const keys = Object.keys(changes);
      const action =
        keys.length === 1 && keys[0] === "role"
          ? "user.role_changed"
          : keys.length === 1 && keys[0] === "status"
            ? status === "active"
              ? "user.activated"
              : "user.deactivated"
            : "user.updated";
      await writeAudit(
        tx,
        actor,
        {
          action,
          resourceType: "user",
          resourceId: id,
          details: {
            summary: describeChange(before, after),
            changes,
            sessionsRevoked,
          } as Prisma.InputJsonValue,
        },
        requestId,
      );
      return { ...toDto(after, actor.actorUserId), sessionsRevoked };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw errors.validation("Los datos enviados no son válidos", {
        issues: [{ location: "body", path: "email", message: USER_MESSAGES.duplicateEmail }],
      });
    }
    throw err;
  }
}
