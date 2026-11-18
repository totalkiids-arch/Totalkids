import type { Metadata } from "next";

import { SubscribersScreen } from "@/features/newsletter";

export const metadata: Metadata = { title: "Suscriptores" };

export default function Page() {
  return <SubscribersScreen />;
}
