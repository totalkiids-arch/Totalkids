import { escapeHtml, formatDateTime, siteLink } from "./format.js";

/**
 * Plantilla HTML de marca Total Kids y su alternativa de texto (RF-21). El
 * contenido se describe con bloques y se pinta dos veces (HTML y texto), así
 * ambas versiones dicen lo mismo. Todo texto pasa por `escapeHtml`: las
 * plantillas nunca concatenan HTML con datos.
 *
 * Pensada para Gmail, Outlook y móviles: maquetación con tablas, CSS en línea,
 * ancho máximo de 600 px (tabla fantasma para Outlook), fuentes del sistema, sin
 * JavaScript ni formularios. El logo es una imagen con URL absoluta y texto
 * alternativo: si el cliente no la carga (p. ej. localhost), se lee «Total Kids».
 */

/** Fila etiqueta → valor. `total` la destaca (el total del pedido). */
export type Row = readonly [label: string, value: string] | readonly [string, string, "total"];

export type Block =
  /** Párrafo. */
  | { kind: "p"; text: string }
  /** Tarjeta con filas etiqueta → valor y líneas separadoras finas. */
  | { kind: "rows"; title?: string; rows: readonly Row[] }
  /** Lista con viñetas. */
  | { kind: "list"; items: readonly string[] }
  /** Botón principal con enlace absoluto. */
  | { kind: "action"; label: string; url: string }
  /** Nota secundaria, en letra más pequeña. */
  | { kind: "note"; text: string };

export interface EmailContent {
  subject: string;
  /** Texto de vista previa en la bandeja (oculto en el cuerpo). */
  preheader: string;
  /** Título grande del evento. */
  heading: string;
  /** Frase corta bajo el título. */
  intro: string;
  blocks: readonly Block[];
  /** "team": correo interno al equipo (tono interno, enlace al panel). */
  audience?: "customer" | "team";
  /** Solo en el newsletter: enlace de baja en el pie. */
  unsubscribeUrl?: string;
}

/** Marco común: sitio (logo y enlaces), datos de la tienda para el pie y fecha de envío. */
export interface LayoutFrame {
  siteUrl: string;
  /** Dirección y horario de retiro (settings.pickup_details), si está configurada. */
  pickupDetails?: string | null | undefined;
  /** Contacto de la tienda (STORE_CONTACT), si está configurado. */
  contact?: string | null | undefined;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Ruta pública del logo para correos (apps/web/public/email). */
export const EMAIL_LOGO_PATH = "/email/total-kids-logo.png";

// Tokens del tema clásico (apps/web/src/app/globals.css, @theme).
export const BRAND = {
  navy: "#1f2a44",
  blue: "#1a5299",
  blueDeep: "#103b70",
  yellow: "#ffc21f",
  yellowDeep: "#d9a21e",
  background: "#fff9ee",
  surface: "#ffffff",
  softYellow: "#ffe9a8",
  cream: "#fff3cc",
  textPrimary: "#1f2a44",
  textBody: "#3d4660",
  textSecondary: "#5b6478",
  border: "#f0e6d2",
  onBlue: "#e0e9ff",
  onDark: "#d5dae6",
  onDarkMuted: "#b4bcd0",
} as const;

/** Pila de fuentes seguras (sin fuentes externas). */
const FONT_STACK = "'Trebuchet MS',Verdana,Arial,Helvetica,sans-serif";
const FONT = `font-family:${FONT_STACK};`;

export const FOOTER_NOTE = "Importes en CLP y fechas en hora de Chile";
const TAGLINE = "Aprender jugando";

function rowHtml([label, value, style]: Row, last: boolean): string {
  const total = style === "total";
  const border = last ? "" : `border-bottom:1px solid ${BRAND.border};`;
  const size = total ? "17px" : "15px";
  return `<tr><td valign="top" style="padding:10px 12px 10px 0;${border}${FONT}font-size:${size};line-height:1.4;color:${total ? BRAND.textPrimary : BRAND.textSecondary};${total ? "font-weight:bold;" : ""}">${escapeHtml(label)}</td><td valign="top" align="right" style="padding:10px 0;${border}${FONT}font-size:${size};line-height:1.4;font-weight:bold;color:${BRAND.textPrimary};">${escapeHtml(value)}</td></tr>`;
}

function blockHtml(block: Block, team: boolean): string {
  switch (block.kind) {
    case "p":
      return `<p style="margin:0 0 16px;${FONT}font-size:16px;line-height:1.55;color:${BRAND.textBody};">${escapeHtml(block.text)}</p>`;
    case "note":
      return `<p style="margin:0 0 16px;${FONT}font-size:13px;line-height:1.5;color:${BRAND.textSecondary};">${escapeHtml(block.text)}</p>`;
    case "list":
      return `<ul style="margin:0 0 16px;padding-left:20px;${FONT}font-size:15px;line-height:1.55;color:${BRAND.textBody};">${block.items
        .map((item) => `<li style="margin:0 0 6px;">${escapeHtml(item)}</li>`)
        .join("")}</ul>`;
    case "rows": {
      const title = block.title
        ? `<tr><td colspan="2" style="padding:0 0 6px;${FONT}font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${BRAND.textSecondary};">${escapeHtml(block.title)}</td></tr>`
        : "";
      const rows = block.rows.map((row, i) => rowHtml(row, i === block.rows.length - 1)).join("");
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border-collapse:separate;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:14px;"><tr><td style="padding:14px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${title}${rows}</table></td></tr></table>`;
    }
    case "action": {
      // Botón "a prueba de Outlook": el color va en la celda y el enlace con padding.
      const bg = team ? BRAND.blue : BRAND.yellow;
      const shadow = team ? BRAND.blueDeep : BRAND.yellowDeep;
      const ink = team ? "#ffffff" : BRAND.navy;
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:4px auto 22px;"><tr><td align="center" bgcolor="${bg}" style="border-radius:999px;background:${bg};border-bottom:3px solid ${shadow};"><a href="${escapeHtml(block.url)}" target="_blank" style="display:inline-block;padding:14px 30px;${FONT}font-size:16px;font-weight:bold;line-height:1.2;color:${ink};text-decoration:none;border-radius:999px;">${escapeHtml(block.label)}</a></td></tr></table>`;
    }
  }
}

function blockText(block: Block): string {
  switch (block.kind) {
    case "p":
    case "note":
      return block.text;
    case "list":
      return block.items.map((item) => `- ${item}`).join("\n");
    case "rows": {
      const rows = block.rows.map(([label, value]) => `${label}: ${value}`);
      return (block.title ? [block.title.toUpperCase(), ...rows] : rows).join("\n");
    }
    case "action":
      return `${block.label}: ${block.url}`;
  }
}

function footerLines(content: EmailContent, frame: LayoutFrame): string[] {
  const lines: string[] = [];
  if (content.audience === "team") {
    lines.push("Correo interno para el equipo de Total Kids. No lo reenvíes a clientes.");
  }
  if (frame.pickupDetails) lines.push(`Retiro en taller: ${frame.pickupDetails}`);
  if (frame.contact) lines.push(`Contacto: ${frame.contact}`);
  lines.push(FOOTER_NOTE);
  return lines;
}

/** Fecha de envío para la tarjeta («Enviado el»): nunca la del pedido, que el payload no trae. */
export function sentAtRow(now: Date): Row {
  return ["Enviado el", formatDateTime(now)];
}

export function renderLayout(content: EmailContent, frame: LayoutFrame): RenderedEmail {
  const team = content.audience === "team";
  const logoUrl = siteLink(frame.siteUrl, EMAIL_LOGO_PATH);
  const brandLine = team ? "Panel Total Kids" : "Total Kids";
  const footer = footerLines(content, frame);

  const badge = team
    ? `<tr><td align="center" style="padding:0 0 12px;"><span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${BRAND.cream};${FONT}font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${BRAND.navy};">Aviso interno</span></td></tr>`
    : "";

  const unsubscribe = content.unsubscribeUrl
    ? `<p style="margin:10px 0 0;${FONT}font-size:12px;line-height:1.5;color:${BRAND.onDarkMuted};">¿No quieres recibir más novedades? <a href="${escapeHtml(content.unsubscribeUrl)}" target="_blank" style="color:#ffffff;text-decoration:underline;">Darte de baja del newsletter</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.background};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.background}" style="background:${BRAND.background};">
<tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${BRAND.surface};border-radius:20px;overflow:hidden;">
<tr><td align="center" bgcolor="${BRAND.blue}" style="background:${BRAND.blue};padding:28px 24px 22px;">
<img src="${escapeHtml(logoUrl)}" width="80" height="80" alt="Total Kids" style="display:block;margin:0 auto;width:80px;height:80px;border:0;outline:none;text-decoration:none;border-radius:40px;${FONT}font-size:20px;font-weight:bold;color:#ffffff;">
<p style="margin:12px 0 0;${FONT}font-size:22px;line-height:1.2;font-weight:bold;color:#ffffff;">${escapeHtml(brandLine)}</p>
<p style="margin:4px 0 0;${FONT}font-size:13px;line-height:1.4;color:${BRAND.onBlue};">${escapeHtml(TAGLINE)}</p>
</td></tr>
<tr><td style="padding:28px 28px 8px;background:${BRAND.background};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${badge}
<tr><td align="center" style="padding:0 0 8px;"><h1 style="margin:0;${FONT}font-size:28px;line-height:1.2;font-weight:bold;color:${BRAND.textPrimary};">${escapeHtml(content.heading)}</h1></td></tr>
<tr><td align="center" style="padding:0 0 24px;"><p style="margin:0;${FONT}font-size:16px;line-height:1.5;color:${BRAND.textBody};">${escapeHtml(content.intro)}</p></td></tr>
<tr><td>
${content.blocks.map((block) => blockHtml(block, team)).join("\n")}
</td></tr>
</table>
</td></tr>
<tr><td bgcolor="${BRAND.navy}" style="background:${BRAND.navy};padding:22px 28px;">
<p style="margin:0 0 6px;${FONT}font-size:14px;font-weight:bold;color:#ffffff;">Total Kids · ${escapeHtml(TAGLINE)}</p>
${footer.map((line) => `<p style="margin:0 0 4px;${FONT}font-size:12px;line-height:1.5;color:${BRAND.onDark};">${escapeHtml(line)}</p>`).join("\n")}
${unsubscribe}
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;

  const text = [
    team ? "TOTAL KIDS · AVISO INTERNO" : "TOTAL KIDS",
    "",
    content.heading,
    content.intro,
    "",
    ...content.blocks.map(blockText).flatMap((part) => [part, ""]),
    "--",
    `Total Kids · ${TAGLINE}`,
    ...footer,
    ...(content.unsubscribeUrl ? [`Darte de baja del newsletter: ${content.unsubscribeUrl}`] : []),
  ].join("\n");

  return { subject: content.subject, html, text };
}
