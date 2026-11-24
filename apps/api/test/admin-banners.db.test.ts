import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient, type PrismaClient } from "../src/lib/prisma.js";
import { buildTestApp } from "./helpers.js";
import { inRollback, panelHeaders, panelSession } from "./panel-helpers.js";

// Banners del panel y de la portada (LN-16, RF-28) contra totalkids_test. Cada
// caso que escribe corre en una transacción que se deshace (inRollback).
const url = process.env.TEST_DATABASE_URL;
const api = (path: string) => `/api/v1${path}`;
const HOUR = 60 * 60 * 1000;

type Issue = { path: string; message: string };
const issueAt = (body: { details?: { issues?: Issue[] } }, path: string) =>
  body.details?.issues?.find((i) => i.path === path)?.message;

describe.skipIf(!url)("/admin/banners y /banners (PostgreSQL real)", () => {
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
      patch: (id: string, body: Record<string, unknown>) => request.Test;
    }) => Promise<void>,
  ) {
    await inRollback(prisma, async (db) => {
      const app = buildTestApp({ prisma: db });
      const h = panelHeaders(admin);
      await fn({
        db,
        app,
        tag: randomUUID().slice(0, 8),
        post: (body) => request(app).post(api("/admin/banners")).set(h).send(body),
        patch: (id, body) =>
          request(app)
            .patch(api(`/admin/banners/${id}`))
            .set(h)
            .send(body),
      });
    });
  }

  const base = (tag: string) => ({
    title: `Línea JUNJI ${tag}`,
    text: "Muebles certificados para salas cuna y jardines.",
    href: "/catalogo?categoria=junji",
    sortOrder: 1,
  });

  it("permisos: sin sesión 401, Operador 403, sin CSRF 403", async () => {
    const app = buildTestApp({ prisma });
    expect((await request(app).get(api("/admin/banners"))).status).toBe(401);
    expect((await request(app).get(api("/admin/banners")).set(panelHeaders(operator))).status).toBe(
      403,
    );
    expect(
      (
        await request(app)
          .post(api("/admin/banners"))
          .set(panelHeaders(admin, false))
          .send(base("x"))
      ).status,
    ).toBe(403);
  });

  it("crea, colapsa espacios, edita y audita", async () => {
    await scenario(async ({ db, tag, post, patch }) => {
      const res = await post({ ...base(tag), title: `  Línea   JUNJI ${tag} ` });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        title: `Línea JUNJI ${tag}`,
        active: true,
        visibility: "visible",
        startsAt: null,
      });
      const id = res.body.id as string;
      const edited = await patch(id, { sortOrder: 3, text: "Nuevo texto" });
      expect(edited.status).toBe(200);
      expect(edited.body).toMatchObject({ sortOrder: 3, text: "Nuevo texto" });
      const actions = await db.auditLog.findMany({
        where: { resourceType: "banner", resourceId: id },
        orderBy: { createdAt: "asc" },
      });
      expect(actions.map((a) => a.action)).toEqual(["banner.created", "banner.updated"]);
    });
  });

  it("el destino solo puede ser interno", async () => {
    await scenario(async ({ post, tag }) => {
      for (const href of [
        "https://otro.cl",
        "//otro.cl/x",
        "javascript:alert(1)",
        "data:text/html,x",
        "/\\otro.cl",
        "/con espacio",
        "catalogo",
      ]) {
        const res = await post({ ...base(tag), href });
        expect(res.status, href).toBe(422);
        expect(issueAt(res.body, "href"), href).toBe(
          "El destino debe ser una página de la tienda que empiece con «/» (p. ej. /catalogo). No se permiten enlaces externos.",
        );
      }
      const empty = await post({ ...base(tag), href: " " });
      expect(issueAt(empty.body, "href")).toBe("Escribe el destino, por ejemplo /catalogo.");
    });
  });

  it("valida largos, orden y ventana con los textos del panel", async () => {
    await scenario(async ({ post, tag }) => {
      const res = await post({
        title: "x".repeat(61),
        text: "",
        href: "/catalogo",
        sortOrder: 100,
        startsAt: "2026-12-10T00:00:00-03:00",
        endsAt: "2026-12-01T00:00:00-03:00",
      });
      expect(res.status).toBe(422);
      expect(issueAt(res.body, "title")).toBe("Usa 60 caracteres o menos.");
      expect(issueAt(res.body, "text")).toBe("Escribe el texto de apoyo.");
      expect(issueAt(res.body, "sortOrder")).toBe(
        "El orden debe ser un número entero entre 1 y 99.",
      );
      expect(issueAt(res.body, "endsAt")).toBe(
        "El término de la publicación debe ser posterior al inicio.",
      );
      const long = await post({ ...base(tag), text: "y".repeat(141) });
      expect(issueAt(long.body, "text")).toBe("Usa 140 caracteres o menos.");
    });
  });

  it("DELETE desactiva (no borra) y la portada solo muestra activos y vigentes", async () => {
    await scenario(async ({ db, app, tag, post }) => {
      const now = Date.now();
      const visible = (await post({ ...base(tag), sortOrder: 2 })).body.id as string;
      const first = (await post({ ...base(`${tag}-a`), sortOrder: 1 })).body.id as string;
      const scheduled = (
        await post({ ...base(`${tag}-p`), startsAt: new Date(now + HOUR).toISOString() })
      ).body;
      expect(scheduled.visibility).toBe("scheduled");
      const ended = (
        await post({
          ...base(`${tag}-t`),
          startsAt: new Date(now - 2 * HOUR).toISOString(),
          endsAt: new Date(now - HOUR).toISOString(),
        })
      ).body;
      expect(ended.visibility).toBe("ended");
      const gone = (await post({ ...base(`${tag}-x`) })).body.id as string;

      const del = await request(app)
        .delete(api(`/admin/banners/${gone}`))
        .set(panelHeaders(admin));
      expect(del.status).toBe(204);
      expect(await db.banner.findUnique({ where: { id: gone } })).toMatchObject({ active: false });

      const pub = await request(app).get(api("/banners"));
      expect(pub.status).toBe(200);
      const ids = (pub.body.items as { id: string }[]).map((b) => b.id);
      expect(ids.filter((id) => [visible, first].includes(id))).toEqual([first, visible]);
      for (const hidden of [scheduled.id, ended.id, gone]) expect(ids).not.toContain(hidden);
      expect(Object.keys(pub.body.items[0] as object).sort()).toEqual(
        ["href", "id", "sortOrder", "text", "title"].sort(),
      );

      const missing = await request(app)
        .delete(api(`/admin/banners/${randomUUID()}`))
        .set(panelHeaders(admin));
      expect(missing.status).toBe(404);
      expect(missing.body.message).toBe("Ese banner ya no existe.");
    });
  });
});
