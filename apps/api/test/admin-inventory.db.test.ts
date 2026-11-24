import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient, type PrismaClient } from "../src/lib/prisma.js";
import { buildTestApp } from "./helpers.js";
import { inRollback, panelHeaders, panelSession } from "./panel-helpers.js";

// GET /admin/inventory (LN-16): inventario de todo el catálogo, una fila por
// variante, contra totalkids_test. Cada caso corre en una transacción que se
// deshace. Se omite sin TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("/admin/inventory (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
  let admin = "";
  let operator = "";

  beforeAll(async () => {
    admin = (await panelSession(prisma, "admin")).token;
    operator = (await panelSession(prisma, "operator")).token;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Borrador en una categoría inactiva con dos variantes (una inactiva). */
  async function fixture(db: PrismaClient) {
    const tag = randomUUID().slice(0, 8);
    const category = await db.category.create({
      data: { slug: `inv-${tag}`, name: `Inv ${tag}`, active: false },
    });
    const product = await db.product.create({
      data: { categoryId: category.id, name: `Zz Inventario ${tag}`, slug: `inv-${tag}` },
    });
    const sku = `INV-${tag}`.toUpperCase();
    const first = await db.productVariant.create({
      data: {
        productId: product.id,
        sku: `${sku}-A`,
        optionLabel: "Chica",
        stockPhysical: 5,
        stockReserved: 2,
        sortOrder: 0,
      },
    });
    const second = await db.productVariant.create({
      data: {
        productId: product.id,
        sku: `${sku}-B`,
        optionLabel: "Grande",
        stockPhysical: 3,
        stockReserved: 3,
        sortOrder: 1,
        active: false,
      },
    });
    return { tag, sku, product, first, second };
  }

  const get = (app: ReturnType<typeof buildTestApp>, query: string, token?: string) => {
    const req = request(app).get(`/api/v1/admin/inventory${query}`);
    return token ? req.set(panelHeaders(token)) : req;
  };

  it("permisos: sin sesión 401 y Operador 403", () =>
    inRollback(prisma, async (db) => {
      const app = buildTestApp({ prisma: db });
      expect((await get(app, "")).status).toBe(401);
      expect((await get(app, "", operator)).status).toBe(403);
    }));

  it("lista las variantes (activas e inactivas) con físico, reservado y disponible", () =>
    inRollback(prisma, async (db) => {
      const { sku, product, first, second } = await fixture(db);
      const app = buildTestApp({ prisma: db });

      const res = await get(app, `?q=${sku}`, admin);
      expect(res.status).toBe(200);
      expect(res.body.meta).toMatchObject({ page: 1, total: 2 });
      expect(res.body.items).toEqual([
        {
          variantId: first.id,
          sku: `${sku}-A`,
          optionLabel: "Chica",
          variantActive: true,
          productId: product.id,
          productName: product.name,
          productSlug: product.slug,
          productStatus: "draft",
          stockPhysical: 5,
          stockReserved: 2,
          available: 3,
        },
        expect.objectContaining({
          variantId: second.id,
          variantActive: false,
          // Todo lo físico está reservado: disponible 0 (a pedido, RN-03).
          available: 0,
        }),
      ]);
    }));

  it("busca por nombre de producto sin distinguir mayúsculas y pagina", () =>
    inRollback(prisma, async (db) => {
      const { tag, first, second } = await fixture(db);
      const app = buildTestApp({ prisma: db });

      const byName = await get(app, `?q=zz%20INVENTARIO%20${tag}&pageSize=1`, admin);
      expect(byName.status).toBe(200);
      expect(byName.body.meta).toMatchObject({ total: 2, pageSize: 1, totalPages: 2 });
      expect(byName.body.items.map((i: { variantId: string }) => i.variantId)).toEqual([first.id]);

      const page2 = await get(app, `?q=${tag}&pageSize=1&page=2`, admin);
      expect(page2.body.items.map((i: { variantId: string }) => i.variantId)).toEqual([second.id]);
    }));

  it("valida la consulta (422) y solo acepta GET (405)", () =>
    inRollback(prisma, async (db) => {
      const app = buildTestApp({ prisma: db });
      expect((await get(app, `?q=${"x".repeat(101)}`, admin)).status).toBe(422);
      expect((await get(app, "?pageSize=500", admin)).status).toBe(422);
      const post = await request(app).post("/api/v1/admin/inventory").set(panelHeaders(admin));
      expect(post.status).toBe(405);
    }));
});
