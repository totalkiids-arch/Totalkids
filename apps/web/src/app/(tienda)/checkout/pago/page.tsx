import type { Metadata } from "next";

import { FlowPaymentScreen } from "@/features/checkout";

export const metadata: Metadata = { title: "Pago Flow" };

export default function Page() {
  return <FlowPaymentScreen />;
}
