import "server-only";

import { cookies } from "next/headers";

import type { GuestAccessStore } from "../application/ports";
import {
  GUEST_COOKIE,
  GUEST_COOKIE_MAX_AGE,
  grantGuestAccess,
  parseGuestAccess,
  serializeGuestAccess,
} from "../domain/guest-lookup";

/** Credenciales de los pedidos consultados como invitado, en cookie httpOnly de 1 hora. */
export const cookieGuestAccessStore: GuestAccessStore = {
  async read() {
    return parseGuestAccess((await cookies()).get(GUEST_COOKIE)?.value);
  },
  async grant(entry) {
    const jar = await cookies();
    const entries = grantGuestAccess(parseGuestAccess(jar.get(GUEST_COOKIE)?.value), entry);
    jar.set(GUEST_COOKIE, serializeGuestAccess(entries), {
      path: "/seguimiento",
      maxAge: GUEST_COOKIE_MAX_AGE,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    });
  },
};
