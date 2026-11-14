# impl — api-admin-messages

Estado: **hecho**. Código en el working tree de `cv` (sin commits, sin ramas).
Verificación: `mvn -B verify` verde (473 pruebas) y `python3 scripts/ci-summary.py --min-total 90 --min-module 80` verde: total 96,3 %, application 98,8 %, domain 94,2 %, infrastructure 95,3 %. Prueba en vivo con el jar, Postgres 17 y curl (abajo).

## Mapa Tn → test
| Tn | Test |
|---|---|
| T62 | `application/.../ListContactMessagesServiceTest#messagesComeNewestFirstWithoutTheSenderKeyAndTheNextCursor` (orden, cursor `next`, última página sin `next`, y el registro `ContactMessageEntry` solo tiene id/name/email/body/createdAt) |
| T142 | `infrastructure/.../AdminMessagesResourceTest#messagesArePaginatedNewestFirstWithoutIpHashAndNeedAToken` (mensajes enviados por `POST /api/v1/contact/messages`; paginados; ni `ip_hash` ni `senderKey` en el JSON; claves exactas; 401 sin token y con `sv` revocado; `Cache-Control: no-store`) |

## Criterio → tests
- R-9 / §4.4 contrato y paginación: T62, T142, `theDefaultLimitIsFiftyAndAFullWalk…`, `sameTimestamp…`, `aNewerIdWithAnOlderDate…`.
- Sin `ip_hash`: T62 (campos del registro), T142 (JSON), `OpenApiDocumentTest#adminContactMessagesOperation…` (el esquema solo tiene 5 propiedades); la consulta SQL nunca selecciona `ip_hash`.
- 401 sin token / `no-store`: T142 y `AdminSecurityTest#everyAdminRouteInOpenApiExceptLoginRejectsARequestWithoutToken` (recorre la ruta nueva al salir en OpenAPI).
- 400 en `limit`/`before` inválidos: `anInvalidCursor…`, `anInvalidOrOutOfRangeLimit…`.
- Swagger completo (200/400/401/500 con ejemplos, `bearerAuth`, parámetros descritos): `OpenApiDocumentTest#adminContactMessagesOperation…` y `everyEndpointIsPresentAndOnlyThose`.
- Capas y una interfaz por caso de uso: `ArchitectureTest` (verde sin cambios).

## Extras fuera del plan
- Application (`ListContactMessagesServiceTest`): página exacta sin `next`, lista vacía, cursor inexistente, `limit` acotado (pide limit+1; 0/negativo → 1, enorme → 100), mismo `created_at` con paginación sin repetidos ni huecos.
- Infra (`AdminMessagesResourceTest`): límite por defecto 50 y recorrido completo de 55 mensajes sin repetir, mismo `created_at` orden estable por id, id mayor con fecha más antigua sigue el orden por fecha, tabla vacía, cursor inexistente/pasado el último → lista vacía 200, cursor `-1/0/abc/1.5/" "/SQL` → 400 (y la tabla sigue intacta), cursor que desborda `long` → 400, `limit` `0/-3/101/100000/99999999999/abc/2.5/" "` → 400 y bordes 1 y 100 → 200, valor vacío = ausente, DELETE/POST → 405.
- `OpenApiDocumentTest#adminContactMessagesOperation…` y ruta añadida a `everyEndpointIsPresentAndOnlyThose`.
- `SubmitContactMessageServiceTest`: el repositorio pasó de lambda a clase anónima (la interfaz ahora tiene 2 métodos); sin cambio de comportamiento.

## Código nuevo / tocado (repo `cv`)
- application: `contact/ContactMessageEntry`, `contact/ContactMessagePage`, `port/in/ListContactMessagesUseCase`, `service/ListContactMessagesService`, `port/out/ContactMessageRepository` (+`findNewestFirst(Long before, int limit)`; `save` intacto).
- infrastructure: `adapter/out/postgres/PostgresContactMessageRepository` (+lectura), `adapter/in/rest/AdminMessagesResource`, `AdminMessagesModels`, `AdminMessagesExamples`, `config/UseCaseConfig` (+1 productor).
- Sin migración nueva: `contact_message` y su índice `created_at DESC` ya existen (V2). Sin código de error nuevo ni cambios en `problems_*.properties`.

## Decisiones tomadas durante la implementación
1. **Cursor = id** (`next` es el id del último mensaje devuelto, como cadena `"40"`, §4.4). La clave real es `(created_at DESC, id DESC)`: `WHERE (created_at, id) < (SELECT created_at, id FROM contact_message WHERE id = ?)`. Si el cursor no existe, la subconsulta da NULL y la lista sale vacía (200, `next: null`): no se inventa un 404 porque no hay borrado y un cursor viejo no es un error del cliente.
2. **`next` solo si hay más**: el servicio pide `limit+1` filas; si llega la extra, `next` = id del último devuelto; si no, `null` (el campo se emite siempre, con `null`).
3. **Validación en el recurso (transporte), acotado en el servicio**: `limit` ∈ 1..100 (por defecto 50) y `before` ≥ 1 se reciben como `String` y se parsean a mano para que cualquier valor malo dé el `400 BAD_REQUEST` estándar (con `int` directo, RESTEasy podría dar 404). El servicio además acota por defensa (como `ListContentVersionsService`). Un `limit` enorme es 400, no se corrige en silencio. No hay código de error nuevo.
4. **Valor vacío (`?limit=`) cuenta como ausente** (RESTEasy lo entrega como `null`): usa el valor por defecto.
5. **El registro de aplicación `ContactMessageEntry` no tiene campo de clave de remitente**: la garantía de «nunca `ip_hash`» es estructural (la consulta no lo selecciona, el tipo no lo puede llevar, el DTO tampoco).
6. Sin logs con datos personales: ni el recurso, ni el servicio ni el adaptador registran nada de los mensajes; el fallo SQL solo lleva un texto fijo.
7. Orden de la nueva ruta en seguridad: la cubre `AdminSessionFilter`/política `/api/v1/admin/*` ya existente; no se duplicó nada.

## Contrato final
`GET /api/v1/admin/contact-messages?limit=<1..100, def. 50>&before=<id ≥ 1>` · `Authorization: Bearer <jwt>` · `Cache-Control: no-store`.
200:
```json
{ "messages": [ { "id": 41, "name": "Ada Ejemplo", "email": "ada@example.com", "body": "…", "createdAt": "2026-11-12T09:30:00Z" } ], "next": "40" }
```
`next` es `null` en la última página; `before` inexistente o pasado el último → `{"messages":[],"next":null}`.
Errores (problem+json): 400 `BAD_REQUEST` (`limit`/`before` no entero o fuera de rango), 401 `ADMIN_UNAUTHORIZED` (sin token, caducado o revocado), 500 `UNEXPECTED`. 405 para otros métodos. Operación `adminListContactMessages`, etiqueta `Admin`, `bearerAuth`.

## Prueba en vivo (jar de producción, Postgres 17, curl)
Cuenta creada con `AdminPasswordTool` (pty), login real y 4 `POST /api/v1/contact/messages` con distintas `CF-Connecting-IP` (4 × 201):
- `?limit=2` → 200, `Cache-Control: no-store`, ids 4 y 3, `next:"3"`; `?limit=2&before=3` → ids 2 y 1, `next:null`; sin parámetros → los 4.
- `limit=0`, `limit=101`, `limit=abc`, `before=-1`, `before=abc` → 400 `BAD_REQUEST` problem+json; `before=999` → 200 lista vacía; sin token → 401 `ADMIN_UNAUTHORIZED`.
- `ip_hash`/IP: 0 apariciones en la respuesta completa (grep de `ip_?hash` y de `203.0.113`). El log del jar no contiene correos ni textos de los mensajes.
- `/openapi.json`: `adminListContactMessages` con respuestas 200/400/401/500.
- Contenedor y proceso eliminados.

## Límites abiertos
- Un solo administrador y una sola instancia, como en los slugs anteriores. Borrado y «leído» fuera de alcance por decisión (R-9).
- README/ARCHITECTURE/CLAUDE y smoke test no se actualizaron: son del slug `api-admin-docs-deploy`.

## Correcciones de la ronda 1 (review.md)
1. `AdminMessagesResourceTest#messagesArePaginatedNewestFirstWithoutIpHashAndNeedAToken` (T142) construía `CF-Connecting-IP` con `"198.51.100." + hashCode() % 200 + i` (podía no ser una IP válida). Ahora usa IPs válidas y distintas por iteración (`203.0.113.11..13`) y comprueba en BD que las 3 filas tienen `ip_hash` de 64 hex (SHA-256), distintos entre sí y sin la IP en claro, y que aun así no aparece en la respuesta. Se quitó el import `UUID` que quedó sin uso.
2. Otros sitios con el patrón: solo ese. `ContactMessagesResourceTest.freshIp()` (preexistente, de otro slug) genera `203.0.113.N-<uuid>`, que tampoco es una IP válida pero allí solo importa que sea única por remitente; no se toca.
3. Re-verificación: `mvn -B verify` verde (473 pruebas, `AdminMessagesResourceTest` 10/10) y ci-summary 90/80 rc=0 (total 96,3 %).
