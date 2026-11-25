import { describe, expect, it } from "vitest";

import { ApiGuestOrder, ApiLookup, toOrder } from "./guest-order-api";

// GuestOrder de la API (LN-09), con un despacho a coordinar y una factura emitida.
const apiOrder = {
  orderNumber: "TK-1048",
  status: "shipped",
  statusLabel: "Despachado",
  createdAt: "2026-11-20T15:00:00.000Z",
  paymentDueAt: "2026-11-20T15:30:00.000Z",
  paidAt: "2026-11-20T15:10:00.000Z",
  buyer: { name: "Ana Pérez", email: "ana@correo.cl" },
  delivery: {
    method: "despacho",
    address: "Av. Alemania 0123, Depto 4, Temuco",
    region: "AR",
    commune: "Temuco",
    notes: null,
    leadTime: null,
    tracking: { carrier: "Starken", code: "SK-123" },
  },
  billing: {
    document: "factura",
    businessName: "Jardín Los Peques",
    invoice: { folio: "1234", issuedAt: "2026-11-21T12:00:00.000Z" },
  },
  items: [
    {
      sku: "TK-7261",
      productName: "Baúl Kurruf",
      optionLabel: null,
      quantity: 2,
      unitPrice: 75_990,
      extrasUnitPrice: 5_000,
      lineTotal: 161_980,
      madeToOrder: true,
      leadTime: "3 a 5 días hábiles",
      extras: [{ code: "nombre", name: "Nombre grabado", unitPrice: 5_000, text: "Sofía" }],
    },
  ],
  totals: { subtotal: 161_980, discount: 10_000, shipping: null, total: 151_980 },
  couponCode: "KIDS10",
  paymentStatus: "paid",
  history: [
    { status: "pending_payment", label: "Pendiente de pago", at: "2026-11-20T15:00:00.000Z" },
    { status: "shipped", label: "Despachado", at: "2026-11-22T10:00:00.000Z" },
  ],
};

describe("pedido del invitado desde la API", () => {
  it("arma el seguimiento con la foto de la compra y el despacho a coordinar", () => {
    const order = toOrder(ApiGuestOrder.parse(apiOrder));
    expect(order).toMatchObject({
      id: "TK-1048",
      email: "ana@correo.cl",
      status: "shipped",
      shipping: 0,
      shippingToCoordinate: true,
      discount: 10_000,
      delivery: { method: "domicilio", address: "Av. Alemania 0123, Depto 4, Temuco" },
      document: "factura",
      invoice: { number: "1234", issuedBy: "Total Kids" },
      tracking: { carrier: "Starken", code: "SK-123" },
    });
    expect(order.lines).toEqual([
      {
        name: "Baúl Kurruf",
        sku: "TK-7261",
        detail: "Nombre grabado: «Sofía»",
        quantity: 2,
        unitPrice: 80_990,
      },
    ]);
    // El total del seguimiento coincide con el de la API.
    const subtotal = order.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
    expect(subtotal + order.shipping - order.discount).toBe(apiOrder.totals.total);
    expect(order.history.map((h) => h.label)).toEqual(["Pendiente de pago", "Despachado"]);
  });

  it("retiro en taller: dirección del taller y sin seguimiento de transportista", () => {
    const order = toOrder(
      ApiGuestOrder.parse({
        ...apiOrder,
        delivery: { method: "retiro", pickupDetails: "Taller en Temuco, 9 a 18 h" },
        totals: { ...apiOrder.totals, shipping: 0 },
      }),
    );
    expect(order.delivery).toEqual({ method: "retiro", address: "Taller en Temuco, 9 a 18 h" });
    expect(order.tracking).toBeNull();
    expect(order.shippingToCoordinate).toBe(false);
  });

  it("la consulta trae el pedido y su credencial; un cuerpo inesperado no se acepta", () => {
    expect(
      ApiLookup.parse({ order: apiOrder, accessToken: "t".repeat(43) }).accessToken,
    ).toHaveLength(43);
    expect(ApiGuestOrder.safeParse({ ...apiOrder, status: "perdido" }).success).toBe(false);
  });
});
