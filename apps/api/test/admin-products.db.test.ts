import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient, type PrismaClient } from "../src/lib/prisma.js";
import { buildTestApp } from "./helpers.js";
import { inRollback, panelHeaders, panelSession } from "./panel-helpers.js";

// Productos del panel (LN-12) contra totalkids_test. Cada caso que escribe corre
// en una transacción que se deshace (inRollback): catalog.db.test.ts corre en
// paralelo y cuenta exacto las categorías y productos visibles. Se omite sin
// TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

const api = (path: string) => `/api/v1/admin${path}`;

describe.skipIf(!url)("/admin/products (PostgreSQL real)", () => {
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

  const as = (token: string) => panelHeaders(token);

  /** App, categorías y extra propios, dentro de una transacción que se deshace. */
  async function scenario(
    fn: (s: Awaited<ReturnType<typeof setup>>) => Promise<void>,
  ): Promise<void> {
    await inRollback(prisma, async (db) => fn(await setup(db)));
  }

  async function setup(db: PrismaClient) {
    const app = buildTestApp({ prisma: db });
    const tag = randomUUID().slice(0, 8);
    const category = await db.category.create({
      data: { slug: `sillas-${tag}`, name: `Sillas ${tag}` },
    });
    const inactive = await db.category.create({
      data: { slug: `antigua-${tag}`, name: `Antigua ${tag}`, active: false },
    });
    const extraCode = `nombre-${tag}`;
    await db.extra.create({
      data: {
        code: extraCode,
        name: "Nombre grabado",
        price: 5_000,
        requiresText: true,
        textLabel: "Nombre",
        textMaxLength: 20,
      },
    });

    const body = (overrides: Record<string, unknown> = {}) => ({
      name: `Silla Montessori ${tag}`,
      description: "Silla de madera para sala cuna.",
      categoryId: category.id,
      variants: [{ sku: `tk-${tag}-${randomUUID().slice(0, 6)}`, price: 49_990 }],
      ...overrides,
    });

    return {
      db,
      app,
      tag,
      categoryId: category.id,
      inactiveCategoryId: inactive.id,
      extraCode,
      body,
      create: (overrides: Record<string, unknown> = {}) =>
        request(app).post(api("/products")).set(as(admin)).send(body(overrides)),
      patch: (id: unknown, payload: Record<string, unknown>) =>
        request(app)
          .patch(api(`/products/${String(id)}`))
          .set(as(admin))
          .send(payload),
      addImage: (productId: unknown, alt = "Silla de madera vista de frente") =>
        db.productImage.create({
          data: {
            productId: String(productId),
            url: `http://localhost:4000/uploads/products/${randomUUID()}.webp`,
            alt,
          },
        }),
    };
  }

  describe("permisos", () => {
    const app = buildTestApp({ prisma });

    it("sin sesión 401, Operador 403, Administrador 200", async () => {
      expect((await request(app).get(api("/products"))).status).toBe(401);
      const asOperator = await request(app).get(api("/products")).set(as(operator));
      expect(asOperator.status).toBe(403);
      expect(asOperator.body.code).toBe("FORBIDDEN");
      expect((await request(app).get(api("/products")).set(as(admin))).status).toBe(200);
    });

    it("el Operador no puede crear, editar ni desactivar; sin CSRF se rechaza con 403", async () => {
      const id = randomUUID();
      const body = { name: "x" };
      expect((await request(app).post(api("/products")).set(as(operator)).send(body)).status).toBe(
        403,
      );
      expect(
        (
          await request(app)
            .patch(api(`/products/${id}`))
            .set(as(operator))
            .send(body)
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .delete(api(`/products/${id}`))
            .set(as(operator))
        ).status,
      ).toBe(403);
      const noCsrf = await request(app)
        .post(api("/products"))
        .set(panelHeaders(admin, false))
        .send(body);
      expect(noCsrf.status).toBe(403);
      expect(noCsrf.body.code).toBe("CSRF_FAILED");
    });
  });

  describe("crear", () => {
    it("crea un borrador con slug derivado, SKU en mayúsculas, extras y stock inicial auditado", () =>
      scenario(async ({ db, tag, create, categoryId, extraCode }) => {
        const sku = `tk-${tag}-ini`;
        const res = await create({
          name: `Mesa Pikler Ñandú ${tag}`,
          optionName: "Tamaño",
          additionalCategoryIds: [categoryId],
          variants: [
            { sku, optionLabel: "Chica", price: 59_990, stockPhysical: 3 },
            { sku: `${sku}-g`, optionLabel: "Grande", price: 79_990, compareAtPrice: 89_990 },
          ],
          extras: [{ code: extraCode, price: 3_000, textMaxLength: 12 }],
        });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
          slug: `mesa-pikler-nandu-${tag}`,
          status: "draft",
          publishedAt: null,
          category: { id: categoryId },
          additionalCategories: [],
          extras: [{ code: extraCode, price: 3_000, textMaxLength: 12, effectivePrice: 3_000 }],
        });
        const variants = res.body.variants as { sku: string; stockPhysical: number }[];
        expect(variants.map((v) => v.sku)).toEqual([sku.toUpperCase(), `${sku}-g`.toUpperCase()]);
        expect(variants[0]).toMatchObject({ stockPhysical: 3, available: 3 });

        const movement = await db.inventoryMovement.findFirst({
          where: { variant: { sku: sku.toUpperCase() } },
        });
        expect(movement).toMatchObject({ kind: "adjustment", physicalDelta: 3, physicalAfter: 3 });
        const audit = await db.auditLog.findFirst({
          where: { action: "product.created", resourceId: res.body.id as string },
        });
        expect(audit?.actorLabel).toBe("Administrador");
      }));

    it("dos productos con el mismo nombre reciben slugs distintos", () =>
      scenario(async ({ tag, create }) => {
        const first = await create({ name: `Banca ${tag}` });
        const second = await create({ name: `Banca ${tag}` });
        expect(first.body.slug).toBe(`banca-${tag}`);
        expect(second.body.slug).toBe(`banca-${tag}-2`);
      }));

    it("rechaza un SKU repetido aunque cambien las mayúsculas", () =>
      scenario(async ({ tag, create }) => {
        const sku = `TK-${tag}-DUP`;
        expect((await create({ variants: [{ sku, price: 1_000 }] })).status).toBe(201);
        const res = await create({ variants: [{ sku: sku.toLowerCase(), price: 1_000 }] });
        expect(res.status).toBe(422);
        expect(res.body.details.issues).toContainEqual({
          location: "body",
          path: "variants.0.sku",
          message: "Ese SKU ya existe. Usa un código único.",
        });
        const inBatch = await create({
          optionName: "Color",
          variants: [
            { sku: `x-${tag}`, optionLabel: "Azul", price: 1 },
            { sku: `X-${tag}`, optionLabel: "Rojo", price: 1 },
          ],
        });
        expect(inBatch.status).toBe(422);
        expect(inBatch.body.details.issues[0].path).toBe("variants.1.sku");
      }));

    it("rechaza importes inválidos (RN-01) con los mensajes del panel", () =>
      scenario(async ({ create }) => {
        const cases: [Record<string, unknown>, string, string][] = [
          [{ price: -1 }, "variants.0.price", "El precio no puede ser negativo."],
          [
            { price: 12.5 },
            "variants.0.price",
            "El precio: usa pesos enteros, sin puntos ni decimales.",
          ],
          [
            { price: 10_000, compareAtPrice: 9_000 },
            "variants.0.compareAtPrice",
            "El precio anterior debe ser igual o mayor al precio actual.",
          ],
        ];
        for (const [variant, path, message] of cases) {
          const res = await create({
            variants: [{ sku: `p-${randomUUID().slice(0, 8)}`, ...variant }],
          });
          expect(res.status, path).toBe(422);
          expect(res.body.details.issues).toContainEqual({ location: "body", path, message });
        }
      }));

    it("un precio anterior igual al precio se guarda como sin oferta", () =>
      scenario(async ({ tag, create }) => {
        const res = await create({
          variants: [{ sku: `eq-${tag}`, price: 10_000, compareAtPrice: 10_000 }],
        });
        expect(res.status).toBe(201);
        expect(res.body.variants[0].compareAtPrice).toBeNull();
      }));

    it("no acepta una categoría inactiva ni un extra inexistente", () =>
      scenario(async ({ create, inactiveCategoryId }) => {
        const res = await create({
          categoryId: inactiveCategoryId,
          extras: [{ code: "no-existe" }],
        });
        expect(res.status).toBe(422);
        const paths = (res.body.details.issues as { path: string }[]).map((i) => i.path);
        expect(paths).toEqual(expect.arrayContaining(["categoryId", "extras.0.code"]));
      }));

    it("exige al menos una variante", () =>
      scenario(async ({ create }) => {
        const res = await create({ variants: [] });
        expect(res.status).toBe(422);
        expect(res.body.details.issues[0].message).toBe("Agrega al menos una variante.");
      }));
  });

  describe("publicar", () => {
    it("no publica sin precio en sus variantes activas", () =>
      scenario(async ({ tag, create, patch, addImage }) => {
        const draft = await create({ variants: [{ sku: `np-${tag}`, price: null }] });
        await addImage(draft.body.id);
        const res = await patch(draft.body.id, { status: "active" });
        expect(res.status).toBe(422);
        expect(res.body.details.issues[0].message).toBe(
          `Define el precio de la variante NP-${tag.toUpperCase()} antes de publicar.`,
        );
      }));

    it("no publica sin imagen con texto alternativo; con imagen sí y fija publishedAt", () =>
      scenario(async ({ create, patch, addImage }) => {
        const draft = await create();
        const noImage = await patch(draft.body.id, { status: "active" });
        expect(noImage.status).toBe(422);
        expect(noImage.body.details.issues).toContainEqual({
          location: "body",
          path: "images",
          message: "Sube al menos una imagen con texto alternativo antes de publicar.",
        });
        await addImage(draft.body.id);
        const ok = await patch(draft.body.id, { status: "active" });
        expect(ok.status).toBe(200);
        expect(ok.body.status).toBe("active");
        expect(ok.body.publishedAt).not.toBeNull();
      }));

    it("el catálogo público (LN-05) no muestra borradores ni inactivos", () =>
      scenario(async ({ db, app, tag, create, patch, addImage }) => {
        const word = `zq${tag.replace(/[^a-z]/g, "")}x`;
        const draft = await create({ name: `Repisa ${word} borrador` });
        const live = await create({ name: `Repisa ${word} publicada` });
        await addImage(live.body.id);
        // Dentro de una sola transacción now() es su inicio: se fija una fecha
        // anterior (publicar conserva la que ya tiene) para que la tienda la vea.
        await db.product.update({
          where: { id: live.body.id as string },
          data: { publishedAt: new Date("2026-01-01") },
        });
        expect((await patch(live.body.id, { status: "active" })).status).toBe(200);

        const names = async () =>
          (
            (await request(app).get(`/api/v1/products?q=${word}`)).body.items as { name: string }[]
          ).map((p) => p.name);
        expect(await names()).toEqual([`Repisa ${word} publicada`]);
        expect(draft.body.status).toBe("draft");

        const del = await request(app)
          .delete(api(`/products/${String(live.body.id)}`))
          .set(as(admin));
        expect(del.status).toBe(204);
        expect(await names()).toEqual([]);
        const ficha = await request(app).get(`/api/v1/products/${String(live.body.slug)}`);
        expect(ficha.status).toBe(404);
      }));
  });

  describe("desactivar y quitar variantes", () => {
    it("DELETE desactiva en vez de borrar y queda auditado", () =>
      scenario(async ({ db, app, create }) => {
        const product = await create();
        const id = product.body.id as string;
        const res = await request(app)
          .delete(api(`/products/${id}`))
          .set(as(admin));
        expect(res.status).toBe(204);
        const row = await db.product.findUnique({ where: { id }, include: { variants: true } });
        expect(row?.status).toBe("inactive");
        expect(row?.variants).toHaveLength(1);
        expect(
          await db.auditLog.count({ where: { action: "product.deactivated", resourceId: id } }),
        ).toBe(1);
        const missing = await request(app)
          .delete(api(`/products/${randomUUID()}`))
          .set(as(admin));
        expect(missing.status).toBe(404);
      }));

    it("con reservas 409; con historial se desactiva; sin nada se borra", () =>
      scenario(async ({ db, tag, create, patch }) => {
        const product = await create({
          optionName: "Color",
          variants: [
            { sku: `keep-${tag}`, optionLabel: "Azul", price: 1_000 },
            { sku: `hist-${tag}`, optionLabel: "Rojo", price: 1_000, stockPhysical: 2 },
            { sku: `free-${tag}`, optionLabel: "Verde", price: 1_000 },
          ],
        });
        const id = product.body.id as string;
        const [keep, hist, free] = product.body.variants as { id: string; sku: string }[];
        await db.productVariant.update({
          where: { id: keep?.id ?? "" },
          data: { stockPhysical: 2, stockReserved: 1 },
        });

        const reserved = await patch(id, {
          variants: [{ id: hist?.id, sku: hist?.sku, optionLabel: "Rojo", price: 1_000 }],
        });
        expect(reserved.status).toBe(409);
        expect(reserved.body.message).toBe(
          `La variante ${String(keep?.sku)} tiene unidades reservadas y no se puede quitar.`,
        );

        const ok = await patch(id, {
          variants: [{ id: keep?.id, sku: keep?.sku, optionLabel: "Azul", price: 1_000 }],
        });
        expect(ok.status).toBe(200);
        const rows = await db.productVariant.findMany({ where: { productId: id } });
        expect(rows.find((v) => v.id === hist?.id)?.active).toBe(false);
        expect(rows.find((v) => v.id === free?.id)).toBeUndefined();
        const audit = await db.auditLog.findFirst({
          where: { action: "product.updated", resourceId: id },
          orderBy: { createdAt: "desc" },
        });
        expect(audit?.details).toMatchObject({
          variants: { deactivated: [hist?.sku], deleted: [free?.sku] },
        });
      }));

    it("el stock de una variante existente no se cambia al editar el producto", () =>
      scenario(async ({ create, patch }) => {
        const product = await create();
        const variant = product.body.variants[0] as { id: string; sku: string };
        const res = await patch(product.body.id, {
          variants: [{ id: variant.id, sku: variant.sku, price: 2_000, stockPhysical: 9 }],
        });
        expect(res.status).toBe(422);
        expect(res.body.details.issues[0].path).toBe("variants.0.stockPhysical");
      }));
  });

  describe("listar y detalle", () => {
    it("busca por nombre o SKU y filtra por estado y categoría", () =>
      scenario(async ({ app, tag, create, categoryId }) => {
        const product = await create({
          name: `Cajonera ${tag}`,
          variants: [{ sku: `caj-${tag}-find`, price: 5_000 }],
        });
        const list = (query: string) =>
          request(app)
            .get(api(`/products?${query}`))
            .set(as(admin));
        const byName = await list(`q=cajonera ${tag}`);
        expect(byName.body.items.map((p: { id: string }) => p.id)).toEqual([product.body.id]);
        const bySku = await list(`q=CAJ-${tag}-FIND`);
        expect(bySku.body.items[0]).toMatchObject({
          id: product.body.id,
          price: 5_000,
          variantCount: 1,
        });
        const filtered = await list(`q=cajonera ${tag}&status=active&categoryId=${categoryId}`);
        expect(filtered.body.items).toEqual([]);
        expect(filtered.body.meta).toMatchObject({ page: 1, total: 0 });

        const detail = await request(app)
          .get(api(`/products/${String(product.body.id)}`))
          .set(as(admin));
        expect(detail.status).toBe(200);
        expect(detail.body.variants[0]).toMatchObject({
          stockPhysical: 0,
          stockReserved: 0,
          active: true,
        });
        const missing = await request(app)
          .get(api(`/products/${randomUUID()}`))
          .set(as(admin));
        expect(missing.status).toBe(404);
      }));
  });
});
