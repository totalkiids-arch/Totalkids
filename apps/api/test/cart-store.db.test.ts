import { afterAll, describe, expect, it } from "vitest";

import type { Prisma } from "../src/generated/prisma/client.js";
import { createPrismaClient } from "../src/lib/prisma.js";
import { hashToken } from "../src/lib/secrets.js";
import {
  CART_TTL_MS,
  createCart,
  deleteExpiredCarts,
  dropExtras,
  findCart,
  findVariantBySku,
  loadVariants,
  removeLine,
  saveLine,
  setLineQuantity,
  touchCart,
} from "../src/services/cart-store.js";

// Repositorio del carrito (LN-06) contra totalkids_test. Cada caso corre en una
// transacción que se deshace (no interfiere con otros tests en paralelo). Se
// omite sin TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

type Tx = Prisma.TransactionClient;

class Rollback extends Error {}

describe.skipIf(!url)("repositorio del carrito (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function inRollback(fn: (tx: Tx) => Promise<void>) {
    await expect(
      prisma.$transaction(async (tx) => {
        await fn(tx);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
  }

  const u = () => Math.random().toString(36).slice(2, 8);

  /** Producto visible con una variante y dos extras (uno con precio propio). */
  async function catalog(
    tx: Tx,
    overrides: { variantActive?: boolean; productStatus?: "active" | "inactive" } = {},
  ) {
    const id = u();
    const category = await tx.category.create({ data: { slug: `c-${id}`, name: "Cunas" } });
    const product = await tx.product.create({
      data: {
        categoryId: category.id,
        slug: `cuna-${id}`,
        name: `Cuna ${id}`,
        status: overrides.productStatus ?? "active",
        publishedAt: new Date("2026-01-01"),
        leadTime: "10 días hábiles",
        images: { create: { url: `/productos/cuna-${id}/1.webp`, alt: "Cuna" } },
      },
    });
    const variant = await tx.productVariant.create({
      data: {
        productId: product.id,
        sku: `TK-${id}`,
        price: 245_990,
        stockPhysical: 3,
        stockReserved: 1,
        active: overrides.variantActive ?? true,
      },
    });
    const armado = await tx.extra.create({
      data: { code: `armado-${id}`, name: "Armado", price: null },
    });
    const nombre = await tx.extra.create({
      data: {
        code: `nombre-${id}`,
        name: "Nombre grabado",
        price: 5_000,
        requiresText: true,
        textLabel: "Nombre",
        textMaxLength: 20,
      },
    });
    await tx.productExtra.createMany({
      data: [
        { productId: product.id, extraId: armado.id, sortOrder: 0, price: 15_000 },
        { productId: product.id, extraId: nombre.id, sortOrder: 1, textMaxLength: 12 },
      ],
    });
    return { product, variant, armado, nombre };
  }

  it("crea el carrito: la cookie lleva el token y la base solo su hash", async () => {
    await inRollback(async (tx) => {
      const now = new Date("2026-11-23T12:00:00Z");
      const { token, cart } = await createCart(tx, now);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const row = await tx.cart.findUniqueOrThrow({ where: { id: cart.id } });
      expect(row.guestTokenHash).toBe(hashToken(token));
      expect(row.guestTokenHash).not.toContain(token);
      expect(row.expiresAt.getTime()).toBe(now.getTime() + CART_TTL_MS);
      expect(await findCart(tx, token, now)).toMatchObject({ id: cart.id, lines: [] });
    });
  });

  it("un carrito vencido o un token desconocido no se encuentran", async () => {
    await inRollback(async (tx) => {
      const now = new Date("2026-11-23T12:00:00Z");
      const { token } = await createCart(tx, now);
      expect(await findCart(tx, token, new Date(now.getTime() + CART_TTL_MS))).toBeNull();
      expect(await findCart(tx, "x".repeat(43), now)).toBeNull();
    });
  });

  it("renueva el vencimiento al modificar y borra los vencidos", async () => {
    await inRollback(async (tx) => {
      const now = new Date("2026-11-23T12:00:00Z");
      const { token, cart } = await createCart(tx, now);
      const later = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
      await touchCart(tx, cart.id, later);
      expect((await findCart(tx, token, later))?.expiresAt.getTime()).toBe(
        later.getTime() + CART_TTL_MS,
      );
      expect(
        await deleteExpiredCarts(tx, new Date(later.getTime() + CART_TTL_MS)),
      ).toBeGreaterThanOrEqual(1);
      expect(await findCart(tx, token, later)).toBeNull();
    });
  });

  it("guarda líneas: la misma combinación suma cantidades; otra es otra línea", async () => {
    await inRollback(async (tx) => {
      const { variant, nombre } = await catalog(tx);
      const { token, cart } = await createCart(tx);
      const base = { variantId: variant.id, extras: [] };
      await saveLine(tx, cart.id, { ...base, key: variant.sku, quantity: 2 });
      await saveLine(tx, cart.id, { ...base, key: variant.sku, quantity: 3 });
      await saveLine(tx, cart.id, {
        variantId: variant.id,
        key: `${variant.sku}|nombre=Sofía`,
        quantity: 1,
        extras: [{ extraId: nombre.id, text: "Sofía" }],
      });
      const saved = await findCart(tx, token);
      expect(saved?.lines.map((l) => [l.key, l.quantity, l.sku])).toEqual([
        [variant.sku, 5, variant.sku],
        [`${variant.sku}|nombre=Sofía`, 1, variant.sku],
      ]);
      expect(saved?.lines[1]?.extras).toEqual([{ extraId: nombre.id, text: "Sofía" }]);
    });
  });

  it("cambia y quita líneas solo de su propio carrito", async () => {
    await inRollback(async (tx) => {
      const { variant } = await catalog(tx);
      const mine = await createCart(tx);
      const other = await createCart(tx);
      await saveLine(tx, mine.cart.id, {
        key: variant.sku,
        variantId: variant.id,
        quantity: 1,
        extras: [],
      });
      const lineId = (await findCart(tx, mine.token))?.lines[0]?.id ?? "";

      // Otro carrito no puede tocar la línea.
      expect(await setLineQuantity(tx, other.cart.id, lineId, 4)).toBe(false);
      expect(await removeLine(tx, other.cart.id, lineId)).toBe(false);

      expect(await setLineQuantity(tx, mine.cart.id, lineId, 4)).toBe(true);
      expect((await findCart(tx, mine.token))?.lines[0]?.quantity).toBe(4);
      // Cantidad 0 = quitar.
      expect(await setLineQuantity(tx, mine.cart.id, lineId, 0)).toBe(true);
      expect((await findCart(tx, mine.token))?.lines).toEqual([]);
    });
  });

  it("limpia los extras que el catálogo dejó de ofrecer", async () => {
    await inRollback(async (tx) => {
      const { variant, armado } = await catalog(tx);
      const { token, cart } = await createCart(tx);
      await saveLine(tx, cart.id, {
        key: `${variant.sku}|${armado.code}`,
        variantId: variant.id,
        quantity: 1,
        extras: [{ extraId: armado.id, text: null }],
      });
      const lineId = (await findCart(tx, token))?.lines[0]?.id ?? "";
      await dropExtras(tx, new Map([[lineId, [armado.id]]]));
      expect((await findCart(tx, token))?.lines[0]?.extras).toEqual([]);
    });
  });

  it("lee la variante vigente: disponible, plazo, foto y extras con precio y largo propios", async () => {
    await inRollback(async (tx) => {
      const { product, variant, armado, nombre } = await catalog(tx);
      const found = await findVariantBySku(tx, variant.sku);
      expect(found).toMatchObject({
        variantId: variant.id,
        productSlug: product.slug,
        price: 245_990,
        available: 2,
        leadTime: "10 días hábiles",
        imageUrl: `/productos/${product.slug}/1.webp`,
      });
      expect(found?.extras).toEqual([
        {
          extraId: armado.id,
          code: armado.code,
          name: "Armado",
          price: 15_000,
          personalization: null,
        },
        {
          extraId: nombre.id,
          code: nombre.code,
          name: "Nombre grabado",
          price: 5_000,
          personalization: { label: "Nombre", maxLength: 12 },
        },
      ]);
      expect((await loadVariants(tx, [variant.id])).get(variant.id)?.sku).toBe(variant.sku);
    });
  });

  it("una variante desactivada o de un producto oculto ya no se vende", async () => {
    await inRollback(async (tx) => {
      const inactive = await catalog(tx, { variantActive: false });
      const hidden = await catalog(tx, { productStatus: "inactive" });
      expect(await findVariantBySku(tx, inactive.variant.sku)).toBeNull();
      const map = await loadVariants(tx, [inactive.variant.id, hidden.variant.id]);
      expect([...map.values()]).toEqual([null, null]);
    });
  });
});
