import type { Metadata } from "next";

import { AdminResetScreen } from "@/features/auth";

// El token es secreto de un solo uso: no se registra ni se manda como Referer
// (proxy.ts agrega Referrer-Policy: no-referrer y Cache-Control: no-store).
export const metadata: Metadata = { title: "Contraseña", referrer: "no-referrer" };

export default async function Page({ searchParams }: PageProps<"/admin/restablecer">) {
  const { token } = await searchParams;
  // La forma del token la valida la API (un token raro recibe «enlace no
  // válido»); aquí solo se descartan listas y textos desmedidos.
  const value = typeof token === "string" && token.length > 0 && token.length <= 200 ? token : null;
  return <AdminResetScreen token={value} />;
}
