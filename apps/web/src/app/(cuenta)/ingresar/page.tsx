import type { Metadata } from "next";

import { LoginScreen } from "@/features/auth";
import { GuestOrderLookup } from "@/features/orders";

export const metadata: Metadata = { title: "Iniciar sesión" };

// La consulta de pedido invitado se entrega desde aquí: auth no depende de orders.
export default function Page() {
  return <LoginScreen aside={<GuestOrderLookup />} />;
}
