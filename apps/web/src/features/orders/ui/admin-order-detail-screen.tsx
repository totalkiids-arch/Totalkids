import { ScreenPlaceholder } from "@/shared/ui/screen-placeholder";

/** Panel administrativo · Detalle de pedido y reembolso. */
export function AdminOrderDetailScreen({ id }: { id: string }) {
  return (
    <ScreenPlaceholder
      section="Panel administrativo"
      title="Detalle de pedido y reembolso"
      description="Detalle completo del pedido y gestión de reembolsos."
      detail={`id: ${id}`}
    />
  );
}
