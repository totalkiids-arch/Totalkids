import Link from "next/link";

import { RecoverForm } from "./auth-forms";
import { AuthLayout, DemoNotice } from "./auth-layout";

/** Cuenta del comprador · Recuperar acceso (RF-22). */
export function RecoverAccessScreen() {
  return (
    <AuthLayout title="Recupera tu acceso">
      <RecoverForm />
      <Link href="/ingresar" className="font-extrabold text-brand-blue underline">
        Volver a iniciar sesión
      </Link>
      <DemoNotice>
        No se envía un correo real. Para seguir el recorrido, abre el{" "}
        <Link href="/restablecer?token=demostracion" className="font-bold underline">
          enlace de recuperación de ejemplo
        </Link>
        .
      </DemoNotice>
    </AuthLayout>
  );
}
