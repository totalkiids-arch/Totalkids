import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentBuyer } from "../container";
import { RegisterForm } from "./auth-forms";
import { AuthLayout, DemoNotice } from "./auth-layout";

/** Cuenta del comprador · Crear cuenta (RF-22). */
export async function RegisterScreen() {
  if (await getCurrentBuyer()) redirect("/cuenta/pedidos");
  return (
    <AuthLayout title="Crea tu cuenta">
      <RegisterForm />
      <p className="font-extrabold">
        ¿Ya tienes cuenta?{" "}
        <Link href="/ingresar" className="text-brand-blue underline">
          Inicia sesión
        </Link>
      </p>
      <DemoNotice>Por ahora la cuenta no se guarda: solo inicia una sesión de ejemplo.</DemoNotice>
    </AuthLayout>
  );
}
