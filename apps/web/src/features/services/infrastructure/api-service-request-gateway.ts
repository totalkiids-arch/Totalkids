import "server-only";

import {
  apiErrorMessage,
  FORM_MESSAGES,
  generalFormError,
  postApiForm,
} from "@/shared/infrastructure/api-forms";

import { ServiceRequestRejectedError, type ServiceRequestGateway } from "../application/ports";

/** Adaptador: POST /service-requests (la API guarda y envía los correos a ambas partes). */
export const apiServiceRequestGateway: ServiceRequestGateway = {
  async submit(request) {
    let result;
    try {
      result = await postApiForm("/service-requests", {
        service: request.service,
        name: request.name,
        email: request.email,
        phone: request.phone,
        commune: request.commune,
        childrenAges: request.ages,
        preferredDate: request.preferredDate,
        message: request.message,
        // El dominio ya exigió la casilla de privacidad.
        privacyAccepted: true,
      });
    } catch {
      throw new ServiceRequestRejectedError(FORM_MESSAGES.unavailable);
    }
    const reference = (result.body as { reference?: unknown } | null)?.reference;
    if (result.status === 201 && typeof reference === "string") return { reference };
    // La tienda valida igual que la API: un 422 aquí es raro; se muestra su mensaje.
    throw new ServiceRequestRejectedError(
      result.status === 422
        ? (apiErrorMessage(result.body) ?? FORM_MESSAGES.unavailable)
        : generalFormError(result),
    );
  },
};
