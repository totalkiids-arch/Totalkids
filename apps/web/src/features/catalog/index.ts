// API pública de la feature "catalog". app/ y otras features importan solo desde aquí.
export {
  countLowStockVariants,
  getProductDetail,
  listFeaturedProducts,
  listProductSlugs,
  searchCatalog,
} from "./container";
export { parseCatalogQuery, countActiveFilters, type CatalogQuery } from "./domain/catalog-query";
export type { ProductSummary } from "./domain/product";
export type { ProductDetail } from "./domain/product-detail";
export { CatalogScreen } from "./ui/catalog-screen";
export { ProductDetailScreen } from "./ui/product-detail-screen";
export { loadProductDetail } from "./ui/product-detail-data";
export { ProductNotFound } from "./ui/product-not-found";
export { ProductPhoto } from "./ui/product-photo";
export { AdminProductsScreen } from "./ui/admin-products-screen";
export { ProductEditorScreen } from "./ui/product-editor-screen";
export { CategoriesScreen } from "./ui/categories-screen";
export { InventoryScreen } from "./ui/inventory-screen";
export { FeaturedProducts } from "./ui/featured-products";
export { ProductCard } from "./ui/product-card";
