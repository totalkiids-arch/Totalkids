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

## Panel y sesión demo (UI-10)

- **Sesión de demostración, sin seguridad real**: `/admin/ingresar` guarda el rol elegido en la cookie `tk_demo_rol` (`admin` | `operator`) con una Server Action. No hay credenciales: correo y contraseña son de ejemplo y no se envían. Lo implementa `features/auth/infrastructure/demo-admin-session.ts` tras los puertos de `application/admin-session.ts`; en LN-04 solo cambia ese adaptador (RNF-01, RF-31).
- **Roles y secciones**: `features/users/domain/admin-role.ts` define los roles, las 15 secciones y `canAccessSection`. El operador ve resumen, pedidos (con su detalle), pagos, solicitudes, correos y reportes (SRS 2.3).
- **Layout** `app/admin/(panel)/layout.tsx`: sin sesión redirige a `/admin/ingresar`; filtra `adminNav` con `canAccessSection` y entrega a `AdminShell` los ítems, el rol y `AdminSignOutButton` (shared no decide permisos ni depende de features).
- **URL directa**: las páginas solo de administrador envuelven su pantalla en `AdminSectionGate`, que muestra «Acceso restringido» al operador (CA-07). Es interfaz: la autorización real la aplica el backend.
- **Menú móvil** (≤760 px, como la maqueta): botón con `aria-expanded`, menú `inert` e invisible cuando está cerrado, Escape cierra y devuelve el foco; se cierra al navegar.

## Panel de catálogo (UI-11)

- **Pantallas** (solo Administrador, dentro de `AdminSectionGate`): `/admin/productos` (búsqueda por nombre o SKU, filtro Publicación y paginación en la URL: `?q=&estado=&pagina=`), `/admin/productos/nuevo` y `/admin/productos/[id]` (mismo editor; un id inexistente responde 404), `/admin/categorias` y `/admin/inventario`.
- **Almacén DEMO**: `features/catalog/infrastructure/demo-admin-catalog.ts` implementa el puerto `application/admin-catalog.ts` en la memoria del servidor, sembrado desde `catalogo.json` (una variante `TK-<id>` por producto; stock físico y reservado ficticios y deterministas). Se pierde al reiniciar y **no se refleja en la tienda pública**, que sigue leyendo el JSON. En LN-12 se cambia solo `adminCatalog` en `container.ts` por un adaptador de la API.
- **Reglas** (`domain/admin-product.ts`, con tests): SKU único sin distinguir mayúsculas, CLP enteros ≥ 0, precio anterior ≥ precio, al menos una variante, físico entero ≥ reservado, disponible = físico − reservado, "Stock bajo" con `LOW_STOCK_THRESHOLD`, imágenes JPG/PNG/WebP ≤ 2 MB con texto alternativo, nombre y slug de categoría únicos. `admin-product-form.ts` convierte el formulario (texto) en borrador; `admin-product-query.ts` lee la URL del listado.
- **Mutaciones**: Server Actions en `ui/admin/admin-catalog-actions.ts`. Comprueban el rol de la sesión demo, validan con zod y delegan en el puerto, que vuelve a validar con el dominio. Los formularios usan `useActionState` + `redirect` y funcionan sin JavaScript (agregar/quitar variante son botones `name="intent"`); los avisos llegan por `?aviso=` y se anuncian con `role="status"`.
- **Imágenes**: vista previa local y validación de tipo, tamaño y alt; el archivo **no se sube** (solo viajan sus metadatos). El almacenamiento se define en PR-05/LN-12.
- **Inventario (RF-34)**: cada ajuste exige motivo y registra fecha, rol, antes → después. "Ajustar stock" en una fila enlaza a `?sku=…#ajuste` y precarga el formulario.
- **Componentes reutilizables** en `shared/ui/admin/` (para UI-12 a UI-14): `AdminPageHeading`, `DataTable` (caption, `th scope`, scroll horizontal solo en su contenedor), `StatusBadge`/`ActiveBadge`, `FilterBar` (GET), `AdminPanel`, `LiveNotice`, `InfoNote`, `FormErrorSummary` y `PaginationNav`.
- `demo-admin-catalog.ts` no lleva `server-only`: el índice de catalog llega a un componente de cliente (`cart-line-item` importa `ProductPhoto`) y ese import rompería el bundle.

## Pedidos, pagos y resumen del panel (Tanda A)

- **Pantallas**: `/admin/pedidos/[id]` (detalle, gestión de estado, historial y reembolso manual; un id inexistente responde 404), `/admin/pagos` (intentos de pago, filtro `?estado=` y conciliación simulada; `?pedido=` preselecciona el pedido) y `/admin` (resumen de solo lectura). Las ven Administrador y Operador. El panel de reembolso aparece solo para el Administrador.
- **Reglas** (`orders/domain/order-workflow.ts`, con tests): transiciones de la tabla de la SRS. No se confirma ni se despacha sin pago confirmado, y despachar exige transportista y seguimiento. Cada cambio pide motivo. Un pedido pendiente con un pago `pending`/`in_review` no se cancela ni se marca vencido hasta conciliarlo (RN-04/RN-06); la pantalla lo explica y enlaza a `/admin/pagos?pedido=<id>#conciliar`. Cancelar un pedido pagado no toca el cobro ni marca dinero devuelto, y la reposición de stock se registra una sola vez y solo si se cancela desde confirmado o en preparación (RN-06). Reembolso manual (RF-32): estados `no_solicitado → solicitado → procesado | fallido`; monto entero > 0, con solicitados + procesados ≤ cobrado; fecha, referencia y responsable obligatorios. Conciliación (RF-33): pagado confirma el pedido (o lo deja en revisión si ya estaba cerrado, RN-05), rechazado lo deja pendiente para reintentar y sin respuesta lo pasa a revisión (RN-04).
- **Almacén DEMO**: `orders/infrastructure/demo-admin-order-panel.ts` implementa el puerto `application/admin-order-panel.ts` en la memoria del servidor (singleton en `globalThis`). Se siembra desde `demo-orders.ts` y les suma intentos de pago ficticios, reembolsos e historial con actor, fecha y motivo. Se pierde al reiniciar. LN-09/LN-16 lo reemplazan por la API. No mueve stock ni dinero.
- **Una línea de `orders/container.ts`**: `const orders` apunta a ese almacén, que también implementa `OrderRepository`. Así `/admin/pedidos`, el CSV y el seguimiento del comprador reflejan los cambios del panel. Al comprador solo le llega una etiqueta por cambio, sin el motivo interno.
- **Mutaciones**: Server Actions en `orders/ui/admin-order-actions.ts`. Comprueban la sesión y el rol (sección `pedidos` o `pagos`; el reembolso exige Administrador, aunque se fuerce la acción), validan con zod y delegan en el puerto, que vuelve a validar con el dominio. El actor sale de la sesión. Los formularios funcionan sin JavaScript (`useActionState` + `redirect` con `?aviso=`).
- **Dependencias entre features**: `orders` usa `payments` (tipo `PaymentStatus`, `PaymentAttemptRow` y `PaymentStatusBadge`). `payments` no importa `orders`: la página `/admin/pagos` le inyecta los intentos y `reconcilePaymentAction` (mismo patrón que `addToCartAction`). `dashboard` lee `orders`, `catalog` (`countLowStockVariants`, mismo criterio que Inventario) y `users`.
- **Componente nuevo** en `shared/ui/admin/`: `StatCard` + `StatGrid` (indicadores; los usan Resumen y Pagos).

## Cupones y banners del panel (UI-13)

- **Pantallas** (solo Administrador, dentro de `AdminSectionGate`): `/admin/cupones` (feature `coupons`) y `/admin/banners` (feature `content`). Edición con `?editar=<id>#editor`; en cupones, `?eliminar=<id>#eliminar` pide confirmar antes de borrar. Despacho y retiro (también UI-13) está en `features/shipping`.
- **Reglas de cupones** (`coupons/domain/coupon.ts`, con tests): código normalizado (mayúsculas, sin espacios), de 3 a 20 caracteres (A–Z, 0–9, `-`, `_`) y único sin distinguir mayúsculas; porcentaje entero 1–100 o monto fijo entero > 0 en CLP; inicio ≤ término (término inclusivo, hora de Chile); máximo de usos entero ≥ 1 y ≥ usos consumidos. Estado derivado con prioridad inactivo > agotado > vencido > programado > activo. **Con usos**, el cupón no se elimina (solo se desactiva) y su código, tipo y valor quedan fijos, para no romper la trazabilidad de `coupon_redemptions` y de los reportes; fechas, máximo y estado sí cambian. `couponDiscount` (RN-01: redondeo al peso, tope en el subtotal elegible, sin despacho) está probada pero no conectada: queda lista para LN-12.
- **Reglas de banners** (`content/domain/banner.ts`, con tests): título (≤ 60) y texto (≤ 140) obligatorios, orden entero 1–99 (repetible, se desempata por título) y destino solo interno (empieza con `/`, no con `//`, sin `\`, espacios ni esquemas como `http:` o `javascript:`). La vista previa usa `safeBannerHref`, que cae en `/catalogo` si un destino guardado no es seguro.
- **Almacenes DEMO**: `coupons/infrastructure/demo-coupon-admin.ts` y `content/infrastructure/demo-banner-admin.ts`, en la memoria del servidor (singleton en `globalThis`). Se pierden al reiniciar. Las fechas de los cupones de ejemplo son relativas al día de arranque, para que siempre haya uno vigente, uno vencido, uno agotado y uno programado. En LN-12/LN-13 se cambia solo la línea de cada `container.ts`.
- **Alcance**: los almacenes son solo del panel (igual que UI-11). El carrito sigue respondiendo que no hay cupones vigentes y la portada no cambia; cada pantalla lo avisa. LN-12/LN-13 los conecta por la API (`/admin/coupons`, `/admin/banners`).
- **Mutaciones**: Server Actions en `coupons/ui/coupon-actions.ts` y `content/ui/banner-actions.ts`, con el mismo patrón que Despacho: comprueban sesión y rol (`canAccessSection`, aunque se fuercen), validan con zod y delegan en el puerto, que vuelve a validar con el dominio. Funcionan sin JavaScript (`useActionState` + `redirect` con `?aviso=`).
