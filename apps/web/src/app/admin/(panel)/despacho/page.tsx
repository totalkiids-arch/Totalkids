import type { Metadata } from "next";

import { ShippingScreen } from "@/features/shipping";

export const metadata: Metadata = { title: "Despacho y retiro" };

export default function Page() {
  return <ShippingScreen />;
}
