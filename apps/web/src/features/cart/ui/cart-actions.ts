"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { addToCart, applyCoupon, changeQuantity, removeCoupon, removeFromCart } from "../container";

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

/** Agrega desde la ficha. Todo se valida en la API (RF-04, RF-06). */
export const addToCartAction: AddToCartAction = async (request) => {
  const parsed = AddRequest.safeParse(request);
  if (!parsed.success) return { ok: false, error: "No pudimos agregar el producto." };
  const { slug: _slug, ...input } = parsed.data;
  const result = await addToCart(input);
  return result.ok ? { ok: true } : result;
};

/** Estado de una acción sobre una línea: null = sin error. */
export type LineActionState = { error: string } | null;

const LineForm = z.object({
  id: z.string().max(64),
  cantidad: z.coerce.number().int().min(0).max(99).optional(),
});

/** Cambia la cantidad de una línea (formulario: id, cantidad). 0 la elimina. */
export async function updateQuantityAction(formData: FormData): Promise<LineActionState> {
  const parsed = LineForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.cantidad === undefined) return null;
  const result = await changeQuantity(parsed.data.id, parsed.data.cantidad);
  refresh();
  return result.ok ? null : { error: result.error };
}

/** Quita una línea (formulario: id). */
export async function removeLineAction(formData: FormData): Promise<LineActionState> {
  const parsed = LineForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return null;
  const result = await removeFromCart(parsed.data.id);
  refresh();
  return result.ok ? null : { error: result.error };
}

export type CouponState = { message: string; tone: "error" | "success" } | null;

/** Aplica un cupón (RF-07): vigencia, usos y carrito los valida la API. */
export async function applyCouponAction(_: CouponState, formData: FormData): Promise<CouponState> {
  const code = String(formData.get("cupon") ?? "").trim();
  if (code === "") return { message: "Escribe el código de tu cupón.", tone: "error" };
  const result = await applyCoupon(code.slice(0, 60));
  if (!result.ok) return { message: result.error, tone: "error" };
  refresh();
  return {
    message: `Cupón «${result.cart.coupon?.code ?? code.toUpperCase()}» aplicado.`,
    tone: "success",
  };
}

/** Quita el cupón aplicado. */
export async function removeCouponAction(): Promise<void> {
  await removeCoupon();
  refresh();
}
