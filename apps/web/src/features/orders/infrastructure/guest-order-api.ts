import { z } from "zod";

import { ORDER_STATUSES, type Order } from "../domain/order";

/*
 * Traducción entre el pedido del invitado en la API (LN-09, GuestOrder en
 * apps/api/openapi.yaml) y el dominio del seguimiento. Puro, para probarlo.
 * Un cuerpo inesperado lanza: nunca se inventan pedidos ni montos.
 */

const status = z.enum(ORDER_STATUSES);

export const ApiGuestOrder = z.object({
  orderNumber: z.string(),
  status,
  createdAt: z.string(),
  buyer: z.object({ name: z.string(), email: z.string() }),
  delivery: z.discriminatedUnion("method", [
    z.object({ method: z.literal("retiro"), pickupDetails: z.string().nullable() }),
    z.object({
      method: z.literal("despacho"),
      address: z.string(),
      tracking: z.object({ carrier: z.string(), code: z.string() }).nullable(),
    }),
  ]),
  billing: z.object({
    document: z.enum(["boleta", "factura"]),
    invoice: z.object({ folio: z.string(), issuedAt: z.string() }).nullable(),
  }),
  items: z.array(
    z.object({
      sku: z.string(),
      productName: z.string(),
      optionLabel: z.string().nullable(),
      quantity: z.number().int(),
      unitPrice: z.number().int(),
      extrasUnitPrice: z.number().int(),
      extras: z.array(z.object({ name: z.string(), text: z.string().nullable() })),
    }),
  ),
  totals: z.object({
    discount: z.number().int(),
    shipping: z.number().int().nullable(),
    total: z.number().int(),
  }),
  history: z.array(z.object({ label: z.string(), at: z.string() })),
});

export const ApiLookup = z.object({ order: ApiGuestOrder, accessToken: z.string() });

/** Dirección de retiro mientras el panel no la configure. */
const PICKUP_FALLBACK = "Taller Total Kids";

export function toOrder(body: z.infer<typeof ApiGuestOrder>): Order {
  return {
    id: body.orderNumber,
    createdAt: body.createdAt,
    email: body.buyer.email,
    buyerName: body.buyer.name,
    status: body.status,
    lines: body.items.map((item) => ({
      name: item.productName,
      sku: item.sku,
      detail:
        [item.optionLabel, ...item.extras.map((e) => (e.text ? `${e.name}: «${e.text}»` : e.name))]
          .filter(Boolean)
          .join(" · ") || null,
      quantity: item.quantity,
      // Foto de la compra: variante + extras con precio, por unidad.
      unitPrice: item.unitPrice + item.extrasUnitPrice,
    })),
    shipping: body.totals.shipping ?? 0,
    shippingToCoordinate: body.delivery.method === "despacho" && body.totals.shipping === null,
    discount: body.totals.discount,
    delivery:
      body.delivery.method === "retiro"
        ? { method: "retiro", address: body.delivery.pickupDetails ?? PICKUP_FALLBACK }
        : { method: "domicilio", address: body.delivery.address },
    document: body.billing.document,
    invoice: body.billing.invoice
      ? {
          number: body.billing.invoice.folio,
          issuedAt: body.billing.invoice.issuedAt,
          issuedBy: "Total Kids",
        }
      : null,
    tracking: body.delivery.method === "despacho" ? body.delivery.tracking : null,
    history: body.history.map((h) => ({ at: h.at, label: h.label })),
  };
}
