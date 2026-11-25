import { describe, expect, it } from "vitest";

import type { CheckoutDetails } from "../domain/checkout-details";
import {
  isFlowUrl,
  toDeliveryQuote,
  toOrderBody,
  toPlaceOrderResult,
  toQuoteSearch,
  toStartPaymentResult,
} from "./checkout-api";

const buyer = { name: "María", rut: "12.345.678-5", email: "m@correo.cl", phone: "+56912345678" };

describe("cotización", () => {
  it("arma la consulta según la entrega", () => {
    expect(toQuoteSearch({ method: "retiro" })).toBe("method=retiro");
    expect(
      toQuoteSearch({
        method: "domicilio",
        region: "RM",
        commune: "Ñuñoa",
        street: "Calle 1",
        unit: null,
        notes: null,
      }),
    ).toBe("method=despacho&region=RM&commune=%C3%91u%C3%B1oa");
  });

  it("lee la respuesta de la API y rechaza una inesperada", () => {
    const quote = toDeliveryQuote({
      method: "despacho",
      cost: null,
      reason: "coordinate",
      leadTime: null,
      pickupDetails: null,
      zone: null,
      freeShipping: null,
      message: "Coordinamos contigo",
      totals: { subtotal: 100_000, discount: 0, shipping: null, total: 100_000 },
    });
    expect(quote.shipping).toEqual({ kind: "pending", cost: null, message: "Coordinamos contigo" });
    expect(quote.totals.total).toBe(100_000);
    expect(() => toDeliveryQuote({ cost: "gratis" })).toThrow();
  });
});

describe("cuerpo de POST /orders", () => {
  it("traduce despacho y factura al contrato de la API", () => {
    const details: CheckoutDetails = {
      buyer,
      delivery: {
        method: "domicilio",
        region: "RM",
        commune: "Ñuñoa",
        street: "Calle 1",
        unit: "Depto 2",
        notes: null,
      },
      billing: {
        document: "factura",
        rut: "76.543.210-3",
        businessName: "Jardín",
        activity: "Educación",
        email: "f@jardin.cl",
        address: "Av 1",
        commune: "Ñuñoa",
        purchaseOrder: true,
      },
    };
    expect(toOrderBody(details, 120_000)).toEqual({
      buyer,
      delivery: {
        method: "despacho",
        region: "RM",
        commune: "Ñuñoa",
        street: "Calle 1",
        unit: "Depto 2",
        notes: null,
      },
      billing: { ...details.billing },
      expectedTotal: 120_000,
      termsAccepted: true,
    });
    expect(
      toOrderBody({ buyer, delivery: { method: "retiro" }, billing: { document: "boleta" } }, 1),
    ).toMatchObject({ delivery: { method: "retiro" }, billing: { document: "boleta" } });
  });
});

const conflict = (reason: string, message = "Mensaje de la API") => ({
  code: "conflict",
  message,
  details: { reason },
});

describe("respuesta de POST /orders", () => {
  it("201 y 200 (reproducido) entregan número y credencial", () => {
    const body = { orderNumber: "TK-1001", accessToken: "a".repeat(43), status: "pending_payment" };
    expect(toPlaceOrderResult(201, body)).toEqual({
      ok: true,
      orderNumber: "TK-1001",
      accessToken: "a".repeat(43),
    });
    expect(toPlaceOrderResult(200, body).ok).toBe(true);
  });

  it("agrupa los motivos del 409", () => {
    for (const reason of ["empty_cart", "cart_blocked", "cart_changed", "coupon_exhausted"]) {
      expect(toPlaceOrderResult(409, conflict(reason))).toMatchObject({ reason: "cart" });
    }
    expect(toPlaceOrderResult(409, conflict("total_changed"))).toEqual({
      ok: false,
      reason: "total_changed",
      message: "Mensaje de la API",
    });
    // Internos: el comprador no ve el texto técnico de la API.
    expect(toPlaceOrderResult(409, conflict("idempotency_mismatch"))).toMatchObject({
      message: "Tus datos cambiaron. Intenta pagar de nuevo.",
    });
    expect(toPlaceOrderResult(422, {})).toMatchObject({ reason: "details" });
    expect(toPlaceOrderResult(500, null)).toMatchObject({ reason: "unavailable" });
    expect(toPlaceOrderResult(201, { orderNumber: 1 })).toMatchObject({ reason: "unavailable" });
  });
});

describe("respuesta de POST /payments/flow/create", () => {
  it("entrega la URL de Flow", () => {
    expect(
      toStartPaymentResult(200, { redirectUrl: "https://sandbox.flow.cl/app/web/pay.php?token=x" }),
    ).toEqual({ ok: true, redirectUrl: "https://sandbox.flow.cl/app/web/pay.php?token=x" });
  });

  it("traduce los motivos del 409 y la credencial inválida", () => {
    expect(toStartPaymentResult(409, conflict("payment_uncertain")).ok).toBe(false);
    expect(toStartPaymentResult(409, conflict("payment_uncertain"))).toMatchObject({
      reason: "uncertain",
    });
    expect(toStartPaymentResult(409, conflict("payment_expired"))).toMatchObject({
      reason: "not_payable",
    });
    expect(toStartPaymentResult(409, conflict("already_paid"))).toMatchObject({
      reason: "already_paid",
    });
    expect(toStartPaymentResult(404, {})).toMatchObject({ reason: "not_found" });
    expect(toStartPaymentResult(200, { redirectUrl: "no es url" })).toMatchObject({
      reason: "unavailable",
    });
  });
});

describe("isFlowUrl", () => {
  it("solo acepta https de flow.cl", () => {
    expect(isFlowUrl("https://www.flow.cl/app/web/pay.php?token=x")).toBe(true);
    expect(isFlowUrl("https://sandbox.flow.cl/app/web/pay.php")).toBe(true);
    expect(isFlowUrl("http://www.flow.cl/pay")).toBe(false);
    expect(isFlowUrl("https://flow.cl.evil.com/pay")).toBe(false);
    expect(isFlowUrl("https://evilflow.cl/pay")).toBe(false);
    expect(isFlowUrl("no es url")).toBe(false);
  });
});
