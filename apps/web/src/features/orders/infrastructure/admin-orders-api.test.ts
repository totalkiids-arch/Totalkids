import { describe, expect, it } from "vitest";

import { PANEL_MESSAGES } from "@/shared/lib/panel-errors";

import { needsTracking, statusOptionLabel } from "../domain/admin-order";
import { toApiOrderSearch } from "../domain/admin-order-query";
import { toAdminOrderDetail, toOrderListPage, toPanelSummary } from "./admin-orders-api";

const detail = {
  id: "0195f3a0-0000-7000-8000-000000000001",
  number: 1048,
  ref: "TK-1048",
  createdAt: "2026-11-20T12:00:00.000Z",
  updatedAt: "2026-11-21T12:00:00.000Z",
  status: "confirmed",
  statusLabel: "Confirmado",
  buyer: {
    name: "Ana Pérez",
    rut: "11.111.111-1",
    email: "ana@example.com",
    phone: "+56911111111",
  },
  delivery: {
    method: "shipping",
    region: "Región Metropolitana",
    commune: "Ñuñoa",
    street: "Av. Grecia 123",
    unit: "Depto 4",
    notes: null,
    leadTime: "3 a 5 días hábiles",
    pickupDetails: null,
    carrier: null,
    trackingCode: null,
  },
  billing: {
    document: "factura",
    rut: "76.111.111-1",
    businessName: "Jardín Las Flores SpA",
    activity: "Educación",
    email: "facturas@example.com",
    address: "Av. Grecia 123",
    commune: "Ñuñoa",
    purchaseOrderRequired: false,
    invoice: null,
    invoicePending: true,
  },
  items: [
    {
      id: "i1",
      variantId: "v1",
      productName: "Mesa Pikler",
      sku: "TK-1",
      optionLabel: "Grande",
      quantity: 2,
      unitPrice: 50000,
      extrasUnitPrice: 5000,
      lineTotal: 110000,
      madeToOrder: true,
      leadTime: null,
      extras: [
        { code: "armado", name: "Armado a domicilio", unitPrice: 5000, text: null },
        { code: "nombre", name: "Nombre", unitPrice: 0, text: "Sofía" },
      ],
    },
  ],
  amounts: {
    currency: "CLP",
    subtotal: 110000,
    discount: 10000,
    shippingCost: null,
    total: 100000,
    couponCode: "HOLA10",
  },
  payment: {
    status: "paid",
    label: "Pagado",
    paymentDueAt: "2026-11-20T13:00:00.000Z",
    paidAt: "2026-11-20T12:10:00.000Z",
  },
  payments: [
    {
      id: "p1",
      attempt: 1,
      commerceOrder: "TK-1048-1",
      flowOrder: "123",
      status: "paid",
      label: "Pagado",
      amount: 100000,
      paymentMethod: null,
      paidAt: "2026-11-20T12:10:00.000Z",
      lastCheckedAt: null,
      createdAt: "2026-11-20T12:01:00.000Z",
    },
  ],
  refunds: [
    {
      id: "r1",
      paymentId: "p1",
      amount: 10000,
      date: "2026-11-21",
      reference: "Transferencia 55",
      status: "requested",
      statusLabel: "Solicitado",
      registeredBy: "Administrador",
      registeredByName: "Eduardo",
      registeredAt: "2026-11-21T10:00:00.000Z",
      resolvedBy: null,
      resolvedByName: null,
      resolvedAt: null,
    },
  ],
  refundTotals: {
    charged: 100000,
    committed: 10000,
    processed: 0,
    refundable: 90000,
    state: "requested",
  },
  statusHistory: [
    {
      id: "h2",
      from: "pending_payment",
      to: "confirmed",
      toLabel: "Confirmado",
      actorLabel: "Sistema",
      actorName: null,
      reason: null,
      at: "2026-11-20T12:10:00.000Z",
    },
    {
      id: "h1",
      from: null,
      to: "pending_payment",
      toLabel: "Pendiente de pago",
      actorLabel: "Sistema",
      actorName: null,
      reason: null,
      at: "2026-11-20T12:00:00.000Z",
    },
  ],
  activity: [
    {
      id: "a1",
      action: "order.refund_recorded",
      actorLabel: "Administrador",
      actorName: "Eduardo",
      reason: null,
      details: { amount: 10000 },
      at: "2026-11-21T10:00:00.000Z",
    },
    {
      id: "a0",
      action: "order.status_changed",
      actorLabel: "Sistema",
      actorName: null,
      reason: null,
      details: {},
      at: "2026-11-20T12:10:00.000Z",
    },
  ],
  emails: [],
  cancelledAt: null,
  restockRecordedAt: null,
  canRecordRestock: false,
  availableTransitions: ["preparing", "cancelled"],
  blockedByUnresolvedPayment: false,
};

describe("toAdminOrderDetail", () => {
  it("arma la dirección, la facturación y las líneas con sus extras", () => {
    const order = toAdminOrderDetail(detail);
    expect(order.ref).toBe("TK-1048");
    expect(order.delivery.address).toBe("Av. Grecia 123 Depto 4, Ñuñoa, Región Metropolitana");
    expect(order.billing).toMatchObject({
      document: "factura",
      businessName: "Jardín Las Flores SpA",
      address: "Av. Grecia 123, Ñuñoa",
      invoicePending: true,
    });
    expect(order.lines[0]?.extras).toEqual(["Armado a domicilio", "Nombre: «Sofía»"]);
    expect(order.amounts.shippingCost).toBeNull();
    expect(order.payment.paidAt).toBe("2026-11-20T12:10:00.000Z");
  });

  it("usa las transiciones, la reposición y los totales que calcula la API", () => {
    const order = toAdminOrderDetail(detail);
    expect(order.transitions).toEqual(["preparing", "cancelled"]);
    expect(order.refundTotals.refundable).toBe(90000);
    expect(order.refunds[0]?.registeredBy).toBe("Eduardo");
  });

  it("historial en orden: estados más eventos (sin repetir los cambios de estado)", () => {
    const order = toAdminOrderDetail(detail);
    expect(order.history.map((h) => [h.kind, h.title, h.actor])).toEqual([
      ["status", "Pendiente de pago", "Sistema"],
      ["status", "Confirmado", "Sistema"],
      ["refund", "Reembolso registrado por $10.000", "Eduardo (Administrador)"],
    ]);
  });

  it("en retiro no arma dirección", () => {
    const pickup = toAdminOrderDetail({
      ...detail,
      delivery: { ...detail.delivery, method: "pickup", pickupDetails: "Taller, Lun a Vie" },
    });
    expect(pickup.delivery.address).toBeNull();
    expect(pickup.delivery.pickupDetails).toBe("Taller, Lun a Vie");
  });

  it("un cuerpo inesperado cuenta como API no disponible", () => {
    expect(() => toAdminOrderDetail({ ref: "TK-1" })).toThrow(PANEL_MESSAGES.unavailable);
  });
});

describe("listado", () => {
  it("traduce la página de pedidos", () => {
    const page = toOrderListPage({
      items: [
        {
          id: "x",
          number: 1048,
          ref: "TK-1048",
          createdAt: "2026-11-20T12:00:00.000Z",
          buyerName: "Ana",
          buyerEmail: "ana@example.com",
          status: "preparing",
          statusLabel: "En preparación",
          paymentStatus: "paid",
          paymentLabel: "Pagado",
          deliveryMethod: "pickup",
          taxDocument: "boleta",
          invoicePending: false,
          shippingCost: null,
          total: 100000,
        },
      ],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    expect(page.items[0]).toEqual({
      ref: "TK-1048",
      createdAt: "2026-11-20T12:00:00.000Z",
      buyerName: "Ana",
      email: "ana@example.com",
      status: "preparing",
      paymentStatus: "paid",
      paymentLabel: "Pagado",
      deliveryMethod: "pickup",
      invoicePending: false,
      total: 100000,
    });
  });

  it("arma la consulta a la API", () => {
    expect(toApiOrderSearch({ q: "ana", status: "shipped", page: 2 })).toBe(
      "page=2&pageSize=20&q=ana&status=shipped",
    );
    expect(toApiOrderSearch({ q: "", status: "todos", page: 1 })).toBe("page=1&pageSize=20");
  });
});

describe("retiro en taller", () => {
  it("«Despachado» se muestra como «Listo para retiro» y no pide seguimiento", () => {
    expect(statusOptionLabel("shipped", "pickup")).toBe("Listo para retiro");
    expect(statusOptionLabel("shipped", "shipping")).toBe("Despachado");
    expect(needsTracking("pickup", ["shipped"])).toBe(false);
    expect(needsTracking("shipping", ["shipped", "cancelled"])).toBe(true);
    expect(needsTracking("shipping", ["cancelled"])).toBe(false);
  });
});

describe("toPanelSummary", () => {
  const recent = {
    id: "0195f3a0-0000-7000-8000-000000000002",
    number: 1050,
    ref: "TK-1050",
    createdAt: "2026-11-24T12:00:00.000Z",
    buyerName: "Ana Pérez",
    buyerEmail: "ana@example.com",
    status: "confirmed",
    statusLabel: "Confirmado",
    paymentStatus: "paid",
    paymentLabel: "Pagado",
    deliveryMethod: "pickup",
    invoicePending: false,
    total: 59990,
  };

  it("completa los estados sin pedidos y traduce los últimos pedidos", () => {
    const summary = toPanelSummary({
      byStatus: { confirmed: 2 },
      paymentsInReview: 1,
      paymentsPending: 0,
      recentOrders: [recent],
      sales: {
        period: { from: "2026-11-01", to: "2026-11-25" },
        charged: 100000,
        refunded: 0,
        net: 100000,
      },
      lowStockVariants: 3,
    });
    expect(summary.byStatus.confirmed).toBe(2);
    expect(summary.byStatus.shipped).toBe(0);
    expect(summary.recentOrders[0]).toMatchObject({ ref: "TK-1050", total: 59990 });
    expect(summary.sales).toEqual({
      from: "2026-11-01",
      to: "2026-11-25",
      charged: 100000,
      refunded: 0,
      net: 100000,
    });
  });

  it("para el Operador, cobros y stock bajo llegan en null", () => {
    const summary = toPanelSummary({
      byStatus: {},
      paymentsInReview: 0,
      paymentsPending: 0,
      recentOrders: [],
      sales: null,
      lowStockVariants: null,
    });
    expect([summary.sales, summary.lowStockVariants]).toEqual([null, null]);
  });
});
