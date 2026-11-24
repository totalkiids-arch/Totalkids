import { escapeHtml } from "./format.js";

/**
 * Plantilla HTML de marca Total Kids y su alternativa de texto (RF-21). El
 * contenido se describe con bloques y se pinta dos veces (HTML y texto), así
 * ambas versiones dicen lo mismo. Todo texto pasa por `escapeHtml`: las
 * plantillas nunca concatenan HTML con datos.
 */

export type Block =
  /** Párrafo. */
  | { kind: "p"; text: string }
  /** Pares etiqueta/valor ("Total", "$12.990"). */
  | { kind: "rows"; rows: readonly (readonly [string, string])[] }
  /** Lista con viñetas. */
  | { kind: "list"; items: readonly string[] }
  /** Botón con enlace absoluto. */
  | { kind: "action"; label: string; url: string }
  /** Nota secundaria, en letra más pequeña. */
  | { kind: "note"; text: string };

export interface EmailContent {
  subject: string;
  /** Texto de vista previa en la bandeja (oculto en el cuerpo). */
  preheader: string;
  heading: string;
  blocks: readonly Block[];
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// Colores de marca (apps/web/src/app/globals.css).
const BRAND_BLUE = "#1a5299";
const SOFT_YELLOW = "#ffe9a8";
const TEXT = "#2b2b2b";
const MUTED = "#5f6b7a";
const SURFACE = "#ffffff";
const BACKGROUND = "#f6f3ec";

const FONT = "font-family:'Nunito',Arial,Helvetica,sans-serif;";
const FOOTER = "Importes en CLP y fechas en hora de Chile · Total Kids, aprender jugando";

function blockHtml(block: Block): string {
  switch (block.kind) {
    case "p":
      return `<p style="margin:0 0 14px;${FONT}font-size:16px;line-height:1.5;color:${TEXT};">${escapeHtml(block.text)}</p>`;
    case "note":
      return `<p style="margin:0 0 14px;${FONT}font-size:13px;line-height:1.5;color:${MUTED};">${escapeHtml(block.text)}</p>`;
    case "list":
      return `<ul style="margin:0 0 14px;padding-left:20px;${FONT}font-size:15px;line-height:1.5;color:${TEXT};">${block.items
        .map((item) => `<li style="margin:0 0 4px;">${escapeHtml(item)}</li>`)
        .join("")}</ul>`;
    case "rows":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;border-collapse:collapse;">${block.rows
        .map(
          ([label, value]) =>
            `<tr><td style="padding:6px 0;border-bottom:1px solid #eee3c8;${FONT}font-size:15px;color:${MUTED};">${escapeHtml(label)}</td><td align="right" style="padding:6px 0;border-bottom:1px solid #eee3c8;${FONT}font-size:15px;font-weight:700;color:${TEXT};">${escapeHtml(value)}</td></tr>`,
        )
        .join("")}</table>`;
    case "action":
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;"><tr><td style="border-radius:999px;background:${BRAND_BLUE};"><a href="${escapeHtml(block.url)}" style="display:inline-block;padding:12px 22px;${FONT}font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(block.label)}</a></td></tr></table>`;
  }
}

function blockText(block: Block): string {
  switch (block.kind) {
    case "p":
    case "note":
      return block.text;
    case "list":
      return block.items.map((item) => `- ${item}`).join("\n");
    case "rows":
      return block.rows.map(([label, value]) => `${label}: ${value}`).join("\n");
    case "action":
      return `${block.label}: ${block.url}`;
  }
}

export function renderLayout(content: EmailContent): RenderedEmail {
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BACKGROUND};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BACKGROUND};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${SURFACE};border-radius:16px;overflow:hidden;">
<tr><td style="padding:18px 24px;${FONT}font-size:22px;font-weight:800;color:${BRAND_BLUE};">Total Kids</td></tr>
<tr><td style="padding:24px;background:${SOFT_YELLOW};">
<h1 style="margin:0 0 16px;${FONT}font-size:26px;line-height:1.2;font-weight:800;color:${TEXT};">${escapeHtml(content.heading)}</h1>
${content.blocks.map(blockHtml).join("\n")}
</td></tr>
<tr><td style="padding:14px 24px;${FONT}font-size:12px;color:${MUTED};">${escapeHtml(FOOTER)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    "Total Kids",
    "",
    content.heading,
    "",
    ...content.blocks.map(blockText).flatMap((part) => [part, ""]),
    "--",
    FOOTER,
  ].join("\n");

  return { subject: content.subject, html, text };
}
