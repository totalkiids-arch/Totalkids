import type { EmailEvent } from "../../../generated/prisma/enums.js";
import type { EmailData, ReviewAlertReason } from "../events.js";
import { formatClp, formatDateTime, orderRef, requestRef, siteLink } from "./format.js";
import {
  renderLayout,
  sentAtRow,
  type Block,
  type EmailContent,
  type ItemLine,
  type ProgressStep,
  type RenderedEmail,
  type Row,
} from "./layout.js";

/**
 * Plantillas de los correos transaccionales (SRS 4.4.3, RF-21), ajustadas al
 * alcance acordado con el cliente: compras solo como invitado (el comprador
 * consulta su pedido con número y correo), productos a pedido, despacho a
 * coordinar o retiro en taller, y factura con folio emitida por Total Kids.
 *
 * Todas usan el mismo layout (`layout.ts`): cabecera con el logo, título grande
 * y una frase, una tarjeta con filas etiqueta → valor, un botón principal y el
 * pie con los datos de la tienda. Los correos al equipo llevan tono interno y
 * enlace al panel. Asuntos y titulares coinciden con la vista previa del panel
 * (apps/web/src/features/emails/domain/email-log.ts). Los enlaces son absolutos
 * (PUBLIC_SITE_URL) y no llevan identificadores predecibles. Nunca datos de pago.
 */

export type { RenderedEmail } from "./layout.js";

export interface RenderContext {
  /** PUBLIC_SITE_URL: origen del sitio (Next.js). */
  siteUrl: string;
  /** Momento del envío («Enviado el» en la tarjeta). Por defecto, ahora. */
  now?: Date;
  /** Pie: dirección y horario de retiro (settings.pickup_details), si está configurada. */
  pickupDetails?: string | null;
  /** Pie: contacto de la tienda (STORE_CONTACT), si está configurado. */
  contact?: string | null;
  /** Solo para password_recovery: enlace de un solo uso, emitido al enviar. */
  passwordReset?: { url: string; expiresAt: Date };
  /** Solo para newsletter_unsubscribe: enlace de baja, emitido al enviar. */
  unsubscribeUrl?: string;
}

/** Ruta pública de la consulta de pedidos por número y correo (UI-09). */
export const ORDER_LOOKUP_PATH = "/seguimiento";
/** Ruta del panel para restablecer la contraseña (página aún por crear en apps/web). */
export const PASSWORD_RESET_PATH = "/admin/restablecer";
/** Página del panel con el registro de correos. */
export const PANEL_EMAILS_PATH = "/admin/correos";

/** Página pública que confirma la baja del newsletter con el token del enlace. */
export const NEWSLETTER_UNSUBSCRIBE_PATH = "/suscripcion/baja";

/** Enlace de baja del newsletter. El token va codificado y nunca se registra en logs. */
export function newsletterUnsubscribeUrl(siteUrl: string, token: string): string {
  return siteLink(siteUrl, `${NEWSLETTER_UNSUBSCRIBE_PATH}?token=${encodeURIComponent(token)}`);
}

/** Enlace de recuperación. El token va codificado y nunca se registra en logs. */
export function passwordResetUrl(siteUrl: string, token: string): string {
  return siteLink(siteUrl, `${PASSWORD_RESET_PATH}?token=${encodeURIComponent(token)}`);
}

type OrderLine = EmailData<"order_received">["items"][number];
type Amounts = Pick<
  EmailData<"order_received">,
  "subtotal" | "discount" | "shippingCost" | "total"
>;
type Delivery = EmailData<"purchase_confirmed">["delivery"];

/** «2 × Cama casita (Roble, 90 cm) + Armado en domicilio · a pedido (10 días hábiles)». */
function lineLabel(line: OrderLine): string {
  const name = line.variant ? `${line.name} (${line.variant})` : line.name;
  const extras = line.extras.length > 0 ? ` + ${line.extras.join(", ")}` : "";
  const toOrder = line.madeToOrder
    ? line.leadTime
      ? ` · a pedido (${line.leadTime})`
      : " · a pedido"
    : "";
  return `${String(line.quantity)} × ${name}${extras}${toOrder}`;
}

/** Línea para la tarjeta de productos: nombre, detalle (variante y extras) y etiqueta a pedido. */
function itemLine(line: OrderLine): ItemLine {
  const detail = [line.variant, line.extras.length > 0 ? `+ ${line.extras.join(", ")}` : null]
    .filter(Boolean)
    .join(" · ");
  return {
    quantity: line.quantity,
    name: line.name,
    detail: detail || undefined,
    badge: line.madeToOrder
      ? line.leadTime
        ? `A pedido · ${line.leadTime}`
        : "A pedido"
      : undefined,
    price: formatClp(line.lineTotal),
    textLabel: lineLabel(line),
  };
}

/** Pasos de la barra de avance según el evento (retiro en taller: «Listo para retiro»). */
function progress(
  stage: "received" | "paid" | "rejected" | "shipped" | "delivered",
  pickup = false,
): Block {
  const order = ["received", "paid", "shipped", "delivered"] as const;
  const labels = ["Recibido", "Pagado", pickup ? "Listo para retiro" : "En camino", "Entregado"];
  const at = stage === "rejected" ? 1 : order.indexOf(stage);
  const steps: ProgressStep[] = labels.map((label, i) => ({
    label: stage === "rejected" && i === 1 ? "Pago no completado" : label,
    state:
      stage === "rejected" && i === 1
        ? "error"
        : i < at || (i === at && stage === "delivered")
          ? "done"
          : i === at
            ? "current"
            : "todo",
  }));
  return { kind: "progress", steps };
}

function amountRows(amounts: Amounts, pickup: boolean): Row[] {
  const rows: Row[] = [["Subtotal", formatClp(amounts.subtotal)]];
  if (amounts.discount > 0) rows.push(["Descuento", `−${formatClp(amounts.discount)}`]);
  rows.push([
    pickup ? "Retiro en taller" : "Despacho",
    pickup
      ? "Gratis"
      : amounts.shippingCost === null
        ? "A coordinar"
        : formatClp(amounts.shippingCost),
  ]);
  rows.push(["Total", formatClp(amounts.total), "total"]);
  return rows;
}

/** Dónde se entrega (retiro en taller o dirección de despacho) y el plazo, si se conoce. */
function deliveryRows(delivery: Delivery): Row[] {
  const rows: Row[] =
    delivery.method === "pickup"
      ? [["Retiro en taller", delivery.pickupDetails]]
      : [["Despacho a", delivery.address]];
  if (delivery.leadTime) rows.push(["Plazo", delivery.leadTime]);
  return rows;
}

/** Tarjeta del pedido: número, fecha de envío, productos, montos y entrega. */
function orderCard(
  ref: string,
  now: Date,
  items: readonly OrderLine[],
  amounts: Amounts,
  delivery: Delivery | undefined,
): Block[] {
  const pickup = delivery?.method === "pickup";
  const rows = amountRows(amounts, pickup);
  const [totalLabel, totalValue] = rows[rows.length - 1] ?? ["Total", formatClp(amounts.total)];
  return [
    {
      kind: "rows",
      title: "Tu pedido",
      icon: "🧾",
      rows: [["N.º de pedido", ref], sentAtRow(now)],
    },
    {
      kind: "items",
      title: "Productos",
      lines: items.map(itemLine),
      amounts: rows.slice(0, -1),
      total: [totalLabel, totalValue],
    },
    // Los correos encolados antes de LN-09 no traen la entrega.
    ...(delivery
      ? [
          {
            kind: "rows",
            title: "Entrega",
            icon: pickup ? "🏠" : "🚚",
            rows: deliveryRows(delivery),
          } as const,
        ]
      : []),
  ];
}

/** Textos de la alerta de revisión (LN-15), por motivo. */
export const REVIEW_ALERT_TEXT: Record<ReviewAlertReason, { title: string; detail: string }> = {
  late_no_stock: {
    title: "Pago tardío sin stock",
    detail:
      "Flow confirmó el pago después del plazo y ya no hay unidades: gestiona una solución o la devolución (RN-05).",
  },
  double_charge: {
    title: "Doble cobro",
    detail: "Flow cobró un segundo intento de un pedido ya pagado: no se entrega dos veces.",
  },
  mismatch: {
    title: "Datos del pago distintos",
    detail: "El monto, la moneda o el número informados por Flow no coinciden con el intento.",
  },
  flow_unreachable: {
    title: "Flow sin respuesta",
    detail:
      "No pudimos confirmar el estado del pago con Flow: el pedido no se vence mientras pueda haber un cobro (RN-04).",
  },
};

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

type Renderers = {
  [E in EmailEvent]: (data: EmailData<E>, ctx: RenderContext, now: Date) => EmailContent;
};

const TEMPLATES: Renderers = {
  order_received: (data, ctx, now) => {
    const ref = orderRef(data.orderNumber);
    const pickup = data.delivery?.method === "pickup";
    return {
      subject: `Recibimos tu pedido #${ref}`,
      preheader: `Tu pedido #${ref} está pendiente de pago.`,
      heading: "¡Recibimos tu pedido!",
      intro: `Hola ${data.buyerName}, tu pedido #${ref} está pendiente de pago.`,
      icon: "🛒",
      blocks: [
        progress("received", pickup),
        ...orderCard(ref, now, data.items, data, data.delivery),
        ...shippingToCoordinateNote(data, pickup),
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

  purchase_confirmed: (data, ctx, now) => {
    const ref = orderRef(data.orderNumber);
    const pickup = data.delivery.method === "pickup";
    return {
      subject: `Tu compra #${ref} está confirmada`,
      preheader: `Confirmamos el pago de tu pedido #${ref}.`,
      heading: "Pago confirmado",
      intro: `¡Gracias por crecer con nosotros, ${data.buyerName}! Tu pedido #${ref} está confirmado.`,
      icon: "🎉",
      tone: "success",
      blocks: [
        progress("paid", pickup),
        ...orderCard(ref, now, data.items, data, data.delivery),
        ...shippingToCoordinateNote(data, pickup),
        ...madeToOrderNote(data.items),
        {
          kind: "p",
          text:
            data.taxDocument === "factura"
              ? "Emitiremos tu factura y te la enviaremos con su folio."
              : "El comprobante de pago de Flow es tu boleta.",
        },
        { kind: "action", label: "Ver mi pedido", url: siteLink(ctx.siteUrl, ORDER_LOOKUP_PATH) },
        {
          kind: "note",
          text: data.contact
            ? `¿Dudas? Contáctanos: ${data.contact}. Indica tu número de pedido ${ref}.`
            : `¿Dudas? Contáctanos indicando tu número de pedido ${ref}.`,
        },
      ],
    };
  },

  new_sale: (data, ctx, now) => {
    const ref = orderRef(data.orderNumber);
    return {
      subject: `Nueva venta #${ref}`,
      preheader: `Se confirmó el pago del pedido #${ref}.`,
      heading: "Nueva venta",
      intro: `Se confirmó el pago del pedido #${ref}. Revisa el detalle y prepáralo desde el panel.`,
      audience: "team",
      blocks: [
        {
          kind: "rows",
          title: "Resumen",
          rows: [
            ["N.º de pedido", ref],
            sentAtRow(now),
            ["Unidades", String(data.itemCount)],
            ["Entrega", data.deliveryMethod === "pickup" ? "Retiro en taller" : "Despacho"],
            ["Documento", data.taxDocument === "factura" ? "Factura (emitir con folio)" : "Boleta"],
            ["Total", formatClp(data.total), "total"],
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

  payment_review_alert: (data, ctx, now) => {
    const ref = orderRef(data.orderNumber);
    const { title, detail } = REVIEW_ALERT_TEXT[data.reason];
    return {
      subject: `Revisar pago del pedido #${ref}: ${title}`,
      preheader: `El pedido #${ref} quedó en revisión: ${title.toLowerCase()}.`,
      heading: "Pago en revisión",
      intro: `El pedido #${ref} quedó en revisión. ${detail}`,
      audience: "team",
      blocks: [
        {
          kind: "rows",
          title: "Detalle",
          rows: [
            ["N.º de pedido", ref],
            sentAtRow(now),
            ["Motivo", title],
            ["Intento de pago", String(data.attempt)],
            ["Monto del intento", formatClp(data.amount), "total"],
          ],
        },
        {
          kind: "action",
          label: "Revisar en el panel",
          url: siteLink(ctx.siteUrl, `/admin/pedidos/${ref}`),
        },
        {
          kind: "note",
          text: "Resuélvelo en Pagos y conciliación: consulta Flow o registra la resolución con su motivo.",
        },
      ],
    };
  },

  payment_rejected: (data, ctx, now) => {
    const ref = orderRef(data.orderNumber);
    const outcome = data.outcome === "rejected" ? "fue rechazado" : "fue anulado";
    return {
      subject: `No pudimos confirmar el pago del pedido #${ref}`,
      preheader: `El pago del pedido #${ref} ${outcome}.`,
      heading: "Tu pago no se completó",
      intro: `Hola ${data.buyerName}, el pago del pedido #${ref} ${outcome}.`,
      icon: "⚠️",
      tone: "warning",
      blocks: [
        progress("rejected"),
        {
          kind: "rows",
          title: "Tu pedido",
          icon: "🧾",
          rows: [
            ["N.º de pedido", ref],
            sentAtRow(now),
            ["Pago", data.outcome === "rejected" ? "Rechazado" : "Anulado"],
          ],
        },
        {
          kind: "p",
          text: "Puedes intentarlo de nuevo de forma segura: se crea un pago nuevo, nunca se reutiliza el anterior.",
        },
        {
          kind: "action",
          label: "Reintentar el pago",
          url: siteLink(ctx.siteUrl, ORDER_LOOKUP_PATH),
        },
        { kind: "note", text: `Consulta tu pedido con el número ${ref} y este correo.` },
      ],
    };
  },

  order_shipped: (data, ctx, now) => {
    const ref = orderRef(data.orderNumber);
    if (data.method === "pickup") {
      // Retiro en taller (LN-13): "Despachado" significa listo para retirar.
      return {
        subject: `Tu pedido #${ref} está listo para retiro`,
        preheader: `Ya puedes retirar tu pedido #${ref} en el taller.`,
        heading: "Listo para retiro",
        intro: `Hola ${data.buyerName}, tu pedido #${ref} está listo para retirar en el taller.`,
        icon: "📦",
        tone: "info",
        blocks: [
          progress("shipped", true),
          {
            kind: "rows",
            title: "Retiro",
            icon: "🏠",
            rows: [
              ["N.º de pedido", ref],
              sentAtRow(now),
              ["Retiro en taller", data.pickupDetails],
            ],
          },
          { kind: "note", text: `Al retirar, indica tu número de pedido ${ref}.` },
          { kind: "action", label: "Ver mi pedido", url: siteLink(ctx.siteUrl, ORDER_LOOKUP_PATH) },
        ],
      };
    }
    const rows: Row[] = [["N.º de pedido", ref], sentAtRow(now), ["Transporte", data.carrier]];
    if (data.trackingCode) rows.push(["Número de seguimiento", data.trackingCode]);
    return {
      subject: `Tu pedido #${ref} va en camino`,
      preheader: `Despachamos tu pedido #${ref}.`,
      heading: "Tu pedido va en camino",
      intro: `Hola ${data.buyerName}, despachamos tu pedido #${ref}.`,
      icon: "🚚",
      tone: "info",
      blocks: [
        progress("shipped"),
        { kind: "rows", title: "Despacho", icon: "📍", rows },
        {
          kind: "action",
          label: "Seguir mi pedido",
          url: siteLink(ctx.siteUrl, ORDER_LOOKUP_PATH),
        },
      ],
    };
  },

  order_delivered: (data, ctx, now) => {
    const ref = orderRef(data.orderNumber);
    return {
      subject: `Tu pedido #${ref} fue entregado`,
      preheader: `Tu pedido #${ref} fue entregado.`,
      heading: "Pedido entregado",
      intro: `Hola ${data.buyerName}, tu pedido #${ref} fue entregado. ¡Que lo disfruten!`,
      icon: "🏡",
      tone: "success",
      blocks: [
        progress("delivered"),
        {
          kind: "rows",
          title: "Tu pedido",
          icon: "🧾",
          rows: [["N.º de pedido", ref], sentAtRow(now)],
        },
        { kind: "p", text: "Te dejamos algunos cuidados para que tus muebles duren más:" },
        { kind: "list", items: CARE_TIPS },
        { kind: "action", label: "Ver mi pedido", url: siteLink(ctx.siteUrl, ORDER_LOOKUP_PATH) },
        {
          kind: "note",
          text: "Si quieres contarnos cómo te fue, responde por nuestros canales de contacto: nos encanta saberlo.",
        },
      ],
    };
  },

  service_request: (data, ctx, now) => {
    const ref = requestRef(data.requestNumber);
    if (data.audience === "admin") {
      return {
        subject: `Nueva solicitud #${ref}`,
        preheader: `Llegó una solicitud de ${data.service}.`,
        heading: "Nueva solicitud de servicio",
        intro: `Llegó la solicitud #${ref}. Revisa el detalle y responde desde el panel.`,
        audience: "team",
        blocks: [
          {
            kind: "rows",
            title: "Solicitud",
            rows: [
              ["Referencia", ref],
              sentAtRow(now),
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
      heading: "Recibimos tu solicitud",
      intro: `Hola ${data.name}, tu solicitud #${ref} quedó registrada. ¡Gracias por contarnos tu idea!`,
      blocks: [
        {
          kind: "rows",
          title: "Tu solicitud",
          rows: [["Referencia", ref], sentAtRow(now), ["Servicio", data.service]],
        },
        { kind: "p", text: `Te responderemos dentro de ${data.responseTime}.` },
        { kind: "action", label: "Ir a la tienda", url: siteLink(ctx.siteUrl, "/") },
      ],
    };
  },

  password_recovery: (_data, ctx) => {
    if (!ctx.passwordReset) throw new Error("Falta el enlace de recuperación");
    return {
      subject: "Restablece tu contraseña del panel",
      preheader: "Enlace de un solo uso para elegir una contraseña nueva.",
      heading: "Restablece tu contraseña",
      intro:
        "Recibimos una solicitud para restablecer la contraseña de tu cuenta del panel de Total Kids.",
      blocks: [
        { kind: "action", label: "Restablecer contraseña", url: ctx.passwordReset.url },
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

  newsletter_unsubscribe: (_data, ctx) => {
    if (!ctx.unsubscribeUrl) throw new Error("Falta el enlace de baja");
    return {
      subject: "Confirma tu baja del newsletter de Total Kids",
      preheader: "Un clic y dejas de recibir nuestras novedades.",
      heading: "Confirma tu baja",
      intro:
        "Recibimos una solicitud para dejar de enviarte ofertas y novedades de Total Kids a este correo.",
      unsubscribeUrl: ctx.unsubscribeUrl,
      blocks: [
        { kind: "action", label: "Confirmar la baja", url: ctx.unsubscribeUrl },
        {
          kind: "p",
          text: "Tus pedidos y su seguimiento no cambian: solo dejas de recibir el newsletter.",
        },
        { kind: "note", text: "Si no fuiste tú, ignora este correo: seguirás suscrito." },
      ],
    };
  },

  email_quota_alert: (data, ctx) => ({
    subject: `Correos en pausa: se alcanzó el límite diario (${String(data.limit)})`,
    preheader: "Los correos pendientes saldrán solos mañana desde las 00:00 (hora de Chile).",
    heading: "Límite diario de correos",
    intro: `Hoy se alcanzó el límite de ${String(data.limit)} correos del plan de Brevo. El envío queda en pausa hasta mañana.`,
    audience: "team",
    blocks: [
      {
        kind: "rows",
        title: "Envíos de hoy",
        rows: [
          ["Día", data.day],
          ["Correos contados", String(data.sent)],
          ["Límite diario", String(data.limit)],
          ["Reserva para correos críticos", String(data.reserve)],
        ],
      },
      {
        kind: "p",
        text: "Nada se pierde: los correos pendientes quedan en la cola, sin gastar reintentos, y salen solos a partir de las 00:00 (hora de Chile).",
      },
      {
        kind: "action",
        label: "Ver los correos en el panel",
        url: siteLink(ctx.siteUrl, PANEL_EMAILS_PATH),
      },
      {
        kind: "note",
        text: "Si pasa seguido, evalúa un plan pagado de Brevo y sube EMAIL_DAILY_LIMIT.",
      },
    ],
  }),
};

/** Arma asunto, HTML y texto de un correo con datos ya validados (`parseEmailData`). */
export function renderEmail<E extends EmailEvent>(
  event: E,
  data: EmailData<E>,
  ctx: RenderContext,
): RenderedEmail {
  const render = TEMPLATES[event] as (
    data: EmailData<E>,
    ctx: RenderContext,
    now: Date,
  ) => EmailContent;
  const content = render(data, ctx, ctx.now ?? new Date());
  return renderLayout(content, {
    siteUrl: ctx.siteUrl,
    pickupDetails: ctx.pickupDetails,
    contact: ctx.contact,
  });
}
