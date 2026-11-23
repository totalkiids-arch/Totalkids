import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient, type PrismaClient } from "../src/lib/prisma.js";
import { LocalDiskImageStorage } from "../src/services/images/local-disk.js";
import { buildTestApp } from "./helpers.js";
import { png, webp } from "./image-fixtures.js";
import { inRollback, panelHeaders, panelSession } from "./panel-helpers.js";

// Imágenes de productos (LN-12) contra totalkids_test, con el adaptador de disco
// en una carpeta temporal. Los casos corren en transacciones que se deshacen
// (inRollback). Se omite sin TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;
const PUBLIC_URL = "http://localhost:4000/uploads";
const TWO_MB = 2 * 1024 * 1024;

describe.skipIf(!url)("/admin/products/{id}/images (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
  const dir = mkdtempSync(path.join(tmpdir(), "tk-images-"));
  const storage = new LocalDiskImageStorage(dir, PUBLIC_URL);
  let admin = "";
  let operator = "";

  beforeAll(async () => {
    admin = (await panelSession(prisma, "admin")).token;
    operator = (await panelSession(prisma, "operator")).token;
  });

  afterAll(async () => {
    rmSync(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  const stored = () => {
    const folder = path.join(dir, "products");
    return existsSync(folder) ? readdirSync(folder) : [];
  };

  async function scenario(
    fn: (s: {
      db: PrismaClient;
      app: ReturnType<typeof buildTestApp>;
      productId: string;
      upload: (file: Buffer, filename: string, fields?: Record<string, string>) => request.Test;
    }) => Promise<void>,
  ) {
    await inRollback(prisma, async (db) => {
      const app = buildTestApp({ prisma: db, imageStorage: storage });
      const tag = randomUUID().slice(0, 8);
      const category = await db.category.create({
        data: { slug: `img-${tag}`, name: `Img ${tag}`, active: false },
      });
      const product = await db.product.create({
        data: { categoryId: category.id, name: "Cuna", slug: `cuna-${tag}` },
      });
      await fn({
        db,
        app,
        productId: product.id,
        upload: (file, filename, fields = { alt: "Cuna de madera vista lateral" }) => {
          let req = request(app)
            .post(`/api/v1/admin/products/${product.id}/images`)
            .set(panelHeaders(admin));
          for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
          return req.attach("file", file, { filename, contentType: "image/png" });
        },
      });
    });
  }

  it("permisos: Operador 403, sin sesión 401, sin CSRF 403", async () => {
    const app = buildTestApp({ prisma, imageStorage: storage });
    const path_ = `/api/v1/admin/products/${randomUUID()}/images`;
    const send = (headers: Record<string, string>) =>
      request(app).post(path_).set(headers).field("alt", "x").attach("file", png(10, 10), "a.png");
    expect((await send(panelHeaders(operator))).status).toBe(403);
    expect((await send({})).status).toBe(403); // sin CSRF el middleware corta antes
    const noSession = await send(panelHeaders());
    expect(noSession.status).toBe(401);
    const noCsrf = await send(panelHeaders(admin, false));
    expect(noCsrf.body.code).toBe("CSRF_FAILED");
    expect(stored()).toEqual([]);
  });

  it("sube un PNG: nombre generado, tamaño leído, URL pública, archivo servido y auditado", () =>
    scenario(async ({ db, app, productId, upload }) => {
      const res = await upload(png(800, 600), "../../mi foto.png");
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        alt: "Cuna de madera vista lateral",
        width: 800,
        height: 600,
        sortOrder: 0,
        variantId: null,
      });
      const imageUrl = res.body.url as string;
      expect(imageUrl).toMatch(new RegExp(`^${PUBLIC_URL}/products/[0-9a-f-]{36}\\.png$`));
      const file = imageUrl.slice(`${PUBLIC_URL}/products/`.length);
      expect(stored()).toContain(file);

      const served = await request(app).get(`/uploads/products/${file}`);
      expect(served.status).toBe(200);
      expect(served.headers["content-type"]).toBe("image/png");
      expect(served.headers["cross-origin-resource-policy"]).toBe("cross-origin");
      expect(served.headers["x-content-type-options"]).toBe("nosniff");

      const second = await upload(webp(640, 480), "otra.webp");
      expect(second.body).toMatchObject({ sortOrder: 1, width: 640 });
      expect(
        await db.auditLog.count({
          where: { action: "product_image.created", resourceId: productId },
        }),
      ).toBe(2);
    }));

  it("rechaza un archivo con extensión falsa (verifica los bytes) y no guarda nada", () =>
    scenario(async ({ upload }) => {
      const before = stored().length;
      const res = await upload(Buffer.from("<?php echo 'hola'; ?>"), "foto.png");
      expect(res.status).toBe(422);
      expect(res.body.details.issues).toContainEqual({
        location: "body",
        path: "file",
        message: "Formato no permitido: usa una imagen JPG, PNG o WebP.",
      });
      expect(stored()).toHaveLength(before);
    }));

  it("rechaza imágenes de más de 2 MB con 413", () =>
    scenario(async ({ upload }) => {
      const before = stored().length;
      const justOver = await upload(png(100, 100, TWO_MB + 1), "grande.png");
      expect(justOver.status).toBe(413);
      expect(justOver.body).toMatchObject({
        code: "PAYLOAD_TOO_LARGE",
        message: "La imagen pesa más de 2 MB. Usa una más liviana.",
      });
      const huge = await upload(png(100, 100, 3 * 1024 * 1024), "enorme.png");
      expect(huge.status).toBe(413);
      expect(stored()).toHaveLength(before);
    }));

  it("exige texto alternativo y que la variante sea del producto", () =>
    scenario(async ({ upload }) => {
      const noAlt = await upload(png(10, 10), "a.png", {});
      expect(noAlt.status).toBe(422);
      expect(noAlt.body.details.issues).toContainEqual({
        location: "body",
        path: "alt",
        message: "Describe la imagen para quien no puede verla.",
      });
      const otherVariant = await upload(png(10, 10), "a.png", {
        alt: "Foto",
        variantId: randomUUID(),
      });
      expect(otherVariant.status).toBe(422);
      expect(otherVariant.body.details.issues[0].path).toBe("variantId");
    }));

  it("multipart solo en esta ruta: JSON aquí o multipart en otra ruta → 415", () =>
    scenario(async ({ app, productId }) => {
      const json = await request(app)
        .post(`/api/v1/admin/products/${productId}/images`)
        .set(panelHeaders(admin))
        .send({ alt: "x" });
      expect(json.status).toBe(415);
      const elsewhere = await request(app)
        .post("/api/v1/admin/products")
        .set(panelHeaders(admin))
        .field("name", "x");
      expect(elsewhere.status).toBe(415);
    }));

  it("edita el texto, reordena y borra (también el archivo)", () =>
    scenario(async ({ app, productId, upload }) => {
      const ids: string[] = [];
      for (const name of ["a", "b", "c"]) {
        ids.push((await upload(png(10, 10), `${name}.png`)).body.id as string);
      }
      const base = `/api/v1/admin/products/${productId}/images`;
      const h = panelHeaders(admin);

      const edited = await request(app)
        .patch(`${base}/${String(ids[0])}`)
        .set(h)
        .send({ alt: "Cuna con baranda" });
      expect(edited.body.alt).toBe("Cuna con baranda");

      const reversed = [...ids].reverse();
      const order = await request(app).put(`${base}/order`).set(h).send({ imageIds: reversed });
      expect(order.status).toBe(200);
      expect(order.body.items.map((i: { id: string }) => i.id)).toEqual(reversed);
      const partial = await request(app)
        .put(`${base}/order`)
        .set(h)
        .send({ imageIds: ids.slice(1) });
      expect(partial.status).toBe(422);

      const detail = await request(app).get(`/api/v1/admin/products/${productId}`).set(h);
      const target = (detail.body.images as { id: string; url: string }[])[0];
      const file = path.basename(String(target?.url));
      expect(stored()).toContain(file);
      const del = await request(app)
        .delete(`${base}/${String(target?.id)}`)
        .set(h);
      expect(del.status).toBe(204);
      expect(stored()).not.toContain(file);
      expect(
        (
          await request(app)
            .delete(`${base}/${String(target?.id)}`)
            .set(h)
        ).status,
      ).toBe(404);
    }));

  it("un producto publicado no se queda sin imágenes (409)", () =>
    scenario(async ({ db, app, productId, upload }) => {
      const image = await upload(png(10, 10), "a.png");
      await db.product.update({
        where: { id: productId },
        data: { status: "active", publishedAt: new Date("2026-01-01") },
      });
      const res = await request(app)
        .delete(`/api/v1/admin/products/${productId}/images/${String(image.body.id)}`)
        .set(panelHeaders(admin));
      expect(res.status).toBe(409);
      expect(res.body.message).toBe(
        "Un producto publicado necesita al menos una imagen. Sube otra antes de quitar esta.",
      );
    }));
});
