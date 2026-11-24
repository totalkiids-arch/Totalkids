import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  createFlowClient,
  FlowRejectedError,
  FlowUncertainError,
  type FlowPaymentStatus,
} from "../src/services/flow/client.js";
import {
  FLOW_PRODUCTION_BASE,
  FLOW_SANDBOX_BASE,
  parseFlowConfig,
} from "../src/services/flow/config.js";
import { signFlowParams } from "../src/services/flow/signature.js";
import { flowMismatches } from "../src/services/flow/verify.js";

const config = { apiKey: "API-KEY", secretKey: "SECRETO", apiBase: FLOW_SANDBOX_BASE };

/** fetch falso que guarda las llamadas y responde siempre lo mismo. */
function flowReplying(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(async () =>
    typeof body === "string" ? new Response(body, { status }) : Response.json(body, { status }),
  );
  return { fetchMock, client: createFlowClient(config, { fetch: fetchMock }) };
}

const PAYMENT = {
  commerceOrder: "TK-1001-1",
  subject: "Pedido TK-1001 – Total Kids",
  amount: 54_990,
  email: "maria@correo.cl",
  urlConfirmation: "https://api.totalkids.cl/api/v1/payments/flow/confirm",
  urlReturn: "https://api.totalkids.cl/api/v1/payments/flow/return",
  timeoutSeconds: 1800,
};

const STATUS = {
  flowOrder: 3567899,
  commerceOrder: "TK-1001-1",
  status: 2,
  amount: "54990",
  currency: "CLP",
  payer: "maria@correo.cl",
  paymentData: { media: "Webpay", fee: 100 },
};

describe("firma de Flow", () => {
  it("ordena por nombre, concatena nombre+valor y firma con HMAC-SHA256 hexadecimal", () => {
    const expected = createHmac("sha256", "SECRETO")
      .update("amount5000apiKeyXcurrencyCLP")
      .digest("hex");
    expect(signFlowParams({ currency: "CLP", apiKey: "X", amount: "5000" }, "SECRETO")).toBe(
      expected,
    );
  });

  it("no incluye s en su propio cálculo", () => {
    const params = { apiKey: "X", token: "T" };
    expect(signFlowParams({ ...params, s: "otra" }, "SECRETO")).toBe(
      signFlowParams(params, "SECRETO"),
    );
  });
});

describe("configuración de Flow", () => {
  it("sin claves queda deshabilitado; con claves usa sandbox por defecto", () => {
    expect(parseFlowConfig({ FLOW_API_KEY: "", FLOW_SECRET_KEY: "" })).toBeNull();
    expect(parseFlowConfig({ FLOW_API_KEY: "a", FLOW_SECRET_KEY: "b" })?.apiBase).toBe(
      FLOW_SANDBOX_BASE,
    );
    expect(
      parseFlowConfig({
        FLOW_API_KEY: "a",
        FLOW_SECRET_KEY: "b",
        FLOW_API_BASE: FLOW_PRODUCTION_BASE,
      })?.apiBase,
    ).toBe(FLOW_PRODUCTION_BASE);
  });

  it("rechaza una clave sin la otra y una base que no es de Flow, sin mostrar valores", () => {
    expect(() => parseFlowConfig({ FLOW_API_KEY: "a" })).toThrow(/juntas/);
    const bad = () =>
      parseFlowConfig({
        FLOW_API_KEY: "a",
        FLOW_SECRET_KEY: "b",
        FLOW_API_BASE: "https://malo.cl",
      });
    expect(bad).toThrow(/base oficial/);
    expect(bad).not.toThrow(/malo/);
  });
});

describe("crear pago", () => {
  it("envía un formulario firmado y arma la URL de pago", async () => {
    const { client, fetchMock } = flowReplying({
      url: "https://sandbox.flow.cl/app/web/pay.php",
      token: "TOKEN123",
      flowOrder: 3567899,
    });
    expect(await client.createPayment(PAYMENT)).toEqual({
      token: "TOKEN123",
      flowOrder: 3567899,
      redirectUrl: "https://sandbox.flow.cl/app/web/pay.php?token=TOKEN123",
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${FLOW_SANDBOX_BASE}/payment/create`);
    expect(init).toMatchObject({ method: "POST", redirect: "error" });
    const form = Object.fromEntries(init?.body as URLSearchParams);
    expect(form).toMatchObject({
      apiKey: "API-KEY",
      currency: "CLP",
      amount: "54990",
      timeout: "1800",
    });
    expect(form.s).toBe(signFlowParams(form, "SECRETO"));
    expect(JSON.stringify(form)).not.toContain("SECRETO");
  });

  it("nunca redirige fuera de Flow ni sin HTTPS", async () => {
    for (const url of [
      "https://flow.cl.malo.com/x",
      "https://maloflow.cl/x",
      "http://www.flow.cl/x",
    ]) {
      const { client } = flowReplying({ url, token: "T", flowOrder: 1 });
      await expect(client.createPayment(PAYMENT), url).rejects.toBeInstanceOf(FlowUncertainError);
    }
  });
});

describe("consultar estado", () => {
  it("firma la consulta y devuelve un estado depurado", async () => {
    const { client, fetchMock } = flowReplying(STATUS);
    expect(await client.getStatus("TOKEN123")).toEqual({
      flowOrder: 3567899,
      commerceOrder: "TK-1001-1",
      status: "paid",
      amount: 54_990,
      currency: "CLP",
      media: "Webpay",
    });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/api/payment/getStatus");
    const query = Object.fromEntries(url.searchParams);
    expect(query.s).toBe(signFlowParams(query, "SECRETO"));
  });

  it("consulta por commerceOrder para conciliar una creación incierta", async () => {
    const { client, fetchMock } = flowReplying(STATUS);
    await client.getStatusByCommerceOrder("TK-1001-1");
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/api/payment/getStatusByCommerceId");
    expect(url.searchParams.get("commerceId")).toBe("TK-1001-1");
  });

  it("traduce los cuatro estados de Flow", async () => {
    const seen = [];
    for (const status of [1, 2, 3, 4]) {
      seen.push((await flowReplying({ ...STATUS, status }).client.getStatus("T")).status);
    }
    expect(seen).toEqual(["pending", "paid", "rejected", "voided"]);
  });

  it("una respuesta ilegible es incierta: ni pagada ni rechazada", async () => {
    const bad = [
      "<html>error</html>",
      {},
      { ...STATUS, status: 9 },
      { ...STATUS, amount: null },
      { ...STATUS, amount: "" },
      { ...STATUS, amount: true },
      { ...STATUS, amount: "54990.5" },
    ];
    for (const body of bad) {
      await expect(flowReplying(body).client.getStatus("T")).rejects.toBeInstanceOf(
        FlowUncertainError,
      );
    }
  });
});

describe("fallos", () => {
  it("un 4xx es rechazo, con el código de Flow", async () => {
    const error = await flowReplying({ code: 108, message: "x" }, 400)
      .client.getStatus("T")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FlowRejectedError);
    expect(error).toMatchObject({ httpStatus: 400, flowCode: 108 });
  });

  it("5xx, 408 y 429 son inciertos", async () => {
    for (const status of [500, 503, 408, 429]) {
      await expect(flowReplying({}, status).client.getStatus("T")).rejects.toBeInstanceOf(
        FlowUncertainError,
      );
    }
  });

  it("un fallo de red o timeout es incierto y no filtra la URL firmada", async () => {
    const client = createFlowClient(config, {
      fetch: async (url) => {
        throw new TypeError(`falló ${String(url)}`);
      },
    });
    const error = (await client.getStatus("TOKEN-SECRETO").catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(FlowUncertainError);
    expect(error.cause).toBeUndefined();
    expect(`${error.message}${error.stack ?? ""}`).not.toContain("TOKEN-SECRETO");
  });

  it("corta la espera si Flow no responde", async () => {
    const client = createFlowClient(config, {
      requestTimeoutMs: 20,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("abortado")));
        }),
    });
    await expect(client.getStatus("T")).rejects.toBeInstanceOf(FlowUncertainError);
  });
});

describe("verificación contra el intento local (RF-16)", () => {
  const actual: FlowPaymentStatus = {
    flowOrder: 10,
    commerceOrder: "TK-1001-1",
    status: "paid",
    amount: 54_990,
    currency: "CLP",
    media: null,
  };
  const expected = { commerceOrder: "TK-1001-1", flowOrder: 10, amount: 54_990, currency: "CLP" };

  it("coincide, también si aún no se conoce el flowOrder", () => {
    expect(flowMismatches(expected, actual)).toEqual([]);
    expect(flowMismatches({ ...expected, flowOrder: null }, actual)).toEqual([]);
  });

  it("detecta cada diferencia", () => {
    expect(
      flowMismatches(expected, {
        ...actual,
        flowOrder: 11,
        commerceOrder: "TK-9-1",
        amount: 1,
        currency: "USD",
      }),
    ).toEqual(["commerce_order", "flow_order", "amount", "currency"]);
  });
});
