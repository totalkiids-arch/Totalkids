import type { Metadata } from "next";

import { UnsubscribeScreen } from "@/features/newsletter";

// Enlace personal del correo de baja: no se indexa ni se siguen sus enlaces.
export const metadata: Metadata = {
  title: "Darme de baja",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function Page({ searchParams }: PageProps<"/suscripcion/baja">) {
  const { token } = await searchParams;
  return <UnsubscribeScreen token={typeof token === "string" ? token.slice(0, 64) : ""} />;
}
