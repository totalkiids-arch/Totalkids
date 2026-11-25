import { describe, expect, it } from "vitest";

import type { EmailEvent } from "../src/generated/prisma/enums.js";
import { EMAIL_EVENTS, parseEmailData, type EmailDataInput } from "../src/services/email/events.js";
import {
  newsletterUnsubscribeUrl,
  passwordResetUrl,
  renderEmail,
} from "../src/services/email/templates/index.js";
import { escapeHtml, formatClp, formatDateTime } from "../src/services/email/templates/format.js";

// Plantillas de correo (LN-14, RF-21, SRS 4.4.3).

const SITE = "https://tienda.example.com/";
const XSS = `<script>alert("x")</script>`;

const line = {
  name: "Cama casita",
  variant: "Roble natural, 90 cm",
  quantity: 2,
  unitPrice: 189990,
  lineTotal: 379980,
  extras: ["Armado en domicilio"],
  madeToOrder: true,
};
const amounts = { subtotal: 379980, discount: 20000, shippingCost: null, total: 359980 };
/** Despacho a domicilio (sin `method`, como lo encolaba LN-14). */
const shipped = {
  orderNumber: 1048,
  buyerName: "Ana",
  carrier: "Starken",
  trackingCode: "ST-998877" as string | null,
};

const SAMPLES: { [E in EmailEvent]: EmailDataInput<E> } = {
  order_received: {
    orderNumber: 1048,
    buyerName: "Ana",
    items: [line],
    ...amounts,
    paymentDueAt: "2026-11-23T18:30:00.000Z",
  },
  purchase_confirmed: {
    orderNumber: 1048,
    buyerName: "Ana",
    items: [line],
    ...amounts,
    delivery: {
      method: "shipping",
      address: "Av. Siempre Viva 123, Ñuñoa",
      leadTime: "5 a 7 días hábiles",
    },
    taxDocument: "factura",
    contact: "+56 9 1234 5678",
  },
  new_sale: {
    orderNumber: 1048,
    total: 359980,
    itemCount: 2,
    deliveryMethod: "shipping",
    taxDocument: "boleta",
  },
  payment_rejected: { orderNumber: 1048, buyerName: "Ana", outcome: "rejected" },
  order_shipped: shipped,
  order_delivered: { orderNumber: 1048, buyerName: "Ana" },
  service_request: {
    audience: "requester",
    requestNumber: 1002,
    service: "Armado",
    name: "Ana",
    responseTime: "2 días hábiles",
  },
  password_recovery: { userId: "0195f3a0-0000-7000-8000-000000000001" },
  newsletter_unsubscribe: { subscriberId: "0195f3a0-0000-7000-8000-000000000002" },
  payment_review_alert: { orderNumber: 1048, reason: "late_no_stock", attempt: 2, amount: 89990 },
};

const SUBJECTS: Record<EmailEvent, string> = {
  order_received: "Recibimos tu pedido #TK-1048",
  purchase_confirmed: "Tu compra #TK-1048 está confirmada",
  new_sale: "Nueva venta #TK-1048",
  payment_rejected: "No pudimos confirmar el pago del pedido #TK-1048",
  order_shipped: "Tu pedido #TK-1048 va en camino",
  order_delivered: "Tu pedido #TK-1048 fue entregado",
  service_request: "Recibimos tu solicitud #SOL-1002",
  password_recovery: "Restablece tu contraseña del panel",
  newsletter_unsubscribe: "Confirma tu baja del newsletter de Total Kids",
  payment_review_alert: "Revisar pago del pedido #TK-1048: Pago tardío sin stock",
};

const RESET_EXPIRES = new Date("2026-11-23T15:00:00.000Z");

function render<E extends EmailEvent>(event: E, data: EmailDataInput<E> = SAMPLES[event]) {
  return renderEmail(event, parseEmailData(event, data), {
    siteUrl: SITE,
    passwordReset: { url: passwordResetUrl(SITE, "tok_abc"), expiresAt: RESET_EXPIRES },
    unsubscribeUrl: newsletterUnsubscribeUrl(SITE, "tok_baja"),
  });
}

/** Todos los href del HTML. */
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1] ?? "");

describe("plantillas de correo", () => {
  it.each(EMAIL_EVENTS)("%s: asunto, HTML de marca y texto plano", (event) => {
    const email = render(event);

    expect(email.subject).toBe(SUBJECTS[event]);
    expect(email.html).toContain('<html lang="es">');
    expect(email.html).toContain("Total Kids");
    expect(email.html).toContain("#1a5299");
    expect(email.text).toContain("Total Kids");
    expect(email.text).toContain("Importes en CLP y fechas en hora de Chile");
    expect(email.text).not.toMatch(/<[a-z]/i);
    for (const output of [email.subject, email.html, email.text]) {
      expect(output).not.toMatch(/undefined|null|NaN|\[object/);
      // Sin datos de pago (RNF-05).
      expect(output).not.toMatch(/tarjeta|cvv|\b\d{13,19}\b/i);
    }
  });

  it.each(EMAIL_EVENTS)(
    "%s: enlaces absolutos desde PUBLIC_SITE_URL, también en el texto",
    (event) => {
      const email = render(event);
      for (const href of hrefs(email.html)) {
        expect(href.startsWith("https://tienda.example.com/")).toBe(true);
        expect(href).not.toContain(".com//");
      }
      for (const href of hrefs(email.html)) {
        expect(email.text).toContain(href.replaceAll("&amp;", "&"));
      }
    },
  );

  it("escapa los textos aportados por usuarios", () => {
    const events = [
      render("order_received", { ...SAMPLES.order_received, buyerName: XSS }),
      render("purchase_confirmed", {
        ...SAMPLES.purchase_confirmed,
        items: [{ ...line, name: XSS, extras: [XSS] }],
        delivery: { method: "shipping", address: XSS },
        contact: XSS,
      }),
      render("order_shipped", { ...shipped, carrier: XSS, trackingCode: XSS }),
      render("service_request", { ...SAMPLES.service_request, name: XSS, service: XSS }),
    ];
    for (const email of events) {
      expect(email.html).not.toContain("<script>");
      expect(email.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    }
  });

  it("pedido recibido: pendiente de pago, productos, total, vigencia y acceso para continuar", () => {
    const { html, text } = render("order_received");
    expect(text).toContain("pendiente de pago");
    expect(text).toContain(
      "2 × Cama casita (Roble natural, 90 cm) + Armado en domicilio · a pedido",
    );
    expect(text).toContain(`Total: ${formatClp(359980)}`);
    expect(text).toContain(`Descuento: −${formatClp(20000)}`);
    expect(text).toContain("Despacho: A coordinar");
    expect(text).toContain(formatDateTime("2026-11-23T18:30:00.000Z"));
    expect(text).toContain("Continuar con el pago: https://tienda.example.com/seguimiento");
    // Sin identificadores predecibles en el enlace del comprador.
    expect(hrefs(html)).toEqual(["https://tienda.example.com/seguimiento"]);
  });

  it("pedido recibido con la entrega (LN-09): retiro en taller o despacho a coordinar, y plazo a pedido", () => {
    const pickup = render("order_received", {
      ...SAMPLES.order_received,
      items: [{ ...line, leadTime: "10 días hábiles" }],
      shippingCost: 0,
      delivery: { method: "pickup", pickupDetails: "Taller, lun a vie 10 a 18 h" },
    }).text;
    expect(pickup).toContain("· a pedido (10 días hábiles)");
    expect(pickup).toContain("Retiro en taller: Gratis");
    expect(pickup).toContain("Retiro en taller: Taller, lun a vie 10 a 18 h");
    expect(pickup).not.toMatch(/Despacho|costo del despacho|undefined|null/);

    const shipping = render("order_received", {
      ...SAMPLES.order_received,
      delivery: { method: "shipping", address: "Av. Alemania 0123, Depto 4, Temuco" },
    }).text;
    expect(shipping).toContain("Despacho: A coordinar");
    expect(shipping).toContain("Despacho a: Av. Alemania 0123, Depto 4, Temuco");
    expect(shipping).toContain("El costo del despacho no está incluido en el total");
    expect(shipping).not.toContain("Plazo:");
  });

  it("compra confirmada: despacho, plazo, factura con folio y contacto; o retiro en taller", () => {
    const shipping = render("purchase_confirmed").text;
    expect(shipping).toContain("Despacho a: Av. Siempre Viva 123, Ñuñoa");
    expect(shipping).toContain("Plazo: 5 a 7 días hábiles");
    expect(shipping).toContain("El costo del despacho no está incluido en el total");
    expect(shipping).toContain("factura");
    expect(shipping).toContain("+56 9 1234 5678");

    const pickup = render("purchase_confirmed", {
      ...SAMPLES.purchase_confirmed,
      shippingCost: 0,
      delivery: { method: "pickup", pickupDetails: "Taller, lun a vie 10 a 18 h" },
      taxDocument: "boleta",
      contact: null,
    }).text;
    expect(pickup).toContain("Retiro en taller: Taller, lun a vie 10 a 18 h");
    expect(pickup).toContain("Retiro en taller: Gratis");
    expect(pickup).toContain("comprobante de pago de Flow es tu boleta");
    expect(pickup).not.toContain("costo del despacho");
  });

  it("nueva venta: resumen para el equipo, sin datos personales del comprador", () => {
    const data = parseEmailData("new_sale", {
      ...SAMPLES.new_sale,
      buyerEmail: "ana@ejemplo.cl",
      buyerRut: "11.111.111-1",
      buyerPhone: "+56911111111",
    });
    expect(data).not.toHaveProperty("buyerEmail");
    const { html, text } = renderEmail("new_sale", data, { siteUrl: SITE });
    expect(`${html}${text}`).not.toMatch(/ana@ejemplo|11\.111|5691111/);
    expect(hrefs(html)).toEqual(["https://tienda.example.com/admin/pedidos/TK-1048"]);
  });

  it("pago rechazado o anulado: resultado y reintento seguro", () => {
    expect(render("payment_rejected").text).toContain("fue rechazado");
    const cancelled = render("payment_rejected", {
      ...SAMPLES.payment_rejected,
      outcome: "cancelled",
    });
    expect(cancelled.text).toContain("fue anulado");
    expect(cancelled.text).toContain("Reintentar el pago: https://tienda.example.com/seguimiento");
  });

  it("pedido despachado: transportista y seguimiento (opcional)", () => {
    expect(render("order_shipped").text).toContain("Número de seguimiento: ST-998877");
    const noCode = render("order_shipped", { ...shipped, trackingCode: null }).text;
    expect(noCode).toContain("Transporte: Starken");
    expect(noCode).not.toContain("Número de seguimiento");
  });

  it("pedido de retiro en taller (LN-13): listo para retiro, sin transportista", () => {
    const email = render("order_shipped", {
      method: "pickup",
      orderNumber: 1048,
      buyerName: "Ana",
      pickupDetails: "Taller Total Kids, Temuco. Lunes a viernes de 10 a 18 h.",
    });
    expect(email.subject).toBe("Tu pedido #TK-1048 está listo para retiro");
    expect(email.text).toContain("está listo para retirar en el taller");
    expect(email.text).toContain(
      "Retiro en taller: Taller Total Kids, Temuco. Lunes a viernes de 10 a 18 h.",
    );
    expect(email.text).not.toMatch(/va en camino|Transporte|undefined|null/);
    expect(hrefs(email.html)).toEqual(["https://tienda.example.com/seguimiento"]);
  });

  it("pedido entregado: confirmación y cuidados, sin módulo de reseñas", () => {
    const { html, text } = render("order_delivered");
    expect(text).toContain("fue entregado");
    expect(text).toContain("- Limpia con un paño suave");
    expect(hrefs(html)).toEqual([]);
  });

  it("solicitud de servicio: al solicitante con plazo; al equipo, mínimo y con acceso al panel", () => {
    const requester = render("service_request").text;
    expect(requester).toContain("Te responderemos dentro de 2 días hábiles.");
    expect(requester).toContain("Referencia: SOL-1002");

    const admin = render("service_request", {
      ...SAMPLES.service_request,
      audience: "admin",
      name: "Nombre Privado",
    });
    expect(admin.subject).toBe("Nueva solicitud #SOL-1002");
    expect(`${admin.html}${admin.text}`).not.toContain("Nombre Privado");
    expect(hrefs(admin.html)).toEqual(["https://tienda.example.com/admin/solicitudes"]);
  });

  it("recuperación: enlace de un solo uso con vencimiento, sin contraseña", () => {
    const { html, text } = render("password_recovery");
    expect(hrefs(html)).toEqual(["https://tienda.example.com/admin/restablecer?token=tok_abc"]);
    expect(text).toContain("sirve una sola vez");
    expect(text).toContain(formatDateTime(RESET_EXPIRES));
    expect(text).not.toContain("0195f3a0");
    expect(() =>
      renderEmail(
        "password_recovery",
        parseEmailData("password_recovery", SAMPLES.password_recovery),
        {
          siteUrl: SITE,
        },
      ),
    ).toThrow("Falta el enlace de recuperación");
  });

  it("baja del newsletter: un enlace con el token, sin el id del suscriptor", () => {
    const { html, text } = render("newsletter_unsubscribe");
    expect(hrefs(html)).toEqual(["https://tienda.example.com/suscripcion/baja?token=tok_baja"]);
    expect(text).toContain("Tus pedidos y su seguimiento no cambian");
    expect(`${html}${text}`).not.toContain("0195f3a0");
    expect(() =>
      renderEmail(
        "newsletter_unsubscribe",
        parseEmailData("newsletter_unsubscribe", SAMPLES.newsletter_unsubscribe),
        { siteUrl: SITE },
      ),
    ).toThrow("Falta el enlace de baja");
  });

  it("formato: CLP, hora de Chile y escape", () => {
    expect(formatClp(1234567)).toBe("$1.234.567");
    // 18:30 UTC = 15:30 en Chile continental (UTC−3 en horario de verano).
    expect(formatDateTime("2026-11-23T18:30:00.000Z")).toMatch(/23 de noviembre de 2026.*15:30/);
    expect(escapeHtml(`a&b<c>"d'`)).toBe("a&amp;b&lt;c&gt;&quot;d&#39;");
    expect(passwordResetUrl("https://x.cl", "a+b/c")).toBe(
      "https://x.cl/admin/restablecer?token=a%2Bb%2Fc",
    );
  });
});
