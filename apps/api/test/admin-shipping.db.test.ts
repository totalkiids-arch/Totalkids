import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient, type PrismaClient } from "../src/lib/prisma.js";
import { buildTestApp } from "./helpers.js";
import { createOrder } from "./order-fixtures.js";
import { inRollback, panelHeaders, panelSession } from "./panel-helpers.js";

// Zonas de despacho, condiciones de retiro y plantilla (LN-16, RF-08, RF-28,
// RN-02) contra totalkids_test. Todo lo que escribe corre en una transacción
// que se deshace: la cotización (shipping-quote.db.test.ts) usa las mismas filas.
const url = process.env.TEST_DATABASE_URL;
const api = (path: string) => `/api/v1${path}`;

type Issue = { path: string; message: string };
const issueAt = (body: { details?: { issues?: Issue[] } }, path: string) =>
  body.details?.issues?.find((i) => i.path === path)?.message;

describe.skipIf(!url)(
  "/admin/shipping-*, /admin/store-theme y /store-theme (PostgreSQL real)",
  () => {
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
        commune: string;
        send: (
          method: "post" | "patch" | "put" | "delete",
          path: string,
          body?: object,
        ) => request.Test;
      }) => Promise<void>,
    ) {
      await inRollback(prisma, async (db) => {
        const app = buildTestApp({ prisma: db });
        const h = panelHeaders(admin);
        await fn({
          db,
          app,
          commune: `Ñuñoa ${randomUUID().slice(0, 6)}`,
          send: (method, path, body) => request(app)[method](api(path)).set(h).send(body),
        });
      });
    }

    it("permisos: sin sesión 401, Operador 403 en zonas, condiciones y plantilla", async () => {
      const app = buildTestApp({ prisma });
      for (const path of [
        "/admin/shipping-zones",
        "/admin/shipping-settings",
        "/admin/store-theme",
      ]) {
        expect((await request(app).get(api(path))).status, path).toBe(401);
        expect((await request(app).get(api(path)).set(panelHeaders(operator))).status, path).toBe(
          403,
        );
      }
      const noCsrf = await request(app)
        .put(api("/admin/store-theme"))
        .set(panelHeaders(admin, false))
        .send({ theme: "navidad" });
      expect(noCsrf.status).toBe(403);
    });

    it("crea zonas con tarifa por confirmar y rechaza la comuna repetida sin tildes", async () => {
      await scenario(async ({ db, commune, send }) => {
        const res = await send("post", "/admin/shipping-zones", {
          region: "rm",
          commune: `  ${commune}  `,
          price: null,
          leadTime: "A coordinar con el taller",
          freeShippingEligible: false,
        });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
          region: "RM",
          commune,
          price: null,
          freeShippingEligible: false,
          active: true,
        });
        const folded = commune.replace("Ñuñoa", "NUNOA");
        const dup = await send("post", "/admin/shipping-zones", {
          region: "RM",
          commune: folded,
          price: 4990,
          leadTime: "3 a 5 días hábiles",
        });
        expect(dup.status).toBe(422);
        expect(issueAt(dup.body, "commune")).toBe(
          "Esa comuna ya tiene una zona en esta región. Edita la existente.",
        );
        // En otra región sí se puede.
        const other = await send("post", "/admin/shipping-zones", {
          region: "AR",
          commune,
          price: 0,
          leadTime: "2 días hábiles",
        });
        expect(other.status).toBe(201);
        expect(
          await db.auditLog.count({
            where: {
              resourceType: "shipping_zone",
              action: "shipping_zone.created",
              resourceId: { in: [res.body.id as string, other.body.id as string] },
            },
          }),
        ).toBe(2);
      });
    });

    it("valida la zona con los textos del panel", async () => {
      await scenario(async ({ send }) => {
        const res = await send("post", "/admin/shipping-zones", {
          region: "XX",
          commune: "",
          price: 2_000_000,
          leadTime: "x".repeat(61),
        });
        expect(res.status).toBe(422);
        expect(issueAt(res.body, "region")).toBe("Elige una región.");
        expect(issueAt(res.body, "commune")).toBe("Escribe la comuna.");
        expect(issueAt(res.body, "price")).toBe("La tarifa parece demasiado alta. Revísala.");
        expect(issueAt(res.body, "leadTime")).toBe("Usa 60 caracteres o menos.");
        const decimals = await send("post", "/admin/shipping-zones", {
          region: "RM",
          commune: "Providencia",
          price: 4990.5,
          leadTime: "3 días",
        });
        expect(issueAt(decimals.body, "price")).toBe(
          "Escribe la tarifa en pesos, sin decimales (p. ej. 4990).",
        );
      });
    });

    it("cambiar la tarifa o desactivar no modifica pedidos anteriores (RN-02)", async () => {
      await scenario(async ({ db, commune, send }) => {
        const zone = (
          await send("post", "/admin/shipping-zones", {
            region: "RM",
            commune,
            price: 5000,
            leadTime: "5 a 7 días hábiles",
          })
        ).body as { id: string };
        const order = await createOrder(db, { delivery: "shipping" });
        await db.order.update({ where: { id: order.id }, data: { shippingZoneId: zone.id } });

        const edited = await send("patch", `/admin/shipping-zones/${zone.id}`, {
          price: 9990,
          leadTime: "10 días hábiles",
        });
        expect(edited.status).toBe(200);
        expect(edited.body).toMatchObject({ price: 9990, leadTime: "10 días hábiles" });
        expect((await send("delete", `/admin/shipping-zones/${zone.id}`)).status).toBe(204);
        expect(await db.shippingZone.findUnique({ where: { id: zone.id } })).toMatchObject({
          active: false,
        });

        const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
        expect(after).toMatchObject({
          shippingCost: order.shippingCost,
          total: order.total,
          shippingLeadTime: order.shippingLeadTime,
          shippingZoneId: zone.id,
        });
        const actions = await db.auditLog.findMany({
          where: { resourceType: "shipping_zone", resourceId: zone.id },
          orderBy: { createdAt: "asc" },
        });
        expect(actions.map((a) => a.action)).toEqual([
          "shipping_zone.created",
          "shipping_zone.updated",
          "shipping_zone.deactivated",
        ]);
        expect(
          (await send("patch", `/admin/shipping-zones/${randomUUID()}`, { active: true })).status,
        ).toBe(404);
      });
    });

    it("guarda las condiciones de retiro y despacho y las valida", async () => {
      await scenario(async ({ db, send }) => {
        const bad = await send("put", "/admin/shipping-settings", {
          pickupEnabled: true,
          pickupDetails: "   ",
          freeShippingThreshold: -1,
          reservationMinutes: 121,
        });
        expect(bad.status).toBe(422);
        expect(issueAt(bad.body, "pickupDetails")).toBe(
          "Escribe la dirección y el horario de retiro.",
        );
        expect(issueAt(bad.body, "freeShippingThreshold")).toBe(
          "Escribe un monto en pesos, o déjalo vacío si no hay despacho gratis.",
        );
        expect(issueAt(bad.body, "reservationMinutes")).toBe(
          "Escribe un número de minutos entre 1 y 120.",
        );

        const ok = await send("put", "/admin/shipping-settings", {
          pickupEnabled: false,
          pickupDetails: "Taller  Total Kids, Temuco · L a V 10–18 h",
          freeShippingThreshold: null,
          reservationMinutes: 45,
        });
        expect(ok.status).toBe(200);
        expect(ok.body).toMatchObject({
          pickupEnabled: false,
          pickupDetails: "Taller Total Kids, Temuco · L a V 10–18 h",
          freeShippingThreshold: null,
          reservationMinutes: 45,
        });
        const read = await send("put", "/admin/shipping-settings", {
          pickupEnabled: true,
          pickupDetails: "Taller Total Kids, Temuco · L a V 10–18 h",
          freeShippingThreshold: 150_000,
          reservationMinutes: 45,
        });
        expect(read.body.freeShippingThreshold).toBe(150_000);
        const audit = await db.auditLog.findFirst({
          where: { action: "settings.shipping_updated" },
          orderBy: { createdAt: "desc" },
        });
        expect(audit?.details).toMatchObject({
          changes: { pickupEnabled: { before: false, after: true } },
        });

        // Retiro deshabilitado: la cotización ya no lo ofrece (lo lee LN-06).
        await send("put", "/admin/shipping-settings", {
          pickupEnabled: false,
          pickupDetails: "Taller",
          freeShippingThreshold: null,
          reservationMinutes: 30,
        });
        expect((await db.setting.findUniqueOrThrow({ where: { id: 1 } })).pickupEnabled).toBe(
          false,
        );
      });
    });

    it("cambia la plantilla activa y la tienda la lee sin sesión", async () => {
      await scenario(async ({ db, app, send }) => {
        const current = await request(app).get(api("/admin/store-theme")).set(panelHeaders(admin));
        expect(current.status).toBe(200);
        expect(current.body.themes).toContain("navidad");

        const bad = await send("put", "/admin/store-theme", { theme: "halloween" });
        expect(bad.status).toBe(422);
        expect(issueAt(bad.body, "theme")).toBe("Elige una plantilla de la lista.");

        const ok = await send("put", "/admin/store-theme", { theme: "navidad" });
        expect(ok.status).toBe(200);
        expect(ok.body.theme).toBe("navidad");
        const pub = await request(app).get(api("/store-theme"));
        expect(pub.status).toBe(200);
        expect(pub.body).toEqual({ theme: "navidad" });
        expect(
          await db.auditLog.count({ where: { action: "settings.theme_changed" } }),
        ).toBeGreaterThan(0);
      });
    });
  },
);
