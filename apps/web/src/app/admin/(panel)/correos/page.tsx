import type { Metadata } from "next";

import { EmailsScreen } from "@/features/emails";

export const metadata: Metadata = { title: "Correos" };

export default function Page() {
  return <EmailsScreen />;
}
