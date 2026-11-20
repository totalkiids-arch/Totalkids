import Link from "next/link";

import { ButtonLink } from "@/shared/ui/button";

import { ResetPasswordForm } from "./auth-forms";
import { AuthLayout, DemoNotice } from "./auth-layout";

/**
 * Cuenta del comprador · Restablecer contraseña (RF-22). Se llega desde el
 * enlace del correo de recuperación (`?token=`); sin enlace, se pide uno nuevo.
 */
export function ResetPasswordScreen({ token }: { token?: string }) {
  const value = token?.trim().slice(0, 200) ?? "";
  return (
    <AuthLayout title="Elige una nueva contraseña">
      {value ? (
        <ResetPasswordForm token={value} />
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-text-body">
            Este enlace no es válido. Pide uno nuevo para elegir tu contraseña.
          </p>
          <ButtonLink href="/recuperar" size="lg">
            Pedir un enlace nuevo
          </ButtonLink>
        </div>
      )}
      <Link href="/ingresar" className="font-extrabold text-brand-blue underline">
        Volver a iniciar sesión
      </Link>
      <DemoNotice>
        Con la API, el enlace vencerá y servirá una sola vez. Por ahora no cambia ninguna
        contraseña.
      </DemoNotice>
    </AuthLayout>
  );
}
