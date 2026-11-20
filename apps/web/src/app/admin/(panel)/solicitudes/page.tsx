import type { Metadata } from "next";

import { ServiceRequestsScreen } from "@/features/services";

export const metadata: Metadata = { title: "Solicitudes" };

export default async function Page({ searchParams }: PageProps<"/admin/solicitudes">) {
  return <ServiceRequestsScreen searchParams={await searchParams} />;
}
