import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient, type PrismaClient } from "../src/lib/prisma.js";
import { buildTestApp } from "./helpers.js";
import { inRollback, panelHeaders, panelSession } from "./panel-helpers.js";

// Ajustes de inventario (LN-12, RF-34, RN-03) contra totalkids_test. Los casos
// simples corren en transacciones que se deshacen; los de concurrencia usan
// conexiones reales sobre un borrador de una categoría inactiva (nunca visible
// en la tienda) que se borra al final. Se omite sin TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("/admin/products/{id}/stock-adjustments (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
  const committed = { categories: [] as string[], products: [] as string[] };
  let admin = "";
  let operator = "";

  beforeAll(async () => {
    admin = (await panelSession(prisma, "admin")).token;
    operator = (await panelSession(prisma, "operator")).token;
  });

  afterAll(async () => {
    const where = { variant: { productId: { in: committed.products } } };
    await prisma.inventoryMovement.deleteMany({ where });
    await prisma.productVariant.deleteMany({ where: { productId: { in: committed.products } } });
    await prisma.product.deleteMany({ where: { id: { in: committed.products } } });
    await prisma.category.deleteMany({ where: { id: { in: committed.categories } } });
    await prisma.$disconnect();
  });

  /** Borrador con una variante (físico y reservado dados) en una categoría inactiva. */
  async function fixture(db: PrismaClient, physical: number, reserved: number) {
    const tag = randomUUID().slice(0, 8);
    const category = await db.category.create({
      data: { slug: `stock-${tag}`, name: `Stock ${tag}`, active: false },
    });
    const product = await db.product.create({
      data: { categoryId: category.id, name: "Mesa", slug: `mesa-stock-${tag}` },
    });
    const variant = await db.productVariant.create({
      data: {
        productId: product.id,
        sku: `STK-${tag}`.toUpperCase(),
        stockPhysical: physical,
        stockReserved: reserved,
      },
    });
    return { category, product, variant };
  }

  const adjust = (
    app: ReturnType<typeof buildTestApp>,
    productId: string,
    body: Record<string, unknown>,
    headers = panelHeaders(admin),
  ) =>
    request(app)
      .post(`/api/v1/admin/products/${productId}/stock-adjustments`)
      .set(headers)
      .send(body);

  async function scenario(
    physical: number,
    reserved: number,
    fn: (s: {
      db: PrismaClient;
      app: ReturnType<typeof buildTestApp>;
      productId: string;
      variantId: string;
    }) => Promise<void>,
  ) {
    await inRollback(prisma, async (db) => {
      const { product, variant } = await fixture(db, physical, reserved);
      await fn({
        db,
        app: buildTestApp({ prisma: db }),
        productId: product.id,
        variantId: variant.id,
      });
    });
  }

  it("permisos: sin sesión 401, Operador 403, sin CSRF 403", () =>
    scenario(5, 0, async ({ app, productId, variantId }) => {
      const body = { variantId, stockPhysical: 6, reason: "Conteo" };
      expect((await adjust(app, productId, body, panelHeaders())).status).toBe(401);
      expect((await adjust(app, productId, body, panelHeaders(operator))).status).toBe(403);
      const noCsrf = await adjust(app, productId, body, panelHeaders(admin, false));
      expect(noCsrf.body.code).toBe("CSRF_FAILED");
      const history = await request(app)
        .get(`/api/v1/admin/products/${productId}/stock-movements`)
        .set(panelHeaders(operator));
      expect(history.status).toBe(403);
    }));

  it("ajusta el físico, crea el movimiento y la auditoría con actor y motivo", () =>
    scenario(5, 2, async ({ db, app, productId, variantId }) => {
      const res = await adjust(app, productId, {
        variantId,
        stockPhysical: 8,
        reason: "  Conteo de bodega de noviembre ",
      });
      expect(res.status).toBe(201);
      expect(res.body.variant).toMatchObject({ stockPhysical: 8, stockReserved: 2, available: 6 });
      expect(res.body.movement).toMatchObject({
        kind: "adjustment",
        physicalBefore: 5,
        physicalAfter: 8,
        physicalDelta: 3,
        reservedBefore: 2,
        reservedAfter: 2,
        reason: "Conteo de bodega de noviembre",
        actorLabel: "Administrador",
        actorName: "Equipo",
      });

      const movement = await db.inventoryMovement.findFirstOrThrow({ where: { variantId } });
      expect(movement).toMatchObject({ kind: "adjustment", physicalDelta: 3, physicalAfter: 8 });
      expect(movement.actorUserId).not.toBeNull();
      const audit = await db.auditLog.findFirstOrThrow({
        where: { action: "inventory.adjusted", resourceId: variantId },
      });
      expect(audit).toMatchObject({
        resourceType: "product_variant",
        reason: "Conteo de bodega de noviembre",
        actorLabel: "Administrador",
      });
      expect(audit.details).toMatchObject({ stockPhysical: { before: 5, after: 8 } });
    }));

  it("no deja el físico por debajo de lo reservado (RN-03)", () =>
    scenario(5, 2, async ({ db, app, productId, variantId }) => {
      const res = await adjust(app, productId, { variantId, stockPhysical: 1, reason: "Merma" });
      expect(res.status).toBe(422);
      expect(res.body.details.issues).toEqual([
        {
          location: "body",
          path: "stockPhysical",
          message: "El stock físico no puede ser menor que las 2 unidades reservadas.",
        },
      ]);
      expect(
        (await db.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockPhysical,
      ).toBe(5);
      expect(await db.inventoryMovement.count({ where: { variantId } })).toBe(0);
    }));

  it("valida el valor, el motivo, que cambie algo y que la variante sea del producto", () =>
    scenario(5, 0, async ({ app, productId, variantId }) => {
      const cases: [Record<string, unknown>, string][] = [
        [{ stockPhysical: -1, reason: "x" }, "El stock físico no puede ser negativo."],
        [
          { stockPhysical: 2.5, reason: "x" },
          "El stock físico debe ser un número entero de unidades.",
        ],
        [{ stockPhysical: 3, reason: "   " }, "Escribe el motivo del ajuste."],
        [
          { stockPhysical: 5, reason: "Igual" },
          "El stock físico ya es 5: no hay nada que ajustar.",
        ],
      ];
      for (const [body, message] of cases) {
        const res = await adjust(app, productId, { variantId, ...body });
        expect(res.status, message).toBe(422);
        expect(res.body.details.issues[0].message).toBe(message);
      }
      const other = await adjust(app, randomUUID(), { variantId, stockPhysical: 3, reason: "x" });
      expect(other.status).toBe(404);
    }));

  it("historial por producto o variante: fecha, actor, antes → después y motivo", () =>
    scenario(5, 0, async ({ db, app, productId, variantId }) => {
      const second = await db.productVariant.create({
        data: { productId, sku: `STK-B-${randomUUID().slice(0, 6)}`.toUpperCase() },
      });
      await adjust(app, productId, { variantId, stockPhysical: 7, reason: "Llegó producción" });
      await adjust(app, productId, { variantId, stockPhysical: 6, reason: "Muestra dañada" });
      await adjust(app, productId, { variantId: second.id, stockPhysical: 2, reason: "Conteo" });

      const base = `/api/v1/admin/products/${productId}/stock-movements`;
      const all = await request(app).get(base).set(panelHeaders(admin));
      expect(all.status).toBe(200);
      expect(all.body.meta).toMatchObject({ total: 3 });
      const one = await request(app).get(`${base}?variantId=${variantId}`).set(panelHeaders(admin));
      expect(
        (one.body.items as { physicalBefore: number; physicalAfter: number; reason: string }[]).map(
          (m) => [m.physicalBefore, m.physicalAfter, m.reason],
        ),
      ).toEqual([
        [7, 6, "Muestra dañada"],
        [5, 7, "Llegó producción"],
      ]);
      expect(one.body.items[0]).toMatchObject({
        actorLabel: "Administrador",
        sku: expect.any(String),
      });
      expect(typeof one.body.items[0].createdAt).toBe("string");
      const missing = await request(app)
        .get(`/api/v1/admin/products/${randomUUID()}/stock-movements`)
        .set(panelHeaders(admin));
      expect(missing.status).toBe(404);
    }));

  describe("concurrencia (conexiones reales)", () => {
    const app = buildTestApp({ prisma });

    async function committedFixture(physical: number, reserved: number) {
      const f = await fixture(prisma, physical, reserved);
      committed.categories.push(f.category.id);
      committed.products.push(f.product.id);
      return f;
    }

    it("varios ajustes simultáneos no pierden actualizaciones: cada uno parte del anterior", async () => {
      const { product, variant } = await committedFixture(10, 0);
      const targets = [11, 12, 13, 14, 15];
      const responses = await Promise.all(
        targets.map((stockPhysical) =>
          adjust(app, product.id, {
            variantId: variant.id,
            stockPhysical,
            reason: `Ajuste a ${String(stockPhysical)}`,
          }),
        ),
      );
      expect(responses.map((r) => r.status)).toEqual(targets.map(() => 201));

      const movements = await prisma.inventoryMovement.findMany({
        where: { variantId: variant.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      expect(movements).toHaveLength(targets.length);
      // La cadena es continua: el "antes" de cada ajuste es el "después" del anterior.
      let previous = 10;
      for (const m of movements) {
        expect(m.physicalAfter - m.physicalDelta).toBe(previous);
        previous = m.physicalAfter;
      }
      const final = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
      expect(final.stockPhysical).toBe(previous);
    });

    it("espera a una reserva en curso y valida contra las reservas ya confirmadas", async () => {
      const { product, variant } = await committedFixture(10, 2);
      let markLocked!: () => void;
      let release!: () => void;
      const locked = new Promise<void>((resolve) => (markLocked = resolve));
      const held = new Promise<void>((resolve) => (release = resolve));

      // Otra conexión reserva 3 unidades y mantiene la fila bloqueada.
      const reservation = prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`
            UPDATE "product_variants" SET "stock_reserved" = "stock_reserved" + 3
            WHERE "id" = ${variant.id}::uuid`;
          markLocked();
          await held;
        },
        { timeout: 20_000 },
      );
      await locked;
      const pending = adjust(app, product.id, {
        variantId: variant.id,
        stockPhysical: 4,
        reason: "Conteo",
      }).then((res) => res);
      await new Promise((resolve) => setTimeout(resolve, 300));
      release();
      await reservation;

      const res = await pending;
      expect(res.status).toBe(422);
      expect(res.body.details.issues[0].message).toBe(
        "El stock físico no puede ser menor que las 5 unidades reservadas.",
      );
      const row = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
      expect(row).toMatchObject({ stockPhysical: 10, stockReserved: 5 });
    });
  });
});
