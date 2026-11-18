import type { Metadata } from "next";

import { PoliciesScreen } from "@/features/content";

export const metadata: Metadata = { title: "Políticas" };

export default function Page() {
  return <PoliciesScreen />;
}
