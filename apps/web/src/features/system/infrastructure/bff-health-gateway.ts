import type { HealthGateway } from "../application/health-gateway";
import { toHealthState } from "../domain/health";

/** Adaptador: consulta la ruta BFF de Next.js (/api/health), nunca la API directamente. */
export const bffHealthGateway: HealthGateway = {
  async check(signal) {
    const res = await fetch("/api/health", {
      cache: "no-store",
      ...(signal ? { signal } : {}),
    });
    return toHealthState(res.ok, await res.json().catch(() => null));
  },
};
