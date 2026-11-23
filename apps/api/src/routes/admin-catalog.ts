import { Router } from "express";

import { AppError, errors } from "../lib/errors.js";
import { readMultipart } from "../lib/multipart.js";
import type { PrismaClient } from "../lib/prisma.js";
import { validated, type ValidationIssue } from "../lib/validation.js";
import { methodNotAllowed } from "../middleware/method-not-allowed.js";
import { requireRole } from "../middleware/panel-auth.js";
import {
  createCategory,
  deactivateCategory,
  listAdminCategories,
  listExtras,
  updateCategory,
} from "../services/admin-catalog/categories.js";
import {
  addImage,
  deleteImage,
  reorderImages,
  updateImage,
} from "../services/admin-catalog/images.js";
import {
  createProduct,
  deactivateProduct,
  getAdminProduct,
  listAdminProducts,
  updateProduct,
} from "../services/admin-catalog/products.js";
import {
  adminProductsQuery,
  createCategoryBody,
  createProductBody,
  IMAGE_FORMAT_NOT_ALLOWED,
  IMAGE_MAX_BYTES,
  IMAGE_TOO_LARGE,
  IMAGE_UPLOAD_MAX_BYTES,
  idParams,
  imageParams,
  imageUploadFields,
  movementsQuery,
  reorderImagesBody,
  stockAdjustmentBody,
  updateCategoryBody,
  updateImageBody,
  updateProductBody,
} from "../services/admin-catalog/schemas.js";
import { adjustStock, listMovements } from "../services/admin-catalog/stock.js";
import { actorOf } from "../services/audit.js";
import { detectImage, type DetectedImage } from "../services/images/image-bytes.js";
import type { ImageStorage } from "../services/images/storage.js";

/** Campo de texto del formulario multipart; vacío o ausente = undefined. */
function formText(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Valida la subida: campos de texto con zod y el archivo por sus bytes iniciales
 * (no por la extensión ni el tipo declarado). Máximo 2 MB.
 */
async function parseImageUpload(form: FormData) {
  const issues: ValidationIssue[] = [];
  const fields = imageUploadFields.safeParse({
    alt: formText(form, "alt"),
    sortOrder: formText(form, "sortOrder"),
    variantId: formText(form, "variantId"),
  });
  if (!fields.success) {
    for (const issue of fields.error.issues) {
      issues.push({
        location: "body",
        path: issue.path.map(String).join("."),
        message: issue.message,
      });
    }
  }

  let file: { bytes: Uint8Array; detected: DetectedImage } | null = null;
  const entry = form.get("file");
  if (!(entry instanceof File)) {
    issues.push({ location: "body", path: "file", message: "Elige una imagen JPG, PNG o WebP." });
  } else if (entry.size > IMAGE_MAX_BYTES) {
    throw new AppError(413, "PAYLOAD_TOO_LARGE", IMAGE_TOO_LARGE);
  } else {
    const bytes = new Uint8Array(await entry.arrayBuffer());
    const detected = bytes.length > 0 ? detectImage(bytes) : null;
    if (bytes.length === 0) {
      issues.push({ location: "body", path: "file", message: "El archivo está vacío." });
    } else if (!detected) {
      issues.push({ location: "body", path: "file", message: IMAGE_FORMAT_NOT_ALLOWED });
    } else {
      file = { bytes, detected };
    }
  }

  if (!fields.success || !file) {
    throw errors.validation("Los datos enviados no son válidos", { issues });
  }
  return { fields: fields.data, file };
}

/**
 * Catálogo del panel (LN-12, RF-26, RF-34). Montado después de `requirePanel` en
 * /admin: la sesión ya se exige y cada ruta pide el rol Administrador (el
 * Operador no modifica ni consulta el catálogo del panel, RF-31).
 */
export function adminCatalogRouter(prisma: PrismaClient, storage: ImageStorage): Router {
  const router = Router();
  const admin = requireRole("admin");

  router
    .route("/admin/products")
    .get(
      admin,
      validated({ query: adminProductsQuery }, async ({ query }, _req, res) => {
        res.json(await listAdminProducts(prisma, query));
      }),
    )
    .post(
      admin,
      validated({ body: createProductBody }, async ({ body }, req, res) => {
        const product = await createProduct(prisma, body, actorOf(req.panel), String(req.id));
        res.status(201).location(`/api/v1/admin/products/${product.id}`).json(product);
      }),
    )
    .all(methodNotAllowed("GET", "POST"));

  router
    .route("/admin/products/:id")
    .get(
      admin,
      validated({ params: idParams }, async ({ params }, _req, res) => {
        const product = await getAdminProduct(prisma, params.id);
        if (!product) throw errors.notFound("Producto no encontrado");
        res.json(product);
      }),
    )
    .patch(
      admin,
      validated(
        { params: idParams, body: updateProductBody },
        async ({ params, body }, req, res) => {
          res.json(
            await updateProduct(prisma, params.id, body, actorOf(req.panel), String(req.id)),
          );
        },
      ),
    )
    .delete(
      admin,
      validated({ params: idParams }, async ({ params }, req, res) => {
        await deactivateProduct(prisma, params.id, actorOf(req.panel), String(req.id));
        res.status(204).end();
      }),
    )
    .all(methodNotAllowed("GET", "PATCH", "DELETE"));

  // ── Inventario (RF-34) ──
  router
    .route("/admin/products/:id/stock-adjustments")
    .post(
      admin,
      validated(
        { params: idParams, body: stockAdjustmentBody },
        async ({ params, body }, req, res) => {
          const result = await adjustStock(
            prisma,
            params.id,
            body,
            actorOf(req.panel),
            String(req.id),
          );
          res.status(201).json(result);
        },
      ),
    )
    .all(methodNotAllowed("POST"));

  router
    .route("/admin/products/:id/stock-movements")
    .get(
      admin,
      validated(
        { params: idParams, query: movementsQuery },
        async ({ params, query }, _req, res) => {
          res.json(await listMovements(prisma, params.id, query));
        },
      ),
    )
    .all(methodNotAllowed("GET"));

  // ── Imágenes ──
  router
    .route("/admin/products/:id/images")
    .post(
      admin,
      validated({ params: idParams }, async ({ params }, req, res) => {
        const form = await readMultipart(req, {
          maxBytes: IMAGE_UPLOAD_MAX_BYTES,
          tooLargeMessage: IMAGE_TOO_LARGE,
        });
        const { fields, file } = await parseImageUpload(form);
        const image = await addImage(
          { prisma, storage, logger: req.log },
          params.id,
          file,
          fields,
          actorOf(req.panel),
          String(req.id),
        );
        res.status(201).json(image);
      }),
    )
    .all(methodNotAllowed("POST"));

  // Antes de /:imageId para que "order" no se tome como identificador.
  router
    .route("/admin/products/:id/images/order")
    .put(
      admin,
      validated(
        { params: idParams, body: reorderImagesBody },
        async ({ params, body }, req, res) => {
          const items = await reorderImages(
            prisma,
            params.id,
            body.imageIds,
            actorOf(req.panel),
            String(req.id),
          );
          res.json({ items });
        },
      ),
    )
    .all(methodNotAllowed("PUT"));

  router
    .route("/admin/products/:id/images/:imageId")
    .patch(
      admin,
      validated(
        { params: imageParams, body: updateImageBody },
        async ({ params, body }, req, res) => {
          res.json(
            await updateImage(
              prisma,
              params.id,
              params.imageId,
              body,
              actorOf(req.panel),
              String(req.id),
            ),
          );
        },
      ),
    )
    .delete(
      admin,
      validated({ params: imageParams }, async ({ params }, req, res) => {
        await deleteImage(
          { prisma, storage, logger: req.log },
          params.id,
          params.imageId,
          actorOf(req.panel),
          String(req.id),
        );
        res.status(204).end();
      }),
    )
    .all(methodNotAllowed("PATCH", "DELETE"));

  router
    .route("/admin/categories")
    .get(admin, async (_req, res) => {
      res.json({ items: await listAdminCategories(prisma) });
    })
    .post(
      admin,
      validated({ body: createCategoryBody }, async ({ body }, req, res) => {
        const category = await createCategory(prisma, body, actorOf(req.panel), String(req.id));
        res.status(201).location(`/api/v1/admin/categories/${category.id}`).json(category);
      }),
    )
    .all(methodNotAllowed("GET", "POST"));

  router
    .route("/admin/categories/:id")
    .patch(
      admin,
      validated(
        { params: idParams, body: updateCategoryBody },
        async ({ params, body }, req, res) => {
          res.json(
            await updateCategory(prisma, params.id, body, actorOf(req.panel), String(req.id)),
          );
        },
      ),
    )
    .delete(
      admin,
      validated({ params: idParams }, async ({ params }, req, res) => {
        // 200 con el aviso de cuántos productos la usan (no 204).
        res.json(await deactivateCategory(prisma, params.id, actorOf(req.panel), String(req.id)));
      }),
    )
    .all(methodNotAllowed("PATCH", "DELETE"));

  router
    .route("/admin/extras")
    .get(admin, async (_req, res) => {
      res.json({ items: await listExtras(prisma) });
    })
    .all(methodNotAllowed("GET"));

  return router;
}
