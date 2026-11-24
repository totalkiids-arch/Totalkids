import type { Cart } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { hashToken, randomToken } from "../../lib/secrets.js";

type CartDb = Pick<PrismaClient, "cart">;

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * La expiración deslizante solo se reescribe si pasó al menos este tiempo desde
 * la última extensión: así leer el carrito no escribe en la base cada vez.
 */
export const CART_EXTEND_INTERVAL_MS = 60 * 60 * 1000;

export function cartTtlMs(ttlDays: number): number {
  return ttlDays * DAY_MS;
}

/** Carrito vigente del token, o null si no existe o ya venció. */
export async function findCart(db: CartDb, token: string, now = new Date()): Promise<Cart | null> {
  const cart = await db.cart.findUnique({ where: { guestTokenHash: hashToken(token) } });
  return cart && cart.expiresAt > now ? cart : null;
}

/** Crea un carrito con un token nuevo. El token en claro solo viaja en la cookie. */
export async function createCart(
  db: CartDb,
  ttlMs: number,
  now = new Date(),
): Promise<{ cart: Cart; token: string }> {
  const token = randomToken();
  const cart = await db.cart.create({
    data: { guestTokenHash: hashToken(token), expiresAt: new Date(now.getTime() + ttlMs) },
  });
  return { cart, token };
}

/**
 * Extiende la expiración si corresponde. Devuelve true si la extendió (entonces
 * hay que renovar también la cookie).
 */
export async function touchCart(
  db: CartDb,
  cart: Pick<Cart, "id" | "expiresAt">,
  ttlMs: number,
  now = new Date(),
): Promise<boolean> {
  const target = now.getTime() + ttlMs;
  if (target - cart.expiresAt.getTime() < CART_EXTEND_INTERVAL_MS) return false;
  await db.cart.update({ where: { id: cart.id }, data: { expiresAt: new Date(target) } });
  return true;
}

/**
 * Borra los carritos vencidos (sus líneas y extras caen en cascada). La llama el
 * worker periódicamente. Devuelve cuántos borró.
 */
export async function purgeExpiredCarts(db: CartDb, now = new Date()): Promise<number> {
  const { count } = await db.cart.deleteMany({ where: { expiresAt: { lte: now } } });
  return count;
}
