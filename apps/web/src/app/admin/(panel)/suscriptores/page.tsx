import type { Metadata } from "next";

import { AdminSectionGate } from "@/features/auth";
import { SubscribersScreen } from "@/features/newsletter";

export const metadata: Metadata = { title: "Suscriptores" };

export default function Page() {
  return (
    <AdminSectionGate section="suscriptores">
      <SubscribersScreen />
    </AdminSectionGate>
  );
}
