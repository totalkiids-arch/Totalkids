import type { Metadata } from "next";

import { CheckoutDetailsScreen } from "@/features/checkout";

// Datos personales del comprador: no se indexa (RNF-10).
export const metadata: Metadata = {
  title: "Datos y facturación",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <CheckoutDetailsScreen />;
}
