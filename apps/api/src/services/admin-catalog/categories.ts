import type { Prisma } from "../../generated/prisma/client.js";
import { errors } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { slugify } from "../../lib/slug.js";
import { writeAudit, type Actor } from "../audit.js";
import { changedFields, Issues, isUniqueViolation } from "./common.js";
import type { CreateCategoryInput, UpdateCategoryInput } from "./schemas.js";

/**
 * Categorías del panel (LN-12, RF-26). Nombre y slug únicos (el nombre se
 * compara sin mayúsculas, tildes ni espacios de más, como el panel). El slug se
 * deriva del nombre al crear y no cambia después. Desactivar no toca los
 * productos: la respuesta avisa cuántos la usan.
 */

type Tx = Prisma.TransactionClient;

export interface AdminCategoryDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
  /** Productos que la usan como principal o adicional, en cualquier estado (cada uno una vez). */
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeactivateCategoryResult {
  category: AdminCategoryDto;
  /** Productos que la usan (principal o adicional). */
  productsUsingCount: number;
  /** Productos publicados que la tienen como principal: dejan de verse en la tienda. */
  hiddenProductsCount: number;
  /** Aviso para el panel; null si ningún producto la usa. */
  warning: string | null;
}

type Row = Prisma.CategoryGetPayload<object>;

const usingCategory = (id: string): Prisma.ProductWhereInput => ({
  OR: [{ categoryId: id }, { additionalCategories: { some: { categoryId: id } } }],
});

function toDto(c: Row, productCount: number): AdminCategoryDto {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    sortOrder: c.sortOrder,
    active: c.active,
    productCount,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

async function withCount(db: Pick<Tx, "product">, c: Row): Promise<AdminCategoryDto> {
  return toDto(c, await db.product.count({ where: usingCategory(c.id) }));
}

/** Todas las categorías (activas e inactivas) en el orden de la tienda, con su conteo. */
export async function listAdminCategories(
  prisma: Pick<PrismaClient, "category" | "product">,
): Promise<AdminCategoryDto[]> {
  const rows = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return Promise.all(rows.map((c) => withCount(prisma, c)));
}

/**
 * Serializa altas y cambios de nombre: la unicidad del nombre no tiene índice
 * en la base (se compara normalizado), así que dos guardados simultáneos no
 * deben pasar el chequeo a la vez.
 */
async function lockCategories(tx: Tx): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('totalkids:categories'))`;
}

async function checkName(
  tx: Tx,
  name: string,
  editingId: string | null,
  issues: Issues,
): Promise<string> {
  const slug = slugify(name);
  if (slug === "") {
    issues.add("name", "Usa al menos una letra o un número en el nombre.");
    return slug;
  }
  const others = await tx.category.findMany({
    where: editingId ? { id: { not: editingId } } : {},
    select: { name: true, slug: true },
  });
  if (others.some((c) => slugify(c.name) === slug)) {
    issues.add("name", "Ya existe una categoría con ese nombre.");
  } else if (editingId === null && others.some((c) => c.slug === slug)) {
    issues.add("name", `Ya existe una categoría con el enlace «${slug}».`);
  }
  return slug;
}

export async function createCategory(
  prisma: Pick<PrismaClient, "$transaction">,
  input: CreateCategoryInput,
  actor: Actor,
  requestId?: string,
): Promise<AdminCategoryDto> {
  try {
    return await prisma.$transaction(async (tx) => {
      await lockCategories(tx);
      const issues = new Issues();
      const slug = await checkName(tx, input.name, null, issues);
      issues.throwIfAny();
      const category = await tx.category.create({
        data: {
          name: input.name,
          slug,
          description: input.description ?? null,
          sortOrder: input.sortOrder ?? 0,
          active: input.active ?? true,
        },
      });
      await writeAudit(
        tx,
        actor,
        {
          action: "category.created",
          resourceType: "category",
          resourceId: category.id,
          details: { name: category.name, slug, active: category.active },
        },
        requestId,
      );
      return toDto(category, 0);
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw errors.conflict("Ya existe una categoría con ese enlace.");
    throw err;
  }
}

export function updateCategory(
  prisma: Pick<PrismaClient, "$transaction">,
  id: string,
  input: UpdateCategoryInput,
  actor: Actor,
  requestId?: string,
): Promise<AdminCategoryDto> {
  return prisma.$transaction(async (tx) => {
    await lockCategories(tx);
    const before = await tx.category.findUnique({ where: { id } });
    if (!before) throw errors.notFound("Categoría no encontrada");
    const issues = new Issues();
    if (input.name !== undefined) await checkName(tx, input.name, id, issues);
    issues.throwIfAny();

    const category = await tx.category.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        sortOrder: input.sortOrder,
        active: input.active,
      },
    });
    const fields = changedFields(before, input, ["name", "description", "sortOrder", "active"]);
    if (Object.keys(fields).length > 0) {
      await writeAudit(
        tx,
        actor,
        {
          action: "category.updated",
          resourceType: "category",
          resourceId: id,
          details: { fields } as Prisma.InputJsonValue,
        },
        requestId,
      );
    }
    return withCount(tx, category);
  });
}

/** DELETE: la categoría pasa a inactiva; los productos no cambian. */
export function deactivateCategory(
  prisma: Pick<PrismaClient, "$transaction">,
  id: string,
  actor: Actor,
  requestId?: string,
): Promise<DeactivateCategoryResult> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.category.findUnique({ where: { id } });
    if (!before) throw errors.notFound("Categoría no encontrada");
    const category = before.active
      ? await tx.category.update({ where: { id }, data: { active: false } })
      : before;
    const productsUsingCount = await tx.product.count({ where: usingCategory(id) });
    const hiddenProductsCount = await tx.product.count({
      where: { categoryId: id, status: "active" },
    });
    if (before.active) {
      await writeAudit(
        tx,
        actor,
        {
          action: "category.deactivated",
          resourceType: "category",
          resourceId: id,
          details: { name: before.name, productsUsingCount, hiddenProductsCount },
        },
        requestId,
      );
    }
    let warning: string | null = null;
    if (productsUsingCount > 0) {
      warning = `${String(productsUsingCount)} producto(s) usan esta categoría y la conservan.`;
      if (hiddenProductsCount > 0) {
        warning += ` ${String(hiddenProductsCount)} publicado(s) la tienen como principal y dejan de verse en la tienda hasta que les asignes otra o la reactives.`;
      }
    }
    return {
      category: toDto(category, productsUsingCount),
      productsUsingCount,
      hiddenProductsCount,
      warning,
    };
  });
}

export interface AdminExtraDto {
  id: string;
  code: string;
  name: string;
  /** Precio general en CLP; null = por confirmar. Cada producto puede tener el suyo. */
  price: number | null;
  available: boolean;
  requiresText: boolean;
  textLabel: string | null;
  textMaxLength: number | null;
}

/** Extras que el panel puede ofrecer en un producto (armado, nombre grabado…). */
export async function listExtras(prisma: Pick<PrismaClient, "extra">): Promise<AdminExtraDto[]> {
  const rows = await prisma.extra.findMany({ orderBy: [{ name: "asc" }, { code: "asc" }] });
  return rows.map((e) => ({
    id: e.id,
    code: e.code,
    name: e.name,
    price: e.price,
    available: e.available,
    requiresText: e.requiresText,
    textLabel: e.textLabel,
    textMaxLength: e.textMaxLength,
  }));
}
