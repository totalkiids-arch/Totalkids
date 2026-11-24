import { Router } from "express";
import { z } from "zod";

import { errors } from "../lib/errors.js";
import { paginationQuery } from "../lib/pagination.js";
import type { PrismaClient } from "../lib/prisma.js";
import { validated } from "../lib/validation.js";
import { methodNotAllowed } from "../middleware/method-not-allowed.js";
import {
  AVAILABILITY,
  getProduct,
  listCategories,
  listProducts,
  SORTS,
} from "../services/catalog.js";

const slug = z
  .string()
  .max(120)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Debe ser un identificador en minúsculas con guiones");

const tag = z
  .string()
  .max(40)
  .regex(/^[a-z0-9]+([-_][a-z0-9]+)*$/, "Valor de filtro inválido");

/** Acepta `?material=a&material=b` y `?material=a,b`. Sin duplicados; máximo 10. */
const tagList = z
  .union([z.string(), z.array(z.string())])
  .transform((value) =>
    (Array.isArray(value) ? value : [value])
      .flatMap((item) => item.split(","))
      .map((item) => item.trim())
      .filter(Boolean),
  )
  .pipe(z.array(tag).max(10))
  .transform((items) => [...new Set(items)]);

/** Colores como los escribe el panel ("Blanco", "Azul marino"); se comparan sin tildes. */
const colorList = z
  .union([z.string(), z.array(z.string())])
  .transform((value) =>
    (Array.isArray(value) ? value : [value])
      .flatMap((item) => item.split(","))
      .map((item) => item.trim().replace(/\s+/g, " "))
      .filter(Boolean),
  )
  .pipe(z.array(z.string().max(60)).max(10))
  .transform((items) => [...new Set(items)]);

const price = z.coerce.number().int().min(0).max(100_000_000);

const flag = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const listQuery = paginationQuery
  .extend({
    q: z.string().trim().max(100).optional(),
    category: slug.optional(),
    ageGroup: tagList.optional(),
    material: tagList.optional(),
    color: colorList.optional(),
    priceMin: price.optional(),
    priceMax: price.optional(),
    onSale: flag.optional(),
    availability: z.enum(AVAILABILITY).optional(),
    sort: z.enum(SORTS).default("best_selling"),
  })
  .refine(
    (query) =>
      query.priceMin === undefined ||
      query.priceMax === undefined ||
      query.priceMin <= query.priceMax,
    { path: ["priceMin"], message: "El precio mínimo no puede superar al máximo" },
  );

// Un slug mal formado no puede existir: responde 404 igual que uno inexistente.
const productParams = z.object({ slug: z.string().max(200) });

/** Catálogo público (LN-05): productos, ficha y categorías. Sin sesión. */
export function catalogRouter(prisma: PrismaClient): Router {
  const router = Router();

  router
    .route("/products")
    .get(
      validated({ query: listQuery }, async ({ query }, _req, res) => {
        const page = await listProducts(prisma, {
          page: query.page,
          pageSize: query.pageSize,
          q: query.q,
          category: query.category,
          ageGroups: query.ageGroup,
          materials: query.material,
          colors: query.color,
          priceMin: query.priceMin,
          priceMax: query.priceMax,
          onSale: query.onSale,
          availability: query.availability,
          sort: query.sort,
        });
        res.json(page);
      }),
    )
    .all(methodNotAllowed("GET"));

  router
    .route("/products/:slug")
    .get(
      validated({ params: productParams }, async ({ params }, _req, res) => {
        const product = await getProduct(prisma, params.slug);
        if (!product) throw errors.notFound("Producto no encontrado");
        res.json(product);
      }),
    )
    .all(methodNotAllowed("GET"));

  router
    .route("/categories")
    .get(async (_req, res) => {
      res.json({ items: await listCategories(prisma) });
    })
    .all(methodNotAllowed("GET"));

  return router;
}
