import { afterAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "../src/lib/prisma.js";
import { hashToken } from "../src/lib/secrets.js";
import {
  CART_EXTEND_INTERVAL_MS,
  cartTtlMs,
  createCart,
  findCart,
  purgeExpiredCarts,
  touchCart,
} from "../src/services/cart/session.js";
import { inRollback } from "./panel-helpers.js";

// Sesión del carrito (LN-06) contra totalkids_test, en transacciones que se
// deshacen. Se omite sin TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;
const TTL = cartTtlMs(30);

describe.skipIf(!url)("sesión del carrito en la base (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("guarda solo el hash del token y encuentra el carrito vigente", async () => {
    await inRollback(prisma, async (db) => {
      const { cart, token } = await createCart(db, TTL);
      expect(cart.guestTokenHash).toBe(hashToken(token));
      expect(cart.guestTokenHash).not.toContain(token);
      expect((await findCart(db, token))?.id).toBe(cart.id);
      // Vencido: como si no existiera.
      const later = new Date(cart.expiresAt.getTime() + 1);
      expect(await findCart(db, token, later)).toBeNull();
    });
  });

  it("extiende la expiración solo si pasó el intervalo", async () => {
    await inRollback(prisma, async (db) => {
      const now = new Date();
      const { cart } = await createCart(db, TTL, now);
      expect(await touchCart(db, cart, TTL, new Date(now.getTime() + 60_000))).toBe(false);
      const later = new Date(now.getTime() + CART_EXTEND_INTERVAL_MS + 1);
      expect(await touchCart(db, cart, TTL, later)).toBe(true);
      const stored = await db.cart.findUniqueOrThrow({ where: { id: cart.id } });
      expect(stored.expiresAt.getTime()).toBe(later.getTime() + TTL);
    });
  });

  it("purgeExpiredCarts borra solo los vencidos", async () => {
    await inRollback(prisma, async (db) => {
      const now = new Date();
      const old = await createCart(db, 1000, new Date(now.getTime() - 5000));
      const fresh = await createCart(db, TTL, now);
      expect(await purgeExpiredCarts(db, now)).toBeGreaterThanOrEqual(1);
      expect(await db.cart.findUnique({ where: { id: old.cart.id } })).toBeNull();
      expect(await db.cart.findUnique({ where: { id: fresh.cart.id } })).not.toBeNull();
    });
  });
});
