import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient, type PrismaClient } from "../src/lib/prisma.js";
import { buildTestApp } from "./helpers.js";
import { inRollback, panelHeaders, panelSession } from "./panel-helpers.js";

// Categorías y extras del panel (LN-12) contra totalkids_test. Cada caso que
// escribe corre en una transacción que se deshace (inRollback), para no alterar
// los conteos exactos de catalog.db.test.ts. Se omite sin TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

const api = (path: string) => `/api/v1/admin${path}`;

describe.skipIf(!url)("/admin/categories (PostgreSQL real)", () => {
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

  async function scenario(
    fn: (s: {
      db: PrismaClient;
      app: ReturnType<typeof buildTestApp>;
      tag: string;
      post: (body: Record<string, unknown>) => request.Test;
      patch: (id: unknown, body: Record<string, unknown>) => request.Test;
      del: (id: unknown) => request.Test;
    }) => Promise<void>,
  ) {
    await inRollback(prisma, async (db) => {
      const app = buildTestApp({ prisma: db });
      const h = panelHeaders(admin);
      await fn({
        db,
        app,
        tag: randomUUID().slice(0, 8),
        post: (body) => request(app).post(api("/categories")).set(h).send(body),
        patch: (id, body) =>
          request(app)
            .patch(api(`/categories/${String(id)}`))
            .set(h)
            .send(body),
        del: (id) =>
          request(app)
            .delete(api(`/categories/${String(id)}`))
            .set(h),
      });
    });
  }

  it("permisos: sin sesión 401, Operador 403, sin CSRF 403", async () => {
    const app = buildTestApp({ prisma });
    expect((await request(app).get(api("/categories"))).status).toBe(401);
    expect((await request(app).get(api("/categories")).set(panelHeaders(operator))).status).toBe(
      403,
    );
    expect(
      (await request(app).post(api("/categories")).set(panelHeaders(operator)).send({ name: "x" }))
        .status,
    ).toBe(403);
    expect((await request(app).get(api("/extras")).set(panelHeaders(operator))).status).toBe(403);
    const noCsrf = await request(app)
      .post(api("/categories"))
      .set(panelHeaders(admin, false))
      .send({ name: "x" });
    expect(noCsrf.body.code).toBe("CSRF_FAILED");
  });

  it("crea con slug derivado del nombre y queda auditado", () =>
    scenario(async ({ db, tag, post }) => {
      const res = await post({ name: `Montessori y Pikler ${tag}`, description: "Juego libre" });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        slug: `montessori-y-pikler-${tag}`,
        active: true,
        productCount: 0,
        description: "Juego libre",
      });
      const audit = await db.auditLog.findFirst({
        where: { action: "category.created", resourceId: res.body.id as string },
      });
      expect(audit?.actorLabel).toBe("Administrador");
    }));

  it("rechaza nombres repetidos sin distinguir mayúsculas ni tildes, y nombres sin letras", () =>
    scenario(async ({ tag, post }) => {
      expect((await post({ name: `Línea Junji ${tag}` })).status).toBe(201);
      const repeated = await post({ name: `  LINEA   junji ${tag.toUpperCase()} ` });
      expect(repeated.status).toBe(422);
      expect(repeated.body.details.issues).toEqual([
        { location: "body", path: "name", message: "Ya existe una categoría con ese nombre." },
      ]);
      const symbols = await post({ name: "¡¡!!" });
      expect(symbols.body.details.issues[0].message).toBe(
        "Usa al menos una letra o un número en el nombre.",
      );
      const empty = await post({ name: "  " });
      expect(empty.body.details.issues[0].message).toBe("Escribe el nombre de la categoría.");
    }));

  it("editar cambia el nombre pero no el slug; no permite tomar el nombre de otra", () =>
    scenario(async ({ tag, post, patch }) => {
      const a = await post({ name: `Cunas ${tag}` });
      await post({ name: `Camas ${tag}` });
      const renamed = await patch(a.body.id, { name: `Cunas y moisés ${tag}`, sortOrder: 3 });
      expect(renamed.status).toBe(200);
      expect(renamed.body).toMatchObject({ slug: `cunas-${tag}`, sortOrder: 3 });
      const clash = await patch(a.body.id, { name: `CAMAS ${tag}` });
      expect(clash.status).toBe(422);
      const missing = await patch(randomUUID(), { name: "Otra" });
      expect(missing.status).toBe(404);
    }));

  it("lista activas e inactivas con el conteo de productos (principal o adicional)", () =>
    scenario(async ({ db, app, tag }) => {
      const mesas = await db.category.create({
        data: { slug: `mesas-${tag}`, name: `Mesas ${tag}` },
      });
      const junji = await db.category.create({
        data: { slug: `junji-${tag}`, name: `JUNJI ${tag}`, active: false },
      });
      const p1 = await db.product.create({
        data: { categoryId: mesas.id, name: "Mesa", slug: `mesa-${tag}` },
      });
      await db.productCategory.create({ data: { productId: p1.id, categoryId: junji.id } });
      await db.product.create({
        data: { categoryId: junji.id, name: "Silla", slug: `silla-${tag}`, status: "inactive" },
      });

      const res = await request(app).get(api("/categories")).set(panelHeaders(admin));
      expect(res.status).toBe(200);
      const byId = new Map(
        (res.body.items as { id: string; productCount: number; active: boolean }[]).map((c) => [
          c.id,
          c,
        ]),
      );
      expect(byId.get(mesas.id)).toMatchObject({ productCount: 1, active: true });
      expect(byId.get(junji.id)).toMatchObject({ productCount: 2, active: false });
    }));

  it("DELETE desactiva y avisa cuántos productos la usan", () =>
    scenario(async ({ db, tag, post, del }) => {
      const used = await post({ name: `Baúles ${tag}` });
      await db.product.create({
        data: {
          categoryId: used.body.id as string,
          name: "Baúl",
          slug: `baul-${tag}`,
          status: "active",
          publishedAt: new Date("2026-01-01"),
        },
      });
      const res = await del(used.body.id);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        category: { active: false, productCount: 1 },
        productsUsingCount: 1,
        hiddenProductsCount: 1,
      });
      expect(res.body.warning).toContain("1 producto(s) usan esta categoría");
      // El producto no se toca.
      expect((await db.product.findFirst({ where: { slug: `baul-${tag}` } }))?.status).toBe(
        "active",
      );

      const empty = await post({ name: `Vacía ${tag}` });
      const quiet = await del(empty.body.id);
      expect(quiet.body).toMatchObject({ productsUsingCount: 0, warning: null });
      expect((await del(randomUUID())).status).toBe(404);
      expect(
        await db.auditLog.count({
          where: { action: "category.deactivated", resourceId: used.body.id as string },
        }),
      ).toBe(1);
    }));

  it("GET /admin/extras lista los extras disponibles para los productos", () =>
    scenario(async ({ db, app, tag }) => {
      await db.extra.create({
        data: { code: `armado-${tag}`, name: "Armado a domicilio", price: null },
      });
      const res = await request(app).get(api("/extras")).set(panelHeaders(admin));
      expect(res.status).toBe(200);
      expect(res.body.items).toContainEqual(
        expect.objectContaining({ code: `armado-${tag}`, price: null, requiresText: false }),
      );
    }));
});
