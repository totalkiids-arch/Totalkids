"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { BagIcon } from "@/shared/ui/icons";

import { readCartUnits, subscribeCart } from "./cart-events";

/**
 * Botón "Carrito (N)" del encabezado. Lee la cantidad de la cookie en el
 * navegador, así las páginas de la tienda siguen siendo estáticas.
 */
export function CartLink() {
  const count = useSyncExternalStore(subscribeCart, readCartUnits, () => 0);
  return (
    <Link
      href="/carrito"
      aria-label={`Carrito, ${count} ${count === 1 ? "producto" : "productos"}`}
      className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full bg-brand-red px-3.5 font-extrabold whitespace-nowrap text-white sm:gap-2 sm:px-4.5"
    >
      <BagIcon size={22} />
      {/* En pantallas angostas solo ícono + cantidad, para que quepa junto al logo. */}
      <span aria-hidden>
        <span className="max-[430px]:hidden">Carrito </span>
        <span className="max-[430px]:hidden">({count})</span>
        <span className="min-[431px]:hidden">{count}</span>
      </span>
    </Link>
  );
}
