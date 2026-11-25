import { TEXT_ACTION } from "@/shared/ui/admin/data-table";

import { reconcilePaymentAction } from "./payment-actions";

/**
 * «Consultar en Flow» (RF-33, LN-15): consulta el estado real del intento con
 * las credenciales del backend y lo asienta. Administrador y Operador. Es
 * seguro repetirlo: nunca confirma por el navegador ni asume un rechazo.
 * Funciona sin JavaScript.
 */
export function ReconcileButton({
  paymentId,
  label,
  volver,
}: {
  paymentId: string;
  /** Para lectores de pantalla: qué intento se consulta (p. ej. su commerceOrder). */
  label: string;
  /** Ruta a la que volver con el aviso (Pagos con sus filtros o el pedido). */
  volver: string;
}) {
  return (
    <form action={reconcilePaymentAction}>
      <input type="hidden" name="id" value={paymentId} />
      <input type="hidden" name="volver" value={volver} />
      <button type="submit" className={TEXT_ACTION} aria-label={`Consultar en Flow ${label}`}>
        Consultar en Flow
      </button>
    </form>
  );
}
