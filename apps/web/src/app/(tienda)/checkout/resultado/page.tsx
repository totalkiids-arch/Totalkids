import type { Metadata } from "next";

import { PaymentResultScreen } from "@/features/checkout";

// Datos personales del comprador: no se indexa (RNF-10).
export const metadata: Metadata = {
  title: "Resultado de pago",
  robots: { index: false, follow: false },
};

// La API redirige aquí al volver de Flow con ?pedido=TK-…: solo dice qué pedido
// mirar. El estado se consulta en la API con la credencial de este navegador.
export default async function Page({ searchParams }: PageProps<"/checkout/resultado">) {
  const { pedido } = await searchParams;
  return <PaymentResultScreen orderNumber={typeof pedido === "string" ? pedido : null} />;
}
