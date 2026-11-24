import type { Prisma } from "../../generated/prisma/client.js";
import { errors } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { writeAudit, type Actor } from "../audit.js";
import type { DetectedImage } from "../images/image-bytes.js";
import type { ImageStorage } from "../images/storage.js";
import { changedFields } from "./common.js";
import type { AdminImageDto } from "./products.js";
import type { ImageUploadFields, UpdateImageInput } from "./schemas.js";

/**
 * Imágenes de un producto (LN-12). El archivo ya llega validado por sus bytes
 * (image-bytes.ts); aquí se guarda con el puerto ImageStorage y se registra en
 * product_images con su texto alternativo (obligatorio, RNF-09).
 */

type Tx = Prisma.TransactionClient;

const toDto = (image: {
  id: string;
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
  sortOrder: number;
  variantId: string | null;
}): AdminImageDto => ({
  id: image.id,
  url: image.url,
  alt: image.alt,
  width: image.width,
  height: image.height,
  sortOrder: image.sortOrder,
  variantId: image.variantId,
});

async function assertVariantOf(
  tx: Pick<Tx, "productVariant">,
  productId: string,
  variantId: string,
) {
  const variant = await tx.productVariant.findFirst({ where: { id: variantId, productId } });
  if (!variant) {
    throw errors.validation("Los datos enviados no son válidos", {
      issues: [
        {
          location: "body",
          path: "variantId",
          message: "La variante no pertenece a este producto.",
        },
      ],
    });
  }
}

/** Bloquea el producto para que subir, borrar y reordenar no se pisen. */
async function lockProduct(tx: Tx, productId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "products" WHERE "id" = ${productId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw errors.notFound("Producto no encontrado");
}

export interface UploadDeps {
  prisma: Pick<PrismaClient, "$transaction" | "product" | "productVariant">;
  storage: ImageStorage;
  /** Para avisar de archivos que no se pudieron borrar (p. ej. req.log). */
  logger: { warn: (details: object, message: string) => void };
}

/**
 * Sube una imagen: primero valida el producto (y la variante), luego guarda el
 * archivo y después la fila. Si la fila falla, borra el archivo.
 */
export async function addImage(
  { prisma, storage, logger }: UploadDeps,
  productId: string,
  file: { bytes: Uint8Array; detected: DetectedImage },
  fields: ImageUploadFields,
  actor: Actor,
  requestId?: string,
): Promise<AdminImageDto> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) throw errors.notFound("Producto no encontrado");
  if (fields.variantId) await assertVariantOf(prisma, productId, fields.variantId);

  const stored = await storage.save(file);
  try {
    return await prisma.$transaction(async (tx) => {
      await lockProduct(tx, productId);
      if (fields.variantId) await assertVariantOf(tx, productId, fields.variantId);
      const last = await tx.productImage.aggregate({
        where: { productId },
        _max: { sortOrder: true },
      });
      const image = await tx.productImage.create({
        data: {
          productId,
          variantId: fields.variantId ?? null,
          url: stored.url,
          alt: fields.alt,
          width: file.detected.width,
          height: file.detected.height,
          sortOrder: fields.sortOrder ?? (last._max.sortOrder ?? -1) + 1,
        },
      });
      await writeAudit(
        tx,
        actor,
        {
          action: "product_image.created",
          resourceType: "product",
          resourceId: productId,
          details: {
            imageId: image.id,
            url: image.url,
            format: file.detected.format,
            bytes: file.bytes.length,
          },
        },
        requestId,
      );
      return toDto(image);
    });
  } catch (err) {
    await storage.delete(stored.key).catch((cleanupError: unknown) => {
      logger.warn({ err: cleanupError, key: stored.key }, "No se pudo borrar la imagen huérfana");
    });
    throw err;
  }
}

async function findImage(tx: Tx, productId: string, imageId: string) {
  const image = await tx.productImage.findFirst({ where: { id: imageId, productId } });
  if (!image) throw errors.notFound("Imagen no encontrada");
  return image;
}

export function updateImage(
  prisma: Pick<PrismaClient, "$transaction">,
  productId: string,
  imageId: string,
  input: UpdateImageInput,
  actor: Actor,
  requestId?: string,
): Promise<AdminImageDto> {
  return prisma.$transaction(async (tx) => {
    await lockProduct(tx, productId);
    const before = await findImage(tx, productId, imageId);
    if (input.variantId) await assertVariantOf(tx, productId, input.variantId);
    const image = await tx.productImage.update({
      where: { id: imageId },
      data: { alt: input.alt, variantId: input.variantId },
    });
    const fields = changedFields(before, input, ["alt", "variantId"]);
    if (Object.keys(fields).length > 0) {
      await writeAudit(
        tx,
        actor,
        {
          action: "product_image.updated",
          resourceType: "product",
          resourceId: productId,
          details: { imageId, fields } as Prisma.InputJsonValue,
        },
        requestId,
      );
    }
    return toDto(image);
  });
}

/** Nuevo orden: la lista debe traer todas las imágenes del producto, una vez cada una. */
export function reorderImages(
  prisma: Pick<PrismaClient, "$transaction">,
  productId: string,
  imageIds: string[],
  actor: Actor,
  requestId?: string,
): Promise<AdminImageDto[]> {
  return prisma.$transaction(async (tx) => {
    await lockProduct(tx, productId);
    const current = await tx.productImage.findMany({
      where: { productId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const sameSet =
      imageIds.length === current.length &&
      new Set(imageIds).size === imageIds.length &&
      current.every((image) => imageIds.includes(image.id));
    if (!sameSet) {
      throw errors.validation("Los datos enviados no son válidos", {
        issues: [
          {
            location: "body",
            path: "imageIds",
            message: "Envía todas las imágenes del producto, una vez cada una, en el nuevo orden.",
          },
        ],
      });
    }
    for (const [index, id] of imageIds.entries()) {
      await tx.productImage.update({ where: { id }, data: { sortOrder: index } });
    }
    await writeAudit(
      tx,
      actor,
      {
        action: "product_image.reordered",
        resourceType: "product",
        resourceId: productId,
        details: { before: current.map((image) => image.id), after: imageIds },
      },
      requestId,
    );
    const images = await tx.productImage.findMany({
      where: { productId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return images.map(toDto);
  });
}

/**
 * Borra la fila y después el archivo (si es de este almacenamiento). Un
 * producto publicado no puede quedar sin imágenes.
 */
export async function deleteImage(
  {
    prisma,
    storage,
    logger,
  }: Pick<UploadDeps, "storage" | "logger"> & {
    prisma: Pick<PrismaClient, "$transaction">;
  },
  productId: string,
  imageId: string,
  actor: Actor,
  requestId?: string,
): Promise<void> {
  const url = await prisma.$transaction(async (tx) => {
    await lockProduct(tx, productId);
    const image = await findImage(tx, productId, imageId);
    const product = await tx.product.findUniqueOrThrow({
      where: { id: productId },
      select: { status: true, _count: { select: { images: true } } },
    });
    if (product.status === "active" && product._count.images <= 1) {
      throw errors.conflict(
        "Un producto publicado necesita al menos una imagen. Sube otra antes de quitar esta.",
      );
    }
    await tx.productImage.delete({ where: { id: imageId } });
    await writeAudit(
      tx,
      actor,
      {
        action: "product_image.deleted",
        resourceType: "product",
        resourceId: productId,
        details: { imageId, url: image.url, alt: image.alt },
      },
      requestId,
    );
    return image.url;
  });

  const key = storage.keyFromUrl(url);
  if (key) {
    await storage.delete(key).catch((err: unknown) => {
      logger.warn({ err, key }, "No se pudo borrar el archivo de la imagen");
    });
  }
}
