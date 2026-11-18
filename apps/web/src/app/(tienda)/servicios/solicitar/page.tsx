import type { Metadata } from "next";

import { ServiceRequestScreen } from "@/features/services";

export const metadata: Metadata = { title: "Solicitar servicio" };

export default function Page() {
  return <ServiceRequestScreen />;
}
