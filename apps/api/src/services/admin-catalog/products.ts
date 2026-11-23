import type { Prisma } from "../../generated/prisma/client.js";
import type { ProductStatus } from "../../generated/prisma/enums.js";
import { errors } from "../../lib/errors.js";
import { pageMeta, pageWindow, type PageMeta } from "../../lib/pagination.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { slugify, uniqueSlug } from "../../lib/slug.js";
import { writeAudit, type Actor } from "../audit.js";
import { available, changedFields, Issues, isUniqueViolation } from "./common.js";
import type {
  AdminProductsQuery,
  CreateProductInput,
  ExtraInput,
  UpdateProductInput,
  VariantInput,
} from "./schemas.js";

/**
 * Productos del panel (LN-12, RF-26). Reglas:
 * - SKU único sin distinguir mayúsculas (se guarda en mayúsculas).
 * - Importes enteros ≥ 0; precio anterior ≥ precio (RN-01).
 * - Publicar exige variantes activas con precio, una imagen con texto
 *   alternativo y la categoría principal activa.
 * - Desactivar no borra: el producto queda `inactive` y sus pedidos intactos (RN-02).
 * - Quitar una variante: con reservas vigentes no se puede; con historial se
 *   desactiva; sin nada que la use se borra.
 * Cada cambio va en una transacción con su fila de audit_log.
 */

type Tx = Prisma.TransactionClient;

export interface AdminCategoryRef {
  id: string;
  slug: string;
  name: string;
  active: boolean;
}

export interface AdminVariantDto {
  id: string;
  sku: string;
  optionLabel: string | null;
  color: string | null;
  size: string | null;
  price: number | null;
  compareAtPrice: number | null;
  stockPhysical: number;
  stockReserved: number;
  /** físico − reservado (RN-03); 0 = se vende a pedido. */
  available: number;
  active: boolean;
  sortOrder: number;
}

export interface AdminImageDto {
  id: string;
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
  sortOrder: number;
  variantId: string | null;
}

export interface AdminProductExtraDto {
  code: string;
  name: string;
  requiresText: boolean;
  textLabel: string | null;
  /** Precio propio del producto (null = usa el del extra). */
  price: number | null;
  textMaxLength: number | null;
  /** Lo que ve el comprador: propio o del extra; null = por confirmar. */
  effectivePrice: number | null;
  effectiveTextMaxLength: number | null;
  available: boolean;
  sortOrder: number;
}

export interface AdminProductDto {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  description: string;
  dimensions: string | null;
  ageGroups: string[];
  materials: string[];
  specs: unknown;
  optionName: string | null;
  leadTime: string | null;
  status: ProductStatus;
  featured: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  category: AdminCategoryRef;
  additionalCategories: AdminCategoryRef[];
  variants: AdminVariantDto[];
  images: AdminImageDto[];
  extras: AdminProductExtraDto[];
}

export interface AdminProductSummaryDto {
  id: string;
  slug: string;
  name: string;
  status: ProductStatus;
  featured: boolean;
  category: AdminCategoryRef;
  /** Menor precio entre las variantes activas con precio; null si ninguna tiene. */
  price: number | null;
  variantCount: number;
  /** Unidades disponibles sumando las variantes activas. */
  available: number;
  image: { url: string; alt: string } | null;
  updatedAt: string;
}

const variantOrder = [
  { sortOrder: "asc" },
  { sku: "asc" },
] satisfies Prisma.ProductVariantOrderByWithRelationInput[];
const imageOrder = [
  { sortOrder: "asc" },
  { createdAt: "asc" },
] satisfies Prisma.ProductImageOrderByWithRelationInput[];

const detailInclude = {
  category: true,
  additionalCategories: { include: { category: true } },
  variants: { orderBy: variantOrder },
  images: { orderBy: imageOrder },
  extras: { orderBy: { sortOrder: "asc" }, include: { extra: true } },
} satisfies Prisma.ProductInclude;

type DetailRow = Prisma.ProductGetPayload<{ include: typeof detailInclude }>;

const categoryRef = (c: { id: string; slug: string; name: string; active: boolean }) => ({
  id: c.id,
  slug: c.slug,
  name: c.name,
  active: c.active,
});

function toDetail(product: DetailRow): AdminProductDto {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    summary: product.summary,
    description: product.description,
    dimensions: product.dimensions,
    ageGroups: product.ageGroups,
    materials: product.materials,
    specs: product.specs,
    optionName: product.optionName,
    leadTime: product.leadTime,
    status: product.status,
    featured: product.featured,
    publishedAt: product.publishedAt?.toISOString() ?? null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    category: categoryRef(product.category),
    additionalCategories: product.additionalCategories
      .map((pc) => categoryRef(pc.category))
      .sort((a, b) => a.name.localeCompare(b.name, "es")),
    variants: product.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      optionLabel: v.optionLabel,
      color: v.color,
      size: v.size,
      price: v.price,
      compareAtPrice: v.compareAtPrice,
      stockPhysical: v.stockPhysical,
      stockReserved: v.stockReserved,
      available: available(v),
      active: v.active,
      sortOrder: v.sortOrder,
    })),
    images: product.images.map((image) => ({
      id: image.id,
      url: image.url,
      alt: image.alt,
      width: image.width,
      height: image.height,
      sortOrder: image.sortOrder,
      variantId: image.variantId,
    })),
    extras: product.extras.map(({ extra, price, textMaxLength, sortOrder }) => ({
      code: extra.code,
      name: extra.name,
      requiresText: extra.requiresText,
      textLabel: extra.textLabel,
      price,
      textMaxLength,
      effectivePrice: price ?? extra.price,
      effectiveTextMaxLength: extra.requiresText ? (textMaxLength ?? extra.textMaxLength) : null,
      available: extra.available,
      sortOrder,
    })),
  };
}

async function loadDetail(db: Pick<Tx, "product">, id: string): Promise<AdminProductDto | null> {
  const product = await db.product.findUnique({ where: { id }, include: detailInclude });
  return product ? toDetail(product) : null;
}

/** Ficha completa para el panel (también borradores e inactivos), o null. */
export function getAdminProduct(
  prisma: Pick<PrismaClient, "product">,
  id: string,
): Promise<AdminProductDto | null> {
  return loadDetail(prisma, id);
}

/** Listado del panel: búsqueda por nombre o SKU, filtro por estado y categoría, paginado. */
export async function listAdminProducts(
  prisma: Pick<PrismaClient, "product">,
  query: AdminProductsQuery,
): Promise<{ items: AdminProductSummaryDto[]; meta: PageMeta }> {
  const and: Prisma.ProductWhereInput[] = [];
  if (query.q) {
    and.push({
      OR: [
        { name: { contains: query.q, mode: "insensitive" } },
        { variants: { some: { sku: { contains: query.q, mode: "insensitive" } } } },
      ],
    });
  }
  if (query.status) and.push({ status: query.status });
  if (query.categoryId) {
    and.push({
      OR: [
        { categoryId: query.categoryId },
        { additionalCategories: { some: { categoryId: query.categoryId } } },
      ],
    });
  }
  const where: Prisma.ProductWhereInput = { AND: and };

  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: {
        category: true,
        variants: { where: { active: true } },
        images: { orderBy: imageOrder, take: 1 },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      ...pageWindow(query),
    }),
  ]);

  const items = rows.map((p) => {
    const prices = p.variants.flatMap((v) => (v.price === null ? [] : [v.price]));
    const first = p.images[0];
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      status: p.status,
      featured: p.featured,
      category: categoryRef(p.category),
      price: prices.length > 0 ? Math.min(...prices) : null,
      variantCount: p.variants.length,
      available: p.variants.reduce((sum, v) => sum + available(v), 0),
      image: first ? { url: first.url, alt: first.alt } : null,
      updatedAt: p.updatedAt.toISOString(),
    };
  });
  return { items, meta: pageMeta(total, query) };
}

// ── Validaciones contra la base ──────────────────────────────────────────────

/** Categorías activas, o las que el producto ya tenía (no obliga a cambiarlas al editar). */
async function checkCategories(
  tx: Tx,
  input: { categoryId?: string | undefined; additionalCategoryIds?: string[] | undefined },
  current: { categoryId: string; additional: string[] } | null,
  issues: Issues,
): Promise<void> {
  const ids = [
    ...(input.categoryId ? [input.categoryId] : []),
    ...(input.additionalCategoryIds ?? []),
  ];
  if (ids.length === 0) return;
  const rows = await tx.category.findMany({ where: { id: { in: ids } } });
  const byId = new Map(rows.map((c) => [c.id, c]));
  const kept = new Set(current ? [current.categoryId, ...current.additional] : []);
  const usable = (id: string) => (byId.get(id)?.active ?? false) || (byId.has(id) && kept.has(id));

  if (input.categoryId && !usable(input.categoryId)) {
    issues.add("categoryId", "Elige una categoría activa.");
  }
  (input.additionalCategoryIds ?? []).forEach((id, index) => {
    if (!usable(id)) {
      issues.add(
        `additionalCategoryIds.${String(index)}`,
        "Una de las categorías adicionales no está activa.",
      );
    }
  });
}

/** Extras por código; deben existir y solo los que piden texto aceptan largo propio. */
async function resolveExtras(
  tx: Tx,
  extras: ExtraInput[],
  issues: Issues,
): Promise<{ extraId: string; input: ExtraInput }[]> {
  const rows = await tx.extra.findMany({ where: { code: { in: extras.map((e) => e.code) } } });
  const byCode = new Map(rows.map((e) => [e.code, e]));
  const seen = new Set<string>();
  const resolved: { extraId: string; input: ExtraInput }[] = [];
  extras.forEach((input, index) => {
    const at = `extras.${String(index)}`;
    const extra = byCode.get(input.code);
    if (!extra) {
      issues.add(`${at}.code`, "Ese extra no existe.");
      return;
    }
    if (seen.has(input.code)) {
      issues.add(`${at}.code`, "Ese extra ya está en la lista.");
      return;
    }
    seen.add(input.code);
    if (!extra.requiresText && input.textMaxLength != null) {
      issues.add(`${at}.textMaxLength`, "Este extra no pide un texto de personalización.");
    }
    resolved.push({ extraId: extra.id, input });
  });
  return resolved;
}

/** SKU únicos dentro del lote y frente a los de otras variantes (sin distinguir mayúsculas). */
async function checkSkus(tx: Tx, variants: VariantInput[], issues: Issues): Promise<void> {
  const seen = new Set<string>();
  variants.forEach((v, index) => {
    if (seen.has(v.sku))
      issues.add(`variants.${String(index)}.sku`, "Ese SKU ya existe. Usa un código único.");
    seen.add(v.sku);
  });
  const taken = await tx.$queryRaw<{ id: string; sku: string }[]>`
    SELECT "id", upper("sku") AS "sku" FROM "product_variants"
    WHERE upper("sku") = ANY(${[...seen]}::text[])`;
  variants.forEach((v, index) => {
    if (taken.some((row) => row.sku === v.sku && row.id !== v.id)) {
      issues.add(`variants.${String(index)}.sku`, "Ese SKU ya existe. Usa un código único.");
    }
  });
}

/** Con más de una variante activa: qué se elige y una opción distinta por variante. */
function checkOptions(
  optionName: string | null,
  variants: { optionLabel?: string | null; active?: boolean | undefined }[],
  issues: Issues,
): void {
  const active = variants.map((v, index) => ({ v, index })).filter(({ v }) => v.active !== false);
  if (active.length <= 1) return;
  if (!optionName) issues.add("optionName", "Indica qué se elige (p. ej. Tamaño o Color).");
  const options = new Set<string>();
  for (const { v, index } of active) {
    const option = (v.optionLabel ?? "").toLowerCase();
    if (option === "")
      issues.add(`variants.${String(index)}.optionLabel`, "Escribe el nombre de la opción.");
    else if (options.has(option)) {
      issues.add(`variants.${String(index)}.optionLabel`, "Esa opción ya está en otra variante.");
    }
    options.add(option);
  }
}

/**
 * Un producto activo debe poder venderse: categoría principal activa, al menos
 * una variante activa, todas con precio, y una imagen con texto alternativo.
 * Se revisa sobre el estado final, dentro de la transacción.
 */
async function assertPublishable(
  tx: Tx,
  productId: string,
  inputSkus: string[] = [],
): Promise<void> {
  const product = await tx.product.findUniqueOrThrow({
    where: { id: productId },
    include: { category: true, variants: { where: { active: true } }, images: true },
  });
  const issues = new Issues();
  if (!product.category.active) issues.add("categoryId", "Elige una categoría activa.");
  if (product.variants.length === 0) {
    issues.add("variants", "Agrega al menos una variante activa antes de publicar.");
  }
  for (const v of product.variants.filter((variant) => variant.price === null)) {
    const index = inputSkus.indexOf(v.sku);
    issues.add(
      index >= 0 ? `variants.${String(index)}.price` : "variants",
      `Define el precio de la variante ${v.sku} antes de publicar.`,
    );
  }
  if (!product.images.some((image) => image.alt.trim() !== "")) {
    issues.add("images", "Sube al menos una imagen con texto alternativo antes de publicar.");
  }
  issues.throwIfAny("El producto no se puede publicar todavía");
}

// ── Escritura ────────────────────────────────────────────────────────────────

const INITIAL_STOCK_REASON = "Stock inicial al crear la variante";

async function createVariant(
  tx: Tx,
  productId: string,
  v: VariantInput,
  sortOrder: number,
  actor: Actor,
) {
  const stock = v.stockPhysical ?? 0;
  const row = await tx.productVariant.create({
    data: {
      productId,
      sku: v.sku,
      optionLabel: v.optionLabel ?? null,
      color: v.color ?? null,
      size: v.size ?? null,
      price: v.price,
      compareAtPrice: v.compareAtPrice,
      stockPhysical: stock,
      active: v.active ?? true,
      sortOrder,
    },
  });
  if (stock > 0) {
    // El stock inicial también queda en el historial (RF-34).
    await tx.inventoryMovement.create({
      data: {
        variantId: row.id,
        kind: "adjustment",
        physicalDelta: stock,
        physicalAfter: stock,
        reservedAfter: 0,
        reason: INITIAL_STOCK_REASON,
        ...actor,
      },
    });
  }
  return row;
}

async function replaceExtras(
  tx: Tx,
  productId: string,
  extras: { extraId: string; input: ExtraInput }[],
): Promise<void> {
  await tx.productExtra.deleteMany({ where: { productId } });
  if (extras.length === 0) return;
  await tx.productExtra.createMany({
    data: extras.map(({ extraId, input }, index) => ({
      productId,
      extraId,
      sortOrder: index,
      price: input.price ?? null,
      textMaxLength: input.textMaxLength ?? null,
    })),
  });
}

async function replaceAdditionalCategories(
  tx: Tx,
  productId: string,
  categoryId: string,
  ids: string[],
): Promise<string[]> {
  const unique = [...new Set(ids)].filter((id) => id !== categoryId);
  await tx.productCategory.deleteMany({ where: { productId } });
  if (unique.length > 0) {
    await tx.productCategory.createMany({
      data: unique.map((id) => ({ productId, categoryId: id })),
    });
  }
  return unique;
}

/** Traduce un choque de índice único a 409 (dos guardados simultáneos con el mismo SKU). */
async function withUniqueConflict<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw errors.conflict(
        "Ese SKU o enlace se acaba de usar en otro producto. Revisa y guarda de nuevo.",
      );
    }
    throw err;
  }
}

export async function createProduct(
  prisma: Pick<PrismaClient, "$transaction">,
  input: CreateProductInput,
  actor: Actor,
  requestId?: string,
): Promise<AdminProductDto> {
  return withUniqueConflict(() =>
    prisma.$transaction(async (tx) => {
      const issues = new Issues();
      await checkCategories(tx, input, null, issues);
      const extras = await resolveExtras(tx, input.extras ?? [], issues);
      await checkSkus(tx, input.variants, issues);
      checkOptions(input.optionName ?? null, input.variants, issues);
      input.variants.forEach((v, index) => {
        if (v.id)
          issues.add(`variants.${String(index)}.id`, "Una variante nueva no lleva identificador.");
      });
      issues.throwIfAny();

      const status = input.status ?? "draft";
      const slug = await uniqueSlug(
        slugify(input.name) || "producto",
        120,
        async (candidate) => (await tx.product.count({ where: { slug: candidate } })) > 0,
      );
      const product = await tx.product.create({
        data: {
          categoryId: input.categoryId,
          name: input.name,
          slug,
          summary: input.summary ?? null,
          description: input.description,
          dimensions: input.dimensions ?? null,
          ageGroups: input.ageGroups ?? [],
          materials: input.materials ?? [],
          specs: input.specs ?? [],
          optionName: input.optionName ?? null,
          leadTime: input.leadTime ?? null,
          featured: input.featured ?? false,
          status,
          publishedAt: status === "active" ? new Date() : null,
        },
      });
      const additional = await replaceAdditionalCategories(
        tx,
        product.id,
        input.categoryId,
        input.additionalCategoryIds ?? [],
      );
      for (const [index, v] of input.variants.entries()) {
        await createVariant(tx, product.id, v, index, actor);
      }
      await replaceExtras(tx, product.id, extras);
      if (status === "active") {
        await assertPublishable(
          tx,
          product.id,
          input.variants.map((v) => v.sku),
        );
      }

      await writeAudit(
        tx,
        actor,
        {
          action: "product.created",
          resourceType: "product",
          resourceId: product.id,
          details: {
            name: product.name,
            slug,
            status,
            categoryId: input.categoryId,
            additionalCategoryIds: additional,
            skus: input.variants.map((v) => v.sku),
            extras: extras.map((e) => e.input.code),
          },
        },
        requestId,
      );
      const detail = await loadDetail(tx, product.id);
      if (!detail) throw errors.internal();
      return detail;
    }),
  );
}

const SCALAR_FIELDS = [
  "name",
  "summary",
  "description",
  "dimensions",
  "ageGroups",
  "materials",
  "specs",
  "optionName",
  "leadTime",
  "featured",
  "status",
  "categoryId",
] as const;

export async function updateProduct(
  prisma: Pick<PrismaClient, "$transaction">,
  id: string,
  input: UpdateProductInput,
  actor: Actor,
  requestId?: string,
): Promise<AdminProductDto> {
  return withUniqueConflict(() =>
    prisma.$transaction(async (tx) => {
      // Bloquea el producto: dos ediciones simultáneas se aplican una tras otra.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "products" WHERE "id" = ${id}::uuid FOR UPDATE`;
      if (locked.length === 0) throw errors.notFound("Producto no encontrado");

      const before = await tx.product.findUniqueOrThrow({
        where: { id },
        include: {
          additionalCategories: true,
          extras: { include: { extra: true } },
          variants: {
            include: {
              _count: {
                select: { orderItems: true, cartItems: true, reservations: true, movements: true },
              },
            },
          },
        },
      });
      const issues = new Issues();
      await checkCategories(
        tx,
        input,
        {
          categoryId: before.categoryId,
          additional: before.additionalCategories.map((pc) => pc.categoryId),
        },
        issues,
      );
      const extras = input.extras ? await resolveExtras(tx, input.extras, issues) : null;

      const variantSummary = {
        added: [] as string[],
        updated: [] as string[],
        deactivated: [] as string[],
        deleted: [] as string[],
      };
      const existing = new Map(before.variants.map((v) => [v.id, v]));
      const removed: typeof before.variants = [];
      /** Variantes con reservas vigentes que se intentan quitar: hay pedidos en curso (409). */
      const reservedConflicts: string[] = [];
      if (input.variants) {
        await checkSkus(tx, input.variants, issues);
        checkOptions(
          input.optionName !== undefined ? input.optionName : before.optionName,
          input.variants,
          issues,
        );
        const keep = new Set<string>();
        input.variants.forEach((v, index) => {
          const at = `variants.${String(index)}`;
          if (!v.id) return;
          const current = existing.get(v.id);
          if (!current) {
            issues.add(`${at}.id`, "La variante no pertenece a este producto.");
            return;
          }
          keep.add(v.id);
          if (v.stockPhysical !== undefined && v.stockPhysical !== current.stockPhysical) {
            issues.add(
              `${at}.stockPhysical`,
              "El stock de una variante existente se cambia con un ajuste de inventario (con motivo).",
            );
          }
          if (v.active === false && current.active && current.stockReserved > 0) {
            reservedConflicts.push(current.sku);
          }
        });
        for (const v of before.variants) {
          if (keep.has(v.id)) continue;
          if (v.stockReserved > 0) reservedConflicts.push(v.sku);
          removed.push(v);
        }
      } else if (input.optionName !== undefined) {
        checkOptions(input.optionName, before.variants, issues);
      }
      issues.throwIfAny();
      // Con reservas vigentes el panel recibe 409 (hay pedidos en curso que la usan).
      const [reservedSku] = reservedConflicts;
      if (reservedSku !== undefined) {
        throw errors.conflict(
          `La variante ${reservedSku} tiene unidades reservadas y no se puede quitar.`,
          { skus: reservedConflicts },
        );
      }

      const status = input.status ?? before.status;
      const categoryId = input.categoryId ?? before.categoryId;
      await tx.product.update({
        where: { id },
        data: {
          name: input.name,
          summary: input.summary,
          description: input.description,
          dimensions: input.dimensions,
          ageGroups: input.ageGroups,
          materials: input.materials,
          specs: input.specs,
          optionName: input.optionName,
          leadTime: input.leadTime,
          featured: input.featured,
          status: input.status,
          categoryId: input.categoryId,
          // Primera publicación: queda la fecha (CHECK products_published_has_date).
          ...(status === "active" && !before.publishedAt ? { publishedAt: new Date() } : {}),
        },
      });

      let additional = before.additionalCategories.map((pc) => pc.categoryId);
      if (input.additionalCategoryIds || input.categoryId) {
        additional = await replaceAdditionalCategories(
          tx,
          id,
          categoryId,
          input.additionalCategoryIds ?? additional,
        );
      }

      if (input.variants) {
        // Primero se quitan las que salen: así su SKU queda libre si se borran.
        for (const v of removed) {
          const c = v._count;
          const hasHistory = c.orderItems + c.cartItems + c.reservations + c.movements > 0;
          if (hasHistory) {
            if (v.active) {
              await tx.productVariant.update({ where: { id: v.id }, data: { active: false } });
              variantSummary.deactivated.push(v.sku);
            }
          } else {
            await tx.productVariant.delete({ where: { id: v.id } });
            variantSummary.deleted.push(v.sku);
          }
        }
        for (const [index, v] of input.variants.entries()) {
          const current = v.id ? existing.get(v.id) : undefined;
          if (!current) {
            await createVariant(tx, id, v, index, actor);
            variantSummary.added.push(v.sku);
            continue;
          }
          const next = {
            sku: v.sku,
            optionLabel: v.optionLabel ?? null,
            color: v.color ?? null,
            size: v.size ?? null,
            price: v.price,
            compareAtPrice: v.compareAtPrice,
            active: v.active ?? true,
            sortOrder: index,
          };
          const changes = changedFields(current, next, [
            "sku",
            "optionLabel",
            "color",
            "size",
            "price",
            "compareAtPrice",
            "active",
            "sortOrder",
          ]);
          if (Object.keys(changes).length === 0) continue;
          await tx.productVariant.update({ where: { id: current.id }, data: next });
          if (current.active && !next.active) variantSummary.deactivated.push(current.sku);
          else variantSummary.updated.push(current.sku);
        }
      }

      if (extras) await replaceExtras(tx, id, extras);
      if (status === "active") {
        await assertPublishable(
          tx,
          id,
          input.variants?.map((v) => v.sku),
        );
      }

      const fields = changedFields(
        before as unknown as Record<string, unknown>,
        input as Record<string, unknown>,
        SCALAR_FIELDS,
      );
      await writeAudit(
        tx,
        actor,
        {
          action: "product.updated",
          resourceType: "product",
          resourceId: id,
          details: {
            fields,
            ...(input.additionalCategoryIds || input.categoryId
              ? {
                  additionalCategoryIds: {
                    before: before.additionalCategories.map((pc) => pc.categoryId),
                    after: additional,
                  },
                }
              : {}),
            ...(input.variants ? { variants: variantSummary } : {}),
            ...(extras
              ? {
                  extras: {
                    before: before.extras.map((pe) => pe.extra.code),
                    after: extras.map((e) => e.input.code),
                  },
                }
              : {}),
          } as Prisma.InputJsonValue,
        },
        requestId,
      );
      const detail = await loadDetail(tx, id);
      if (!detail) throw errors.internal();
      return detail;
    }),
  );
}

/** DELETE: pasa a `inactive`. No borra el producto, sus variantes ni sus pedidos (RF-26). */
export async function deactivateProduct(
  prisma: Pick<PrismaClient, "$transaction">,
  id: string,
  actor: Actor,
  requestId?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id }, select: { status: true } });
    if (!product) throw errors.notFound("Producto no encontrado");
    if (product.status === "inactive") return;
    await tx.product.update({ where: { id }, data: { status: "inactive" } });
    await writeAudit(
      tx,
      actor,
      {
        action: "product.deactivated",
        resourceType: "product",
        resourceId: id,
        details: { status: { before: product.status, after: "inactive" } },
      },
      requestId,
    );
  });
}
