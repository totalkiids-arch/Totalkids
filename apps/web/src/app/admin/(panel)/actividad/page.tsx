import type { Metadata } from "next";

import { ActivityLogScreen } from "@/features/activity";
import { AdminSectionGate } from "@/features/auth";

export const metadata: Metadata = { title: "Historial de actividad" };

export default function Page() {
  return (
    <AdminSectionGate section="actividad">
      <ActivityLogScreen />
    </AdminSectionGate>
  );
}
