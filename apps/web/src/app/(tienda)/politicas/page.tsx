import type { Metadata } from "next";

import { PoliciesScreen } from "@/features/content";

export const metadata: Metadata = {
  title: "Políticas",
  description:
    "Condiciones de compra, despacho y retiro, cambios y garantía, y privacidad de Total Kids.",
  alternates: { canonical: "/politicas" },
};

export default function Page() {
  return <PoliciesScreen />;
}
