import type { Metadata } from "next";

import { ActivityLogScreen } from "@/features/activity";

export const metadata: Metadata = { title: "Historial de actividad" };

export default function Page() {
  return <ActivityLogScreen />;
}
