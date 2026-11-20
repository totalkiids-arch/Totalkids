import type { Metadata } from "next";

import { PaymentResultScreen } from "@/features/checkout";
import { isPaymentStatus } from "@/features/payments";

// Datos personales del comprador: no se indexa (RNF-10).
export const metadata: Metadata = {
  title: "Resultado de pago",
  robots: { index: false, follow: false },
};

// Provisional: ?estado= sirve solo para previsualizar los estados. La versión real
// obtendrá el estado desde la API usando el token que devuelve Flow (nunca de la URL).
export default async function Page({ searchParams }: PageProps<"/checkout/resultado">) {
  const { estado } = await searchParams;
  return <PaymentResultScreen status={isPaymentStatus(estado) ? estado : null} />;
}
