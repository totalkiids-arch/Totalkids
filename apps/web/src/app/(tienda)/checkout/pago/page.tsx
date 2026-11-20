import type { Metadata } from "next";

import { FlowPaymentScreen } from "@/features/checkout";

// Datos personales del comprador: no se indexa (RNF-10).
export const metadata: Metadata = {
  title: "Pago Flow",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <FlowPaymentScreen />;
}
