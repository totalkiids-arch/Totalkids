"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { acceptCartChanges, addToCart, changeQuantity, removeFromCart } from "../container";

const AddRequest = z.object({
  slug: z.string().max(120),
  sku: z.string().max(60),
  quantity: z.number().int(),
  extras: z.array(z.string().max(40)).max(10),
  texts: z.record(z.string().max(40), z.string().max(200)),
});

export type AddToCartAction = (
  request: z.input<typeof AddRequest>,
) => Promise<{ ok: true } | { ok: false; error: string }>;

/** Agrega desde la ficha. Todo se revalida en el servidor (RF-04, RF-06). */
export const addToCartAction: AddToCartAction = async (request) => {
  const parsed = AddRequest.safeParse(request);
  if (!parsed.success) return { ok: false, error: "No pudimos agregar el producto." };
  const result = await addToCart(parsed.data);
  return result.ok ? { ok: true } : result;
};

const LineForm = z.object({
  id: z.string().max(400),
  cantidad: z.coerce.number().int().optional(),
});

/** Cambia la cantidad de una línea (formulario: id, cantidad). 0 la elimina. */
export async function updateQuantityAction(formData: FormData) {
  const parsed = LineForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.cantidad === undefined) return;
  await changeQuantity(parsed.data.id, parsed.data.cantidad);
  refresh();
}

/** Quita una línea (formulario: id). */
export async function removeLineAction(formData: FormData) {
  const parsed = LineForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await removeFromCart(parsed.data.id);
  refresh();
}

/** Guarda los ajustes informados en el carrito (productos retirados, stock). */
export async function acceptChangesAction() {
  await acceptCartChanges();
  refresh();
}

export type CouponState = { message: string; tone: "error" | "success" } | null;

/**
 * Cupones (RF-07): se validan contra la API (vigencia, usos, subtotal elegible).
 * Mientras no exista, no hay cupones activos y se responde con honestidad.
 */
export async function applyCouponAction(_: CouponState, formData: FormData): Promise<CouponState> {
  const code = String(formData.get("cupon") ?? "").trim();
  if (code === "") return { message: "Escribe el código de tu cupón.", tone: "error" };
  return {
    message: `El cupón «${code.slice(0, 30)}» no existe o ya no está vigente.`,
    tone: "error",
  };
}
