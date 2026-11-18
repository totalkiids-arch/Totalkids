/**
 * Datos de contacto y comerciales del sitio.
 * Los valores entre corchetes son marcadores de la maqueta: los entrega el cliente
 * (PR-04 / CL-02 / CL-03). Al definirlos aquí, se actualizan en todo el sitio.
 */
export const site = {
  name: "Total Kids",
  tagline: "Aprender jugando",
  description:
    "Mobiliario infantil para hogares, jardines y colegios. Espacios a la medida de los niños.",
  phone: "+56 9 [TU NÚMERO]",
  email: "[TU CORREO]",
  address: "[TU DIRECCIÓN], [COMUNA]",
  hours: "[HORARIO DE ATENCIÓN]",
  installments: "Paga en cuotas [CONDICIONES]",
  shippingLeadTime: "Plazos: [TUS PLAZOS]",
  safetyCertification: "Cantos redondeados, pinturas [CERTIFICACIÓN]",
  /** Número de WhatsApp en formato internacional sin "+" (p. ej. "56912345678"). null = no se muestra. */
  whatsapp: null as string | null,
} as const;
