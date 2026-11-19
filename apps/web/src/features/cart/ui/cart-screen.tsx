import Link from "next/link";

import { site } from "@/shared/config/site";
import { Tito } from "@/shared/ui/brand/tito";
import { ButtonLink } from "@/shared/ui/button";
import { CheckoutSteps } from "@/shared/ui/checkout-steps";
import { ArrowLeftIcon, ArrowRightIcon, ToolIcon } from "@/shared/ui/icons";

import { freeShippingProgress, type PricedCart } from "../application/price-cart";
import { getCart } from "../container";
import { acceptChangesAction } from "./cart-actions";
import { CartLineItem } from "./cart-line-item";
import { CouponForm } from "./coupon-form";
import { formatPrice } from "./format";

const units = (n: number) => `${n} ${n === 1 ? "producto" : "productos"}`;

/** Tienda y compra · Carrito (RF-05 a RF-08). Se revalida contra el catálogo en cada visita. */
export async function CartScreen() {
  const cart = await getCart();
  const empty = cart.lines.length === 0;

  return (
    <>
      <CheckoutSteps current={1} />
      <div className="mx-auto flex max-w-7xl flex-wrap items-start gap-6 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-4">
          <h1 className="text-[38px] leading-tight font-extrabold sm:text-[46px]">
            Tu carrito <span className="text-2xl text-text-secondary">({units(cart.units)})</span>
          </h1>

          {cart.changed ? <ChangesNotice cart={cart} /> : null}
          {empty ? null : <FreeShipping subtotal={cart.subtotal} />}

          {empty ? (
            <EmptyCart />
          ) : (
            <ul className="flex flex-col gap-4">
              {cart.lines.map((item) => (
                <li key={item.line.id}>
                  <CartLineItem item={item} />
                </li>
              ))}
            </ul>
          )}

          {empty ? null : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border-3 border-dashed border-ochre bg-cream px-5.5 py-4.5">
              <p className="flex items-center gap-3">
                <ToolIcon size={30} className="shrink-0 text-yellow-ink" />
                <span>
                  <strong className="block font-heading text-xl">¿Te lo armamos?</strong>
                  <span className="text-sm text-on-yellow">
                    Agrégalo en la ficha de cada producto o cotízalo para tu institución.
                  </span>
                </span>
              </p>
              <ButtonLink href="/servicios" variant="dark">
                Ver servicios
              </ButtonLink>
            </div>
          )}

          <Link href="/catalogo" className="flex items-center gap-1.5 self-start font-extrabold">
            <ArrowLeftIcon size={18} />
            Seguir comprando
          </Link>
        </div>

        {empty ? null : <Summary cart={cart} />}
      </div>
    </>
  );
}

function ChangesNotice({ cart }: { cart: PricedCart }) {
  return (
    <div role="status" className="flex flex-col gap-2 rounded-3xl bg-cream px-5 py-4">
      <p className="font-extrabold">Actualizamos tu carrito con la disponibilidad de hoy.</p>
      {cart.removed.length > 0 ? (
        <p className="text-sm">
          {cart.removed.length === 1
            ? "Un producto ya no está a la venta y lo quitamos."
            : `${cart.removed.length} productos ya no están a la venta y los quitamos.`}
        </p>
      ) : null}
      <form action={acceptChangesAction}>
        <button type="submit" className="text-sm font-extrabold text-brand-blue underline">
          Entendido
        </button>
      </form>
    </div>
  );
}

function FreeShipping({ subtotal }: { subtotal: number }) {
  const progress = freeShippingProgress(subtotal, site.freeShippingThreshold);
  if (!progress) {
    return (
      <p className="rounded-3xl bg-soft-green px-5 py-4 font-extrabold">
        Despacho gratis desde $[MONTO] en zonas con cobertura.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2.5 rounded-3xl bg-soft-green px-5 py-4">
      <p className="font-extrabold">
        {progress.remaining === 0
          ? "¡Tu compra tiene despacho gratis!"
          : `¡Te faltan ${formatPrice(progress.remaining)} para el despacho gratis!`}
      </p>
      <div
        role="progressbar"
        aria-label="Avance hacia el despacho gratis"
        aria-valuenow={progress.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-4.5 rounded-full bg-surface"
      >
        <div
          className="h-full rounded-full bg-brand-green"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <p className="text-[13px] text-text-secondary">
        Aplica en zonas con cobertura; el retiro no la incluye.
      </p>
    </div>
  );
}

function EmptyCart() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[32px] bg-surface px-6 py-10 text-center">
      <Tito className="w-24" animated />
      <h2 className="text-3xl font-extrabold">¡Oh! Tu carrito está vacío</h2>
      <p className="text-text-secondary">Tito te ayuda a encontrar el mueble perfecto.</p>
      <ButtonLink href="/catalogo" size="lg">
        Ir al catálogo
      </ButtonLink>
    </div>
  );
}

function Summary({ cart }: { cart: PricedCart }) {
  return (
    <aside
      aria-labelledby="resumen"
      className="flex max-w-full flex-[1_1_340px] flex-col gap-3.5 rounded-[32px] bg-surface p-7 shadow-[0_2px_0_var(--color-border)] lg:sticky lg:top-6"
    >
      <h2 id="resumen" className="text-[28px] font-extrabold">
        Resumen
      </h2>
      <dl className="flex flex-col gap-3">
        <div className="flex justify-between gap-3">
          <dt>Productos ({cart.units})</dt>
          <dd className="font-extrabold">{formatPrice(cart.subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Despacho</dt>
          <dd className="text-right text-text-secondary">Se calcula en el siguiente paso</dd>
        </div>
      </dl>
      {cart.unpriced.length > 0 ? (
        <p className="rounded-2xl bg-cream px-3.5 py-2.5 text-sm">
          Precio por confirmar, no incluido en el total: {cart.unpriced.join(", ")}.
        </p>
      ) : null}

      <CouponForm />

      <hr className="border-t-3 border-dashed border-border" />
      <p className="flex items-baseline justify-between">
        <span className="text-lg font-extrabold">Total</span>
        <strong className="font-heading text-[34px]">{formatPrice(cart.subtotal)}</strong>
      </p>

      {cart.blocked ? (
        <>
          <p className="text-center text-sm font-bold text-brand-red-deep">
            Quita los productos agotados para continuar.
          </p>
          <span
            aria-disabled
            className="flex min-h-14 items-center justify-center rounded-full bg-chip-border font-extrabold text-text-secondary"
          >
            Continuar con mis datos
          </span>
        </>
      ) : (
        <ButtonLink href="/checkout" variant="danger" size="lg" className="min-h-14">
          Continuar con mis datos
          <ArrowRightIcon size={20} />
        </ButtonLink>
      )}
      <p className="text-center text-[13px] text-text-secondary">
        Pagas de forma segura con Flow: tarjetas, transferencia y más.
      </p>
    </aside>
  );
}
