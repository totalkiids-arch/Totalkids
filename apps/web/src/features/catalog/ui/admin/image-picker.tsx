"use client";

import Image from "next/image";
import { useEffect, useId, useState } from "react";

import { AdminMuted } from "@/shared/ui/admin/panel";
import { TextField } from "@/shared/ui/form";

import {
  IMAGE_ALT_MAX,
  IMAGE_TYPES,
  validateImageFile,
  type FieldErrors,
} from "../../domain/admin-product";
import { fieldId } from "../../domain/admin-product-form";

/** Las fotos subidas (servidas por la API vía /uploads) y las externas no pasan por el optimizador. */
const unoptimized = (src: string) => src.startsWith("/uploads/") || /^https?:\/\//.test(src);

/**
 * Fotos del producto: texto alternativo de las actuales y una imagen nueva. La
 * imagen se sube al guardar (JPG, PNG o WebP de hasta 2 MB; la API revisa sus
 * bytes). Con JavaScript se ve una vista previa y se avisa antes de enviar.
 */
export function ImagePicker({
  images,
  newImageAlt,
  errors,
}: {
  images: readonly {
    id: string;
    src: string;
    width: number | null;
    height: number | null;
    alt: string;
  }[];
  /** Alt de la imagen nueva devuelto por el servidor (si hubo errores). */
  newImageAlt: string;
  errors: FieldErrors;
}) {
  const inputId = useId();
  const [preview, setPreview] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // Libera la URL de la vista previa al cambiarla o al salir.
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  const fileError = localError ?? errors.newImage;

  return (
    <div className="flex flex-col gap-5">
      {images.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {images.map((image, index) => (
            <li key={image.id} className="flex flex-col gap-2">
              <Image
                src={image.src}
                width={image.width ?? 800}
                height={image.height ?? 800}
                alt={image.alt}
                sizes="(min-width: 1024px) 320px, 100vw"
                unoptimized={unoptimized(image.src)}
                className="h-auto w-full rounded-lg border border-border bg-background"
              />
              <div id={fieldId(`images.${index}.alt`)} className="scroll-mt-24">
                <TextField
                  label={`Descripción de la foto ${index + 1}`}
                  name="image_alt"
                  defaultValue={image.alt}
                  maxLength={IMAGE_ALT_MAX}
                  error={errors[`images.${index}.alt`]}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <AdminMuted>
          Este producto aún no tiene fotos. Para publicarlo necesita al menos una.
        </AdminMuted>
      )}

      <div id={fieldId("newImage")} className="flex scroll-mt-24 flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-extrabold">
          Agregar imagen
        </label>
        <input
          id={inputId}
          type="file"
          name="new_image"
          accept={IMAGE_TYPES.join(",")}
          aria-describedby={`${inputId}-ayuda${fileError ? ` ${inputId}-error` : ""}`}
          aria-invalid={fileError ? true : undefined}
          className="w-full cursor-pointer rounded-xl border-2 border-chip-border bg-surface p-2 text-sm file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-brand-navy file:px-4 file:py-2 file:font-extrabold file:text-white"
          onChange={(event) => {
            const file = event.target.files?.[0];
            setPreview(null);
            setLocalError(null);
            if (!file) return;
            const error = validateImageFile(file);
            if (error) {
              setLocalError(error);
              event.target.value = "";
              return;
            }
            setPreview(URL.createObjectURL(file));
          }}
        />
        {fileError ? (
          <p id={`${inputId}-error`} className="text-sm font-bold text-brand-red">
            {fileError}
          </p>
        ) : null}
        <p id={`${inputId}-ayuda`} className="text-[13px] text-text-secondary">
          JPG, PNG o WebP. Máximo 2 MB. Se sube al guardar el producto.
        </p>
      </div>

      {preview ? (
        /* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), no optimizable */
        <img
          src={preview}
          alt="Vista previa de la imagen elegida"
          className="h-auto w-full rounded-lg border border-border"
        />
      ) : null}
      <div id={fieldId("newImage.alt")} className="scroll-mt-24">
        <TextField
          label="Descripción de la imagen nueva"
          name="new_image_alt"
          defaultValue={newImageAlt}
          maxLength={IMAGE_ALT_MAX}
          hint="Obligatoria si agregas una imagen: describe el mueble para quien no puede ver la foto."
          error={errors["newImage.alt"]}
        />
      </div>
    </div>
  );
}
