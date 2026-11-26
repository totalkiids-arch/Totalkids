// Muestras de los correos transaccionales con datos ficticios (pedido TK-9999):
//
//   pnpm --filter @totalkids/api email:preview --out <carpeta>   # escribe los HTML (sin red ni base)
//   pnpm --filter @totalkids/api email:preview --to <correo>     # los envía por el emisor configurado
//
// --out escribe un .html y un .txt por correo y un index.html para abrirlos en
// el navegador. La carpeta relativa se resuelve desde apps/api.
//
// --to usa el emisor de EMAIL_PROVIDER (Brevo si es "brevo" y hay API key). No
// crea pedidos ni tokens; solo registra cada envío en email_log (como «Muestra»)
// para que cuente en el límite diario. Antes revisa que quede cupo sin tocar la
// reserva de los correos críticos. Nunca muestra la API key.
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { z } from "zod";

import { loadEnv } from "../config/env.js";
import { createLogger } from "../lib/logger.js";
import { createPrismaClient } from "../lib/prisma.js";
import { createEmailSender } from "../services/email/create-sender.js";
import { previewSamples, recordPreviewSend, renderPreview } from "../services/email/preview.js";
import { countSentToday } from "../services/email/quota.js";
import { escapeHtml } from "../services/email/templates/format.js";

function usage(message: string): never {
  console.error(`${message}\n
Uso:
  pnpm --filter @totalkids/api email:preview --out <carpeta>
  pnpm --filter @totalkids/api email:preview --to <correo>`);
  process.exit(1);
}

const env = loadEnv();
const now = new Date();
const options = { siteUrl: env.PUBLIC_SITE_URL, now, contact: env.STORE_CONTACT ?? null };

async function writePreviews(dir: string) {
  const out = resolve(dir);
  await mkdir(out, { recursive: true });
  const links: string[] = [];
  for (const sample of previewSamples(now)) {
    const email = renderPreview(sample, options);
    await writeFile(join(out, `${sample.slug}.html`), email.html, "utf8");
    await writeFile(
      join(out, `${sample.slug}.txt`),
      `Asunto: ${email.subject}\n\n${email.text}`,
      "utf8",
    );
    links.push(
      `<li><a href="${sample.slug}.html">${escapeHtml(email.subject)}</a> · <a href="${sample.slug}.txt">texto plano</a></li>`,
    );
  }
  const index = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Correos de muestra · Total Kids</title></head>
<body style="font-family:'Trebuchet MS',Verdana,Arial,sans-serif;max-width:720px;margin:32px auto;padding:0 16px;color:#1f2a44;">
<h1>Correos de muestra</h1>
<p>Datos ficticios. El logo se carga desde ${escapeHtml(env.PUBLIC_SITE_URL)}: si ese sitio no está levantado, se ve el texto alternativo.</p>
<ul>${links.join("\n")}</ul>
</body></html>`;
  await writeFile(join(out, "index.html"), index, "utf8");
  console.log(`Muestras escritas en ${out}`);
  console.log(`Abre ${join(out, "index.html")} en el navegador.`);
}

async function sendPreviews(to: string) {
  const recipient = z.email().safeParse(to.trim());
  if (!recipient.success) usage("El correo de --to no es válido.");
  const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === "development");
  const sender = createEmailSender(env, logger);
  const samples = previewSamples(now);

  if (sender.name === "fake") {
    console.log(
      "EMAIL_PROVIDER no es brevo (o falta BREVO_API_KEY): el envío es simulado y no se registra.",
    );
    for (const sample of samples) {
      const email = renderPreview(sample, options);
      const result = await sender.send({
        to: recipient.data,
        ...email,
        tag: `preview_${sample.event}`,
      });
      console.log(`  ${sample.slug}: ${result.outcome}`);
    }
    return;
  }

  const prisma = createPrismaClient(env.DATABASE_URL);
  try {
    const { day, used } = await countSentToday(prisma, now);
    const available = env.EMAIL_DAILY_LIMIT - env.EMAIL_DAILY_RESERVE - used;
    if (samples.length > available) {
      console.error(
        `No hay cupo para ${String(samples.length)} muestras hoy (${day}): van ${String(used)} de ${String(env.EMAIL_DAILY_LIMIT)} y se reservan ${String(env.EMAIL_DAILY_RESERVE)} para los críticos.`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(`Enviando ${String(samples.length)} muestras por ${sender.name}…`);
    let accepted = 0;
    for (const sample of samples) {
      const email = renderPreview(sample, options);
      const result = await sender.send({
        to: recipient.data,
        ...email,
        tag: `preview_${sample.event}`,
      });
      await recordPreviewSend(prisma, {
        slug: sample.slug,
        event: sample.event,
        recipient: recipient.data,
        result,
        at: new Date(),
      });
      if (result.outcome === "accepted") accepted += 1;
      console.log(
        `  ${sample.slug}: ${result.outcome}${result.outcome === "accepted" ? "" : ` (${result.detail})`}`,
      );
    }
    console.log(
      `Listo: ${String(accepted)} de ${String(samples.length)} aceptados. Quedan registrados como «Muestra» en el panel de Correos.`,
    );
    if (accepted < samples.length) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const { values } = parseArgs({
    options: { to: { type: "string" }, out: { type: "string" } },
    allowPositionals: true,
  });
  if (values.to && values.out) usage("Usa --to o --out, no ambos.");
  if (values.out) return writePreviews(values.out);
  if (values.to) return sendPreviews(values.to);
  usage("Falta --to o --out.");
}

main().catch((error: unknown) => {
  // Solo el nombre del error: nunca la configuración (puede traer la API key).
  console.error(
    "No se pudieron generar las muestras:",
    error instanceof Error ? `${error.name}: ${error.message}` : "Error",
  );
  process.exit(1);
});
