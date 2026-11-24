import { z } from "zod";

import type { FlowConfig } from "./config.js";
import { signFlowParams, type FlowParams } from "./signature.js";

/**
 * Cliente HTTP de Flow (LN-10, SRS 4.4.1). No toca la base ni decide el estado
 * del pedido. Distingue dos fallos, porque se tratan distinto:
 * - FlowRejectedError: Flow respondió que no a la solicitud.
 * - FlowUncertainError: no se sabe qué pasó (timeout, red, 5xx, respuesta
 *   ilegible). Nunca equivale a un rechazo: se concilia antes de reintentar.
 * Los errores no incluyen claves, tokens ni el cuerpo de la respuesta.
 */

export class FlowRejectedError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly flowCode: number | null,
  ) {
    super(`Flow rechazó la solicitud (HTTP ${httpStatus}, código ${flowCode ?? "sin código"})`);
    this.name = "FlowRejectedError";
  }
}

export class FlowUncertainError extends Error {
  constructor(public readonly reason: "network" | "http" | "response") {
    super(`Resultado incierto al consultar Flow (${reason})`);
    this.name = "FlowUncertainError";
  }
}

/** Lo que necesita el cliente HTTP. */
export type FlowCredentials = Omit<FlowConfig, "callbackBase">;

export interface CreatePaymentInput {
  /** Identificador propio y único del intento. */
  commerceOrder: string;
  subject: string;
  /** CLP, entero. */
  amount: number;
  email: string;
  urlConfirmation: string;
  urlReturn: string;
  /** Segundos que la orden queda pagable; compatible con la reserva (RN-04). */
  timeoutSeconds: number;
}

export interface CreatedFlowPayment {
  token: string;
  flowOrder: number;
  /** URL a la que se envía al comprador (url + token). */
  redirectUrl: string;
}

export const FLOW_STATUS = { 1: "pending", 2: "paid", 3: "rejected", 4: "voided" } as const;
export type FlowStatus = (typeof FLOW_STATUS)[keyof typeof FLOW_STATUS];

/** Estado depurado: sin datos del pagador ni de tarjeta (RNF-05). */
export interface FlowPaymentStatus {
  flowOrder: number;
  commerceOrder: string;
  status: FlowStatus;
  amount: number;
  currency: string;
  /** Medio de pago informado, cuando existe. */
  media: string | null;
}

export interface FlowClient {
  createPayment(input: CreatePaymentInput): Promise<CreatedFlowPayment>;
  getStatus(token: string): Promise<FlowPaymentStatus>;
  /** Para conciliar una creación incierta, cuando no se alcanzó a recibir el token. */
  getStatusByCommerceOrder(commerceOrder: string): Promise<FlowPaymentStatus>;
}

const createdSchema = z.object({
  url: z.url(),
  token: z.string().min(1).max(200),
  flowOrder: z.coerce.number().int().positive(),
});

// Sin z.coerce: convertiría null, "" o true en un número y podría ocultar una discrepancia.
const integer = z.union([
  z.number().int().nonnegative(),
  z
    .string()
    .regex(/^\d+(\.0+)?$/)
    .transform(Number)
    .pipe(z.number().int().nonnegative()),
]);

const statusSchema = z.object({
  flowOrder: integer,
  commerceOrder: z.string().min(1),
  status: z.literal([1, 2, 3, 4]),
  amount: integer,
  currency: z.string().min(1),
  paymentData: z.object({ media: z.string().nullish() }).nullish(),
});

const errorSchema = z.object({ code: z.coerce.number().int() });

/** 408 y 429 no dicen si la solicitud se procesó: son inciertos, como los 5xx. */
const isUncertainHttp = (status: number) => status >= 500 || status === 408 || status === 429;

function parseWith<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new FlowUncertainError("response");
  return parsed.data;
}

/** Solo se redirige al comprador a un host de Flow, por HTTPS. */
function redirectUrl(url: string, token: string): string {
  const target = new URL(url);
  const isFlow = target.hostname === "flow.cl" || target.hostname.endsWith(".flow.cl");
  if (target.protocol !== "https:" || !isFlow) throw new FlowUncertainError("response");
  target.searchParams.set("token", token);
  return target.toString();
}

export interface FlowClientOptions {
  fetch?: typeof fetch;
  /** Tiempo máximo de espera por solicitud. */
  requestTimeoutMs?: number;
}

export function createFlowClient(
  config: FlowCredentials,
  options: FlowClientOptions = {},
): FlowClient {
  const doFetch = options.fetch ?? fetch;
  const requestTimeoutMs = options.requestTimeoutMs ?? 10_000;

  async function send(method: "GET" | "POST", path: string, params: FlowParams): Promise<unknown> {
    const all = { ...params, apiKey: config.apiKey };
    const form = new URLSearchParams({ ...all, s: signFlowParams(all, config.secretKey) });
    const url = `${config.apiBase}${path}`;

    let response: Response;
    let body: unknown;
    try {
      response = await doFetch(method === "GET" ? `${url}?${form.toString()}` : url, {
        method,
        // Seguir una redirección podría reenviar la solicitud firmada a otro host.
        redirect: "error",
        signal: AbortSignal.timeout(requestTimeoutMs),
        ...(method === "POST" ? { body: form } : {}),
      });
      body = await response.json().catch((error: unknown) => {
        if (error instanceof SyntaxError) return undefined;
        throw error;
      });
    } catch {
      // Sin `cause`: el error de fetch puede traer la URL firmada.
      throw new FlowUncertainError("network");
    }

    if (response.ok) return body;
    if (isUncertainHttp(response.status)) throw new FlowUncertainError("http");
    const detail = errorSchema.safeParse(body);
    throw new FlowRejectedError(response.status, detail.success ? detail.data.code : null);
  }

  async function status(path: string, params: FlowParams): Promise<FlowPaymentStatus> {
    const data = parseWith(statusSchema, await send("GET", path, params));
    return {
      flowOrder: data.flowOrder,
      commerceOrder: data.commerceOrder,
      status: FLOW_STATUS[data.status],
      amount: data.amount,
      currency: data.currency,
      media: data.paymentData?.media ?? null,
    };
  }

  return {
    async createPayment(input) {
      const body = await send("POST", "/payment/create", {
        commerceOrder: input.commerceOrder,
        subject: input.subject,
        currency: "CLP",
        amount: String(input.amount),
        email: input.email,
        urlConfirmation: input.urlConfirmation,
        urlReturn: input.urlReturn,
        timeout: String(input.timeoutSeconds),
      });
      const data = parseWith(createdSchema, body);
      return {
        token: data.token,
        flowOrder: data.flowOrder,
        redirectUrl: redirectUrl(data.url, data.token),
      };
    },
    getStatus: (token) => status("/payment/getStatus", { token }),
    getStatusByCommerceOrder: (commerceOrder) =>
      status("/payment/getStatusByCommerceId", { commerceId: commerceOrder }),
  };
}
