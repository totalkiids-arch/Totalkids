import type { EmailEvent } from "../../../generated/prisma/enums.js";
import type { EmailData } from "../events.js";
import { formatClp, formatDateTime, orderRef, requestRef, siteLink } from "./format.js";
import { renderLayout, type Block, type EmailContent, type RenderedEmail } from "./layout.js";

/**
 * Plantillas de los correos transaccionales (SRS 4.4.3, RF-21), ajustadas al
 * alcance acordado con el cliente: compras solo como invitado (el comprador
 * consulta su pedido con número y correo), productos a pedido, despacho a
 * coordinar o retiro en taller, y factura con folio emitida por Total Kids.
 *
 * Asuntos y titulares coinciden con la vista previa del panel
 * (apps/web/src/features/emails/domain/email-log.ts). Los enlaces son absolutos
 * (PUBLIC_SITE_URL) y no llevan identificadores predecibles: el comprador entra
 * a la consulta de pedidos; el equipo, al panel con sesión. Nunca datos de pago.
 */

export type { RenderedEmail } from "./layout.js";

export interface RenderContext {
  /** PUBLIC_SITE_URL: origen del sitio (Next.js). */
  siteUrl: string;
  /** Solo para password_recovery: enlace de un solo uso, emitido al enviar. */
  passwordReset?: { url: string; expiresAt: Date };
}

/** Ruta pública de la consulta de pedidos por número y correo (UI-09). */
export const ORDER_LOOKUP_PATH = "/seguimiento";
/** Ruta del panel para restablecer la contraseña (página aún por crear en apps/web). */
export const PASSWORD_RESET_PATH = "/admin/restablecer";

/** Enlace de recuperación. El token va codificado y nunca se registra en logs. */
export function passwordResetUrl(siteUrl: string, token: string): string {
  return siteLink(siteUrl, `${PASSWORD_RESET_PATH}?token=${encodeURIComponent(token)}`);
}

type OrderLine = EmailData<"order_received">["items"][number];
type Amounts = Pick<
  EmailData<"order_received">,
  "subtotal" | "discount" | "shippingCost" | "total"
>;

function lineText(line: OrderLine): string {
  const name = line.variant ? `${line.name} (${line.variant})` : line.name;
  const extras = line.extras.length > 0 ? ` + ${line.extras.join(", ")}` : "";
  const toOrder = line.madeToOrder ? " · a pedido" : "";
  return `${String(line.quantity)} × ${name}${extras}${toOrder} — ${formatClp(line.lineTotal)}`;
}

function amountRows(amounts: Amounts, pickup: boolean): Block {
  const rows: [string, string][] = [["Subtotal", formatClp(amounts.subtotal)]];
  if (amounts.discount > 0) rows.push(["Descuento", `−${formatClp(amounts.discount)}`]);
  rows.push([
    pickup ? "Retiro en taller" : "Despacho",
    pickup
      ? "Gratis"
      : amounts.shippingCost === null
        ? "A coordinar"
        : formatClp(amounts.shippingCost),
  ]);
  rows.push(["Total", formatClp(amounts.total)]);
  return { kind: "rows", rows };
}

function madeToOrderNote(items: readonly OrderLine[]): Block[] {
  return items.some((line) => line.madeToOrder)
    ? [
        {
          kind: "note",
          text: "Los productos a pedido se fabrican en nuestro taller después de confirmar el pago.",
        },
      ]
    : [];
}

function shippingToCoordinateNote(amounts: Amounts, pickup: boolean): Block[] {
  return !pickup && amounts.shippingCost === null
    ? [
        {
          kind: "note",
          text: "El costo del despacho no está incluido en el total: lo coordinamos contigo antes de enviarlo.",
        },
      ]
    : [];
}

const CARE_TIPS = [
  "Limpia con un paño suave apenas húmedo; evita productos abrasivos.",
  "Mantén los muebles lejos de fuentes de calor y del sol directo.",
  "Revisa y aprieta los tornillos cada cierto tiempo.",
];

type Renderers = { [E in EmailEvent]: (data: EmailData<E>, ctx: RenderContext) => EmailContent };

const TEMPLATES: Renderers = {
  order_received: (data, ctx) => {
    const ref = orderRef(data.orderNumber);
    return {
      subject: `Recibimos tu pedido #${ref}`,
      preheader: `Tu pedido #${ref} está pendiente de pago.`,
      heading: "¡Recibimos tu pedido!",
      blocks: [
        { kind: "p", text: `Hola ${data.buyerName}, tu pedido #${ref} está pendiente de pago.` },
        { kind: "list", items: data.items.map(lineText) },
        amountRows(data, false),
        {
          kind: "p",
          text: `Reservamos tus productos hasta el ${formatDateTime(data.paymentDueAt)}. Si no se completa el pago a tiempo, el pedido vence.`,
        },
        ...madeToOrderNote(data.items),
        {
          kind: "action",
          label: "Continuar con el pago",
          url: siteLink(ctx.siteUrl, ORDER_LOOKUP_PATH),
        },
        {
          kind: "note",
          text: `Para continuar, consulta tu pedido con el número ${ref} y este correo.`,
        },
      ],
    };
  },

  purchase_confirmed: (data, ctx) => {
    const ref = orderRef(data.orderNumber);
    const pickup = data.delivery.method === "pickup";
    const deliveryRows: [string, string][] =
      data.delivery.method === "pickup"
        ? [["Retiro en taller", data.delivery.pickupDetails]]
        : [["Despacho a", data.delivery.address]];
    if (data.delivery.leadTime) deliveryRows.push(["Plazo", data.delivery.leadTime]);
    return {
      subject: `Tu compra #${ref} está confirmada`,
      preheader: `Confirmamos el pago de tu pedido #${ref}.`,
      heading: "¡Gracias por crecer con nosotros!",
      blocks: [
        { kind: "p", text: `Hola ${data.buyerName}, tu pedido #${ref} está confirmado.` },
        { kind: "list", items: data.items.map(lineText) },
        amountRows(data, pickup),
        { kind: "rows", rows: deliveryRows },
        ...shippingToCoordinateNote(data, pickup),
        ...madeToOrderNote(data.items),
        {
          kind: "p",
          text:
            data.taxDocument === "factura"
              ? "Emitiremos tu factura y te la enviaremos con su folio."
              : "El comprobante de pago de Flow es tu boleta.",
        },
        {
          kind: "p",
          text: data.contact
            ? `¿Dudas? Contáctanos: ${data.contact}. Indica tu número de pedido ${ref}.`
            : `¿Dudas? Contáctanos indicando tu número de pedido ${ref}.`,
        },
        { kind: "action", label: "Ver mi pedido", url: siteLink(ctx.siteUrl, ORDER_LOOKUP_PATH) },
      ],
    };
  },

  new_sale: (data, ctx) => {
    const ref = orderRef(data.orderNumber);
    return {
      subject: `Nueva venta #${ref}`,
      preheader: `Se confirmó el pago del pedido #${ref}.`,
      heading: "Nueva venta en la tienda",
      blocks: [
        {
          kind: "p",
          text: `Se confirmó el pago del pedido #${ref}. Revisa el detalle en el panel.`,
        },
        {
          kind: "rows",
          rows: [
            ["Total", formatClp(data.total)],
            ["Unidades", String(data.itemCount)],
            ["Entrega", data.deliveryMethod === "pickup" ? "Retiro en taller" : "Despacho"],
            ["Documento", data.taxDocument === "factura" ? "Factura (emitir con folio)" : "Boleta"],
          ],
        },
        {
          kind: "action",
          label: "Abrir el panel",
          url: siteLink(ctx.siteUrl, `/admin/pedidos/${ref}`),
        },
      ],
    };
  },

  payment_rejected: (data, ctx) => {
    const ref = orderRef(data.orderNumber);
    const outcome = data.outcome === "rejected" ? "fue rechazado" : "fue anulado";
    return {
      subject: `No pudimos confirmar el pago del pedido #${ref}`,
      preheader: `El pago del pedido #${ref} ${outcome}.`,
      heading: "Tu pago no se completó",
      blocks: [
        { kind: "p", text: `Hola ${data.buyerName}, el pago del pedido #${ref} ${outcome}.` },
        {
          kind: "p",
          text: "Puedes intentarlo de nuevo de forma segura: se crea un pago nuevo, nunca se reutiliza el anterior.",
        },
        {
          kind: "action",
          label: "Reintentar el pago",
          url: siteLink(ctx.siteUrl, ORDER_LOOKUP_PATH),
        },
        {
          kind: "note",
          text: `Consulta tu pedido con el número ${ref} y este correo.`,
        },
      ],
    };
  },

  order_shipped: (data, ctx) => {
    const ref = orderRef(data.orderNumber);
    if (data.method === "pickup") {
      // Retiro en taller (LN-13): "Despachado" significa listo para retirar.
      return {
        subject: `Tu pedido #${ref} está listo para retiro`,
        preheader: `Ya puedes retirar tu pedido #${ref} en el taller.`,
        heading: "¡Tu pedido está listo!",
        blocks: [
          {
            kind: "p",
            text: `Hola ${data.buyerName}, tu pedido #${ref} está listo para retirar en el taller.`,
          },
          { kind: "rows", rows: [["Retiro en taller", data.pickupDetails]] },
          {
            kind: "action",
            label: "Ver mi pedido",
            url: siteLink(ctx.siteUrl, ORDER_LOOKUP_PATH),
          },
        ],
      };
    }
    const rows: [string, string][] = [["Transporte", data.carrier]];
    if (data.trackingCode) rows.push(["Número de seguimiento", data.trackingCode]);
    return {
      subject: `Tu pedido #${ref} va en camino`,
      preheader: `Despachamos tu pedido #${ref}.`,
      heading: "¡Tu pedido va en camino!",
      blocks: [
        { kind: "p", text: `Hola ${data.buyerName}, despachamos tu pedido #${ref}.` },
        { kind: "rows", rows },
        {
          kind: "action",
          label: "Seguir mi pedido",
          url: siteLink(ctx.siteUrl, ORDER_LOOKUP_PATH),
        },
      ],
    };
  },

  order_delivered: (data) => {
    const ref = orderRef(data.orderNumber);
    return {
      subject: `Tu pedido #${ref} fue entregado`,
      preheader: `Tu pedido #${ref} fue entregado.`,
      heading: "¡Que lo disfruten!",
      blocks: [
        {
          kind: "p",
          text: `Hola ${data.buyerName}, tu pedido #${ref} fue entregado. Te dejamos algunos cuidados para que tus muebles duren más:`,
        },
        { kind: "list", items: CARE_TIPS },
        {
          kind: "p",
          text: "Si quieres contarnos cómo te fue, responde por nuestros canales de contacto: nos encanta saberlo.",
        },
      ],
    };
  },

  service_request: (data, ctx) => {
    const ref = requestRef(data.requestNumber);
    if (data.audience === "admin") {
      return {
        subject: `Nueva solicitud #${ref}`,
        preheader: `Llegó una solicitud de ${data.service}.`,
        heading: "Nueva solicitud de servicio",
        blocks: [
          { kind: "p", text: `Llegó la solicitud #${ref}. Revisa el detalle en el panel.` },
          {
            kind: "rows",
            rows: [
              ["Servicio", data.service],
              ["Plazo de respuesta", data.responseTime],
            ],
          },
          {
            kind: "action",
            label: "Abrir el panel",
            url: siteLink(ctx.siteUrl, "/admin/solicitudes"),
          },
        ],
      };
    }
    return {
      subject: `Recibimos tu solicitud #${ref}`,
      preheader: `Tu solicitud #${ref} quedó registrada.`,
      heading: "¡Recibimos tu idea!",
      blocks: [
        { kind: "p", text: `Hola ${data.name}, tu solicitud #${ref} quedó registrada.` },
        {
          kind: "rows",
          rows: [
            ["Servicio", data.service],
            ["Referencia", ref],
          ],
        },
        { kind: "p", text: `Te responderemos dentro de ${data.responseTime}.` },
      ],
    };
  },

  password_recovery: (_data, ctx) => {
    if (!ctx.passwordReset) throw new Error("Falta el enlace de recuperación");
    return {
      subject: "Restablece tu contraseña del panel",
      preheader: "Enlace de un solo uso para elegir una contraseña nueva.",
      heading: "Restablece tu contraseña",
      blocks: [
        {
          kind: "p",
          text: "Recibimos una solicitud para restablecer la contraseña de tu cuenta del panel de Total Kids.",
        },
        { kind: "action", label: "Elegir una contraseña nueva", url: ctx.passwordReset.url },
        {
          kind: "p",
          text: `El enlace sirve una sola vez y vence el ${formatDateTime(ctx.passwordReset.expiresAt)}. Si pides otro, este deja de valer.`,
        },
        {
          kind: "note",
          text: "Si no fuiste tú, ignora este correo: tu contraseña no cambia. Nunca te pediremos tu contraseña por correo.",
        },
      ],
    };
  },
};

/** Arma asunto, HTML y texto de un correo con datos ya validados (`parseEmailData`). */
export function renderEmail<E extends EmailEvent>(
  event: E,
  data: EmailData<E>,
  ctx: RenderContext,
): RenderedEmail {
  const render = TEMPLATES[event] as (data: EmailData<E>, ctx: RenderContext) => EmailContent;
  return renderLayout(render(data, ctx));
}
