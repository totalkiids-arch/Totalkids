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
| Panel administrativo | Ingreso del equipo            | `/admin/ingresar`                                 | `auth`       |
|                      | Definir contraseña            | `/admin/restablecer`                              | `auth`       |
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

## Panel y sesión (UI-10, LN-16)

- **BFF del panel** (`shared/infrastructure/panel-api.ts`): el navegador nunca llama a la API. `panelGet` (componentes de servidor) y `panelSend` (Server Actions y Route Handlers) reenvían solo las cookies `tk_panel` y `tk_csrf` (y sus variantes `__Host-`, ver `shared/config/panel-cookies.ts`), `X-Request-Id` y `X-Forwarded-For`. `panelSend` pide `GET /csrf` y manda el token en la cookie y en `X-CSRF-Token`; los `Set-Cookie` de esas cookies vuelven al navegador. **`tk_carrito` no se reenvía**: la tienda guarda ahí su carrito en JSON y la API usa el mismo nombre para su token opaco.
- **Errores** (`shared/lib/panel-errors.ts`): `PanelApiError` con `kind` (`unauthorized`, `forbidden`, `not-found`, `conflict`, `validation` con errores por campo, `rate-limited` con los minutos de espera, `unavailable` para timeout o caída) y el mensaje del panel. 401 lleva al ingreso; la caída muestra un aviso, nunca datos de reemplazo (`PanelUnavailable` en el layout, `app/admin/(panel)/error.tsx` en las secciones).
- **Sesión real** (`features/auth/infrastructure/api-admin-session.ts`): ingreso con `POST /auth/login`, sesión con `GET /auth/session` (una vez por petición, `cache` de React), cierre con `POST /auth/logout`. `/admin/restablecer?token=` define la contraseña (invitación o recuperación); sin token pide el enlace. El mínimo de contraseña está en `features/auth/domain/password-policy.ts` y un test lo compara con la API y el contrato.
- **`src/proxy.ts`** (solo `/admin`): sin cookie del panel lleva al ingreso sin llamar a la API; en `/admin/restablecer` agrega `Referrer-Policy: no-referrer` y `Cache-Control: no-store`.
- **Roles y secciones**: `features/users/domain/admin-role.ts` define los roles, las 16 secciones y `canAccessSection`. El operador ve resumen, pedidos (con su detalle), pagos, solicitudes y correos, igual que los `x-roles` de la API (SRS 2.3).
- **Layout** `app/admin/(panel)/layout.tsx`: sin sesión redirige a `/admin/ingresar`; filtra `adminNav` con `canAccessSection` y entrega a `AdminShell` los ítems, el rol y `AdminSignOutButton` (shared no decide permisos ni depende de features).
- **URL directa**: las páginas solo de administrador envuelven su pantalla en `AdminSectionGate`, que muestra «Sin permiso para esta sección» al operador (CA-07). Es interfaz: la autorización real la aplica la API.
- **Menú móvil** (≤760 px, como la maqueta): botón con `aria-expanded`, menú `inert` e invisible cuando está cerrado, Escape cierra y devuelve el foco; se cierra al navegar.

## Panel de catálogo (UI-11, LN-12 en la API)

- **Pantallas** (solo Administrador, dentro de `AdminSectionGate`): `/admin/productos` (búsqueda por nombre o SKU, filtro Publicación —Publicado, Borrador, Inactivo— y paginación en la URL: `?q=&estado=&pagina=`; los resuelve la API), `/admin/productos/nuevo` y `/admin/productos/[id]` (mismo editor; un id inexistente responde 404), `/admin/categorias` y `/admin/inventario`.
- **Adaptador**: `catalog/infrastructure/api-admin-catalog.ts` implementa `application/admin-catalog.ts` con la API (`/admin/products`, `/admin/categories`, `/admin/extras`, `/admin/inventory`, stock-adjustments e imágenes). La traducción API ⇄ dominio está en `admin-catalog-api.ts` (pura, con tests); un cuerpo inesperado cuenta como API caída.
- **Reglas** (`domain/admin-product.ts`, con tests): las mismas de la API con sus mensajes (CLP enteros ≥ 0, precio anterior ≥ precio, SKU sin espacios y sin repetir dentro del producto, físico ≥ reservado, ajuste con motivo y distinto del actual, imágenes JPG/PNG/WebP ≤ 2 MB con texto alternativo, nombre de categoría único). La unicidad entre productos y la publicación las comprueba la API; sus errores llegan por campo (`toFormErrors`).
- **Estado de publicación**: «Visible en el catálogo» pide `active`; sin marcar, un producto nuevo o nunca publicado queda en `draft` y uno publicado pasa a `inactive` (`requestedStatus`). Publicar exige categoría activa, precio en cada variante y una imagen con texto alternativo: si la imagen viene en el mismo guardado, se sube y después se publica.
- **Stock**: una variante nueva lleva su stock inicial; el de una variante guardada solo se cambia en Inventario, con motivo (RF-34). Inventario lista todas las variantes con `GET /admin/inventory` y los ajustes recientes con `/admin/activity?area=inventario`.
- **Extras**: el editor muestra los extras de la tienda (`/admin/extras`) con «Ofrecer», precio propio opcional (vacío = el general o «por confirmar») y límite de caracteres si piden texto.
- **Imágenes**: se suben al guardar (multipart por `panelSendForm`; `serverActions.bodySizeLimit` = 3 MB en `next.config.ts`). Las que guarda la API en `${API_URL}/uploads` se piden a `/uploads/…` de Next (rewrite en `next.config.ts`), así el navegador no habla con la API.
- **Mutaciones**: Server Actions en `ui/admin/admin-catalog-actions.ts`. Comprueban el rol, validan con zod y delegan en el puerto. 403 o API caída vuelven como mensaje (`attemptPanel`); 401 lleva al ingreso.
- **Tienda**: el stock de `/catalogo` y de las fichas sale del catálogo público de la API (`infrastructure/api-store-stock.ts`, sin sesión, caché de 60 s con la etiqueta `tienda-stock`, que el ajuste de stock invalida con `updateTag`). Fichas y precios siguen saliendo de `catalogo.json`. Si la API no responde, todo queda «a pedido».
- `ProductPhoto` vive en `shared/ui/product-photo.tsx`: el carrito (componente de cliente) la importa de ahí y no carga el contenedor de catalog, que tiene adaptadores de servidor.
- **Componentes reutilizables** en `shared/ui/admin/`: `AdminPageHeading`, `DataTable` (caption, `th scope`, scroll horizontal solo en su contenedor), `StatusBadge`/`ActiveBadge`, `FilterBar` (GET), `AdminPanel`, `LiveNotice`, `InfoNote`, `FormErrorSummary` y `PaginationNav`.

## Pedidos y pagos del panel (LN-13 en la API)

- **Pantallas**: `/admin/pedidos` (búsqueda, filtro de estado y página resueltos por la API; «Exportar CSV» solo para el Administrador), `/admin/pedidos/[id]` (detalle, cambio de estado, historial, reembolso manual y folio de factura; un número inexistente responde 404) y `/admin/pagos` (intentos de pago de solo lectura, filtro `?estado=&pedido=&pagina=`). Las ven Administrador y Operador.
- **Adaptadores**: `orders/infrastructure/api-admin-order-panel.ts` (traducción en `admin-orders-api.ts`, con tests) y `payments/infrastructure/api-admin-payments.ts` (`admin-payments-api.ts`). El detalle trae de la API las transiciones disponibles, si se puede registrar la reposición, si un pago sin resolver bloquea y los totales de reembolso: el panel no repite esas reglas (`orders/domain/admin-order.ts` solo tiene tipos y textos).
- **Roles**: reembolsos (registrar y resolver) y corrección de folio son solo del Administrador; el Operador registra el primer folio. Las acciones lo comprueban y la API lo vuelve a exigir.
- **Retiro en taller**: «Despachado» se muestra como «Listo para retiro» y no pide transportista ni seguimiento (`statusOptionLabel`, `needsTracking`). Un despacho sin tarifa se muestra «A coordinar».
- **Errores**: 422 y 409 llegan por campo (los 409 de pedidos traen `details.field`); 403 o API caída, como mensaje del formulario.
- **Pagos**: la conciliación con Flow es de LN-15; la vista marca «Por conciliar» los intentos pendientes o en revisión. Los estados de intento del panel (`AttemptStatus`) suman «Anulado» a los de la tienda.
- **TRANSITORIO hasta la etapa 3**: el resumen, los reportes, la actividad y el CSV de pedidos siguen leyendo `demo-admin-order-panel.ts`, que también usa el seguimiento de la tienda (checkout de demostración).
- **Componente** en `shared/ui/admin/`: `StatCard` + `StatGrid` (indicadores; los usan Resumen y Pagos).

## Cupones y banners del panel (UI-13)

- **Pantallas** (solo Administrador, dentro de `AdminSectionGate`): `/admin/cupones` (feature `coupons`) y `/admin/banners` (feature `content`). Edición con `?editar=<id>#editor`; en cupones, `?eliminar=<id>#eliminar` pide confirmar antes de borrar. Despacho y retiro (también UI-13) está en `features/shipping`.
- **Reglas de cupones** (`coupons/domain/coupon.ts`, con tests): código normalizado (mayúsculas, sin espacios), de 3 a 20 caracteres (A–Z, 0–9, `-`, `_`) y único sin distinguir mayúsculas; porcentaje entero 1–100 o monto fijo entero > 0 en CLP; inicio ≤ término (término inclusivo, hora de Chile); máximo de usos entero ≥ 1 y ≥ usos consumidos. Estado derivado con prioridad inactivo > agotado > vencido > programado > activo. **Con usos**, el cupón no se elimina (solo se desactiva) y su código, tipo y valor quedan fijos, para no romper la trazabilidad de `coupon_redemptions` y de los reportes; fechas, máximo y estado sí cambian. `couponDiscount` (RN-01: redondeo al peso, tope en el subtotal elegible, sin despacho) está probada pero no conectada: queda lista para LN-12.
- **Reglas de banners** (`content/domain/banner.ts`, con tests): título (≤ 60) y texto (≤ 140) obligatorios, orden entero 1–99 (repetible, se desempata por título) y destino solo interno (empieza con `/`, no con `//`, sin `\`, espacios ni esquemas como `http:` o `javascript:`). La vista previa usa `safeBannerHref`, que cae en `/catalogo` si un destino guardado no es seguro.
- **Almacenes DEMO**: `coupons/infrastructure/demo-coupon-admin.ts` y `content/infrastructure/demo-banner-admin.ts`, en la memoria del servidor (singleton en `globalThis`). Se pierden al reiniciar. Las fechas de los cupones de ejemplo son relativas al día de arranque, para que siempre haya uno vigente, uno vencido, uno agotado y uno programado. En LN-12/LN-13 se cambia solo la línea de cada `container.ts`.
- **Alcance**: los almacenes son solo del panel (igual que UI-11). El carrito sigue respondiendo que no hay cupones vigentes y la portada no cambia; cada pantalla lo avisa. LN-12/LN-13 los conecta por la API (`/admin/coupons`, `/admin/banners`).
- **Mutaciones**: Server Actions en `coupons/ui/coupon-actions.ts` y `content/ui/banner-actions.ts`, con el mismo patrón que Despacho: comprueban sesión y rol (`canAccessSection`, aunque se fuercen), validan con zod y delegan en el puerto, que vuelve a validar con el dominio. Funcionan sin JavaScript (`useActionState` + `redirect` con `?aviso=`).

## Solicitudes, suscriptores y correos del panel (UI-14, parte 1)

- **Pantallas**: `/admin/solicitudes` (`services`; Administrador y Operador; `?servicio=&estado=&id=#detalle`), `/admin/suscriptores` (`newsletter`; solo Administrador, dentro de `AdminSectionGate`; `?estado=activos|bajas`, `?baja=<id>#confirmar` pide confirmar) y `/admin/correos` (`emails`; ambos roles; `?evento=&estado=&pedido=TK-xxxx&id=#detalle`).
- **Reglas** (dominio con tests):
  - `services/domain/service-request-admin.ts`: Nueva → En gestión → Resuelta, resolver directo desde Nueva y reabrir (Resuelta → En gestión); nunca se vuelve a Nueva. La nota interna (≤ 1000) se puede guardar sola. Cada cambio queda en el historial con actor, fecha y cambio.
  - `newsletter/domain/subscriber.ts`: correo, fecha de consentimiento y versión del texto (`CONSENT_VERSION`). La baja no borra el registro: deja la fecha y quién la registró. Volver a suscribirse reactiva el registro con el consentimiento nuevo.
  - `emails/domain/email-log.ts`: los 8 eventos de la SRS 4.4.3, estados pendiente/enviado/fallido/incierto (un timeout es incierto), clave única por evento (`addEmailEvent` no duplica) e intentos con fecha, tipo y resultado. El reenvío manual solo aplica a fallido o incierto: suma un intento manual al original (actor, fecha, resultado y `resendRecordId`) y crea un registro nuevo con `resendOf` («Reenvío de #…»). No toca el pedido. Incluye la vista previa de plantilla por evento.
- **Almacenes DEMO** (memoria del servidor, singleton en `globalThis`, se pierden al reiniciar): `services/infrastructure/demo-service-request-desk.ts` y `newsletter/infrastructure/demo-subscriber-list.ts` implementan **también** el puerto del formulario público. Se cambió una línea (`const gateway`) de cada `container.ts`, así lo enviado en `/servicios/solicitar` y `/suscripcion` aparece en el panel. `emails/infrastructure/demo-email-log.ts` trae correos de ejemplo con los números reales de `demo-orders.ts` y de las solicitudes demo, copiados como texto: `emails` no importa `orders` ni `services`. **No se envían correos reales**. LN-08/LN-13 (solicitudes y newsletter) y LN-14/LN-16 (correos) reemplazan solo la línea de cada `container.ts`.
- **Permisos** (tabla de la API de la SRS): las Server Actions comprueban sesión y rol aunque se fuercen. Seguimiento de solicitudes: sección `solicitudes`. Baja: sección `suscriptores`. Reenvío: solo Administrador; el Operador ve la pantalla pero no el botón «Simular reenvío». El actor sale de la sesión.
- **Exportaciones CSV** (solo Administrador, 403 si no; el botón solo se muestra al Administrador): `/admin/solicitudes/exportar` y `/admin/suscriptores/exportar`, con los filtros de la URL y datos mínimos. Solicitudes: referencia, fecha, servicio, estado, nombre y correo; sin teléfono, mensaje ni nota. Suscriptores: correo, fechas, versión y estado.
- **Shared nuevo**:
  - `shared/lib/csv.ts` (`toCsv`, `csvCell`, `csvDownload`): BOM, `;`, CRLF, comillas duplicadas y neutralización de celdas que empiezan con `=`, `+`, `-`, `@`, tabulador o retorno de carro (RF-29). El CSV de pedidos sigue con su propio `csvCell`.
  - `shared/lib/chile-time.ts`: fechas en America/Santiago para pantalla y CSV.
