// Raíz de composición de "emails": conecta los puertos con sus adaptadores actuales.
import type { EmailLog } from "./application/ports";
import { demoEmailLog } from "./infrastructure/demo-email-log";

// DEMO (ver infrastructure/demo-email-log.ts). En LN-14/LN-16 se cambia solo esta línea.
// Administrador y Operador consultan; solo el Administrador reenvía (lo verifica la acción).
export const emailLog: EmailLog = demoEmailLog;
