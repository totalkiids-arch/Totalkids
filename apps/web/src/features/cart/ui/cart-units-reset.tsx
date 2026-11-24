"use client";

import { useEffect } from "react";

import { CART_UNITS_COOKIE } from "../application/cart-view";
import { notifyCartChanged } from "./cart-events";

/**
 * Con el pago confirmado, la API ya eliminó el carrito (LN-11). La página de
 * resultado no puede escribir cookies desde el servidor, así que aquí se pone en
 * 0 el contador del encabezado (la cookie de unidades no es HttpOnly).
 */
export function CartUnitsReset() {
  useEffect(() => {
    document.cookie = `${CART_UNITS_COOKIE}=0; path=/; max-age=0; samesite=lax`;
    notifyCartChanged();
  }, []);
  return null;
}
