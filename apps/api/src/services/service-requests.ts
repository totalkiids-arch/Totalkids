import type { PrismaClient } from "../lib/prisma.js";
import { enqueueEmail } from "./email/enqueue.js";
import { emailEventKey } from "./email/events.js";

/**
 * Solicitudes de servicios especiales (LN-08, RF-24). Se guardan con la
 * aceptación de la privacidad (fecha y versión) y, en la misma transacción, se
 * encolan dos correos: el acuse al solicitante y el aviso al equipo (RF-24:
 * "notifica a ambas partes"). El seguimiento en el panel llega con LN-13.
 */

/** Servicios de la tienda (apps/web, features/services/domain/services.ts). */
export const SERVICES = {
  armado: "Armado e instalación",
  diseno: "Diseño de espacios",
  personalizacion: "Personalización",
  instituciones: "Jardines y colegios",
  regalos: "Lista de regalos y Gift Card",
  garantia: "Garantía y mantención",
} as const;

export type ServiceId = keyof typeof SERVICES;
export const SERVICE_IDS = Object.keys(SERVICES) as [ServiceId, ...ServiceId[]];

/** Plazo de respuesta que se informa en los correos, hasta que el panel lo configure. */
export const RESPONSE_TIME = "2 días hábiles";

/** Versión del texto de privacidad aceptado. Provisional hasta CL-02. */
export const PRIVACY_VERSION = "v1-provisional";

/** Referencia visible de una solicitud ("SOL-1002"). */
export const requestReference = (number: number) => `SOL-${String(number)}`;

export interface ServiceRequestInput {
  service: ServiceId;
  name: string;
  email: string;
  phone: string | null;
  commune: string | null;
  childrenAges: string | null;
  /** "AAAA-MM-DD" o null. */
  preferredDate: string | null;
  message: string;
}

type Db = Pick<PrismaClient, "$transaction">;

export async function createServiceRequest(
  db: Db,
  input: ServiceRequestInput,
  options: { adminEmail: string; now?: Date },
): Promise<{ reference: string }> {
  const now = options.now ?? new Date();
  return db.$transaction(async (tx) => {
    const request = await tx.serviceRequest.create({
      data: {
        service: input.service,
        name: input.name,
        email: input.email,
        phone: input.phone,
        commune: input.commune,
        childrenAges: input.childrenAges,
        preferredDate: input.preferredDate ? new Date(`${input.preferredDate}T00:00:00Z`) : null,
        message: input.message,
        privacyAcceptedAt: now,
        privacyVersion: PRIVACY_VERSION,
        createdAt: now,
      },
    });
    const data = {
      requestNumber: request.number,
      service: SERVICES[input.service],
      name: input.name,
      responseTime: RESPONSE_TIME,
    };
    for (const [audience, recipient] of [
      ["requester", input.email],
      ["admin", options.adminEmail],
    ] as const) {
      await enqueueEmail(tx, {
        event: "service_request",
        recipient,
        eventKey: emailEventKey("service_request", request.id, audience),
        data: { ...data, audience },
        serviceRequestId: request.id,
      });
    }
    return { reference: requestReference(request.number) };
  });
}
