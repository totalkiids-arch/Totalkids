import type { Metadata } from "next";

import { ReportsScreen } from "@/features/reports";

export const metadata: Metadata = { title: "Reportes" };

export default function Page() {
  return <ReportsScreen />;
}
