// Raíz de composición de la feature: conecta los puertos (application) con sus
// adaptadores (infrastructure). La UI obtiene dependencias desde aquí.
import type { HealthGateway } from "./application/health-gateway";
import { bffHealthGateway } from "./infrastructure/bff-health-gateway";

export const healthGateway: HealthGateway = bffHealthGateway;
