# Arquitectura de apps/web

El frontend sigue una arquitectura limpia organizada por **features** (dominios del negocio). Las reglas de dependencia se verifican con ESLint (`eslint.config.js`), así que `pnpm lint` falla si alguien las rompe.

## Estructura

```
src/
  app/                 Enrutamiento de Next.js. Solo páginas, layouts y rutas BFF.
    (tienda)/          Tienda y compra (route group: no aparece en la URL)
    (cuenta)/          Cuenta del comprador
    admin/(acceso)/    Ingreso al panel (sin menú lateral)
    admin/(panel)/     Panel administrativo (con menú lateral)
    api/               Rutas BFF: el navegador llama aquí y Next.js llama a la API
  features/<nombre>/   Un dominio del negocio
    domain/            Tipos, entidades y reglas. TypeScript puro.
    application/       Casos de uso y puertos (interfaces). TypeScript puro.
    infrastructure/    Adaptadores que implementan los puertos (HTTP, storage…)
    ui/                Componentes React y pantallas (*-screen.tsx)
    container.ts       Raíz de composición: conecta puertos con adaptadores
    index.ts           API pública de la feature
  shared/              Código transversal sin conocimiento de negocio
    config/            Rutas de navegación y variables de entorno de servidor
    infrastructure/    Cliente HTTP de servidor hacia la API (apiFetch)
    ui/                Componentes genéricos y layouts (StoreShell, AdminShell)
```

Las capas se crean **cuando se necesitan**: una feature que hoy solo tiene `ui/` no lleva carpetas vacías. `features/system` (estado de la API) es el ejemplo de referencia con las cuatro capas.

## Reglas de dependencia

```
app ──> features/<f>/index.ts ──> ui ──> container ──> infrastructure
                                   │                        │
                                   └──> application <──────┘
                                            │
                                            └──> domain
```

| Desde                   | Puede importar                                    | No puede importar                      |
| ----------------------- | ------------------------------------------------- | -------------------------------------- |
| `domain/`               | Nada propio de la app (solo TS y librerías puras) | React, Next.js, otras capas            |
| `application/`          | `domain/`                                         | React, Next.js, infrastructure, ui     |
| `infrastructure/`       | `application/`, `domain/`, `shared/`              | `ui/`                                  |
| `ui/`                   | `container`, `application/`, `domain/`, `shared/` | `infrastructure/`                      |
| `app/` y otras features | `@/features/<f>` (su `index.ts`)                  | Capas internas (`@/features/<f>/ui/…`) |
| `shared/`               | `shared/`                                         | `features/`                            |

## Datos y la API

- El navegador **nunca** llama a la API Express. Los componentes de cliente llaman a rutas BFF en `src/app/api/*`.
- Las rutas BFF y los Server Components usan `apiFetch` (`shared/infrastructure/api-client.ts`), que es `server-only`, propaga `X-Request-Id` y `X-Forwarded-For`.
- Los secretos solo existen en el servidor. Ninguna variable secreta lleva el prefijo `NEXT_PUBLIC_`.

## Cómo agregar una pantalla

1. Crea `features/<f>/ui/<nombre>-screen.tsx` y expórtalo en `features/<f>/index.ts`.
2. Crea `app/<grupo>/<ruta>/page.tsx` que solo lea `params`/`searchParams` y renderice la pantalla.
3. Si la ruta va en un menú, agrégala en `shared/config/routes.ts` (`typedRoutes` valida que exista).

## Mapa de pantallas

| Sección              | Pantalla                      | Ruta                                              | Feature      |
| -------------------- | ----------------------------- | ------------------------------------------------- | ------------ |
| Tienda y compra      | Inicio                        | `/`                                               | `home`       |
|                      | Catálogo y búsqueda           | `/catalogo`                                       | `catalog`    |
|                      | Ficha de producto             | `/producto/[slug]`                                | `catalog`    |
|                      | Carrito                       | `/carrito`                                        | `cart`       |
|                      | Datos y facturación           | `/checkout`                                       | `checkout`   |
|                      | Pago Flow                     | `/checkout/pago`                                  | `checkout`   |
|                      | Resultado de pago             | `/checkout/resultado`                             | `checkout`   |
|                      | Servicios                     | `/servicios`                                      | `services`   |
|                      | Solicitar servicio            | `/servicios/solicitar`                            | `services`   |
|                      | Suscripción y baja            | `/suscripcion`                                    | `newsletter` |
|                      | Políticas                     | `/politicas`                                      | `content`    |
| Cuenta del comprador | Iniciar sesión                | `/ingresar`                                       | `auth`       |
|                      | Crear cuenta                  | `/registro`                                       | `auth`       |
|                      | Recuperar acceso              | `/recuperar`                                      | `auth`       |
|                      | Restablecer contraseña        | `/restablecer`                                    | `auth`       |
|                      | Historial de pedidos          | `/cuenta/pedidos`                                 | `orders`     |
|                      | Detalle y seguimiento         | `/cuenta/pedidos/[id]`                            | `orders`     |
| Panel administrativo | Acceso por rol                | `/admin/ingresar`                                 | `auth`       |
|                      | Resumen                       | `/admin`                                          | `dashboard`  |
|                      | Pedidos                       | `/admin/pedidos`                                  | `orders`     |
|                      | Detalle de pedido y reembolso | `/admin/pedidos/[id]`                             | `orders`     |
|                      | Pagos y conciliación          | `/admin/pagos`                                    | `payments`   |
|                      | Productos                     | `/admin/productos`                                | `catalog`    |
|                      | Crear / editar producto       | `/admin/productos/nuevo`, `/admin/productos/[id]` | `catalog`    |
|                      | Categorías                    | `/admin/categorias`                               | `catalog`    |
|                      | Inventario                    | `/admin/inventario`                               | `catalog`    |
|                      | Cupones                       | `/admin/cupones`                                  | `coupons`    |
|                      | Despacho y retiro             | `/admin/despacho`                                 | `shipping`   |
|                      | Banners                       | `/admin/banners`                                  | `content`    |
|                      | Solicitudes                   | `/admin/solicitudes`                              | `services`   |
|                      | Suscriptores                  | `/admin/suscriptores`                             | `newsletter` |
|                      | Correos                       | `/admin/correos`                                  | `emails`     |
|                      | Reportes                      | `/admin/reportes`                                 | `reports`    |
|                      | Usuarios y roles              | `/admin/usuarios`                                 | `users`      |
|                      | Historial de actividad        | `/admin/actividad`                                | `activity`   |

**Estados de pago** (Pagado, Pendiente, Rechazado, En revisión, Vencido) no son pantallas: son `PaymentStatus` en `features/payments/domain`, y los muestra la pantalla Resultado de pago. Mientras tanto se pueden previsualizar con `/checkout/resultado?estado=paid|pending|rejected|in_review|expired`.

## Catálogo (UI-02)

- Todo el estado vive en la URL: `/catalogo?q=&categoria=&nivel=&material=&precio_min=&precio_max=&ofertas=1&orden=&pagina=`. Se puede compartir, funciona con atrás/adelante y sin JavaScript.
- `features/catalog/domain/catalog-query.ts`: leer la consulta (`parseCatalogQuery`), armar enlaces (`toQueryString`) y aplicar búsqueda, filtros, orden y paginación (`applyCatalogQuery`). Funciones puras con tests.
- El adaptador `imported-product-catalog.ts` aplica esas reglas sobre el catálogo importado (ver abajo). Al existir la API, el adaptador traduce `CatalogQuery` a la consulta del endpoint y el filtrado pasa al servidor.
- Búsquedas y combinaciones de filtros llevan `noindex`; el catálogo y sus categorías sí se indexan.

## Ficha de producto (UI-04)

- `/producto/[slug]` se prerenderiza con `generateStaticParams` (`listProductSlugs`); un slug inexistente responde 404 con `not-found.tsx`.
- `features/catalog/domain/product-detail.ts`: fotos, variantes (una opción por variante, con SKU, precio y stock; un producto simple tiene una sola), extras y reglas puras con tests: selección de variante, opciones agotadas, tope de cantidad (stock y 9 por línea), total con extras y validación del texto personalizado (RF-03, RF-04).
- `ProductShowcase` (cliente) guarda la selección; precio, SKU y disponibilidad salen de la variante. Una variante agotada no se puede comprar. Las pestañas sin contenido (p. ej. Medidas) no se muestran.
- `loadProductDetail` usa `cache` de React: `generateMetadata` y la pantalla comparten una sola consulta. JSON-LD `Product` publica ofertas solo cuando hay precio.
- Pendiente: "Agregar al carrito" valida y confirma, pero aún no persiste la línea (RF-05, pantalla Carrito).

## Catálogo importado de totalmuebles.cl

Los productos son los del sitio WooCommerce del cliente. `pnpm --filter web catalogo:importar` (`scripts/importar-catalogo.ts`):

1. Lee la Store API pública (solo JSON) de las categorías `junji`, `infantil` y `montessori-pikler`, más el ranking de ventas, las fechas de publicación y los destacados.
2. Descarta `EXCLUDED_SLUGS` (productos no infantiles ni de aula, y "Diseños de salas", que es un servicio).
3. Normaliza con funciones puras y probadas (`infrastructure/totalmuebles/transform.ts`): nombres en mayúsculas a oración, HTML a texto plano (nunca se renderiza HTML del sitio), medidas y ficha técnica desde la descripción, categorías, niveles y materiales por palabras clave.
4. Descarga hasta 6 fotos por producto como WebP (1200 px) en `public/productos/<slug>/` y escribe `infrastructure/totalmuebles/catalogo.json`.

Ambos resultados se versionan. Volver a ejecutarlo actualiza precios, stock y fotos; revisa el diff antes de commitear. El JSON será la semilla de la tabla de productos cuando el catálogo pase a la API.

- **Categorías**: las del cliente (Cunas y camas, Mesas, Sillas, Mudadores, Almacenamiento, Montessori y Pikler) más la línea JUNJI. El nombre del producto manda sobre las categorías del sitio, que tienen ruido.
- **Niveles** (filtro `nivel`): sala cuna, nivel medio, transición y educadoras/adultos, detectados por el nombre. Un producto sin nivel solo aparece sin ese filtro.
- **Sin datos en el sitio**: SKU (se usa `TK-<id del sitio>`), variantes, colores, cuotas, garantía y cantidad exacta de stock (con stock sin cantidad se permite hasta 9 por línea).

## Carrito (UI-05)

- **Dónde vive**: cookie `tk_carrito` con las líneas (SKU, cantidad, extras y textos), sin precios ni datos personales (`features/cart/domain/cart-cookie.ts`, validada con zod; una línea inválida se descarta sin perder las demás). Es provisional: con la API, la cookie guardará un id opaco y las líneas irán a la base de datos (RF-05). Solo cambia el adaptador `CartStore`.
- **Revalidación (RF-06)**: `application/price-cart.ts` recalcula cada vez contra el catálogo vigente: quita productos retirados, descarta extras que ya no se ofrecen, ajusta la cantidad al stock e informa, y bloquea el pago si hay líneas agotadas. Lo que no tiene precio (p. ej. el armado) se lista aparte y no se suma.
- **Agregar** valida en el servidor (`application/validate-add.ts`): variante vigente, stock contando lo que ya está en el carrito, extras ofrecidos y textos personalizados. Mismo SKU con extras o textos distintos son líneas distintas.
- **Mutaciones**: Server Actions en `ui/cart-actions.ts`. La ficha (catalog) no importa cart: la página `/producto/[slug]` le inyecta `addToCartAction`, para no crear un ciclo entre features.
- **Contador del encabezado**: `CartLink` lee la cookie en el navegador (`useSyncExternalStore`), así las páginas de la tienda siguen estáticas. `shared/ui/cart-signal.ts` avisa los cambios. El layout entrega `CartLink` a `StoreShell` (shared no depende de features).
- **Pendiente**: cupones (RF-07; hoy responde que no hay cupones vigentes) y umbral de despacho gratis (`site.freeShippingThreshold`, RF-08), ambos según la API y el cliente.
