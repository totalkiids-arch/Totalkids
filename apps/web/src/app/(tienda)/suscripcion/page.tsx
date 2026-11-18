import type { Metadata } from "next";

import { SubscriptionScreen } from "@/features/newsletter";

export const metadata: Metadata = { title: "Suscripción y baja" };

export default function Page() {
  return <SubscriptionScreen />;
}
