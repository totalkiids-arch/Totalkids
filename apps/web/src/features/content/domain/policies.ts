/**
 * Contenido de la página de políticas, tomado de la maqueta (docs/maqueta, pantalla
 * "politicas"). Es provisional: Total Kids debe aportar y aprobar el texto legal
 * definitivo antes de publicar (PR-04).
 *
 * Los ids son anclas públicas: el pie de página, el checkout, el registro y los
 * formularios enlazan a /politicas#<id>. No cambiarlos sin actualizar esos enlaces.
 */
export interface PolicySection {
  id: string;
  title: string;
  paragraphs: readonly string[];
}

export const POLICY_SECTIONS = [
  {
    id: "terminos",
    title: "Términos de uso",
    paragraphs: [
      "Al usar este sitio aceptas las condiciones de compra, despacho y privacidad descritas en esta página.",
      "Condiciones generales de uso: pendientes de aprobación por Total Kids.",
    ],
  },
  {
    id: "compra",
    title: "Compra y precios",
    paragraphs: [
      "Los importes se presentan en pesos chilenos. El resumen de compra informa productos, extras, descuentos y despacho antes del pago.",
      "El pago se realiza en la página segura de Flow. Total Kids no recibe ni almacena datos de tarjeta.",
    ],
  },
  {
    id: "despacho",
    title: "Despacho y retiro",
    paragraphs: [
      "La compra ofrece zonas habilitadas con tarifa y plazo, o retiro sin costo.",
      "La dirección y el horario de retiro definitivos están pendientes de confirmación.",
    ],
  },
  {
    id: "cambios",
    title: "Retracto, cambios y garantía",
    paragraphs: [
      "Texto comercial y condiciones pendientes de aprobación por Total Kids.",
      "Puedes pedir ayuda o una revisión de garantía desde Servicios especiales.",
    ],
  },
  {
    id: "factura",
    title: "Boleta y factura",
    paragraphs: [
      "Los datos tributarios se piden en el checkout. La emisión de boleta o factura es externa y no se realiza automáticamente en el sitio.",
    ],
  },
  {
    id: "cancelaciones",
    title: "Cancelaciones y reembolsos",
    paragraphs: [
      "Cancelar un pedido no devuelve el dinero automáticamente. La devolución se registra de forma manual, con monto, fecha y referencia.",
    ],
  },
  {
    id: "privacidad",
    title: "Privacidad y newsletter",
    paragraphs: [
      "Usamos los datos que ingresas para gestionar tu pedido o tu solicitud y para contactarte sobre ellos.",
      "El newsletter requiere un consentimiento separado, que nunca viene premarcado, y puedes darte de baja cuando quieras.",
      "Responsable del tratamiento, contacto, plazos de retención y versión legal definitiva: pendientes de aprobación por Total Kids.",
    ],
  },
] as const satisfies readonly PolicySection[];

export type PolicyId = (typeof POLICY_SECTIONS)[number]["id"];
