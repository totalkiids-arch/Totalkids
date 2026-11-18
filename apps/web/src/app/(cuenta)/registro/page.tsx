import type { Metadata } from "next";

import { RegisterScreen } from "@/features/auth";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function Page() {
  return <RegisterScreen />;
}
