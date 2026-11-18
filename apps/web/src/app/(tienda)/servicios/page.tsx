import type { Metadata } from "next";

import { ServicesScreen } from "@/features/services";

export const metadata: Metadata = { title: "Servicios" };

export default function Page() {
  return <ServicesScreen />;
}
