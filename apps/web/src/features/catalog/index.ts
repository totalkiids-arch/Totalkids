// API pública de la feature "catalog". app/ y otras features importan solo desde aquí.
export { listFeaturedProducts } from "./container";
export type { ProductSummary } from "./domain/product";
export { CatalogScreen } from "./ui/catalog-screen";
export { ProductDetailScreen } from "./ui/product-detail-screen";
export { AdminProductsScreen } from "./ui/admin-products-screen";
export { ProductEditorScreen } from "./ui/product-editor-screen";
export { CategoriesScreen } from "./ui/categories-screen";
export { InventoryScreen } from "./ui/inventory-screen";
export { FeaturedProducts } from "./ui/featured-products";
export { ProductCard } from "./ui/product-card";
