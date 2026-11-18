import type { Metadata } from "next";

import { ServiceRequestsScreen } from "@/features/services";

export const metadata: Metadata = { title: "Solicitudes" };

export default function Page() {
  return <ServiceRequestsScreen />;
}
