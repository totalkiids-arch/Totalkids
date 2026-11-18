import type { Metadata } from "next";

import { ResetPasswordScreen } from "@/features/auth";

export const metadata: Metadata = { title: "Restablecer contraseña" };

export default function Page() {
  return <ResetPasswordScreen />;
}
