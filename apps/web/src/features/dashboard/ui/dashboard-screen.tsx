import { HealthStatus } from "@/features/system";
import { ScreenPlaceholder } from "@/shared/ui/screen-placeholder";

/** Panel administrativo · Resumen. */
export function DashboardScreen() {
  return (
    <ScreenPlaceholder
      section="Panel administrativo"
      title="Resumen"
      description="Indicadores clave de ventas, pedidos y estado del sistema."
    >
      <HealthStatus />
    </ScreenPlaceholder>
  );
}
