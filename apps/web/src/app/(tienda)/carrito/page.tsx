import type { Metadata } from "next";

import { CartScreen } from "@/features/cart";

export const metadata: Metadata = { title: "Carrito" };

export default function Page() {
  return <CartScreen />;
}
