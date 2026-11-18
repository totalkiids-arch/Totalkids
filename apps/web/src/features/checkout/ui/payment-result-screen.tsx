import { PAYMENT_STATUS_LABEL, type PaymentStatus } from "@/features/payments";
import { ScreenPlaceholder } from "@/shared/ui/screen-placeholder";

/** Tienda y compra · Resultado de pago. Muestra uno de los estados de pago. */
export function PaymentResultScreen({ status }: { status: PaymentStatus | null }) {
  return (
    <ScreenPlaceholder
      section="Tienda y compra"
      title="Resultado de pago"
      description="Resultado del pago en Flow: pagado, pendiente, rechazado, en revisión o vencido."
      detail={`estado: ${status ? PAYMENT_STATUS_LABEL[status] : "desconocido"}`}
    />
  );
}
