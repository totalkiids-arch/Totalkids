# apps/api — guía para crear endpoints

API interna de Total Kids: Express 5 + Prisma 7 + zod 4. Base `/api/v1` y contrato OpenAPI en [`openapi.yaml`](openapi.yaml), servido en `/api/docs` (solo en desarrollo, ver `API_DOCS`). El navegador nunca llama a la API directamente: lo hace Next.js desde el servidor (BFF), y **la autorización siempre se verifica aquí** (SRS 4.4.2).

```bash
pnpm --filter @totalkids/api dev         # http://localhost:4000/api/v1/health
pnpm --filter @totalkids/api test
pnpm --filter @totalkids/api lint
pnpm --filter @totalkids/api typecheck
pnpm --filter @totalkids/api worker:dev  # worker de correos (LN-14) y limpieza de carritos (LN-06), en otra terminal
```

## Qué recorre cada petición

[`src/app.ts`](src/app.ts) monta los middlewares en este orden:

| #   | Pieza                             | Archivo                       | Qué hace                                                                                                                 |
| --- | --------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | `requestId`                       | `middleware/request-id.ts`    | Reutiliza el `X-Request-Id` de Next o genera uno.                                                                        |
| 2   | Log HTTP                          | `lib/logger.ts`               | Una línea por petición. Oculta cookies, tokens, secretos y correos.                                                      |
| 3   | `helmet` y `cors`                 | —                             | Cabeceras de seguridad; CORS solo para `CORS_ORIGINS`.                                                                   |
| 4   | `Cache-Control: no-store`         | `app.ts`                      | Ninguna respuesta de `/api/v1` se cachea.                                                                                |
| 5   | `globalLimiter`                   | `middleware/rate-limit.ts`    | Límite por IP (`RATE_LIMIT_*`). Responde 429.                                                                            |
| 6   | `requireContentType`              | `middleware/body.ts`          | 415 si el cuerpo no es JSON. Formularios solo en los callbacks de Flow; multipart solo en la subida de imágenes (LN-12). |
| 7   | `bodyParsers`                     | `middleware/body.ts`          | JSON de hasta 100 KB (400 si está malformado, 413 si es grande). En Flow, formulario de hasta 16 KB.                     |
| 8   | `csrfProtection`                  | `middleware/csrf.ts`          | Exige el doble envío CSRF en POST/PUT/PATCH/DELETE. Responde 403.                                                        |
| 9   | Routers                           | `routes/*`                    | Tu endpoint.                                                                                                             |
| 10  | `notFound` y `createErrorHandler` | `middleware/error-handler.ts` | 404, y traduce cualquier error a `ErrorBody`.                                                                            |

## Errores

Todas las respuestas de error tienen la misma forma:

```json
{ "code": "VALIDATION_ERROR", "message": "…", "details": { … } | null, "requestId": "…" }
```

El catálogo está en [`src/lib/errors.ts`](src/lib/errors.ts) (`ERROR_CODES`). Next puede tomar decisiones según `code`. El `message` está en español y es para personas, así que puede cambiar.

| code                     | status | cuándo                                                                   |
| ------------------------ | ------ | ------------------------------------------------------------------------ |
| `BAD_REQUEST`            | 400    | JSON malformado u otra petición mal formada                              |
| `UNAUTHORIZED`           | 401    | no hay sesión                                                            |
| `FORBIDDEN`              | 403    | hay sesión, pero sin permiso (rol)                                       |
| `CSRF_FAILED`            | 403    | falta el token CSRF, no coincide u `Origin` es ajeno                     |
| `NOT_FOUND`              | 404    | la ruta o el recurso no existe                                           |
| `METHOD_NOT_ALLOWED`     | 405    | la ruta existe pero no admite ese método (incluye la cabecera `Allow`)   |
| `CONFLICT`               | 409    | duplicado, transición inválida o clave de idempotencia reutilizada       |
| `PAYLOAD_TOO_LARGE`      | 413    | cuerpo sobre el límite                                                   |
| `UNSUPPORTED_MEDIA_TYPE` | 415    | `Content-Type` no permitido                                              |
| `VALIDATION_ERROR`       | 422    | los datos no pasan zod; `details.issues` trae un problema por campo      |
| `RATE_LIMITED`           | 429    | límite superado; `details.retryAfterSeconds` y la cabecera `Retry-After` |
| `INTERNAL_ERROR`         | 500    | cualquier excepción no prevista                                          |
| `DATABASE_UNAVAILABLE`   | 503    | health sin base de datos                                                 |

En los handlers se lanza el error y el manejador se encarga del resto. En Express 5 también funciona dentro de un `async`:

```ts
import { errors } from "../lib/errors.js";

throw errors.notFound("Producto no encontrado");
throw errors.forbidden(); // mensaje por defecto
throw errors.conflict("El SKU ya existe", { field: "sku" });
```

Reglas:

- **Nunca** pongas datos de pago, secretos ni correos en `message` o `details`. En producción, un 500 siempre responde "Error interno del servidor" con `details: null`, y la respuesta nunca lleva stack.
- Si agregas un código nuevo, súmalo también a `ERROR_CODES` y al `enum` de `ErrorBody` en `openapi.yaml`. Un test revisa que coincidan.

## Validación

`validated(schemas, handler)` está en [`src/lib/validation.ts`](src/lib/validation.ts). Valida `params`, `query` y `body` con zod y le entrega al handler los datos **ya parseados y tipados**. Si algo falla, responde 422 con todos los problemas juntos:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Los datos enviados no son válidos",
  "details": {
    "issues": [
      { "location": "body", "path": "items.0.quantity", "message": "Demasiado pequeño: …" }
    ]
  },
  "requestId": "…"
}
```

- Los mensajes salen en español (locale `es` de zod). Para un texto propio: `z.string().min(2, "Ingresa tu nombre")`.
- La respuesta nunca incluye el valor recibido.
- En Express 5, `req.query` es de solo lectura. Usa siempre `input.query`, no `req.query`.
- Para paginar, usa `paginationQuery`, `pageMeta` y `pageWindow` de [`src/lib/pagination.ts`](src/lib/pagination.ts): `?page=1&pageSize=20`, con un máximo de 100. La respuesta lleva `{ items, meta }`.

## Límites de peticiones

Están en [`src/middleware/rate-limit.ts`](src/middleware/rate-limit.ts). Todos responden 429 `RATE_LIMITED` con las cabeceras `RateLimit`, `RateLimit-Policy` (draft-8) y `Retry-After`. Cuentan por la IP real (`req.ip`, vía `TRUST_PROXY`), así que Next **debe reenviar `X-Forwarded-For`**.

| Fábrica                    | Regla                                                                | Úsala en                                                                             |
| -------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `globalLimiter(env)`       | `RATE_LIMIT_MAX` cada `RATE_LIMIT_WINDOW_MS` por IP (300 / 5 min)    | ya montado en todo `/api/v1`                                                         |
| `publicFormLimiter()`      | 10 / 15 min por IP                                                   | `POST /service-requests`, `/newsletter`, `/newsletter/unsubscribe`, `/orders/lookup` |
| `loginIpLimiter()`         | 20 / 15 min por IP                                                   | `POST /auth/login`                                                                   |
| `loginAccountLimiter()`    | **5 fallos por cuenta / 15 min** (solo cuentan las respuestas ≥ 400) | `POST /auth/login` (LN-04)                                                           |
| `createRateLimiter({...})` | la que necesites (`name`, `windowMs`, `limit`, `keyGenerator`)       | casos especiales                                                                     |

- Crea **una instancia por endpoint**, porque cada llamada tiene su propio contador. Todas aceptan overrides, por ejemplo `publicFormLimiter({ limit: 5 })`.
- Los contadores viven en memoria del proceso. Si la API se escala a varias instancias, hay que pasar a un almacén compartido.

Login del panel (LN-04): el límite por cuenta lee `req.body.email`, así que va después del parser JSON (ya montado) y antes de validar:

```ts
router.post(
  "/auth/login",
  loginIpLimiter(),
  loginAccountLimiter(),
  validated({ body: loginBody }, login),
);
```

## CSRF (doble envío firmado)

Las cookies del navegador viven en el dominio de Next.js. Next se las reenvía a la API y devuelve al navegador los `Set-Cookie` que recibe de ella.

1. **Token.** `GET /api/v1/csrf` responde `{ csrfToken }` y fija la cookie `tk_csrf` (`__Host-tk_csrf` en producción), que es `HttpOnly; SameSite=Lax; Path=/` y además `Secure` en producción. El token es `nonce.HMAC(CSRF_SECRET, nonce|sesión)`.
2. **Formulario.** El Server Component pinta un campo oculto con el token (`<CsrfField/>` en apps/web, cuando se conecte la API). Sin JS también funciona, porque un sitio ajeno no puede leer la cookie para fabricar el campo.
3. **Envío.** La Server Action manda a la API:
   - `Cookie`: las cookies del navegador, entre ellas `tk_csrf` y la de sesión o carrito.
   - `X-CSRF-Token`: el valor del campo oculto.
   - `X-Forwarded-For` y `X-Request-Id`, como ya hace `apiFetch`.
4. **Verificación.** En POST/PUT/PATCH/DELETE, la cabecera y la cookie deben ser iguales y la firma debe valer para la sesión actual. Si no, responde 403 `CSRF_FAILED`. Una petición con `Origin` fuera de `CORS_ORIGINS` también se rechaza.
5. **Sesión.** El token está atado a la clave de sesión que entrega `csrfSessionKey(req)` en `createApp`. Por defecto es el hash de la cookie del panel (`panelCsrfSessionKey`, LN-04); si no hay sesión del panel, la del carrito (`cart:<hash>`, LN-06); o `""` sin ninguna. Al crear el carrito la API ya devuelve un token nuevo (ver «Carrito (LN-06)»). Después de iniciar o cerrar sesión, Next vuelve a pedir `/csrf`.
6. **Exenciones**, declaradas en un solo lugar (`FLOW_CALLBACK_PATHS` en `middleware/body.ts`): `POST /payments/flow/confirm` y `POST /payments/flow/return`. Flow no tiene sesión ni token. **Estas rutas no tienen autoridad para acreditar pagos** (RNF-04): solo reciben `token` y la API consulta el estado real a Flow (`getStatus`) antes de confirmar nada (RF-16).

No hace falta hacer nada por endpoint: la protección cubre todo `/api/v1`. En el contrato, agrega `CsrfTokenHeader` a cada operación que modifique (un test lo comprueba).

## Sesión del panel y permisos (LN-04)

Solo el equipo del taller (Administrador y Operador) tiene cuenta: los compradores compran como invitados (UI-09).

- **Ingreso:** `POST /auth/login` abre una sesión nueva y fija la cookie `tk_panel` (`__Host-tk_panel` en producción), HttpOnly y SameSite=Lax. En la base (`sessions`) solo queda el hash SHA-256 del token. Correo inexistente, contraseña errónea y cuenta inactiva responden igual (401).
- **Vencimiento:** 12 h de vida máxima y 2 h sin uso (`SESSION_TTL_MS`, `SESSION_IDLE_MS` en `services/auth.ts`). Se revoca al cerrar sesión (`POST /auth/logout`), al ingresar de nuevo desde el mismo navegador y al restablecer la contraseña. Una cuenta desactivada deja de valer de inmediato.
- **Permisos en backend (RF-31):** todo `/admin` exige sesión (`requirePanel`, montado en `createApp`: denegar por defecto). Cada ruta declara su rol con `requireRole`. El rol se lee de la base en cada petición, así que un cambio de rol rige sin volver a ingresar:

  ```ts
  router.get("/admin/reports/sales", requireRole("admin"), handler); // 401 sin sesión, 403 si es operador
  ```

  Fuera de `/admin`, usa `requirePanel(prisma, isProduction, ...roles)`. La sesión queda en `req.panel` (`user.id`, `user.role`, `user.name`).

- **Recuperación:** `POST /auth/password-reset/request` responde 202 siempre y, si la cuenta existe y está activa, encola el correo `password_recovery` con `enqueueEmail` (`outbox_jobs` con `{ userId }` y su `email_log`). El worker de correos (LN-14) llama a `issuePasswordResetToken(prisma, userId)` al enviar: así el token en claro nunca queda guardado. El token es de un solo uso, vence a los 30 min y solo vale el último. `POST /auth/password-reset/confirm` lo consume, cambia la contraseña y revoca todas las sesiones.
- **Contraseñas:** argon2id (OWASP: 19 MiB, t=2), mínimo 12 y máximo 128 caracteres (`passwordSchema`). Al ingresar se rehace el hash si los parámetros cambiaron.
- **Alta de cuentas:** el CRUD de usuarios del panel llega en LN-16. Mientras tanto:

  ```bash
  pnpm --filter @totalkids/api users:create --email ana@totalkids.cl --name "Ana" --role admin
  ```

  Pide la contraseña sin mostrarla (o la lee de stdin). Nunca la pases como argumento.

- **Auditoría:** el ingreso (`auth.login`) y el restablecimiento (`auth.password_reset`) quedan en `audit_log`.

## Catálogo público (LN-05)

`GET /products`, `GET /products/{slug}` y `GET /categories`, sin sesión. La lógica está en `services/catalog.ts`.

- **Visibles:** producto `active` con `published_at` ya cumplido, categoría activa y al menos una variante activa. Lo demás responde como si no existiera (404 en la ficha).
- **Precio y disponibilidad:** `price` es el menor precio entre las variantes activas (null si ninguna tiene). `availability` es `en_stock` si alguna variante tiene `stock_physical − stock_reserved > 0`; si no, `a_pedido` (UI-11). La ficha trae `available` por variante. Cada producto del listado trae `colors` (los de sus variantes activas) para armar el filtro.
- **Búsqueda sin tildes:** la migración `busqueda_sin_tildes` crea la extensión `unaccent` y la función inmutable `tk_search_normalize(text)`. Cada palabra de `q` (máximo 8) debe aparecer en nombre, resumen, descripción, categoría principal o una categoría adicional activa (RF-02). Los comodines `%` y `_` se escapan.
- **Filtros:** `category`, `ageGroup`, `material` (repetibles o separados por coma), `color` (alguna variante activa con ese color, sin tildes ni mayúsculas: `color=azul marino` encuentra «Azul marino»), `priceMin`/`priceMax` (excluyen productos sin precio), `onSale` y `availability`.
- **Orden:** `best_selling` (por defecto) suma las unidades de pedidos `confirmed` en adelante; empata por destacado y novedad. También `price_asc`, `price_desc` (sin precio al final) y `newest`.
- **Consultas:** el listado arma un solo `WHERE` parametrizado con `Prisma.sql` (RNF-04) para el conteo y la página, y luego carga los productos de la página con Prisma.

## Catálogo admin (LN-12)

Panel de catálogo e inventario (RF-26, RF-34, RN-01 a RN-03). Rutas en [`src/routes/admin-catalog.ts`](src/routes/admin-catalog.ts), reglas en [`src/services/admin-catalog/`](src/services/admin-catalog/). Todo es **solo para el Administrador** (`requireRole("admin")` detrás del `requirePanel` de `/admin`): el Operador recibe 403 también en las lecturas (RF-31). Los métodos que modifican exigen CSRF, como el resto de la API.

### Endpoints

| Método y ruta                                            | Qué hace                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `GET /admin/products`                                    | Listado paginado. `q` (nombre o SKU), `status` (`draft`, `active`, `inactive`), `categoryId`.                   |
| `POST /admin/products`                                   | Crea con variantes, categoría principal y adicionales, y extras. 201.                                           |
| `GET /admin/products/{id}`                               | Ficha completa: variantes (también inactivas) con físico/reservado/disponible, imágenes, extras.                |
| `PATCH /admin/products/{id}`                             | Edita (campos parciales; `variants` y `extras`, si vienen, son la lista completa). Publicar = `status: active`. |
| `DELETE /admin/products/{id}`                            | Desactiva (`inactive`). No borra nada. 204.                                                                     |
| `POST /admin/products/{id}/images`                       | Sube una imagen (`multipart/form-data`: `file`, `alt`, `sortOrder?`, `variantId?`). 201.                        |
| `PATCH /admin/products/{id}/images/{imageId}`            | Cambia `alt` o `variantId`.                                                                                     |
| `PUT /admin/products/{id}/images/order`                  | Reordena: `{ imageIds }` con todas las imágenes del producto.                                                   |
| `DELETE /admin/products/{id}/images/{imageId}`           | Borra la fila y el archivo. 204.                                                                                |
| `POST /admin/products/{id}/stock-adjustments`            | Ajuste de stock: `{ variantId, stockPhysical, reason }`. 201 con la variante y el movimiento.                   |
| `GET /admin/products/{id}/stock-movements`               | Historial (todos los tipos), más reciente primero; filtro `variantId`, paginado.                                |
| `GET /admin/categories`                                  | Todas (activas e inactivas) con `productCount` (principal o adicional, cada producto una vez).                  |
| `POST /admin/categories`, `PATCH /admin/categories/{id}` | Crea o edita (`name`, `description`, `sortOrder`, `active`).                                                    |
| `DELETE /admin/categories/{id}`                          | Desactiva y responde 200 con `productsUsingCount`, `hiddenProductsCount` y `warning`.                           |
| `GET /admin/extras`                                      | Extras que se pueden ofrecer en un producto (armado, nombre grabado…).                                          |

### Reglas

- **SKU:** sin espacios, hasta 40 caracteres, único **sin distinguir mayúsculas**. Se guarda en mayúsculas (`tk-1` → `TK-1`), así el índice único de la base cubre también dos guardados simultáneos (409); antes se compara con `upper(sku)` para dar el error por campo (422, «Ese SKU ya existe. Usa un código único.»).
- **Importes (RN-01):** enteros ≥ 0. `price` puede quedar en `null` mientras el cliente no lo define (borrador). `compareAtPrice` debe ser igual o mayor al precio, como en el panel; **si es igual se guarda `null`** (sin oferta), porque la migración exige `compare_at_price > price`.
- **Publicar** (`status: active`, al crear o editar): categoría principal activa, al menos una variante activa, **todas las activas con precio** y **al menos una imagen con texto alternativo**. Si falta algo, 422 con un issue por campo. La primera publicación fija `publishedAt`. Como las imágenes se suben después de crear, un producto nuevo nace como `draft`.
- **Desactivar no borra (RF-26):** `DELETE` deja el producto `inactive`; la tienda (LN-05) deja de mostrarlo y sus pedidos no cambian (RN-02: los pedidos guardan su propia copia de nombre, SKU y precios).
- **Variantes:** con `id` se actualizan, sin `id` se crean. Una variante que deja de venir en la lista: **con unidades reservadas → 409** (hay pedidos en curso); con historial (pedidos, carritos, reservas o movimientos) → se **desactiva**; sin nada → se borra. El stock físico de una variante existente **no** se cambia al editar el producto (422): va por un ajuste con motivo. El de una variante nueva queda como movimiento «Stock inicial al crear la variante».
- **Opciones:** con más de una variante activa, `optionName` («Tamaño», «Color») y un `optionLabel` distinto por variante son obligatorios.
- **Extras por producto:** `extras: [{ code, price?, textMaxLength? }]` reemplaza la lista. `price`/`textMaxLength` en `null` = los del extra. El largo propio (1–100) solo vale para extras que piden texto.
- **Slug:** se deriva del nombre al crear (`slugify`, igual que el panel) y se hace único (`silla`, `silla-2`). Al editar no cambia, para no romper enlaces.
- **Categorías:** nombre obligatorio (hasta 60), único comparando sin mayúsculas, tildes ni espacios de más; slug derivado y único. Un candado de transacción (`pg_advisory_xact_lock`) evita que dos altas simultáneas pasen el chequeo de nombre. Desactivar no toca los productos: los publicados que la tienen como **principal** dejan de verse en la tienda hasta reasignarlos o reactivarla, y la respuesta lo avisa.
- **Transacciones y auditoría:** cada cambio corre en una transacción y deja su fila en `audit_log` con el actor, un resumen antes/después y el `requestId` (`product.*`, `product_image.*`, `category.*`, `inventory.adjusted`).

### Ajustes de stock (RF-34, RN-03)

`POST /admin/products/{id}/stock-adjustments` fija el **nuevo stock físico absoluto** con un motivo obligatorio (hasta 200 caracteres):

1. Bloquea la fila de la variante con `SELECT … FOR UPDATE`. Un ajuste simultáneo con una reserva (o con otro ajuste) espera a que el otro termine y valida contra los valores ya confirmados: no se pierden actualizaciones.
2. Rechaza (422) un físico menor que lo reservado («El stock físico no puede ser menor que las N unidades reservadas.») o igual al actual (la base exige que un movimiento cambie algo).
3. Actualiza la variante y crea un `InventoryMovement` (`adjustment`, `physicalDelta`, `reservedDelta = 0`, valores finales, actor) y una fila de `audit_log` con el motivo.

Stock 0 no es «agotado»: el producto se vende a pedido con su plazo (UI-11). El historial (`stock-movements`) muestra fecha, actor (rol y nombre), SKU, físico y reservado antes → después, motivo y pedido.

### Imágenes en desarrollo

- **Subida sin dependencias:** `POST /admin/products/{id}/images` es la única ruta que acepta `multipart/form-data` (`isImageUploadPath` en `middleware/body.ts`; en cualquier otra ruta, 415). [`lib/multipart.ts`](src/lib/multipart.ts) junta el cuerpo con un tope de 2 MB + 64 KB (413 en cuanto lo pasa; si `Content-Length` ya lo supera, ni lo lee) y lo entrega a `Request.formData()`, que trae Node. La protección CSRF no cambia: va en cabecera y cookie.
- **Validación:** JPG, PNG o WebP **reconocidos por sus bytes iniciales** ([`services/images/image-bytes.ts`](src/services/images/image-bytes.ts)), no por la extensión ni por el tipo que declara el navegador; máximo 2 MB (413); `alt` obligatorio (hasta 160). Ancho y alto se leen del encabezado.
- **Almacenamiento:** puerto `ImageStorage` ([`services/images/storage.ts`](src/services/images/storage.ts)) con el adaptador `LocalDiskImageStorage`: guarda en `IMAGES_DIR/products/<uuid>.<ext>` (nombre generado por el servidor, nunca el del archivo subido) y guarda en `product_images.url` la URL `IMAGES_PUBLIC_URL/products/<uuid>.<ext>`. Primero se escribe el archivo y luego la fila; si la fila falla, se borra el archivo.
- **Servidas por la API solo fuera de producción:** `/uploads` (p. ej. `http://localhost:4000/uploads/products/….webp`) con `Cross-Origin-Resource-Policy: cross-origin` (para que la tienda en :3000 las muestre), `nosniff`, sin listado de carpetas y caché de 1 h. La carpeta `uploads/` está en `.gitignore`.
- **Tests:** usan una carpeta temporal y la borran al terminar; los casos que escriben corren en una transacción que se deshace (`inRollback` en `test/panel-helpers.ts`) para no alterar los conteos exactos de `catalog.db.test.ts`.

### Qué falta para producción

La SRS deja el almacenamiento de imágenes como dependencia externa (PR-05). Nada de esto está implementado; queda documentado:

- **Opción principal (hosting en VPS):** usar el mismo `LocalDiskImageStorage` en producción, con `IMAGES_DIR` en un **volumen persistente** del VPS (fuera de la carpeta de la app, para que un deploy no lo borre). Lo sirve el proxy (Caddy o Nginx) bajo `/uploads` (la API no lo sirve en producción) con caché larga (los nombres no se reutilizan), `X-Content-Type-Options: nosniff`, sin listado de carpetas y sin ejecutar nada de esa carpeta. `IMAGES_PUBLIC_URL` pasa a ser la URL https pública (p. ej. `https://<dominio>/uploads`; obligatoria con https en producción). La carpeta entra en el **respaldo diario cifrado** junto con la base (DE-07, RNF-07).
- **Alternativa:** si el hosting final no tiene disco persistente, un adaptador externo (S3, R2 o Cloudinary) que implemente `ImageStorage` (`save`, `delete`, `keyFromUrl`) y se pase en `createApp({ imageStorage })`. Las validaciones de la ruta no cambian.
- **En ambos casos:** permitir el dominio de las imágenes en `next/image` (`remotePatterns`) al conectar el panel (LN-16), y una limpieza periódica de archivos huérfanos (p. ej. si se cae el proceso entre guardar el archivo y la fila).

## Carrito (LN-06)

Carrito del invitado en servidor (RF-05 a RF-08, RN-01, RN-04). Rutas en [`src/routes/cart.ts`](src/routes/cart.ts) y [`src/routes/shipping.ts`](src/routes/shipping.ts); reglas en [`src/services/cart/`](src/services/cart/), [`src/services/coupons.ts`](src/services/coupons.ts) y [`src/services/shipping/`](src/services/shipping/). No hay cuentas de comprador, así que tampoco hay fusión de carritos al iniciar sesión.

### Endpoints

| Método y ruta             | Qué hace                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET /cart`               | Carrito calculado. Sin cookie (o vencido) responde vacío **sin crear filas**.                         |
| `POST /cart/items`        | `{ sku, quantity, extras?: [código], texts?: { código: texto } }`. Crea el carrito si no existe. 201. |
| `PATCH /cart/items/{id}`  | `{ quantity }` de 1 a 9. Para quitar, `DELETE`.                                                       |
| `DELETE /cart/items/{id}` | Quita la línea.                                                                                       |
| `POST /cart/coupon`       | `{ code }`. Uno por carrito: aplicar otro lo reemplaza.                                               |
| `DELETE /cart/coupon`     | Quita el cupón.                                                                                       |
| `GET /shipping/quote`     | `?method=retiro` o `?method=despacho&region=RM&commune=Ñuñoa`. Cotiza sobre el carrito propio.        |

Todas las respuestas del carrito tienen la misma forma (`Cart` en el contrato): `lines` (con `status`, precios, extras, `availability` y `notices`), `notices` del carrito, `coupon`, `totals` (`units`, `subtotal`, `discount`, `totalWithoutShipping`, `unpriced`), `freeShipping` y `canCheckout`. **Los importes salen solo de aquí** (RNF-03).

### Sesión

- Cookie `tk_carrito` (`__Host-tk_carrito` en producción): HttpOnly, SameSite=Lax, `Path=/` y Secure en producción. Lleva un token aleatorio de 256 bits; en `carts.guest_token_hash` queda solo su SHA-256. Un valor con otro formato (como la cookie JSON que usa hoy la tienda) se ignora.
- Se crea con el primer `POST /cart/items`. `GET /cart`, la cotización y un cupón sin carrito no crean filas.
- **Expiración deslizante:** `CART_TTL_DAYS` (30 por defecto) desde el último uso. Para no escribir en cada lectura, la fecha y la cookie se renuevan como mucho una vez por hora. Un carrito vencido se trata como inexistente; el worker borra los vencidos cada hora (`purgeExpiredCarts`, líneas y extras en cascada).
- **Solo el carrito propio:** nunca se recibe un id de carrito. Un id de línea de otro carrito, inexistente o mal formado responde 404 igual.

### CSRF con carrito

La clave de sesión del CSRF (`combinedCsrfSessionKey` en [`middleware/cart-session.ts`](src/middleware/cart-session.ts)) es la del panel si hay sesión del panel (sin cambios respecto de LN-04) y si no `cart:<hash>` del carrito, o `""` sin ninguna. Al **crear** el carrito la clave pasa de `""` a la del carrito, así que esa misma respuesta trae un token nuevo: `Set-Cookie: tk_csrf` y la cabecera `X-CSRF-Token`. Con sesión del panel abierta no cambia nada.

### Reglas

- **Líneas (RF-05):** variante activa de un producto visible en la tienda (misma condición que LN-05, `visibleProduct`); si no, 404 «Este producto ya no está disponible.». Los extras se piden por código y deben estar ofrecidos por el producto (`product_extras`) y disponibles. Si el extra pide texto, es obligatorio y respeta el largo efectivo (el del producto o el del extra; 422 «Revisa el nombre del niño (máximo 12 caracteres).»). Precio efectivo del extra: el del producto o el del extra; `null` = por confirmar (no suma, se lista en `totals.unpriced`, no bloquea).
- **Combinación:** `line_key` = SKU + hash de los extras ordenados y sus textos normalizados (NFC, sin espacios al borde ni repetidos; se conservan mayúsculas y tildes). La misma combinación suma cantidad; otra es otra línea.
- **Límites (422, con los textos de la tienda):** 1 a 9 unidades por línea y 9 por SKU sumando líneas («Solo puedes agregar N unidades más.», «Ya tienes 9 unidades…»); 30 líneas («El carrito admite hasta 30 productos distintos.»). Una variante sin precio no se puede agregar.
- **Revalidación (RF-06) en cada lectura:** precio actual de variante y extras; producto o variante inactivos → `status: unavailable`, fuera de los totales y aviso; variante que perdió el precio → `unpriced` y `canCheckout: false`; extras retirados → aviso y dejan de sumar. **Leer no borra nada** (si Next lee dos veces, el aviso no se pierde): la siguiente escritura limpia (borra las líneas no vendibles, quita extras retirados juntando líneas que quedan iguales con el tope de 9, y quita el cupón que dejó de valer) y devuelve los avisos en `notices` («Un producto ya no está a la venta y lo quitamos.», «Quitamos un servicio…», «Ajustamos la cantidad a 9…»). No hay aviso de «cambió el precio» (el carrito no guarda precios): siempre se muestra el precio y el total actuales, y LN-09 compara con el total que confirmó el comprador.
- **Disponibilidad:** no bloquea (cambio del cliente: stock 0 se vende a pedido). `availability.status` es `en_stock`, `mixto` («Reserva: N en stock, el resto a pedido») o `a_pedido` («Reserva a pedido: se fabrica al confirmar»), con el plazo del producto. Agregar al carrito **no reserva stock** (RN-04).
- **Despacho gratis (RF-08):** `freeShipping` compara el umbral (`settings.free_shipping_threshold`) con **subtotal − descuento**; `null` sin umbral. En la cotización solo aplica a zonas activas y elegibles, nunca al retiro.

### Cupón (RF-07, RN-01)

- Código normalizado (mayúsculas, sin espacios). Válido si está activo, vigente **hoy en días de Chile** (America/Santiago, ambos extremos inclusive) y con cupo (`usesCount < maxUses`).
- Descuento solo sobre el subtotal elegible (productos y extras con precio, nunca el despacho). Porcentaje redondeado al peso más cercano (0,5 hacia arriba); nunca mayor que ese subtotal. No se acumulan.
- Rechazos 422 con los textos de la tienda: «Escribe el código de tu cupón.» y «El cupón «X» no existe o ya no está vigente.» (para inexistente, inactivo, futuro, vencido o agotado; el motivo va en `details.reason`), y «Agrega productos antes de aplicar un cupón.» (`empty_cart`).
- Se revalida en cada lectura: si deja de valer, `coupon.valid: false`, descuento 0 y aviso «El cupón «X» ya no está vigente y no se aplica.»; la siguiente escritura lo quita.
- **En el carrito no se reserva uso.** Para los pedidos (LN-09, LN-15), en la misma transacción del pedido:

  ```ts
  import {
    consumeCouponUse,
    CouponUnavailableError,
    releaseCouponUse,
    reserveCouponUse,
  } from "../services/coupons.js";

  await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({ data: {/* …, couponId, couponCode, discount */} });
    if (cart.coupon?.valid) {
      // Lanza CouponUnavailableError si otro pedido se llevó el último uso → 409 al comprador.
      await reserveCouponUse(tx, { couponId, orderId: order.id, discount: cart.totals.discount });
    }
  });
  await prisma.$transaction((tx) => consumeCouponUse(tx, orderId)); // al confirmar el pago
  await prisma.$transaction((tx) => releaseCouponUse(tx, orderId)); // al vencer o cancelar sin pagar
  ```

  `reserveCouponUse` hace un `UPDATE coupons SET uses_count = uses_count + 1 WHERE … AND uses_count < max_uses AND vigente` y crea `coupon_redemptions` (`reserved`): con compras simultáneas PostgreSQL bloquea la fila y reevalúa la condición, así que nunca se pasa de `max_uses` (además de la restricción `uses_count ≤ max_uses` de la base). `consumeCouponUse` (`reserved → consumed`) y `releaseCouponUse` (`reserved → released` y devuelve el cupo) son idempotentes y devuelven `true` solo si cambiaron algo; un uso consumido no se libera.

### Cotización de entrega

`GET /shipping/quote` responde `{ method, cost, reason, leadTime, pickupDetails, zone, freeShipping, message, totals }`:

| Caso                                                  | `cost` | `reason`       |
| ----------------------------------------------------- | ------ | -------------- |
| Retiro en taller habilitado (`pickupDetails`)         | 0      | `pickup`       |
| Zona activa y elegible, subtotal − descuento ≥ umbral | 0      | `threshold`    |
| Zona activa con tarifa                                | tarifa | `zone`         |
| Zona activa sin tarifa («por confirmar»)              | null   | `pending_rate` |
| Comuna sin zona activa («a coordinar»)                | null   | `coordinate`   |

Retiro deshabilitado → 422. La comuna se compara sin tildes ni mayúsculas. `totals.total` = subtotal − descuento + despacho; un `cost: null` no se suma (RF-11).

La cotización pasa por el **puerto `ShippingQuoter`** ([`services/shipping/quoter.ts`](src/services/shipping/quoter.ts)). Hoy lo implementa `ZoneShippingQuoter` (zonas y configuración del panel) y se puede reemplazar en `createApp({ shippingQuoter })`. Existe para poder sumar más adelante un adaptador de courier (p. ej. Blue Express) **sin cambiar el carrito ni la ruta**; no hay nada de courier implementado.

### Cómo lo conecta LN-07 desde Next.js

1. En cada llamada al carrito, el servidor de Next reenvía la cabecera `Cookie` del navegador (con `tk_carrito` y `tk_csrf`), `X-Forwarded-For` y `X-Request-Id`, como ya hace `apiFetch`.
2. Releva al navegador **todos** los `Set-Cookie` que responde la API (`tk_carrito` al crear o renovar; `tk_csrf` al crear el carrito) con `cookies().set(...)` en la Server Action o Route Handler.
3. En las escrituras envía `X-CSRF-Token`. Si la respuesta trae la cabecera `X-CSRF-Token`, ese es el token para el siguiente formulario.
4. Reemplaza la cookie JSON actual (`CookieCartStore`) por estas llamadas: la API ya no acepta ese formato. Los ids de línea pasan a ser `CartLine.id` (uuid). Los textos de avisos, cupón, disponibilidad y despacho gratis ya vienen en español desde la API; el aviso de despacho gratis debe usar `freeShipping.remaining` (después del descuento).

## Formularios públicos (LN-08)

Solicitudes de servicio y newsletter, sin sesión: CSRF (middleware global) y límites por IP. Rutas en [`src/routes/forms.ts`](src/routes/forms.ts); reglas en [`services/service-requests.ts`](src/services/service-requests.ts) y [`services/newsletter.ts`](src/services/newsletter.ts).

| Ruta                                | Qué hace                                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /service-requests`            | Guarda la solicitud (RF-24) con la privacidad aceptada (fecha y versión) y encola el acuse al solicitante y el aviso a `EMAIL_ADMIN_TO`. 201 `{ reference: "SOL-1002" }`. |
| `POST /newsletter`                  | `{ email, consent: true, consentVersion }` (RF-25). Alta, renovación del consentimiento o reactivación tras una baja. 202 siempre.                                        |
| `POST /newsletter/unsubscribe-link` | `{ email }`. Si está suscrito, encola `newsletter_unsubscribe`. 202 siempre (no revela quién está en la lista). 5 por IP / 15 min y 3 por correo / hora.                  |
| `POST /newsletter/unsubscribe`      | `{ token }` del enlace `/suscripcion/baja?token=…`. 204; repetirlo responde igual; un token ajeno, 404.                                                                   |

- **Baja con credencial (RF-35):** con solo el correo nadie puede dar de baja a otra persona. El worker emite el token al enviar el correo (como la recuperación de contraseña): en la base queda solo su hash (`unsubscribe_token_hash`) y solo vale el último enlace enviado. Volver a suscribirse cambia el hash, así los enlaces viejos dejan de servir.
- **La baja no borra nada:** queda `unsubscribed` con fecha y `unsubscribed_by = "Suscriptor"`; los pedidos no cambian.
- **Pendiente:** el plazo de respuesta de los correos de solicitudes (`RESPONSE_TIME`, "2 días hábiles") y las versiones de los textos (`v1-provisional`) son provisionales hasta CL-02. El seguimiento de solicitudes y suscriptores en el panel llega con LN-13.

## Pedidos admin (LN-13)

Panel de pedidos (RF-27, RF-32, RF-34; RN-04 a RN-06; UI-12). Rutas en [`src/routes/admin-orders.ts`](src/routes/admin-orders.ts) y reglas en [`src/services/admin-orders/`](src/services/admin-orders/). Las reglas puras (`rules.ts`) usan la misma tabla de transiciones y los mismos textos que el dominio del panel (`apps/web/src/features/orders/domain/order-workflow.ts`), así LN-16 muestra lo que devuelve la API; `test/admin-orders-rules.test.ts` lo comprueba. `{id}` es el uuid del pedido o su número visible (`TK-1048` o `1048`).

### Endpoints

| Método y ruta                                        | Roles                   | Qué hace                                                                                                                                                                         |
| ---------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /admin/orders`                                  | Administrador, Operador | Listado paginado. `q` (número, nombre o correo, sin tildes), `status`, `paymentStatus` (`none` = sin intentos), `deliveryMethod`, `invoicePending`, `from`/`to` (días de Chile). |
| `GET /admin/orders/{id}`                             | Administrador, Operador | Ficha: comprador, entrega, factura, líneas, pagos, reembolsos y sus totales, historial, actividad (`audit_log`), correos y `availableTransitions`.                               |
| `PATCH /admin/orders/{id}/status`                    | Administrador, Operador | `{ to, reason, carrier?, code?, restock? }`. 200 con la ficha.                                                                                                                   |
| `POST /admin/orders/{id}/invoice`                    | Administrador, Operador | `{ number, replace?, reason? }`. 201 al registrar, 200 al corregir (`replace` solo el Administrador).                                                                            |
| `POST /admin/orders/{id}/refund-records`             | Administrador           | `{ amount, date, reference, status: requested \| processed }`. 201 con `{ refund, refundTotals }`.                                                                               |
| `PATCH /admin/orders/{id}/refund-records/{refundId}` | Administrador           | `{ status: processed \| failed }`. 200 con `{ refund, refundTotals }`.                                                                                                           |

### Errores

- **422 (forma):** un issue por campo con el texto del panel (`reason`, `carrier`, `code`, `amount`, `date`, `reference`, `status`, `number`). El tope de reembolso también va aquí, en `amount`: «El monto supera lo cobrado: quedan $N por registrar.» o «El pedido ya tiene registrado todo lo cobrado.».
- **409 (estado):** `details.field` dice a qué parte del formulario corresponde:
  - `to`: transición fuera de la tabla, confirmar sin pago confirmado y asentado, despachar sin pago, cancelar o vencer con un pago sin resolver (RN-04);
  - `restock`: reposición ya registrada o pedido no pagado;
  - `form`: reembolso sin pago confirmado, reembolso ya resuelto, factura con boleta, sin pago o ya registrada;
  - `number`: folio repetido en otro pedido (índice único, `P2002`);
  - `amount`: el trigger `refund_records_within_charge` rechazó el reembolso (`check_violation`). Con el pedido bloqueado no debería ocurrir; si ocurre es 409 y nunca 500.
- **403:** el Operador en reembolsos o al corregir un folio. **404:** el pedido o el reembolso no existen (o el reembolso es de otro pedido).

### Reglas

- **Bloqueo:** cada escritura bloquea el pedido (`SELECT … FOR UPDATE`) y valida contra lo ya confirmado. Historial, auditoría, inventario, cupón y correos se confirman juntos o no se confirma nada. Las variantes se bloquean en orden de id.
- **Estados:** la tabla de la SRS. Confirmar a mano exige un pago `paid` **y ya asentado** (sin reservas activas ni cupón reservado: eso lo hace LN-10). Cancelar o vencer libera las reservas (`releaseOrderReservations`, movimiento `release`) y, si no hubo pago, el uso del cupón (`releaseCouponUse`). Cancelar un pedido pagado no devuelve dinero (la auditoría lo avisa) y, con `restock: true`, repone **una sola vez** lo que la venta descontó (reservas `consumed`, movimiento `restock`, RN-06). Una línea a pedido puede tener parte reservada (LN-09): se libera o repone solo esa parte.
- **Retiro en taller (nota para LN-16):** «Despachado» significa «listo para retiro», no pide transportista ni código y encola `order_shipped` con la plantilla de retiro (`pickupDetails`). El panel debería rotular el botón y el estado como «Listo para retiro» cuando `delivery.method = pickup`.
- **Reembolsos (RF-32):** solo el Administrador. Nunca modifican el `Payment` ni el estado del pedido. Monto entero > 0; los `requested` y `processed` no superan lo cobrado (un `failed` libera el tope). La fecha, en días de Chile, no puede ser futura ni anterior al cobro (`paidAt`). Referencia de 3 a 120 caracteres. Registrado como `processed` queda resuelto en el acto. Un `requested` se resuelve una sola vez. Auditoría: `order.refund_recorded` y `order.refund_resolved`.
- **Factura (UI-12):** solo para pedidos con factura y pagados. Folio de solo dígitos (hasta 10), sin ceros a la izquierda, único entre pedidos. Guarda `invoiceIssuedAt`, `invoiceIssuedByUserId` e `invoiceIssuedByLabel`. Administrador y Operador registran el primero (`order.invoice_registered`). Corregir exige `replace: true`, ser Administrador, un motivo y un folio distinto (`order.invoice_replaced`, con antes y después). `replace: true` sin folio previo registra el primero.
- **Correos:** `order_shipped` y `order_delivered` se encolan en la misma transacción con `enqueueEmail` y su `eventKey`, así que repetir no duplica.

### Lo que queda para LN-10 y LN-15

- **Venta de stock al confirmar el pago (LN-10):** pasar las reservas `active` a `consumed`, bajar físico y reservado con un movimiento `sale`, y llamar a `consumeCouponUse`. Hasta entonces el panel no deja confirmar a mano un pedido con reservas o cupón sin asentar.
- **`purchase_confirmed` y `new_sale` (LN-10):** se encolan al verificar el pago, no desde el panel.
- **Vencimiento automático (LN-15):** el job que vence los pedidos sin pagar al pasar `paymentDueAt` debe reutilizar `releaseOrderReservations` (en `services/admin-orders/inventory.ts`) y `releaseCouponUse` dentro de su transacción, con el pedido bloqueado y respetando RN-04 (no vencer con un pago pendiente o en revisión).

## Correos y worker (LN-14)

Correos transaccionales de la SRS 4.4.3 (RF-20, RF-21). El código está en [`src/services/email/`](src/services/email/) y el proceso del worker en [`src/worker.ts`](src/worker.ts).

### Cómo encolar

El correo nace **dentro de la misma transacción** que la operación de negocio, con `enqueueEmail(tx, …)`. Crea el `outbox_jobs` y el `email_log` con la misma `eventKey`; si la clave ya existe no duplica nada (`ON CONFLICT DO NOTHING`, no aborta tu transacción) y devuelve `{ enqueued: false }`. Si tu transacción hace rollback, el correo tampoco existe.

```ts
import { enqueueEmail } from "../services/email/enqueue.js";
import { emailEventKey } from "../services/email/events.js";

await prisma.$transaction(async (tx) => {
  const order = await tx.order.update({
    where: { id },
    data: { status: "confirmed", paidAt: now },
  });
  await enqueueEmail(tx, {
    event: "purchase_confirmed",
    recipient: order.buyerEmail,
    eventKey: emailEventKey("purchase_confirmed", order.id),
    orderId: order.id,
    data: {
      orderNumber: order.number,
      buyerName: order.buyerName,
      items,
      subtotal,
      discount,
      shippingCost,
      total,
      delivery,
      taxDocument,
    },
  });
  await enqueueEmail(tx, {
    event: "new_sale",
    recipient: env.EMAIL_ADMIN_TO,
    eventKey: emailEventKey("new_sale", order.id),
    orderId: order.id,
    data: { orderNumber: order.number, total, itemCount, deliveryMethod, taxDocument },
  });
});
```

`data` se valida con el esquema del evento (`EMAIL_DATA_SCHEMAS` en `events.ts`): si falta un campo, lanza (es un error de programación). Es una foto del momento y **nunca** lleva contraseñas, tokens ni datos de pago.

| Tarea | Evento                                                                        | Destinatario     | `eventKey`                          | Referencia         |
| ----- | ----------------------------------------------------------------------------- | ---------------- | ----------------------------------- | ------------------ |
| LN-09 | `order_received` (pendiente de pago; ya conectado en `createOrder`)           | comprador        | `order_received:<orderId>`          | `orderId`          |
| LN-09 | `purchase_confirmed` (solo tras verificar el pago)                            | comprador        | `purchase_confirmed:<orderId>`      | `orderId`          |
| LN-09 | `new_sale` (sin datos del comprador)                                          | `EMAIL_ADMIN_TO` | `new_sale:<orderId>`                | `orderId`          |
| LN-09 | `payment_rejected` (`outcome: rejected/cancelled`)                            | comprador        | `payment_rejected:<paymentId>`      | `orderId`          |
| LN-13 | `order_shipped` (transportista y seguimiento; en retiro, «listo para retiro») | comprador        | `order_shipped:<orderId>`           | `orderId`          |
| LN-13 | `order_delivered` (cuidados del producto)                                     | comprador        | `order_delivered:<orderId>`         | `orderId`          |
| LN-08 | `service_request` (`audience: requester`)                                     | solicitante      | `service_request:<id>:requester`    | `serviceRequestId` |
| LN-08 | `service_request` (`audience: admin`)                                         | `EMAIL_ADMIN_TO` | `service_request:<id>:admin`        | `serviceRequestId` |
| LN-04 | `password_recovery` (ya conectado)                                            | cuenta del panel | `password_recovery:<userId>:<uuid>` | —                  |

### Plantillas

`templates/` arma asunto, HTML de marca y texto plano de cada evento (los asuntos coinciden con la vista previa del panel). Todo texto se escapa; importes en CLP y fechas en America/Santiago. Los enlaces son absolutos desde `PUBLIC_SITE_URL` y sin identificadores predecibles: el comprador va a `/seguimiento` (consulta con número y correo); el equipo, a `/admin/pedidos/TK-<n>` y `/admin/solicitudes` (con sesión). La recuperación enlaza a `/admin/restablecer?token=…`: el worker emite el token (`issuePasswordResetToken`) justo al enviar, así nunca queda guardado ni en logs. **Pendiente en apps/web:** la página `/admin/restablecer` (leer `token` de la query, no registrarlo y responder con `Referrer-Policy: no-referrer`).

### El worker

Proceso aparte; puede haber varias instancias. En cada vuelta:

1. Libera los bloqueos vencidos (`processing` más viejo que `EMAIL_WORKER_LOCK_TIMEOUT_MS`): el worker se cayó a mitad del envío y no se sabe si el correo salió, así que queda **incierto**. Nunca se reenvía a ciegas.
2. Reclama hasta `EMAIL_WORKER_BATCH` trabajos `pending` vencidos con `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)`: dos instancias nunca toman el mismo.
3. Envía cada uno y registra en una transacción el `email_attempts`, el estado del correo y el del trabajo:

| Resultado del proveedor                                       | Intento   | Correo      | Trabajo                                                       |
| ------------------------------------------------------------- | --------- | ----------- | ------------------------------------------------------------- |
| 2xx                                                           | `sent`    | `sent`      | `done` (con `provider_message_id`)                            |
| 400, 404, 422 y otros 4xx (destinatario o contenido inválido) | `failed`  | `failed`    | `failed`, sin reintento                                       |
| 401 o 403 (API key o remitente), con alerta de configuración  | `failed`  | `pending`   | reintento, como el caso siguiente                             |
| 429, 500, 502, 503 o sin conexión (ECONNREFUSED, ENOTFOUND…)  | `failed`  | `pending`   | reintento a **1, 5 y 15 min**; luego `dead` y correo `failed` |
| timeout, 504 o conexión cortada después de enviar             | `timeout` | `uncertain` | `failed`, sin reintento                                       |

Un correo `failed`, `dead` o `uncertain` deja un `logger.error` (sin destinatario) como alerta (RNF-15). Al corregir una API key mala, los correos que siguen en reintento salen solos. `SIGINT` y `SIGTERM` terminan el lote en curso y cierran limpio.

### Reenvío manual

`POST /admin/emails/{id}/resend`, solo Administrador y con CSRF. Solo sobre `failed` o `uncertain` (409 si no lo está, si ya hay un reenvío en curso o si es `password_recovery`). En una transacción crea un `email_log` nuevo con `resend_of_id`, su trabajo (un solo intento, con el actor en el payload) y la entrada `email.resent` en `audit_log`, y responde 202. El worker registra el intento **manual con actor** en el registro nuevo y en el original, cuyo estado pasa a reflejar el resultado. Nunca toca el pedido.

### Correr en local

```bash
docker compose up -d                              # PostgreSQL
pnpm --filter @totalkids/api worker:dev           # EMAIL_PROVIDER=fake por defecto
```

Con el adaptador falso (`EMAIL_PROVIDER=fake`, por defecto) no se usa la red: el worker deja el correo `sent` con un `provider_message_id` `fake-…` y registra su intento; en el log aparece `Correo simulado (EMAIL_PROVIDER=fake)`. Revisa `email_log` y `email_attempts` con `pnpm --filter @totalkids/api exec prisma studio`. Los tests siempre usan el falso, aunque se configure Brevo.

Para probar Brevo de verdad (solo con una cuenta de pruebas): `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY` y un `BREVO_SENDER_EMAIL` autorizado en Brevo. **Antes de producción hay que autenticar en Brevo el dominio nuevo del cliente (SPF, DKIM y DMARC).** Ese dominio aún no está definido, por eso el repositorio solo usa `example.com`.

## Crear un endpoint nuevo (ejemplo completo)

`POST /api/v1/newsletter` (LN-08):

```ts
// src/routes/newsletter.ts
import { Router } from "express";
import { z } from "zod";

import { validated } from "../lib/validation.js";
import { methodNotAllowed } from "../middleware/method-not-allowed.js";
import { publicFormLimiter } from "../middleware/rate-limit.js";

const subscribeBody = z.object({
  email: z.email("Ingresa un correo válido").transform((v) => v.trim().toLowerCase()),
  consent: z.literal(true, "Debes aceptar recibir el newsletter"),
});

export function newsletterRouter(deps: {/* repositorios, servicios */}): Router {
  const router = Router();

  router
    .route("/newsletter")
    .post(
      publicFormLimiter(), // 429 si abusan del formulario
      validated({ body: subscribeBody }, async ({ body }, _req, res) => {
        await deps.subscriptions.subscribe(body.email); // Prisma: consultas parametrizadas
        res.status(202).json({ status: "ok" });
      }),
    )
    .all(methodNotAllowed("POST")); // 405 + Allow para los demás métodos

  return router;
}
```

Checklist:

1. **Router** en `src/routes/`, con sus dependencias inyectadas para poder probarlo con mocks. Móntalo en `createApp` (`v1.use(newsletterRouter(...))`).
2. **`validated`** para todo lo que entra: params, query y body. Nada de `req.body` sin validar.
3. **Autorización** en la API: sesión (401) y rol (403) antes de tocar datos (RF-31). En `/admin` la sesión ya se exige; agrega `requireRole(...)`.
4. **Límites**: `publicFormLimiter` en formularios públicos. El límite global ya está.
5. **CSRF**: automático. Desde Next, envía `Cookie` y `X-CSRF-Token`.
6. **Errores** con `errors.*`. Nunca `res.status(4xx).json(...)` a mano.
7. **`methodNotAllowed`** al final de cada `router.route(...)`.
8. **Contrato**: actualiza la operación en `openapi.yaml` (cuerpos, respuestas con `$ref` a `components/responses`, `security`, `x-roles`), quita `[Pendiente …]` y `x-pending-task`, y agrega el path a `IMPLEMENTED` en `test/openapi.test.ts`.
9. **Tests** con supertest y `buildTestApp({ registerRoutes, csrfSessionKey })` de `test/helpers.ts`. `csrfHeaders()` da un par CSRF válido para los POST. Las rutas que tocan modelos se prueban contra la base real en `*.db.test.ts`: `test/global-setup.ts` vacía `totalkids_test` antes de cada corrida.
10. **Logs**: no registres cuerpos. Si un campo sensible nuevo pudiera llegar a un log, súmalo a `REDACT_PATHS` en `lib/logger.ts`.

## Variables de entorno

Están en `.env.example`. Las nuevas de LN-02:

| Variable               | Por defecto                                     | Notas                                          |
| ---------------------- | ----------------------------------------------- | ---------------------------------------------- |
| `RATE_LIMIT_WINDOW_MS` | `300000`                                        | ventana del límite global                      |
| `RATE_LIMIT_MAX`       | `300`                                           | peticiones por IP en la ventana                |
| `CSRF_SECRET`          | aleatorio por arranque (dev/test)               | **obligatorio en producción**, ≥ 32 caracteres |
| `API_DOCS`             | `enabled` (`disabled` si `NODE_ENV=production`) | `/api/docs` y `/api/docs/openapi.json`         |

Las de LN-14 (correos y worker):

| Variable                       | Por defecto                           | Notas                                                                 |
| ------------------------------ | ------------------------------------- | --------------------------------------------------------------------- |
| `EMAIL_PROVIDER`               | `fake`                                | `fake` o `brevo`; en tests siempre `fake`                             |
| `BREVO_API_KEY`                | —                                     | **obligatoria en producción con Brevo**                               |
| `BREVO_API_URL`                | `https://api.brevo.com/v3/smtp/email` |                                                                       |
| `BREVO_SENDER_EMAIL`           | `no-reply@example.com`                | **obligatorio en producción con Brevo**; dominio autenticado en Brevo |
| `BREVO_SENDER_NAME`            | `Total Kids`                          |                                                                       |
| `EMAIL_ADMIN_TO`               | `equipo@example.com`                  | casilla del equipo; **obligatoria en producción con Brevo**           |
| `PUBLIC_SITE_URL`              | `http://localhost:3000`               | enlaces de los correos; **obligatoria y con https en producción**     |
| `EMAIL_SEND_TIMEOUT_MS`        | `10000`                               | sin respuesta = resultado incierto                                    |
| `EMAIL_WORKER_POLL_MS`         | `5000`                                | pausa entre vueltas sin trabajo                                       |
| `EMAIL_WORKER_BATCH`           | `10`                                  | trabajos por vuelta                                                   |
| `EMAIL_WORKER_LOCK_TIMEOUT_MS` | `300000`                              | bloqueo vencido; debe ser mayor que `EMAIL_SEND_TIMEOUT_MS`           |

Las de LN-12 (imágenes del catálogo):

| Variable            | Por defecto                       | Notas                                                                   |
| ------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| `IMAGES_DIR`        | `uploads` (relativa a `apps/api`) | carpeta del adaptador de disco local                                    |
| `IMAGES_PUBLIC_URL` | `http://localhost:4000/uploads`   | base de `product_images.url`; **obligatoria y con https en producción** |

La de LN-06 (carrito):

| Variable        | Por defecto | Notas                                                          |
| --------------- | ----------- | -------------------------------------------------------------- |
| `CART_TTL_DAYS` | `30`        | días sin uso tras los que vence el carrito del invitado (1–90) |
