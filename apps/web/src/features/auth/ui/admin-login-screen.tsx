import { AccessFrame, AccessNotice } from "./access-frame";
import { AdminLoginForm } from "./admin-login-form";

/**
 * Panel administrativo · Ingreso del equipo (Administrador u Operador).
 * Correo y contraseña van al servidor de Next, que los envía a la API
 * (POST /auth/login). La sesión queda en una cookie HttpOnly.
 */
export function AdminLoginScreen({ notice }: { notice?: "contrasena" }) {
  return (
    <AccessFrame title="Bienvenido al panel">
      {notice === "contrasena" ? (
        <AccessNotice>Tu contraseña quedó guardada. Ya puedes ingresar con ella.</AccessNotice>
      ) : null}
      <AdminLoginForm />
    </AccessFrame>
  );
}
