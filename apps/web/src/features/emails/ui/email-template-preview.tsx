import { Logo } from "@/shared/ui/brand/logo";

import type { EmailPreview } from "../domain/email-log";

/**
 * Vista previa de la plantilla HTML de marca (RF-21). Solo ilustra: el correo
 * real lo arma el backend (LN-14) con su alternativa de texto. Todo el texto
 * pasa por React, que lo escapa. El botón no es un enlace: en el correo real
 * llevaría un enlace seguro, sin identificadores predecibles.
 */
export function EmailTemplatePreview({
  preview,
  recipient,
}: {
  preview: EmailPreview;
  recipient: string;
}) {
  return (
    <figure className="min-w-0">
      <dl className="mb-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="font-extrabold text-text-secondary">Para</dt>
        <dd className="min-w-0 break-all">{recipient}</dd>
        <dt className="font-extrabold text-text-secondary">Asunto</dt>
        <dd className="min-w-0 break-words">{preview.subject}</dd>
      </dl>
      <div className="overflow-hidden rounded-xl border border-border bg-background">
        <div className="flex items-center gap-3 bg-surface px-5 py-4">
          <Logo size="sm" />
          <span className="font-heading text-lg font-extrabold">Total Kids</span>
        </div>
        <div className="flex flex-col items-start gap-3 bg-soft-yellow px-5 py-6">
          <p className="font-heading text-2xl font-extrabold">{preview.heading}</p>
          <p className="max-w-[60ch] text-text-body">{preview.body}</p>
          {preview.action ? (
            <span
              aria-hidden
              className="rounded-full bg-brand-blue px-5 py-2.5 text-sm font-extrabold text-white"
            >
              {preview.action}
            </span>
          ) : null}
        </div>
        <p className="px-5 py-3 text-xs text-text-secondary">
          Importes en CLP y fechas en hora de Chile · Total Kids, aprender jugando
        </p>
      </div>
      <figcaption className="mt-2 text-[13px] text-text-secondary">
        Ejemplo de correo.{" "}
        {preview.action ? `Botón «${preview.action}» (sin enlace en la vista previa).` : ""}
      </figcaption>
    </figure>
  );
}
