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

/** Pedidos consultados como invitado, en cookie httpOnly de 1 hora. */
export const cookieGuestAccessStore: GuestAccessStore = {
  async read() {
    return parseGuestAccess((await cookies()).get(GUEST_COOKIE)?.value);
  },
  async grant(orderId) {
    const jar = await cookies();
    const ids = grantGuestAccess(parseGuestAccess(jar.get(GUEST_COOKIE)?.value), orderId);
    jar.set(GUEST_COOKIE, serializeGuestAccess(ids), {
      path: "/cuenta/pedidos",
      maxAge: GUEST_COOKIE_MAX_AGE,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    });
  },
};
