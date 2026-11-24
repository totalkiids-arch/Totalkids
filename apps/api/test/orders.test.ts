import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  formatOrderNumber,
  formatRut,
  isValidRut,
  normalizePhone,
  parseOrderNumber,
} from "../src/domain/checkout.js";
import { issueOrderAccess, verifyOrderAccess } from "../src/lib/order-access.js";
import { buildTestApp, csrfHeaders } from "./helpers.js";

describe("datos del checkout (mismas reglas que la web)", () => {
  it("valida y formatea el RUT con módulo 11", () => {
    expect(isValidRut("12.345.678-5")).toBe(true);
    expect(isValidRut("10000013-k")).toBe(true);
    expect(isValidRut("12.345.678-9")).toBe(false);
    expect(isValidRut("01234567-8")).toBe(false);
    expect(formatRut("123456785")).toBe("12.345.678-5");
  });

  it("normaliza el teléfono chileno", () => {
    expect(normalizePhone("+56 9 1234 5678")).toBe("+56912345678");
    expect(normalizePhone("(9) 1234-5678")).toBe("+56912345678");
    expect(normalizePhone("1234")).toBeNull();
  });

  it("número visible del pedido", () => {
    expect(formatOrderNumber(1001)).toBe("TK-1001");
    for (const value of ["TK-1048", "tk-1048", "#TK-1048", "1048", " tk 1048 "]) {
      expect(parseOrderNumber(value), value).toBe(1048);
    }
    expect(parseOrderNumber("TK-")).toBeNull();
    expect(parseOrderNumber("../1")).toBeNull();
  });
});

describe("credencial X-Order-Access", () => {
  const secret = "secreto-de-pruebas-con-al-menos-32-caracteres";

  it("es estable por pedido y no se puede usar en otro", () => {
    const token = issueOrderAccess(secret, "pedido-1");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issueOrderAccess(secret, "pedido-1")).toBe(token);
    expect(verifyOrderAccess(secret, "pedido-1", token)).toBe(true);
    expect(verifyOrderAccess(secret, "pedido-2", token)).toBe(false);
  });

  it("no sirve con otro secreto ni alterada", () => {
    const token = issueOrderAccess(secret, "pedido-1");
    expect(verifyOrderAccess(`${secret}-rotado`, "pedido-1", token)).toBe(false);
    expect(verifyOrderAccess(secret, "pedido-1", `${token.slice(0, -1)}A`)).toBe(
      token.endsWith("A"),
    );
    expect(verifyOrderAccess(secret, "pedido-1", "")).toBe(false);
  });
});

describe("POST /orders (sin base)", () => {
  const app = buildTestApp();
  const valid = {
    buyer: {
      name: "María González",
      rut: "12345678-5",
      email: "Maria@Correo.cl",
      phone: "912345678",
    },
    delivery: { method: "retiro" },
    billing: { document: "boleta" },
    expectedTotal: 50_000,
    termsAccepted: true,
  };
  const post = (body: object, key?: string) => {
    const req = request(app).post("/api/v1/orders").set(csrfHeaders());
    return (key ? req.set("Idempotency-Key", key) : req).send(body);
  };

  it("exige CSRF", async () => {
    const res = await request(app).post("/api/v1/orders").send(valid);
    expect(res.status).toBe(403);
  });

  it("exige una Idempotency-Key válida", async () => {
    for (const key of [undefined, "corta", "con espacios no válidos!!"]) {
      const res = await post(valid, key);
      expect(res.status, String(key)).toBe(422);
      expect(res.body.details.issues[0].path).toBe("Idempotency-Key");
    }
  });

  it("valida comprador, entrega, factura y aceptación de condiciones", async () => {
    const res = await post(
      {
        buyer: { name: "", rut: "12.345.678-9", email: "maria@", phone: "123" },
        delivery: { method: "despacho", region: "XX", commune: "", street: "" },
        billing: { document: "factura" },
        expectedTotal: -1,
        termsAccepted: false,
      },
      "0f8fad5b-d9cb-469f-a165-70867728950e",
    );
    expect(res.status).toBe(422);
    const paths = (res.body.details.issues as { path: string }[]).map((i) => i.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "buyer.name",
        "buyer.rut",
        "buyer.email",
        "buyer.phone",
        "delivery.region",
        "billing.rut",
        "expectedTotal",
        "termsAccepted",
      ]),
    );
  });

  it("sin carrito responde 409 empty_cart sin tocar la base", async () => {
    const res = await post(valid, "0f8fad5b-d9cb-469f-a165-70867728950e");
    expect(res.status).toBe(409);
    expect(res.body.details.reason).toBe("empty_cart");
  });
});

describe("consulta de pedido de invitado (sin base)", () => {
  it("GET /orders/{n} sin credencial responde 401 sin tocar la base", async () => {
    const res = await request(buildTestApp()).get("/api/v1/orders/TK-1001");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("POST /orders/lookup exige CSRF y valida número y correo", async () => {
    const app = buildTestApp();
    expect(
      (
        await request(app)
          .post("/api/v1/orders/lookup")
          .send({ orderNumber: "TK-1", email: "a@b.cl" })
      ).status,
    ).toBe(403);
    const res = await request(app)
      .post("/api/v1/orders/lookup")
      .set(csrfHeaders())
      .send({ orderNumber: "", email: "no-es-correo" });
    expect(res.status).toBe(422);
    const paths = (res.body.details.issues as { path: string }[]).map((i) => i.path).sort();
    expect(paths).toEqual(["email", "orderNumber"]);
  });

  it("limita las consultas por IP: 10 cada 15 minutos", async () => {
    const app = buildTestApp();
    const send = () =>
      request(app)
        .post("/api/v1/orders/lookup")
        .set(csrfHeaders())
        .send({ orderNumber: "", email: "" });
    for (let i = 0; i < 10; i++) expect((await send()).status).toBe(422);
    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("RATE_LIMITED");
  });
});
