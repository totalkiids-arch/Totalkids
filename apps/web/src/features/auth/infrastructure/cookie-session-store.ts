import "server-only";

import { cookies } from "next/headers";

import type { SessionStore } from "../application/ports";
import { parseSession, serializeSession, SESSION_COOKIE, SESSION_MAX_AGE } from "../domain/session";

/** Sesión de demostración en cookie httpOnly (ver domain/session.ts). */
export const cookieSessionStore: SessionStore = {
  async read() {
    return parseSession((await cookies()).get(SESSION_COOKIE)?.value);
  },
  async write(buyer) {
    (await cookies()).set(SESSION_COOKIE, serializeSession(buyer), {
      path: "/",
      maxAge: SESSION_MAX_AGE,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    });
  },
  async clear() {
    (await cookies()).delete(SESSION_COOKIE);
  },
};
