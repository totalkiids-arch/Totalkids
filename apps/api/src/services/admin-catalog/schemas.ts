import { z } from "zod";

import { paginationQuery } from "../../lib/pagination.js";

/**
 * Esquemas de entrada del catálogo admin (LN-12). Los mensajes y los límites son
 * los del editor del panel (apps/web, domain/admin-product.ts) para que el panel
 * pueda mostrarlos tal cual; donde la columna es más corta manda la base.
 */

export const PRODUCT_NAME_MAX = 120;
export const DESCRIPTION_MAX = 4000;
export const SKU_MAX = 40;
/** El panel admite 60, pero products.option_name es VARCHAR(40). */
export const OPTION_NAME_MAX = 40;
export const OPTION_MAX = 60;
export const CATEGORY_NAME_MAX = 60;
export const IMAGE_ALT_MAX = 160;
export const STOCK_REASON_MAX = 200;
export const PERSONALIZATION_LIMIT = { min: 1, max: 100 } as const;
/** Tope técnico de un importe (cabe holgado en INTEGER). */
export const CLP_MAX = 100_000_000;
export const STOCK_MAX = 1_000_000;

/** Importe en CLP: entero ≥ 0 (RN-01). */
export function clp(label: string) {
  return z
    .number({ error: `${label}: escribe un monto en pesos, por ejemplo 129990.` })
    .int(`${label}: usa pesos enteros, sin puntos ni decimales.`)
    .min(0, `${label} no puede ser negativo.`)
    .max(CLP_MAX, `${label} supera el máximo permitido.`);
}

function requiredText(max: number, empty: string, label: string) {
  return z
    .string({ error: empty })
    .trim()
    .min(1, empty)
    .max(max, `${label} admite como máximo ${String(max)} caracteres.`);
}

/** Texto opcional: "" se guarda como null; undefined = sin cambios (PATCH). */
function optionalText(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label} admite como máximo ${String(max)} caracteres.`)
    .nullable()
    .optional()
    .transform((value) => (value === "" ? null : value));
}

const tag = z
  .string()
  .max(40)
  .regex(/^[a-z0-9]+([-_][a-z0-9]+)*$/, "Valor inválido: usa minúsculas, números y guiones");

const stockPhysical = z
  .number({ error: "El stock físico debe ser un número entero de unidades." })
  .int("El stock físico debe ser un número entero de unidades.")
  .min(0, "El stock físico no puede ser negativo.")
  .max(STOCK_MAX, "El stock físico supera el máximo permitido.");

/** SKU: sin espacios; se guarda en mayúsculas para que el índice único no distinga mayúsculas. */
export const sku = z
  .string({ error: "Escribe el SKU." })
  .trim()
  .min(1, "Escribe el SKU.")
  .max(SKU_MAX, `El SKU admite como máximo ${String(SKU_MAX)} caracteres.`)
  .regex(/^\S+$/, "El SKU no puede tener espacios.")
  .transform((value) => value.toUpperCase());

/**
 * Variante. El precio puede quedar en null mientras el cliente no lo define (no
 * se puede publicar así). El precio anterior es opcional, igual o mayor al
 * precio; igual al precio = sin oferta (se guarda null, la base exige ">").
 */
export const variantInput = z
  .strictObject({
    id: z.uuid("Identificador de variante inválido").optional(),
    sku,
    optionLabel: optionalText(OPTION_MAX, "La opción"),
    color: optionalText(60, "El color"),
    size: optionalText(60, "La medida"),
    price: clp("El precio").nullable().optional(),
    compareAtPrice: clp("El precio anterior").nullable().optional(),
    /** Solo en variantes nuevas: el stock de las existentes se cambia con un ajuste (RF-34). */
    stockPhysical: stockPhysical.optional(),
    active: z.boolean().optional(),
  })
  .superRefine((variant, ctx) => {
    const { price, compareAtPrice } = variant;
    if (compareAtPrice === null || compareAtPrice === undefined) return;
    if (price === null || price === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["compareAtPrice"],
        message: "Define el precio actual antes del precio anterior.",
      });
    } else if (compareAtPrice < price) {
      ctx.addIssue({
        code: "custom",
        path: ["compareAtPrice"],
        message: "El precio anterior debe ser igual o mayor al precio actual.",
      });
    }
  })
  .transform((variant) => ({
    ...variant,
    price: variant.price ?? null,
    compareAtPrice:
      variant.compareAtPrice === undefined || variant.compareAtPrice === variant.price
        ? null
        : variant.compareAtPrice,
  }));

export type VariantInput = z.output<typeof variantInput>;

/** Extra ofrecido por el producto, con precio y largo de texto propios (null = los del extra). */
export const extraInput = z.strictObject({
  code: z.string().trim().min(1, "Elige un extra.").max(40),
  price: clp("El precio del extra").nullable().optional(),
  textMaxLength: z
    .number()
    .int(
      `El límite debe ser un entero entre ${String(PERSONALIZATION_LIMIT.min)} y ${String(PERSONALIZATION_LIMIT.max)}.`,
    )
    .min(
      PERSONALIZATION_LIMIT.min,
      `El límite debe ser un entero entre ${String(PERSONALIZATION_LIMIT.min)} y ${String(PERSONALIZATION_LIMIT.max)}.`,
    )
    .max(
      PERSONALIZATION_LIMIT.max,
      `El límite debe ser un entero entre ${String(PERSONALIZATION_LIMIT.min)} y ${String(PERSONALIZATION_LIMIT.max)}.`,
    )
    .nullable()
    .optional(),
});

export type ExtraInput = z.output<typeof extraInput>;

export const PRODUCT_STATUSES = ["draft", "active", "inactive"] as const;

const productFields = {
  name: requiredText(PRODUCT_NAME_MAX, "Escribe el nombre del producto.", "El nombre"),
  summary: optionalText(400, "El resumen"),
  description: requiredText(DESCRIPTION_MAX, "Escribe la descripción.", "La descripción"),
  dimensions: optionalText(200, "Las medidas"),
  ageGroups: z.array(tag).max(10).optional(),
  materials: z.array(tag).max(10).optional(),
  specs: z
    .array(
      z.strictObject({
        label: requiredText(60, "Escribe la etiqueta.", "La etiqueta"),
        value: requiredText(200, "Escribe el valor.", "El valor"),
      }),
    )
    .max(30)
    .optional(),
  optionName: optionalText(OPTION_NAME_MAX, "El texto"),
  leadTime: optionalText(60, "El plazo"),
  featured: z.boolean().optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  categoryId: z.uuid("Elige una categoría activa."),
  /** Categorías adicionales; la principal se ignora si viene repetida. */
  additionalCategoryIds: z
    .array(z.uuid("Una de las categorías adicionales no está activa."))
    .max(10)
    .optional(),
  /** Lista completa de variantes: las que no vienen se quitan (o se desactivan). */
  variants: z
    .array(variantInput)
    .min(1, "Agrega al menos una variante.")
    .max(50, "Un producto admite como máximo 50 variantes."),
  /** Lista completa de extras del producto, en el orden en que se muestran. */
  extras: z.array(extraInput).max(20).optional(),
};

export const createProductBody = z.strictObject(productFields);
export type CreateProductInput = z.output<typeof createProductBody>;

export const updateProductBody = z
  .strictObject(productFields)
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Envía al menos un campo para modificar.");
export type UpdateProductInput = z.output<typeof updateProductBody>;

export const adminProductsQuery = paginationQuery.extend({
  /** Nombre o SKU. */
  q: z.string().trim().max(100).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  /** Categoría principal o adicional. */
  categoryId: z.uuid("Categoría inválida").optional(),
});
export type AdminProductsQuery = z.output<typeof adminProductsQuery>;

export const idParams = z.object({ id: z.uuid("Identificador inválido") });

// ── Imágenes ─────────────────────────────────────────────────────────────────

export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
/** Cuerpo multipart completo: la imagen más los campos de texto. */
export const IMAGE_UPLOAD_MAX_BYTES = IMAGE_MAX_BYTES + 64 * 1024;
export const IMAGE_TOO_LARGE = "La imagen pesa más de 2 MB. Usa una más liviana.";
export const IMAGE_FORMAT_NOT_ALLOWED = "Formato no permitido: usa una imagen JPG, PNG o WebP.";

const imageAlt = requiredText(
  IMAGE_ALT_MAX,
  "Describe la imagen para quien no puede verla.",
  "La descripción",
);

/** Campos de texto del formulario multipart (todo llega como texto). */
export const imageUploadFields = z.object({
  alt: imageAlt,
  sortOrder: z.coerce
    .number()
    .int("El orden debe ser un número entero.")
    .min(0)
    .max(10_000)
    .optional(),
  variantId: z.uuid("Variante inválida").optional(),
});
export type ImageUploadFields = z.output<typeof imageUploadFields>;

export const updateImageBody = z
  .strictObject({
    alt: imageAlt.optional(),
    /** null = la foto deja de estar asociada a una variante. */
    variantId: z.uuid("Variante inválida").nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "Envía al menos un campo para modificar.");
export type UpdateImageInput = z.output<typeof updateImageBody>;

export const reorderImagesBody = z.strictObject({
  imageIds: z.array(z.uuid("Imagen inválida")).min(1).max(100),
});

export const imageParams = z.object({
  id: z.uuid("Identificador inválido"),
  imageId: z.uuid("Identificador de imagen inválido"),
});

// ── Inventario ───────────────────────────────────────────────────────────────

/** Ajuste de stock físico (RF-34): nuevo valor absoluto y motivo obligatorio. */
export const stockAdjustmentBody = z.strictObject({
  variantId: z.uuid("Elige la variante a ajustar."),
  stockPhysical,
  reason: requiredText(STOCK_REASON_MAX, "Escribe el motivo del ajuste.", "El motivo"),
});
export type StockAdjustmentInput = z.output<typeof stockAdjustmentBody>;

/** Inventario de todo el catálogo: nombre de producto o SKU. */
export const inventoryQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
});

export const movementsQuery = paginationQuery.extend({
  variantId: z.uuid("Variante inválida").optional(),
});

// ── Categorías ───────────────────────────────────────────────────────────────

const categoryFields = {
  name: requiredText(CATEGORY_NAME_MAX, "Escribe el nombre de la categoría.", "El nombre"),
  description: optionalText(500, "La descripción"),
  sortOrder: z.number().int("El orden debe ser un número entero.").min(0).max(10_000).optional(),
  active: z.boolean().optional(),
};

export const createCategoryBody = z.strictObject(categoryFields);
export type CreateCategoryInput = z.output<typeof createCategoryBody>;

/** El slug no se edita: cambiarlo rompería los enlaces de la tienda. */
export const updateCategoryBody = z
  .strictObject(categoryFields)
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Envía al menos un campo para modificar.");
export type UpdateCategoryInput = z.output<typeof updateCategoryBody>;
