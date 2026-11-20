import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { DEMO_ACCOUNT_EMAIL, getCurrentBuyer } from "../container";
import { LoginForm } from "./auth-forms";
import { AuthLayout, DemoNotice } from "./auth-layout";

/**
 * Cuenta del comprador · Iniciar sesión (RF-22). Con sesión iniciada, va
 * directo a "Mis pedidos". `aside` recibe la consulta de pedido invitado
 * (la entrega la página, para que auth no dependa de orders).
 */
export async function LoginScreen({ aside }: { aside?: ReactNode }) {
  if (await getCurrentBuyer()) redirect("/cuenta/pedidos");
  return (
    <AuthLayout title="Qué bueno verte de nuevo" aside={aside}>
      <LoginForm />
      <div className="flex flex-wrap justify-between gap-3 font-extrabold">
        <Link href="/registro" className="text-brand-blue underline">
          Crear cuenta
        </Link>
        <Link href="/recuperar" className="text-brand-blue underline">
          Olvidé mi contraseña
        </Link>
      </div>
      <DemoNotice>
        Cualquier contraseña funciona. Usa {DEMO_ACCOUNT_EMAIL} para ver pedidos de ejemplo.
      </DemoNotice>
    </AuthLayout>
  );
}
