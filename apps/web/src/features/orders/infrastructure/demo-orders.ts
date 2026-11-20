import "server-only";

import type { OrderRepository } from "../application/ports";
import type { Order } from "../domain/order";

/**
 * Pedidos de EJEMPLO (hasta LN-09) con productos reales del catálogo:
 * - camila@example.com: la cuenta de ejemplo (historial propio).
 * - invitado@example.com: compra sin cuenta, para la consulta de pedido invitado.
 */
const DEMO_ORDERS: readonly Order[] = [
  {
    id: "TK-1051",
    createdAt: "2026-11-19T16:20:00-03:00",
    email: "camila@example.com",
    buyerName: "Camila González",
    status: "pending_payment",
    lines: [
      {
        name: "Cubo Pikler Montessori",
        sku: "TK-7238",
        detail: null,
        quantity: 1,
        unitPrice: 54990,
      },
    ],
    shipping: 0,
    discount: 0,
    delivery: { method: "retiro", address: "Tienda Total Kids · [TU DIRECCIÓN], [COMUNA]" },
    document: "boleta",
    tracking: null,
    history: [{ at: "2026-11-19T16:20:00-03:00", label: "Pedido recibido, esperando el pago" }],
  },
  {
    id: "TK-1048",
    createdAt: "2026-11-10T11:05:00-03:00",
    email: "camila@example.com",
    buyerName: "Camila González",
    status: "shipped",
    lines: [
      {
        name: "Cama infantil Montessori tipo jeep",
        sku: "TK-7839",
        detail: "Armado incluido",
        quantity: 1,
        unitPrice: 90000,
      },
      { name: "Librero Montessori", sku: "TK-7845", detail: null, quantity: 1, unitPrice: 49990 },
    ],
    shipping: 4990,
    discount: 0,
    delivery: { method: "domicilio", address: "Av. Alemania 0123, Temuco, La Araucanía" },
    document: "boleta",
    tracking: { carrier: "Starken", code: "998877665" },
    history: [
      { at: "2026-11-10T11:05:00-03:00", label: "Pedido recibido" },
      { at: "2026-11-10T11:07:00-03:00", label: "Pago confirmado por Flow" },
      { at: "2026-11-11T09:30:00-03:00", label: "En preparación" },
      { at: "2026-11-13T15:45:00-03:00", label: "Despachado con Starken" },
    ],
  },
  {
    id: "TK-1032",
    createdAt: "2026-10-02T10:15:00-03:00",
    email: "camila@example.com",
    buyerName: "Camila González",
    status: "delivered",
    lines: [
      {
        name: "Kit de mesa y 4 sillas párvulos metálicas kinder",
        sku: "TK-7796",
        detail: null,
        quantity: 1,
        unitPrice: 115000,
      },
    ],
    shipping: 4990,
    discount: 0,
    delivery: { method: "domicilio", address: "Av. Alemania 0123, Temuco, La Araucanía" },
    document: "factura",
    tracking: { carrier: "Starken", code: "112233445" },
    history: [
      { at: "2026-10-02T10:15:00-03:00", label: "Pedido recibido" },
      { at: "2026-10-02T10:16:00-03:00", label: "Pago confirmado por Flow" },
      { at: "2026-10-03T12:00:00-03:00", label: "En preparación" },
      { at: "2026-10-05T17:20:00-03:00", label: "Despachado con Starken" },
      { at: "2026-10-08T13:10:00-03:00", label: "Entregado" },
    ],
  },
  {
    id: "TK-1055",
    createdAt: "2026-11-18T19:40:00-03:00",
    email: "invitado@example.com",
    buyerName: "Jardín Los Peques SpA",
    status: "preparing",
    lines: [
      { name: "Escabel 2 peldaños", sku: "TK-6788", detail: null, quantity: 2, unitPrice: 49990 },
    ],
    shipping: 0,
    discount: 0,
    delivery: { method: "retiro", address: "Tienda Total Kids · [TU DIRECCIÓN], [COMUNA]" },
    document: "factura",
    tracking: null,
    history: [
      { at: "2026-11-18T19:40:00-03:00", label: "Pedido recibido" },
      { at: "2026-11-18T19:42:00-03:00", label: "Pago confirmado por Flow" },
      { at: "2026-11-19T10:00:00-03:00", label: "En preparación" },
    ],
  },
];

export const demoOrderRepository: OrderRepository = {
  async listByEmail(email) {
    return DEMO_ORDERS.filter((o) => o.email === email);
  },
  async findById(id) {
    return DEMO_ORDERS.find((o) => o.id === id) ?? null;
  },
};
