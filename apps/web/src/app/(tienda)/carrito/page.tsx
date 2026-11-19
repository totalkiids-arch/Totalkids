import type { Metadata } from "next";

import { CartScreen } from "@/features/cart";

// El carrito es personal: no se indexa (RNF-10).
export const metadata: Metadata = { title: "Carrito", robots: { index: false, follow: false } };

export default function Page() {
  return <CartScreen />;
}
