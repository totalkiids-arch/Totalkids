import { randomInt, randomUUID } from "node:crypto";

import { vi } from "vitest";

import {
  FlowRejectedError,
  FlowUncertainError,
  type CreatePaymentInput,
  type FlowClient,
  type FlowPaymentStatus,
} from "../src/services/flow/client.js";

/**
 * Flow en memoria para los tests (LN-10, LN-15): nunca se llama a Flow real.
 * Cada pago creado queda pendiente hasta que el test lo cambia. `failWith`
 * simula una consulta fallida: incierta (red, 5xx) o rechazada (4xx: 401,
 * firma inválida…), que la conciliación también trata como incierta.
 */
export class FakeFlow implements FlowClient {
  readonly created: CreatePaymentInput[] = [];
  readonly statuses = new Map<string, FlowPaymentStatus>();
  token = "";
  /** Si existe, las consultas de estado fallan así en vez de responder. */
  failWith: (() => Error) | null = null;

  createPayment = vi.fn(async (input: CreatePaymentInput) => {
    this.created.push(input);
    this.token = `TOKEN-${randomUUID()}`;
    const flowOrder = randomInt(1_000_000, 2_000_000_000);
    this.statuses.set(this.token, {
      flowOrder,
      commerceOrder: input.commerceOrder,
      status: "pending",
      amount: input.amount,
      currency: "CLP",
      media: null,
    });
    return Promise.resolve({
      token: this.token,
      flowOrder,
      redirectUrl: `https://sandbox.flow.cl/app/web/pay.php?token=${this.token}`,
    });
  });

  getStatus = vi.fn(async (token: string) => {
    if (this.failWith) return Promise.reject(this.failWith());
    const status = this.statuses.get(token);
    return status ? Promise.resolve(status) : Promise.reject(new FlowRejectedError(400, 105));
  });

  getStatusByCommerceOrder = vi.fn(async (commerceOrder: string) => {
    if (this.failWith) return Promise.reject(this.failWith());
    const status = [...this.statuses.values()].find((s) => s.commerceOrder === commerceOrder);
    return status ? Promise.resolve(status) : Promise.reject(new FlowRejectedError(400, 105));
  });

  /** Cambia el estado del último pago creado con `createPayment`. */
  set(change: Partial<FlowPaymentStatus>) {
    const current = this.statuses.get(this.token);
    if (!current) throw new Error("No hay pago");
    this.statuses.set(this.token, { ...current, ...change });
  }

  /** Registra en Flow un intento creado directo en la base (fixtures). */
  register(
    payment: { commerceOrder: string; amount: number },
    change: Partial<FlowPaymentStatus> = {},
  ) {
    this.statuses.set(`co:${payment.commerceOrder}`, {
      flowOrder: randomInt(1_000_000, 2_000_000_000),
      commerceOrder: payment.commerceOrder,
      status: "pending",
      amount: payment.amount,
      currency: "CLP",
      media: null,
      ...change,
    });
  }

  uncertain() {
    this.failWith = () => new FlowUncertainError("network");
  }

  /** Flow responde 4xx (p. ej. 401 por credenciales o firma inválida). */
  rejects(httpStatus: number, flowCode: number | null = null) {
    this.failWith = () => new FlowRejectedError(httpStatus, flowCode);
  }

  recover() {
    this.failWith = null;
  }
}
