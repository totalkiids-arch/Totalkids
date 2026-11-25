import { z } from "zod";

import { unavailableError } from "@/shared/lib/panel-errors";

import type { UserList } from "../application/ports";
import { ADMIN_ROLES } from "../domain/admin-role";
import type { InternalUser } from "../domain/internal-user";

/*
 * Traducción de /admin/users (apps/api/openapi.yaml) al panel. Puro (sin
 * server-only ni Next.js) para poder probarlo. Un cuerpo inesperado cuenta como
 * API no disponible. La API nunca entrega contraseñas ni hashes.
 */

const ApiUser = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(ADMIN_ROLES),
  active: z.boolean(),
  lastLoginAt: z.string().nullable(),
  isSelf: z.boolean(),
});

const ApiUserList = z.object({ items: z.array(ApiUser), activeAdmins: z.number().int() });
const ApiCreated = ApiUser.extend({ invitationSent: z.boolean() });
const ApiChanged = ApiUser.extend({ sessionsRevoked: z.number().int() });

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw unavailableError(parsed.error);
  return parsed.data;
}

const toUser = (u: z.infer<typeof ApiUser>): InternalUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  active: u.active,
  lastLoginAt: u.lastLoginAt,
  isSelf: u.isSelf,
});

export function toUserList(body: unknown): UserList {
  const data = parse(ApiUserList, body);
  return { users: data.items.map(toUser), activeAdmins: data.activeAdmins };
}

export function toCreatedUser(body: unknown) {
  const data = parse(ApiCreated, body);
  return { user: toUser(data), invitationSent: data.invitationSent };
}

export function toChangedUser(body: unknown) {
  const data = parse(ApiChanged, body);
  return { user: toUser(data), sessionsRevoked: data.sessionsRevoked };
}
