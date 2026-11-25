// Raíz de composición de "emails": conecta el puerto con su adaptador.
import type { EmailLog } from "./application/ports";
import { apiEmailLog } from "./infrastructure/api-email-log";

// Administrador y Operador consultan; solo el Administrador reenvía (lo verifican
// la acción y la API).
export const emailLog: EmailLog = apiEmailLog;
