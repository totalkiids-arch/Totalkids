import { AccessFrame } from "./access-frame";
import { RequestResetForm, ResetPasswordForm } from "./admin-reset-forms";

/**
 * /admin/restablecer: con ?token= define la contraseña (invitación o
 * recuperación); sin token, pide el enlace por correo.
 */
export function AdminResetScreen({ token }: { token: string | null }) {
  return token ? (
    <AccessFrame title="Define tu contraseña">
      <ResetPasswordForm token={token} />
    </AccessFrame>
  ) : (
    <AccessFrame title="Recupera tu contraseña">
      <RequestResetForm />
    </AccessFrame>
  );
}
