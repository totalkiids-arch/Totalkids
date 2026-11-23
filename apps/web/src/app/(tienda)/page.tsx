import type { Metadata } from "next";

import { HomeScreen } from "@/features/home";

export const metadata: Metadata = {
  title: "Inicio",
  description:
    "Mobiliario infantil para hogares, jardines y colegios: cunas, mesas, sillas y almacenamiento para aprender jugando.",
  alternates: { canonical: "/" },
};

export default function Page() {
  return <HomeScreen />;
}
