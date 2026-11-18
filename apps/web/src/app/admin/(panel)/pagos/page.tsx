import type { Metadata } from "next";

import { PaymentsScreen } from "@/features/payments";

export const metadata: Metadata = { title: "Pagos y conciliación" };

export default function Page() {
  return <PaymentsScreen />;
}
