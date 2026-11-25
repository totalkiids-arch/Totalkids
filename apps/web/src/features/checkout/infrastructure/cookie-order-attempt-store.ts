import "server-only";

import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import type { OrderAttemptStore } from "../application/ports";

/**
 * Idempotency-Key del pedido en curso, en cookie httpOnly bajo /checkout.
 * Mientras no cambie, un doble clic o volver desde Flow responde el mismo
 * pedido (la API lo reproduce) en vez de crear otro. Dura lo mismo que una
 * reserva larga; si los datos cambian, la API avisa y se rota.
 */
const COOKIE = "tk_checkout_intento";
const MAX_AGE = 60 * 60 * 2;
const KEY = /^[A-Za-z0-9_-]{16,128}$/;

async function save(key: string) {
  (await cookies()).set(COOKIE, key, {
    path: "/checkout",
    maxAge: MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  });
  return key;
}

export const cookieOrderAttemptStore: OrderAttemptStore = {
  async current() {
    const key = (await cookies()).get(COOKIE)?.value;
    return key && KEY.test(key) ? key : save(randomUUID());
  },
  rotate() {
    return save(randomUUID());
  },
};
