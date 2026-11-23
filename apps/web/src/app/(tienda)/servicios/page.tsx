import type { Metadata } from "next";

import { ServicesScreen } from "@/features/services";

export const metadata: Metadata = {
  title: "Servicios especiales",
  description:
    "Armado e instalación, diseño de espacios, personalización y equipamiento para jardines y colegios.",
  alternates: { canonical: "/servicios" },
};

export default function Page() {
  return <ServicesScreen />;
}
