import type { AdminRole } from "@/features/users";

/** Quién está usando el panel. Con LN-04 sumará la cuenta interna autenticada. */
export interface AdminSession {
  role: AdminRole;
}

/**
 * Puerto: lee la sesión del panel en el servidor. null = sin sesión.
 * Hoy lo implementa una cookie de demostración; en LN-04, la sesión real.
 */
export interface AdminSessionReader {
  read(): Promise<AdminSession | null>;
}

/** Puerto: abre y cierra la sesión (solo desde Server Actions o Route Handlers). */
export interface AdminSessionWriter {
  start(role: AdminRole): Promise<void>;
  end(): Promise<void>;
}
