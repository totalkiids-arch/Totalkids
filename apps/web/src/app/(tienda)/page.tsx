import type { Metadata } from "next";

import { HomeScreen } from "@/features/home";

export const metadata: Metadata = { title: "Inicio" };

export default function Page() {
  return <HomeScreen />;
}
