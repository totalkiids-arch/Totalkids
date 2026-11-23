import type { Metadata } from "next";

import { SubscriptionScreen } from "@/features/newsletter";

export const metadata: Metadata = {
  title: "Suscripción y baja",
  description: "Recibe ofertas y novedades de Total Kids, o date de baja cuando quieras.",
  alternates: { canonical: "/suscripcion" },
};

const text = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

// ?correo=&consentimiento= llegan desde el formulario de la portada;
// ?baja=1&correo= desde el enlace de baja de un correo.
export default async function Page({ searchParams }: PageProps<"/suscripcion">) {
  const params = await searchParams;
  return (
    <SubscriptionScreen
      email={text(params.correo)}
      consent={text(params.consentimiento)}
      unsubscribe={text(params.baja)}
    />
  );
}
