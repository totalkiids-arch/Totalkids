import { ScreenPlaceholder } from "@/shared/ui/screen-placeholder";

/** Cuenta del comprador · Detalle y seguimiento. */
export function OrderTrackingScreen({ id }: { id: string }) {
  return (
    <ScreenPlaceholder
      section="Cuenta del comprador"
      title="Detalle y seguimiento"
      description="Detalle del pedido, pago y seguimiento del despacho."
      detail={`id: ${id}`}
    />
  );
}
