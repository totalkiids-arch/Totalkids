import { z } from "zod";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Query de paginación común (`?page=2&pageSize=50`). Se combina con los filtros
 * propios del endpoint: `paginationQuery.extend({ estado: ... })`.
 */
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type Pagination = z.output<typeof paginationQuery>;

/** Metadatos de página (esquema PageMeta del contrato). */
export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function pageMeta(total: number, { page, pageSize }: Pagination): PageMeta {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

/** `skip`/`take` para Prisma a partir de la página pedida. */
export function pageWindow({ page, pageSize }: Pagination): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}
