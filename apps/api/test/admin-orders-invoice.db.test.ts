import { randomInt } from "node:crypto";

import request from "supertest";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

import { createPrismaClient, type PrismaClient } from "../src/lib/prisma.js";
import { buildTestApp } from "./helpers.js";
import { createOrder } from "./order-fixtures.js";
import { inRollback, panelHeaders, panelSession } from "./panel-helpers.js";

// Factura del pedido (LN-13, UI-12) contra totalkids_test, en transacciones que
// se deshacen. Folios al azar para no chocar con otros archivos que corren en
// paralelo (el folio es único en toda la base). Se omite sin TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

type App = ReturnType<typeof buildTestApp>;
type Body = Record<string, unknown>;

const folio = () => String(randomInt(1_000_000, 9_999_999_999));

describe.skipIf(!url)("POST /admin/orders/{id}/invoice (PostgreSQL real)", () => {
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

  const run = (fn: (db: PrismaClient, app: App) => Promise<void>) =>
    inRollback(prisma, (db) => fn(db, buildTestApp({ prisma: db })));

  const post = (app: App, id: string, body: Body, headers = panelHeaders(admin)) =>
    request(app).post(`/api/v1/admin/orders/${id}/invoice`).set(headers).send(body);

  /** Pedido con factura y pago confirmado: pendiente de emitir. */
  const invoiceOrder = (db: PrismaClient, extra: { invoiceFolio?: string } = {}) =>
    createOrder(db, { status: "confirmed", payments: ["paid"], document: "factura", ...extra });

  function issues(res: request.Response) {
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    const list = (res.body as { details: { issues: { path: string; message: string }[] } }).details
      .issues;
    return Object.fromEntries(list.map((i) => [i.path, i.message]));
  }

  function expectConflict(res: request.Response, message: string, field = "form") {
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body).toMatchObject({ code: "CONFLICT", message, details: { field } });
  }

  describe("registrar el primer folio", () => {
    it("el Operador lo registra: 201, sin ceros a la izquierda, con fecha, actor y auditoría", async () => {
      await run(async (db, app) => {
        const order = await invoiceOrder(db);
        const number = folio();
        const res = await post(
          app,
          `TK-${String(order.number)}`,
          { number: `000${number}` },
          panelHeaders(operator),
        );
        expect(res.status, JSON.stringify(res.body)).toBe(201);
        expect(res.body).toMatchObject({
          invoice: { number, issuedBy: "Operador", issuedByName: "Equipo" },
          previousNumber: null,
          invoicePending: false,
        });

        const saved = await db.order.findUniqueOrThrow({ where: { id: order.id } });
        expect(saved).toMatchObject({ invoiceFolio: number, invoiceIssuedByLabel: "Operador" });
        expect(saved.invoiceIssuedAt).toBeInstanceOf(Date);
        expect(saved.invoiceIssuedByUserId).toBeTruthy();

        const audit = await db.auditLog.findMany({
          where: { resourceId: order.id, action: "order.invoice_registered" },
        });
        expect(audit).toHaveLength(1);
        expect(audit[0]).toMatchObject({ actorLabel: "Operador", details: { folio: number } });

        const detail = await request(app)
          .get(`/api/v1/admin/orders/${order.id}`)
          .set(panelHeaders(admin));
        expect(detail.body).toMatchObject({
          billing: { invoice: { number, issuedBy: "Operador" }, invoicePending: false },
        });
      });
    });

    it("folio inválido: 422 en number con el texto del panel", async () => {
      await run(async (db, app) => {
        const order = await invoiceOrder(db);
        for (const number of ["", "  ", "12a", "12-3", "12345678901", 123]) {
          expect(issues(await post(app, order.id, { number })), String(number)).toEqual({
            number: "Ingresa el folio de la factura (solo números).",
          });
        }
        const saved = await db.order.findUniqueOrThrow({ where: { id: order.id } });
        expect(saved.invoiceFolio).toBeNull();
      });
    });

    it("409 si es con boleta, si no está pagado o si ya está registrada", async () => {
      await run(async (db, app) => {
        const boleta = await createOrder(db, { status: "confirmed", payments: ["paid"] });
        expectConflict(
          await post(app, boleta.id, { number: folio() }),
          "Este pedido es con boleta: el comprobante de Flow la reemplaza.",
        );
        for (const status of ["pending_payment", "cancelled", "expired"] as const) {
          const unpaid = await createOrder(db, { status, document: "factura" });
          expectConflict(
            await post(app, unpaid.id, { number: folio() }),
            "La factura se emite cuando el pago está confirmado.",
          );
        }
        const done = await invoiceOrder(db, { invoiceFolio: folio() });
        for (const headers of [panelHeaders(admin), panelHeaders(operator)]) {
          expectConflict(
            await post(app, done.id, { number: folio() }, headers),
            "La factura de este pedido ya está registrada.",
          );
        }
      });
    });

    it("folio repetido en otro pedido: 409 con field number", async () => {
      await run(async (db, app) => {
        const taken = folio();
        await invoiceOrder(db, { invoiceFolio: taken });
        const order = await invoiceOrder(db);
        expectConflict(
          await post(app, order.id, { number: `0${taken}` }),
          "Ese folio ya está registrado en otro pedido.",
          "number",
        );
        const saved = await db.order.findUniqueOrThrow({ where: { id: order.id } });
        expect(saved.invoiceFolio).toBeNull();
      });
    });

    it("404 si el pedido no existe", async () => {
      await run(async (_db, app) => {
        expect((await post(app, "TK-999999999", { number: folio() })).status).toBe(404);
      });
    });
  });

  describe("corregir el folio", () => {
    it("solo el Administrador: Operador con replace → 403", async () => {
      await run(async (db, app) => {
        const order = await invoiceOrder(db, { invoiceFolio: folio() });
        const res = await post(
          app,
          order.id,
          { number: folio(), replace: true, reason: "Folio mal digitado" },
          panelHeaders(operator),
        );
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({
          code: "FORBIDDEN",
          message: "Solo el Administrador corrige el folio de una factura registrada.",
        });
      });
    });

    it("el Administrador corrige con motivo: 200, auditoría con antes y después", async () => {
      await run(async (db, app) => {
        const before = folio();
        const after = folio();
        const order = await invoiceOrder(db, { invoiceFolio: before });
        const res = await post(app, order.id, {
          number: after,
          replace: true,
          reason: "  Folio mal digitado  ",
        });
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body).toMatchObject({
          invoice: { number: after, issuedBy: "Administrador" },
          previousNumber: before,
        });
        const audit = await db.auditLog.findMany({
          where: { resourceId: order.id, action: "order.invoice_replaced" },
        });
        expect(audit).toHaveLength(1);
        expect(audit[0]).toMatchObject({
          reason: "Folio mal digitado",
          details: { from: before, to: after },
        });
      });
    });

    it("motivo obligatorio y un folio distinto (422); folio de otro pedido (409)", async () => {
      await run(async (db, app) => {
        const current = folio();
        const order = await invoiceOrder(db, { invoiceFolio: current });
        expect(issues(await post(app, order.id, { number: folio(), replace: true }))).toEqual({
          reason: "Escribe el motivo de la corrección (mínimo 3 caracteres).",
        });
        expect(
          issues(
            await post(app, order.id, { number: `00${current}`, replace: true, reason: "ok" }),
          ),
        ).toEqual({
          number: "Ese folio ya es el registrado: no hay nada que corregir.",
          reason: "Escribe el motivo de la corrección (mínimo 3 caracteres).",
        });
        const taken = folio();
        await invoiceOrder(db, { invoiceFolio: taken });
        expectConflict(
          await post(app, order.id, { number: taken, replace: true, reason: "Folio mal digitado" }),
          "Ese folio ya está registrado en otro pedido.",
          "number",
        );
        const saved = await db.order.findUniqueOrThrow({ where: { id: order.id } });
        expect(saved.invoiceFolio).toBe(current);
      });
    });

    it("replace sin folio previo registra el primero (201)", async () => {
      await run(async (db, app) => {
        const order = await invoiceOrder(db);
        const res = await post(app, order.id, { number: folio(), replace: true });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ previousNumber: null });
      });
    });
  });
});
