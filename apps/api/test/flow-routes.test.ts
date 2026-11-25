import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../src/lib/prisma.js";
import { FlowRejectedError, FlowUncertainError } from "../src/services/flow/client.js";
import { FLOW_PRODUCTION_BASE, parseFlowConfig } from "../src/services/flow/config.js";
import { seal, unseal } from "../src/services/flow/seal.js";
import { queryAttempt } from "../src/services/flow/attempt.js";
import type { FlowGateway } from "../src/services/flow/start.js";
import { buildTestApp, csrfHeaders } from "./helpers.js";

// Rutas de Flow (LN-10) sin base de datos. El flujo completo: flow-payments.db.test.ts.
const TOKEN = "TOKENDEFLOW1234567890";

function setup(getStatusError: Error, knownTokens = 0) {
  const getStatus = vi.fn().mockRejectedValue(getStatusError);
  const flow: FlowGateway = {
    client: { getStatus, createPayment: vi.fn(), getStatusByCommerceOrder: vi.fn() },
    callbackBase: "https://api.test/api/v1",
    sealSecret: "secreto",
  };
  const prisma = {
    $queryRaw: vi.fn(),
    payment: {
      count: vi.fn().mockResolvedValue(knownTokens),
      findUnique: vi.fn().mockResolvedValue(null),
    },
  } as unknown as PrismaClient;
  return { app: buildTestApp({ prisma, flow }), getStatus };
}

type App = ReturnType<typeof buildTestApp>;
const callback = (app: App, path: "confirm" | "return", token = TOKEN) =>
  request(app).post(`/api/v1/payments/flow/${path}`).type("form").send({ token });

describe("URL de pago cifrada", () => {
  it("se recupera solo con la misma clave y sin alteraciones", () => {
    const url = "https://sandbox.flow.cl/app/web/pay.php?token=ABC";
    const sealed = seal(url, "clave");
    expect(sealed).not.toContain("ABC");
    expect(unseal(sealed, "clave")).toBe(url);
    expect(unseal(sealed, "otra")).toBeNull();
    expect(unseal(`AAAA${sealed.slice(4)}`, "clave")).toBeNull();
    expect(unseal("", "clave")).toBeNull();
  });
});

describe("consulta de un intento", () => {
  it("usa el token guardado; sin él, el número de orden", async () => {
    const getStatus = vi.fn().mockResolvedValue({});
    const getStatusByCommerceOrder = vi.fn().mockResolvedValue({});
    const flow = {
      client: { createPayment: vi.fn(), getStatus, getStatusByCommerceOrder },
      sealSecret: "clave",
    };
    const stored = seal(`https://sandbox.flow.cl/pay?token=${TOKEN}`, "clave");
    const query = (redirectUrlEncrypted: string | null) =>
      queryAttempt(flow, { commerceOrder: "TK-1-1", redirectUrlEncrypted });
    expect(await query(stored)).toMatchObject({ token: TOKEN });
    expect(getStatus).toHaveBeenCalledWith(TOKEN);
    await query(null);
    expect(getStatusByCommerceOrder).toHaveBeenCalledWith("TK-1-1");
  });
});

describe("FLOW_CALLBACK_BASE", () => {
  it("quita la barra final y exige https en producción", () => {
    const keys = { FLOW_API_KEY: "a", FLOW_SECRET_KEY: "b" };
    const parse = (FLOW_CALLBACK_BASE: string) =>
      parseFlowConfig({ ...keys, FLOW_API_BASE: FLOW_PRODUCTION_BASE, FLOW_CALLBACK_BASE });
    expect(parse("https://api.test/api/v1/")?.callbackBase).toBe("https://api.test/api/v1");
    expect(() => parse("http://api.test/api/v1")).toThrow(/https/);
    expect(() => parse("")).toThrow(/https/);
  });
});

describe("POST /payments/flow/create", () => {
  const create = (app: App, headers = {}) =>
    request(app).post("/api/v1/payments/flow/create").set(headers).send({ orderNumber: "TK-1048" });

  it("exige CSRF, credencial del pedido y Flow configurado", async () => {
    const app = buildTestApp();
    expect((await create(app)).status).toBe(403);
    expect((await create(app, csrfHeaders())).status).toBe(401);
    const res = await create(app, { ...csrfHeaders(), "x-order-access": "x" });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ details: { reason: "payment_unavailable" } });
  });
});

describe("POST /payments/flow/confirm", () => {
  it("sin Flow o con resultado incierto responde 500 para que Flow reintente", async () => {
    expect((await callback(buildTestApp(), "confirm")).status).toBe(500);
    const { app } = setup(new FlowUncertainError("network"));
    expect((await callback(app, "confirm")).status).toBe(500);
  });

  it("un token que nadie reconoce se descarta; uno propio se reintenta", async () => {
    const error = new FlowRejectedError(400, 105);
    expect((await callback(setup(error).app, "confirm")).status).toBe(200);
    expect((await callback(setup(error, 1).app, "confirm")).status).toBe(500);
    const unauthorized = setup(new FlowRejectedError(401, null)).app;
    expect((await callback(unauthorized, "confirm")).status).toBe(500);
  });

  it("no consulta a Flow con un token mal formado", async () => {
    const { app, getStatus } = setup(new FlowUncertainError("network"));
    expect((await callback(app, "confirm", "../x")).status).toBe(422);
    expect(getStatus).not.toHaveBeenCalled();
  });
});

describe("POST /payments/flow/return", () => {
  it("siempre redirige a la tienda, aunque no se pueda verificar", async () => {
    const { app } = setup(new FlowUncertainError("network"));
    for (const res of [
      await callback(app, "return"),
      await callback(app, "return", "../x"),
      await callback(buildTestApp(), "return"),
    ]) {
      expect(res.status).toBe(303);
      expect(res.headers.location).toBe("http://localhost:3000/checkout/resultado");
    }
  });
});
