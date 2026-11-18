import type { HealthState } from "../domain/health";

/** Puerto: cómo la aplicación consulta el estado del sistema. La infraestructura lo implementa. */
export interface HealthGateway {
  check(signal?: AbortSignal): Promise<HealthState>;
}
