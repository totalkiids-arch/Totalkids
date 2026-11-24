import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient, type PrismaClient } from "../src/lib/prisma.js";
import { chileDate } from "../src/services/cart/chile-date.js";
import { buildTestApp } from "./helpers.js";
import { createOrder } from "./order-fixtures.js";
import { inRollback, panelHeaders, panelSession } from "./panel-helpers.js";

// Cupones del panel (LN-16, RF-28) contra totalkids_test. Cada caso que escribe
// corre en una transacción que se deshace (inRollback): los tests del carrito
// (cart-coupon.db.test.ts) usan la misma tabla. Se omite sin TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;
const api = (path: string) => `/api/v1/admin${path}`;

const DAY = 24 * 60 * 60 * 1000;
const day = (offset: number) => chileDate(new Date(Date.now() + offset * DAY));

type Issue = { path: string; message: string };
const issueAt = (body: { details?: { issues?: Issue[] } }, path: string) =>
  body.details?.issues?.find((i) => i.path === path)?.message;

describe.skipIf(!url)("/admin/coupons (PostgreSQL real)", () => {
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
      code: string;
      post: (body: Record<string, unknown>) => request.Test;
      patch: (id: string, body: Record<string, unknown>) => request.Test;
      del: (id: string) => request.Test;
      list: () => request.Test;
    }) => Promise<void>,
  ) {
    await inRollback(prisma, async (db) => {
      const app = buildTestApp({ prisma: db });
      const h = panelHeaders(admin);
      await fn({
        db,
        code: `T${randomUUID().slice(0, 8).toUpperCase()}`,
        post: (body) => request(app).post(api("/coupons")).set(h).send(body),
        patch: (id, body) =>
          request(app)
            .patch(api(`/coupons/${id}`))
            .set(h)
            .send(body),
        del: (id) =>
          request(app)
            .delete(api(`/coupons/${id}`))
            .set(h),
        list: () => request(app).get(api("/coupons")).set(h),
      });
    });
  }

  const base = (code: string) => ({
    code,
    kind: "percent",
    value: 10,
    startsOn: day(-1),
    endsOn: day(30),
    maxUses: 50,
  });

  it("permisos: sin sesión 401, Operador 403 (también al leer), sin CSRF 403", async () => {
    const app = buildTestApp({ prisma });
    expect((await request(app).get(api("/coupons"))).status).toBe(401);
    expect((await request(app).get(api("/coupons")).set(panelHeaders(operator))).status).toBe(403);
    const asOperator = await request(app)
      .post(api("/coupons"))
      .set(panelHeaders(operator))
      .send(base("NOPE"));
    expect(asOperator.status).toBe(403);
    const noCsrf = await request(app)
      .post(api("/coupons"))
      .set(panelHeaders(admin, false))
      .send(base("NOPE"));
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.code).toBe("CSRF_FAILED");
  });

  it("crea con el código normalizado, lo lista con estado derivado y audita", async () => {
    await scenario(async ({ db, code, post, list }) => {
      const res = await post({ ...base(` ${code.toLowerCase().slice(0, 4)} ${code.slice(4)} `) });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        code,
        kind: "percent",
        value: 10,
        uses: 0,
        reservedUses: 0,
        consumedUses: 0,
        active: true,
        status: "active",
        statusLabel: "Activo",
        termsLocked: false,
        canDelete: true,
      });
      const audit = await db.auditLog.findFirst({
        where: { resourceType: "coupon", resourceId: res.body.id as string },
      });
      expect(audit).toMatchObject({ action: "coupon.created", actorLabel: "Administrador" });

      await post({ ...base(`${code}P`), startsOn: day(5), endsOn: day(9) });
      await post({ ...base(`${code}V`), startsOn: day(-9), endsOn: day(-2) });
      await post({ ...base(`${code}I`), active: false });
      const listed = await list();
      expect(listed.status).toBe(200);
      const mine = (listed.body.items as { code: string; status: string }[]).filter((c) =>
        c.code.startsWith(code),
      );
      expect(mine.map((c) => [c.code, c.status])).toEqual([
        [code, "active"],
        [`${code}P`, "scheduled"],
        [`${code}V`, "expired"],
        [`${code}I`, "inactive"],
      ]);
    });
  });

  it("rechaza con los textos del panel (422 por campo)", async () => {
    await scenario(async ({ post, code }) => {
      const bad = await post({
        code: "Ñ1",
        kind: "percent",
        value: 101,
        startsOn: day(5),
        endsOn: day(1),
        maxUses: 0,
      });
      expect(bad.status).toBe(422);
      expect(issueAt(bad.body, "code")).toBe("El código debe tener entre 3 y 20 caracteres.");
      expect(issueAt(bad.body, "value")).toBe(
        "El porcentaje debe ser un número entero entre 1 y 100.",
      );
      expect(issueAt(bad.body, "endsOn")).toBe(
        "La fecha de término no puede ser anterior al inicio.",
      );
      expect(issueAt(bad.body, "maxUses")).toBe(
        "El máximo de usos debe ser un número entero de al menos 1.",
      );

      const accents = await post({ ...base("NIÑOS10") });
      expect(issueAt(accents.body, "code")).toBe(
        "Usa solo letras sin tilde (A–Z), números, guion (-) o guion bajo (_).",
      );
      const amount = await post({ ...base(code), kind: "amount", value: 0 });
      expect(issueAt(amount.body, "value")).toBe("El monto debe ser mayor que 0.");
      const decimals = await post({ ...base(code), kind: "amount", value: 4990.5 });
      expect(decimals.status).toBe(422);
      const fakeDate = await post({ ...base(code), startsOn: "2026-02-30" });
      expect(issueAt(fakeDate.body, "startsOn")).toBe("Elige la fecha de inicio.");
    });
  });

  it("el código es único sin distinguir mayúsculas", async () => {
    await scenario(async ({ post, code }) => {
      expect((await post(base(code))).status).toBe(201);
      const dup = await post(base(code.toLowerCase()));
      expect(dup.status).toBe(422);
      expect(issueAt(dup.body, "code")).toBe(
        "Ese código ya existe. Usa otro o edita el cupón existente.",
      );
    });
  });

  it("con usos: código, tipo y valor fijos (409); vigencia y máximo sí cambian", async () => {
    await scenario(async ({ db, code, post, patch }) => {
      const created = await post(base(code));
      const id = created.body.id as string;
      await db.coupon.update({ where: { id }, data: { usesCount: 3 } });

      for (const change of [{ code: `${code}X` }, { kind: "amount" }, { value: 15 }]) {
        const res = await patch(id, change);
        expect(res.status).toBe(409);
        expect(res.body.message).toBe("Tiene usos: para otro descuento crea un cupón nuevo.");
        expect(res.body.details.field).toBe(Object.keys(change)[0]);
      }
      // Mandar los mismos términos no es un cambio.
      const same = await patch(id, { code: code.toLowerCase(), kind: "percent", value: 10 });
      expect(same.status).toBe(200);

      const tooLow = await patch(id, { maxUses: 2 });
      expect(tooLow.status).toBe(422);
      expect(issueAt(tooLow.body, "maxUses")).toBe(
        "El máximo no puede ser menor que los 3 usos ya consumidos.",
      );
      const ok = await patch(id, { maxUses: 3, endsOn: day(60) });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ maxUses: 3, endsOn: day(60), status: "exhausted" });
      expect(ok.body.termsLocked).toBe(true);
      expect(ok.body.canDelete).toBe(false);

      const audit = await db.auditLog.findFirst({
        where: { resourceType: "coupon", resourceId: id, action: "coupon.updated" },
        orderBy: { createdAt: "desc" },
      });
      expect(audit?.details).toMatchObject({ changes: { maxUses: { before: 50, after: 3 } } });
    });
  });

  it("activar y desactivar se auditan aparte", async () => {
    await scenario(async ({ db, code, post, patch }) => {
      const id = (await post(base(code))).body.id as string;
      const off = await patch(id, { active: false });
      expect(off.body).toMatchObject({ active: false, status: "inactive" });
      await patch(id, { active: true });
      const actions = await db.auditLog.findMany({
        where: { resourceType: "coupon", resourceId: id },
        orderBy: { createdAt: "asc" },
        select: { action: true },
      });
      expect(actions.map((a) => a.action)).toEqual([
        "coupon.created",
        "coupon.deactivated",
        "coupon.activated",
      ]);
    });
  });

  it("elimina solo sin usos ni historial; si no, 409 y solo se desactiva", async () => {
    await scenario(async ({ db, code, post, del }) => {
      const free = (await post(base(code))).body.id as string;
      expect((await del(free)).status).toBe(204);
      expect(await db.coupon.findUnique({ where: { id: free } })).toBeNull();
      expect(
        await db.auditLog.count({ where: { resourceId: free, action: "coupon.deleted" } }),
      ).toBe(1);
      expect((await del(free)).status).toBe(404);

      const used = (await post(base(`${code}U`))).body.id as string;
      await db.coupon.update({ where: { id: used }, data: { usesCount: 1 } });
      const inUse = await del(used);
      expect(inUse.status).toBe(409);
      expect(inUse.body.message).toBe("Este cupón tiene usos: solo se puede desactivar.");

      // Canje liberado: usesCount vuelve a 0, pero el pedido lo cita.
      const released = (await post(base(`${code}R`))).body.id as string;
      const order = await createOrder(db, { couponId: released });
      await db.couponRedemption.update({
        where: { orderId: order.id },
        data: { status: "released" },
      });
      expect((await del(released)).status).toBe(409);
    });
  });

  it("404 para un cupón inexistente y 422 para un id mal formado", async () => {
    await scenario(async ({ patch }) => {
      const missing = await patch(randomUUID(), { active: false });
      expect(missing.status).toBe(404);
      expect(missing.body.message).toBe("Ese cupón ya no existe.");
      expect((await patch("abc", { active: false })).status).toBe(422);
      expect((await patch(randomUUID(), {})).status).toBe(422);
    });
  });
});
