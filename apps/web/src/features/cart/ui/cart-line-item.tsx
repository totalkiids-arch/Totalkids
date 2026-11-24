"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { TrashIcon } from "@/shared/ui/icons";
import { ProductPhoto } from "@/shared/ui/product-photo";

import { MAX_QUANTITY_PER_LINE, type CartLineView } from "../application/cart-view";
import { removeLineAction, updateQuantityAction, type LineActionState } from "./cart-actions";
import { notifyCartChanged } from "./cart-events";
import { formatPrice } from "./format";

/** Una línea del carrito: foto, detalle, cantidad, total y quitar. */
export function CartLineItem({ item }: { item: CartLineView }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const product = item;
  const href = `/producto/${item.slug}` as const;
  const unavailable = item.status === "unavailable";

  function run(
    action: (data: FormData) => Promise<LineActionState>,
    fields: Record<string, string>,
  ) {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    setError(null);
    startTransition(async () => {
      const result = await action(data);
      if (result) setError(result.error);
      notifyCartChanged();
    });
  }

  const meta = [
    item.option,
    ...item.extras.map((e) => (e.text ? `${e.label}: «${e.text}»` : e.label)),
  ].filter(Boolean);
  const notes = [...item.notes, ...(error ? [error] : [])];

  return (
    <article
      aria-busy={pending}
      className={`flex flex-wrap items-center gap-x-5 gap-y-4 rounded-[28px] bg-surface p-4 shadow-[0_2px_0_var(--color-border)] ${pending ? "opacity-70" : ""}`}
    >
      <Link href={href} tabIndex={-1} aria-hidden className="w-24 shrink-0 sm:w-35">
        <ProductPhoto
          image={product.image}
          sizes="140px"
          className="rounded-[20px] border-2 border-border"
        />
      </Link>

      <div className="flex min-w-0 flex-[1_1_160px] flex-col gap-0.5">
        <h2 className="text-[22px] leading-tight font-bold">
          <Link href={href} className="text-text-primary">
            {product.name}
          </Link>
        </h2>
        {meta.length > 0 ? <p className="text-sm text-text-secondary">{meta.join(" · ")}</p> : null}
        {unavailable ? null : (
          <p
            className={`text-[13px] font-extrabold ${item.availability.status === "en_stock" ? "text-brand-green" : "text-brand-blue"}`}
          >
            {item.availability.message}
          </p>
        )}
        <p className="mt-1 text-lg font-extrabold">
          <span className="sr-only">Total de la línea: </span>
          {unavailable ? (
            <span className="text-text-secondary line-through">{formatPrice(item.total)}</span>
          ) : (
            formatPrice(item.total)
          )}
        </p>
        {item.quantity > 1 && item.variantPrice !== null && !unavailable ? (
          <p className="text-[13px] text-text-secondary">{formatPrice(item.variantPrice)} c/u</p>
        ) : null}
        {notes.map((note) => (
          <p
            key={note}
            className={`mt-1 rounded-xl px-3 py-1.5 text-sm font-bold ${unavailable || note === error ? "bg-soft-red text-brand-red-deep" : "bg-cream text-yellow-ink"}`}
          >
            {note}
          </p>
        ))}
      </div>

      <div className="flex items-center gap-3">
        {unavailable ? null : (
          <div
            role="group"
            aria-label={`Cantidad de ${product.name}`}
            className="flex items-center rounded-full border-2 border-chip-border bg-background p-0.75"
          >
            <button
              type="button"
              aria-label="Quitar uno"
              disabled={pending || item.quantity <= 1}
              onClick={() =>
                run(updateQuantityAction, { id: item.id, cantidad: String(item.quantity - 1) })
              }
              className="flex size-11 items-center justify-center rounded-full bg-cream text-[22px] font-extrabold hover:bg-soft-yellow disabled:cursor-not-allowed disabled:opacity-45"
            >
              −
            </button>
            <output aria-live="polite" className="min-w-9 text-center text-lg font-extrabold">
              {item.quantity}
            </output>
            <button
              type="button"
              aria-label="Agregar uno"
              disabled={pending || item.quantity >= MAX_QUANTITY_PER_LINE}
              onClick={() =>
                run(updateQuantityAction, { id: item.id, cantidad: String(item.quantity + 1) })
              }
              className="flex size-11 items-center justify-center rounded-full bg-cream text-[22px] font-extrabold hover:bg-soft-yellow disabled:cursor-not-allowed disabled:opacity-45"
            >
              +
            </button>
          </div>
        )}
        <button
          type="button"
          aria-label={`Eliminar ${product.name}`}
          disabled={pending}
          onClick={() => run(removeLineAction, { id: item.id })}
          className="flex size-11.5 items-center justify-center rounded-[14px] bg-soft-red text-brand-red-deep hover:bg-offer disabled:opacity-45"
        >
          <TrashIcon size={22} />
        </button>
      </div>
    </article>
  );
}
