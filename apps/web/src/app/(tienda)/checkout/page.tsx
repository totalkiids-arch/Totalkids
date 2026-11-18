import type { Metadata } from "next";

import { CheckoutDetailsScreen } from "@/features/checkout";

export const metadata: Metadata = { title: "Datos y facturación" };

export default function Page() {
  return <CheckoutDetailsScreen />;
}
