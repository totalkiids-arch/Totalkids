// Raíz de composición de "emails": conecta los puertos con sus adaptadores actuales.
import type { ActivityEntry } from "@/features/activity";
import type { EmailLog } from "./application/ports";
import { ATTEMPT_RESULT_LABEL, EMAIL_EVENT_LABEL } from "./domain/email-log";
import { demoEmailLog } from "./infrastructure/demo-email-log";

// DEMO (ver infrastructure/demo-email-log.ts). En LN-14/LN-16 se cambia solo esta línea.
// Administrador y Operador consultan; solo el Administrador reenvía (lo verifica la acción).
export const emailLog: EmailLog = demoEmailLog;

/** Caso de uso: reenvíos manuales de correos, para el historial (RF-21, RF-34). */
export async function listActivity(): Promise<ActivityEntry[]> {
  return (await emailLog.list()).flatMap((record) =>
    record.attempts.flatMap((attempt, index) =>
      attempt.kind !== "manual" || !attempt.actor
        ? []
        : [
            {
              id: `correo-${record.id}-${index}`,
              at: attempt.at,
              actor: attempt.actor,
              area: "correos" as const,
              action: `Reenvío de «${EMAIL_EVENT_LABEL[record.event]}» a ${record.recipient}: ${ATTEMPT_RESULT_LABEL[attempt.result].toLowerCase()}.`,
              reason: null,
              reference: {
                label: record.reference ? record.reference.id : "Correo",
                href: `/admin/correos?id=${encodeURIComponent(record.id)}#detalle`,
              },
            },
          ],
    ),
  );
}
