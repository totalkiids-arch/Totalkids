import { afterAll, describe, expect, it } from "vitest";

import type { Prisma } from "../src/generated/prisma/client.js";
import { createPrismaClient } from "../src/lib/prisma.js";
import { getProduct, listCategories, listProducts } from "../src/services/catalog.js";

// Categorías adicionales y extras por producto en el catálogo (revisión de
// LN-01) contra totalkids_test. Cada caso corre en una transacción que se
// deshace: no interfiere con los conteos exactos de catalog.db.test.ts, que
// corre en paralelo. Se omite sin TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

type Tx = Prisma.TransactionClient;

class Rollback extends Error {}

describe.skipIf(!url)("catálogo: categorías adicionales y extras por producto", () => {
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

  /** Dos categorías ("mesas" principal y "junji" adicional) y un producto visible en ambas. */
  async function fixture(tx: Tx) {
    const id = u();
    const mesas = await tx.category.create({ data: { slug: `mesas-${id}`, name: "Mesas" } });
    const junji = await tx.category.create({
      data: { slug: `junji-${id}`, name: "Línea JUNJI", sortOrder: 99 },
    });
    const product = await tx.product.create({
      data: {
        categoryId: mesas.id,
        name: `Mesa circular ${id}`,
        slug: `mesa-circular-${id}`,
        status: "active",
        publishedAt: new Date("2026-01-01"),
        optionName: "Tamaño",
        leadTime: "10 días hábiles",
        additionalCategories: { create: { categoryId: junji.id } },
      },
    });
    await tx.productVariant.create({
      data: { productId: product.id, sku: `TK-M${id}`, price: 69_990 },
    });
    return { mesas, junji, product };
  }

  const filters = (category: string) => ({
    category,
    sort: "newest" as const,
    page: 1,
    pageSize: 20,
  });

  it("una categoría adicional muestra el producto en el listado", async () => {
    await inRollback(async (tx) => {
      const { mesas, junji, product } = await fixture(tx);
      for (const category of [mesas, junji]) {
        const { items } = await listProducts(tx, filters(category.slug));
        expect(
          items.map((i) => i.slug),
          category.slug,
        ).toEqual([product.slug]);
      }
    });
  });

  it("cuenta el producto en su categoría principal y en la adicional, una sola vez", async () => {
    await inRollback(async (tx) => {
      const { mesas, junji, product } = await fixture(tx);
      // Repetir la principal como adicional no duplica el conteo.
      await tx.productCategory.create({ data: { productId: product.id, categoryId: mesas.id } });
      const counts = new Map((await listCategories(tx)).map((c) => [c.slug, c.productCount]));
      expect(counts.get(mesas.slug)).toBe(1);
      expect(counts.get(junji.slug)).toBe(1);
    });
  });

  it("el resumen trae la categoría principal y las adicionales activas", async () => {
    await inRollback(async (tx) => {
      const { mesas, junji, product } = await fixture(tx);
      const listed = async () =>
        (await listProducts(tx, filters(mesas.slug))).items.find((i) => i.slug === product.slug);
      expect((await listed())?.categories).toEqual([mesas.slug, junji.slug]);
      await tx.category.update({ where: { id: junji.id }, data: { active: false } });
      expect((await listed())?.categories).toEqual([mesas.slug]);
    });
  });

  it("una categoría adicional inactiva no muestra el producto", async () => {
    await inRollback(async (tx) => {
      const { junji } = await fixture(tx);
      await tx.category.update({ where: { id: junji.id }, data: { active: false } });
      const { items } = await listProducts(tx, filters(junji.slug));
      expect(items).toEqual([]);
    });
  });

  it("la búsqueda encuentra el producto por el nombre de su categoría adicional activa", async () => {
    await inRollback(async (tx) => {
      const { junji, product } = await fixture(tx);
      const id = product.slug.split("-").pop() ?? "";
      const search = (q: string) =>
        listProducts(tx, { q, sort: "newest", page: 1, pageSize: 20 }).then(({ items }) =>
          items.map((i) => i.slug),
        );
      expect(await search(`linea ${id}`)).toEqual([product.slug]);
      await tx.category.update({ where: { id: junji.id }, data: { active: false } });
      expect(await search(`linea ${id}`)).toEqual([]);
    });
  });

  it("la ficha trae nombre de la opción, plazo y el precio del extra propio del producto", async () => {
    await inRollback(async (tx) => {
      const { product } = await fixture(tx);
      const id = u();
      const armado = await tx.extra.create({
        data: { code: `armado-${id}`, name: "Armado a domicilio", price: null },
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

      const detail = await getProduct(tx, product.slug);
      expect(detail).toMatchObject({ optionName: "Tamaño", leadTime: "10 días hábiles" });
      expect(detail?.extras).toEqual([
        // Precio propio del producto.
        { code: armado.code, name: "Armado a domicilio", price: 15_000, personalization: null },
        // Sin precio propio usa el del extra; el largo, el del producto.
        {
          code: nombre.code,
          name: "Nombre grabado",
          price: 5_000,
          personalization: { label: "Nombre", maxLength: 12 },
        },
      ]);
    });
  });
});
