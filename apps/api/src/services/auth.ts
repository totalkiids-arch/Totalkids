import { randomUUID } from "node:crypto";

import type { UserRole } from "../generated/prisma/enums.js";
import { errors } from "../lib/errors.js";
import {
  hashPassword,
  needsRehash,
  passwordSchema,
  verifyDummyPassword,
  verifyPassword,
} from "../lib/passwords.js";
import type { PrismaClient } from "../lib/prisma.js";
import { hashToken, randomToken } from "../lib/secrets.js";
import { enqueueEmail } from "./email/enqueue.js";

/**
 * Autenticación del equipo del panel (LN-04, RF-31, RNF-01). Los compradores no
 * tienen cuenta (UI-09): solo Administrador y Operador ingresan.
 *
 * Sesiones opacas y revocables: el navegador guarda un token aleatorio en una
 * cookie HttpOnly y la base solo su hash. Vencen por tiempo absoluto y por
 * inactividad; se revocan al cerrar sesión, al restablecer la contraseña y
 * dejan de valer si la cuenta se desactiva.
 */

/** Vida máxima de una sesión, aunque se use todo el tiempo. */
export const SESSION_TTL_MS = 12 * 60 * 60_000;
/** Una sesión sin uso durante este tiempo deja de valer. */
export const SESSION_IDLE_MS = 2 * 60 * 60_000;
/** `last_seen_at` se actualiza como mucho una vez por minuto (evita una escritura por petición). */
const TOUCH_INTERVAL_MS = 60_000;
/** Vigencia del enlace de recuperación de contraseña. */
export const PASSWORD_RESET_TTL_MS = 30 * 60_000;

export const STAFF_ROLES = ["admin", "operator"] as const satisfies readonly UserRole[];

/** Nombre visible del rol, para auditoría e historial ("Administrador"). */
export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Administrador",
  operator: "Operador",
};

export interface PanelUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface PanelSession {
  id: string;
  user: PanelUser;
  expiresAt: Date;
}

type Db = Pick<
  PrismaClient,
  "$transaction" | "user" | "session" | "authToken" | "auditLog" | "outboxJob" | "emailLog"
>;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toPanelUser(user: PanelUser): PanelUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

// ── Alta de cuentas (script de administración; el CRUD llega en LN-16) ─────────

export interface NewStaffUser {
  email: string;
  name: string;
  role: UserRole;
  password: string;
}

/** Crea una cuenta del equipo. 409 si el correo ya existe; 422 si la contraseña no cumple. */
export async function createStaffUser(db: Db, input: NewStaffUser): Promise<PanelUser> {
  const password = passwordSchema.safeParse(input.password);
  if (!password.success) {
    throw errors.validation(password.error.issues[0]?.message ?? "Contraseña inválida");
  }
  const email = normalizeEmail(input.email);
  if (await db.user.findUnique({ where: { email } })) {
    throw errors.conflict("Ya existe una cuenta con ese correo");
  }
  const user = await db.user.create({
    data: {
      email,
      name: input.name.trim(),
      role: input.role,
      passwordHash: await hashPassword(password.data),
    },
  });
  return toPanelUser(user);
}

// ── Ingreso y sesiones ─────────────────────────────────────────────────────────

export interface LoginContext {
  /** Token de una sesión anterior presente en la cookie: se revoca al ingresar. */
  previousToken?: string | undefined;
  userAgent?: string | undefined;
  requestId?: string | undefined;
}

export interface LoginResult {
  token: string;
  session: PanelSession;
}

const INVALID_CREDENTIALS = "Correo o contraseña incorrectos";

/**
 * Verifica las credenciales y abre una sesión nueva (nunca reutiliza la anterior:
 * evita fijación de sesión). Correo inexistente, contraseña errónea y cuenta
 * inactiva responden igual (401), sin revelar cuál fue.
 */
export async function login(
  db: Db,
  credentials: { email: string; password: string },
  context: LoginContext = {},
  now = new Date(),
): Promise<LoginResult> {
  const email = normalizeEmail(credentials.email);
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    await verifyDummyPassword(credentials.password);
    throw errors.unauthorized(INVALID_CREDENTIALS);
  }
  const valid = await verifyPassword(user.passwordHash, credentials.password);
  if (!valid || user.status !== "active") throw errors.unauthorized(INVALID_CREDENTIALS);

  const rehash = needsRehash(user.passwordHash) ? await hashPassword(credentials.password) : null;
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  const session = await db.$transaction(async (tx) => {
    if (context.previousToken) {
      await tx.session.updateMany({
        where: { tokenHash: hashToken(context.previousToken), revokedAt: null },
        data: { revokedAt: now },
      });
    }
    const created = await tx.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt,
        lastSeenAt: now,
        userAgent: context.userAgent?.slice(0, 400) ?? null,
        createdAt: now,
      },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { lastLoginAt: now, ...(rehash ? { passwordHash: rehash } : {}) },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        actorLabel: ROLE_LABEL[user.role],
        action: "auth.login",
        resourceType: "user",
        resourceId: user.id,
        requestId: context.requestId ?? null,
      },
    });
    return created;
  });

  return { token, session: { id: session.id, user: toPanelUser(user), expiresAt } };
}

/**
 * Sesión vigente para el token de la cookie, o null. Lee el rol y el estado de
 * la cuenta en cada petición: un cambio de rol o una desactivación rigen de
 * inmediato (permisos en backend, RF-31).
 */
export async function resolveSession(
  db: Pick<PrismaClient, "session">,
  token: string,
  now = new Date(),
): Promise<PanelSession | null> {
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= now) return null;
  const lastSeen = session.lastSeenAt ?? session.createdAt;
  if (now.getTime() - lastSeen.getTime() >= SESSION_IDLE_MS) return null;
  if (session.user.status !== "active") return null;

  if (now.getTime() - lastSeen.getTime() >= TOUCH_INTERVAL_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
  }
  return { id: session.id, user: toPanelUser(session.user), expiresAt: session.expiresAt };
}

/** Revoca la sesión del token (cerrar sesión). Idempotente. */
export async function logout(
  db: Pick<PrismaClient, "session">,
  token: string,
  now = new Date(),
): Promise<void> {
  await db.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: now },
  });
}

// ── Recuperación de contraseña (token de un solo uso) ──────────────────────────

/**
 * Pide la recuperación. Si el correo es de una cuenta activa, encola el correo
 * `password_recovery` (outbox + email_log, LN-14); el worker lo envía y llama a
 * `issuePasswordResetToken` en ese momento.
 * El payload no lleva el token: el secreto nunca queda guardado en claro.
 * Responde igual exista o no la cuenta.
 */
export async function requestPasswordReset(db: Db, rawEmail: string): Promise<void> {
  const user = await db.user.findUnique({ where: { email: normalizeEmail(rawEmail) } });
  if (!user || user.status !== "active") return;
  await db.$transaction((tx) =>
    enqueueEmail(tx, {
      event: "password_recovery",
      recipient: user.email,
      eventKey: `password_recovery:${user.id}:${randomUUID()}`,
      data: { userId: user.id },
    }),
  );
}

/**
 * Emite el token de recuperación para el correo (lo llama el worker al enviarlo).
 * Invalida los tokens anteriores sin usar: solo vale el último enlace enviado.
 * Devuelve el token en claro una sola vez; en la base queda su hash.
 */
export async function issuePasswordResetToken(
  db: Db,
  userId: string,
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS);
  await db.$transaction(async (tx) => {
    await tx.authToken.updateMany({
      where: { userId, purpose: "password_reset", usedAt: null },
      data: { usedAt: now },
    });
    await tx.authToken.create({
      data: {
        userId,
        purpose: "password_reset",
        tokenHash: hashToken(token),
        expiresAt,
        createdAt: now,
      },
    });
  });
  return { token, expiresAt };
}

const INVALID_RESET_LINK = "El enlace no es válido o ya venció. Pide uno nuevo.";

function invalidResetLink() {
  return errors.validation(INVALID_RESET_LINK, {
    issues: [{ location: "body", path: "token", message: INVALID_RESET_LINK }],
  });
}

/**
 * Cambia la contraseña con un token de recuperación. El token se consume en la
 * misma transacción (dos usos simultáneos: solo uno gana) y se revocan todas las
 * sesiones de la cuenta (RNF-01).
 */
export async function resetPassword(
  db: Db,
  input: { token: string; password: string },
  context: { requestId?: string | undefined } = {},
  now = new Date(),
): Promise<void> {
  const record = await db.authToken.findUnique({
    where: { tokenHash: hashToken(input.token) },
    include: { user: true },
  });
  if (
    !record ||
    record.purpose !== "password_reset" ||
    record.usedAt ||
    record.expiresAt <= now ||
    record.user.status !== "active"
  ) {
    throw invalidResetLink();
  }

  const passwordHash = await hashPassword(input.password);
  await db.$transaction(async (tx) => {
    const consumed = await tx.authToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) throw invalidResetLink();
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await tx.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.authToken.updateMany({
      where: { userId: record.userId, purpose: "password_reset", usedAt: null },
      data: { usedAt: now },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: record.userId,
        actorLabel: ROLE_LABEL[record.user.role],
        action: "auth.password_reset",
        resourceType: "user",
        resourceId: record.userId,
        requestId: context.requestId ?? null,
      },
    });
  });
}
