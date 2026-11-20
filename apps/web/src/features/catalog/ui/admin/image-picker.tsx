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

interface Picked {
  url: string;
  type: string;
  size: number;
  name: string;
}

/**
 * Fotos del producto: texto alternativo de las actuales y una imagen nueva con
 * vista previa local. La imagen NO se sube: el almacenamiento se define en
 * PR-05/LN-12. Al servidor solo viajan tipo, tamaño y alt, que se validan allí.
 */
export function ImagePicker({
  images,
  newImageAlt,
  errors,
}: {
  images: readonly { src: string; width: number; height: number; alt: string }[];
  /** Alt de la imagen nueva devuelto por el servidor (si hubo errores). */
  newImageAlt: string;
  errors: FieldErrors;
}) {
  const inputId = useId();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // Libera la URL de la vista previa al cambiarla o al salir.
  useEffect(() => () => (picked ? URL.revokeObjectURL(picked.url) : undefined), [picked]);

  const fileError = localError ?? errors.newImage;

  return (
    <div className="flex flex-col gap-5">
      <p className="rounded-lg bg-cream px-3.5 py-3 text-[13px] text-on-yellow">
        La carga de imágenes todavía no está disponible. Puedes elegir un archivo para revisar que
        cumpla los requisitos y ver cómo se vería.
      </p>

      {images.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {images.map((image, index) => (
            <li key={image.src} className="flex flex-col gap-2">
              <Image
                src={image.src}
                width={image.width}
                height={image.height}
                alt={image.alt}
                sizes="(min-width: 1024px) 320px, 100vw"
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
        <AdminMuted>Este producto aún no tiene fotos.</AdminMuted>
      )}

      <div id={fieldId("newImage")} className="flex scroll-mt-24 flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-extrabold">
          Agregar imagen
        </label>
        {/* Sin name: el archivo no se envía. Sin JavaScript no hay vista previa. */}
        <input
          id={inputId}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          aria-describedby={`${inputId}-ayuda${fileError ? ` ${inputId}-error` : ""}`}
          aria-invalid={fileError ? true : undefined}
          className="w-full cursor-pointer rounded-xl border-2 border-chip-border bg-surface p-2 text-sm file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-brand-navy file:px-4 file:py-2 file:font-extrabold file:text-white"
          onChange={(event) => {
            const file = event.target.files?.[0];
            setPicked(null);
            setLocalError(null);
            if (!file) return;
            const error = validateImageFile(file);
            if (error) {
              setLocalError(error);
              event.target.value = "";
              return;
            }
            setPicked({
              url: URL.createObjectURL(file),
              type: file.type,
              size: file.size,
              name: file.name,
            });
          }}
        />
        {fileError ? (
          <p id={`${inputId}-error`} className="text-sm font-bold text-brand-red">
            {fileError}
          </p>
        ) : null}
        <p id={`${inputId}-ayuda`} className="text-[13px] text-text-secondary">
          JPG, PNG o WebP. Máximo 2 MB. La vista previa necesita JavaScript.
        </p>
      </div>

      {picked ? (
        <div className="flex flex-col gap-2">
          <input type="hidden" name="new_image_type" value={picked.type} />
          <input type="hidden" name="new_image_size" value={picked.size} />
          <input type="hidden" name="new_image_name" value={picked.name} />
          {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), no optimizable */}
          <img
            src={picked.url}
            alt="Vista previa de la imagen elegida"
            className="h-auto w-full rounded-lg border border-border"
          />
          <div id={fieldId("newImage.alt")} className="scroll-mt-24">
            <TextField
              label="Descripción de la imagen nueva"
              name="new_image_alt"
              defaultValue={newImageAlt}
              maxLength={IMAGE_ALT_MAX}
              hint="Obligatoria: describe el mueble para quien no puede ver la foto."
              error={errors["newImage.alt"]}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
