import type { Metadata } from "next";

import { ServiceRequestScreen } from "@/features/services";

export const metadata: Metadata = {
  title: "Solicitar servicio",
  description: "Cuéntanos qué necesitas: armado, diseño de espacios, personalización y más.",
};

export default async function Page({ searchParams }: PageProps<"/servicios/solicitar">) {
  const { servicio } = await searchParams;
  return <ServiceRequestScreen service={typeof servicio === "string" ? servicio : undefined} />;
}
