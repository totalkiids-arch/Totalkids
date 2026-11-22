# apps/api — guía para crear endpoints

API interna de Total Kids: Express 5 + Prisma 7 + zod 4. Base `/api/v1` y contrato OpenAPI en [`openapi.yaml`](openapi.yaml), servido en `/api/docs` (solo en desarrollo, ver `API_DOCS`). El navegador nunca llama a la API directamente: lo hace Next.js desde el servidor (BFF), y **la autorización siempre se verifica aquí** (SRS 4.4.2).

```bash
pnpm --filter @totalkids/api dev         # http://localhost:4000/api/v1/health
pnpm --filter @totalkids/api test
pnpm --filter @totalkids/api lint
pnpm --filter @totalkids/api typecheck
```

## Qué recorre cada petición

[`src/app.ts`](src/app.ts) monta los middlewares en este orden:

| #   | Pieza                             | Archivo                       | Qué hace                                                                                             |
| --- | --------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | `requestId`                       | `middleware/request-id.ts`    | Reutiliza el `X-Request-Id` de Next o genera uno.                                                    |
| 2   | Log HTTP                          | `lib/logger.ts`               | Una línea por petición. Oculta cookies, tokens, secretos y correos.                                  |
| 3   | `helmet` y `cors`                 | —                             | Cabeceras de seguridad; CORS solo para `CORS_ORIGINS`.                                               |
| 4   | `Cache-Control: no-store`         | `app.ts`                      | Ninguna respuesta de `/api/v1` se cachea.                                                            |
| 5   | `globalLimiter`                   | `middleware/rate-limit.ts`    | Límite por IP (`RATE_LIMIT_*`). Responde 429.                                                        |
| 6   | `requireContentType`              | `middleware/body.ts`          | 415 si el cuerpo no es JSON. Los formularios solo se aceptan en los callbacks de Flow.               |
| 7   | `bodyParsers`                     | `middleware/body.ts`          | JSON de hasta 100 KB (400 si está malformado, 413 si es grande). En Flow, formulario de hasta 16 KB. |
| 8   | `csrfProtection`                  | `middleware/csrf.ts`          | Exige el doble envío CSRF en POST/PUT/PATCH/DELETE. Responde 403.                                    |
| 9   | Routers                           | `routes/*`                    | Tu endpoint.                                                                                         |
| 10  | `notFound` y `createErrorHandler` | `middleware/error-handler.ts` | 404, y traduce cualquier error a `ErrorBody`.                                                        |

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
5. **Sesión.** El token está atado a la clave de sesión que entrega `csrfSessionKey(req)` en `createApp`. Por defecto es el hash de la cookie del panel (`panelCsrfSessionKey`, LN-04), o `""` sin sesión. **LN-06** le suma la cookie opaca del carrito. Después de iniciar o cerrar sesión, Next vuelve a pedir `/csrf`.
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

- **Recuperación:** `POST /auth/password-reset/request` responde 202 siempre y, si la cuenta existe y está activa, encola `email.password_recovery` en `outbox_jobs` con `{ userId }`. El worker de correos (LN-14) llama a `issuePasswordResetToken(prisma, userId)` al enviar: así el token en claro nunca queda guardado. El token es de un solo uso, vence a los 30 min y solo vale el último. `POST /auth/password-reset/confirm` lo consume, cambia la contraseña y revoca todas las sesiones.
- **Contraseñas:** argon2id (OWASP: 19 MiB, t=2), mínimo 12 y máximo 128 caracteres (`passwordSchema`). Al ingresar se rehace el hash si los parámetros cambiaron.
- **Alta de cuentas:** el CRUD de usuarios del panel llega en LN-16. Mientras tanto:

  ```bash
  pnpm --filter @totalkids/api users:create --email ana@totalkids.cl --name "Ana" --role admin
  ```

  Pide la contraseña sin mostrarla (o la lee de stdin). Nunca la pases como argumento.

- **Auditoría:** el ingreso (`auth.login`) y el restablecimiento (`auth.password_reset`) quedan en `audit_log`.

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
