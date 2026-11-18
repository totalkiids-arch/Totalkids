import type { Metadata } from "next";

import { AdminLoginScreen } from "@/features/auth";

export const metadata: Metadata = { title: "Acceso por rol" };

export default function Page() {
  return <AdminLoginScreen />;
}
