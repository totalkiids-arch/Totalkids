import type { Metadata } from "next";

import { RecoverAccessScreen } from "@/features/auth";

export const metadata: Metadata = { title: "Recuperar acceso" };

export default function Page() {
  return <RecoverAccessScreen />;
}
