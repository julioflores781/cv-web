# review — api-logging-core

## Veredicto final (ronda 2): APPROVED

Ver «Ronda 2» al final. La ronda 1 (CHANGES REQUESTED) queda abajo como historial.

## Ronda 1: CHANGES REQUESTED

Verificado de forma independiente en el working tree de `cv`: la implementación es sólida y cumple casi todo el alcance, pero hay dos incumplimientos reales (uno de A8, uno de la paridad de rutas admin) que obligan a rechazar. Son arreglos pequeños.

## Verificación ejecutada por mí
- `mvn -B verify` (Docker): BUILD SUCCESS, **531/531** pruebas (366 en `infrastructure`). Repetido al final con `-q`: exit 0.
- `python3 scripts/ci-summary.py --min-total 90 --min-module 80`: exit 0. Total 96,1 %; application 98,8 %; domain 94,2 %; infrastructure 95,0 %.
- Estabilidad: 13 clases de logs/errores (AccessLog, RequestId, RequestIds, ClientIp, ClientIpLogging, RequestContextPropagation, SensitiveDataNotLogged, JsonLogFormat, LogConfig, HealthStaysOnMainPort, ErrorLogDescription, AdminEdgeGuard, ErrorHandling) ejecutadas **10 veces seguidas**, con arranque de Quarkus cada vez: 10/10 exit 0.
- Mutación en una copia (`scratchpad/mut`, el repo no se tocó); las cuatro se detectan:
  | Mutación | Pruebas que fallan |
  |---|---|
  | patrón `%R` -> `%U` (query en el log) | `AccessLogTest.theQueryStringNeverReachesAnyRecord`, `LogConfigTest.theAccessLogPattern...`, `JsonLogFormatTest.theAccessLineInJson...` |
  | `isAdmin` siempre verdadero (IP en rutas públicas) | `ClientIpLoggingTest.publicRequestsNeverLogTheIp...`, `JsonLogFormatTest.theAccessLineInJson...` |
  | `RequestIds.accept` sin patrón (acepta cualquier no vacío) | `RequestIdTest` (6 fallos: 5 casos de T9 + variante RestAssured) |
  | `ErrorLogDescription` sin rama SQL | `SensitiveDataNotLoggedTest.aDatabaseFailure...`, `ErrorLogDescriptionTest` (3 fallos) |
- API real, jar de producción (JSON, `CV_ADMIN_EDGE_BLOCK=true`, Postgres propio, ya borrado) y `quarkus:dev` (texto). Se probaron: público, admin, 404, 413 (con `Content-Length` declarado y con cuerpo real de 200 KB), health, swagger, openapi; sin `X-Request-Id`, válido, inválido con espacios, de 100 caracteres, con `%0d%0a` y con salto de línea crudo por `nc`; `CF-Connecting-IP` y `X-Client-IP` en público y admin; keep-alive (dos peticiones por la misma conexión); y un 500 real con la BD parada.
  - Todas las líneas del JSON de producción parsean como JSON de una línea; `service=cv-api`; sin `sequence/loggerClassName/processName/processId/threadId/hostName/ndc`; `logger` renombrado; `request_id`, `client_ip`, `error_code` planos.
  - Canarios (`CANARY-Q`, `CANARY-RID`, `CANARY-NL`, `198.51.100.x` en rutas públicas): **0 apariciones** en toda la salida de prod y de dev. Los ids inválidos nunca se reflejan (se genera uno de 32 hex). El 413 y los 404 llevan `X-Request-Id` y línea de access. El 404 de sonda admin con `CF-Connecting-IP` y edge-block queda con `ip=` y `rid=` (ids válidos del cliente respetados).
  - Sin fuga entre peticiones: segunda petición por la misma conexión sale con `err=-` tras una previa con `err=NOT_FOUND`, y con su propio `rid`.
  - Health, swagger y openapi: ninguna línea de access; `/q/health/ready` y `/live` en el 8080 (200; 503 con la BD parada, como antes); gestión sin activar.
  - 500 real: `Unexpected database error (SQLState=57P01, class=PSQLException)`, sin traza ni mensaje, con `request_id` y `client_ip` en admin.
- Docker: contenedor `rv-pg` y procesos de la API/dev detenidos.

## Trazabilidad Tn <-> test (revisados leyendo el código del test)
T1 `AccessLogTest.oneAccessLine...` (una sola línea, rid igual a la cabecera, bytes>0) OK · T2 `everyPublicEndpointLeavesItsLine` (13 filas, con `CF-Connecting-IP`) OK · T3 OK · T4 `anOversizedDeclaredBody...` (socket crudo, 413 + cabecera + línea) OK · T5 `healthSwaggerAndOpenApi...` (centinela, `assertEquals(1, lines.size())`, sin sleeps) OK · T6 OK (mutado) · T7-T10 `RequestIdTest` OK (mutado; T9 usa socket crudo, incluida cadena vacía y no ASCII) · T11/T12 `RequestContextPropagationTest` OK · T13 `ErrorHandlingTest` OK · T14 OK · T15/T16 `ClientIpLoggingTest` OK (mutado) · T17 `ClientIpTest` OK · T18 `RequestIdsTest` OK · T19 `AdminEdgeGuardTest` OK · T20 `SensitiveDataNotLoggedTest` OK · T21/T22 `JsonLogFormatTest` OK (archivo con las claves reales de consola copiadas del `application.properties`) · T23 `LogConfigTest` OK · T24/T25 OK (mutado) · T29 `HealthStaysOnMainPortTest` OK.
Criterios A1-A6, A8, A10, A12 mapean a Tn con test real; salvo lo indicado abajo (A8 parcial).

## Cambios requeridos

1. **A8 incumplido: los WARN de refresco de BD vuelcan mensaje de PSQL y traza.** `infrastructure/.../adapter/out/postgres/PostgresResumeRepository.java:83` y `PostgresSiteContentRepository.java:125` hacen `LOG.warnf(e, ...)`. Con la BD parada, el jar de producción emite en el campo `stackTrace` `Caused by: org.postgresql.util.PSQLException: Connection to localhost:55433 refused...` (host/puerto/URL de conexión), y `FATAL: terminating connection...`. El plan lo recomienda (§10 punto 6) y el brief y el encargo de esta revisión lo piden; A8 dice "ningún registro contiene ... el mensaje de excepciones SQL o JDBC". La justificación de impl.md (decisión 4: `ErrorLogDescription` vive en `adapter.in.rest.error` y `ArchitectureTest.outboundAdaptersDoNotUseInboundOnes` lo impide) es válida para ese paquete, pero no impide la solución: mover/exponer la utilidad en un paquete neutro (p. ej. `config`, pública) y usarla desde `ProblemExceptionMapper` y desde los dos repositorios, con un test que fuerce el fallo de refresco y compruebe que no sale mensaje ni traza. No requiere cambiar el diseño.
2. **Paridad de rutas admin: `;` (matrix params) no se trata como admin en `RequestContextHandler`.** `config/RequestContextHandler.java:55-57` (`isAdmin(context.normalizedPath())`) vs `AdminPaths.normalized(request)` (usa `UriInfo.getPath()`). Comprobado en el jar sin edge-block: `GET /api/v1/admin;x=1/auth/session` con `X-Client-IP: 192.0.2.5` llega al recurso admin (401 `ADMIN_UNAUTHORIZED`) pero la línea sale con `ip=-`, mientras que `//`, `/./`, `%61uth`, barra final y `/api//v1/admin` sí registran la IP. No hay fuga (falla hacia no registrar IP) ni bypass de seguridad, pero una fuerza bruta contra el login con `;x=1` evadiría el registro de IP, justo lo que A6/T19 quieren ver. Alinear (quitar `;...` de cada segmento antes de comparar o derivar del mismo criterio que `AdminPaths`) y añadir un test parametrizado de variantes (`//`, `/./`, `%61dmin`, `;x=1`, mayúsculas -> no admin, `/api/v1/adminx` -> no admin). Hoy **no hay ningún test de variantes** de ruta en la línea de IP.

## Skills consultadas
- `simplify`: `RequestContextHandler.java:55` y `AdminPaths.isAdmin` duplican la misma condición (`equals(ADMIN_ROOT) || startsWith(ADMIN_ROOT + "/")`) en dos clases; `AdminPaths` es package-private en `adapter.in.rest`. Al resolver el cambio 2, centralizar el criterio en un único sitio público. Sin otros hallazgos (sin código muerto, sin secretos; los canarios son cadenas ficticias).
- `strict-typing`: sin hallazgos (Java tipado completo, `Optional` en las utilidades, sin `Object` sueltos).
- `testing-strategy`: sin hallazgos en robustez (polling de 10 ms con tope de 5 s, sin sleeps fijos, `copyAll()` del MDC en `LogRecords.publish`); la laguna es el test de variantes de ruta del cambio 2 y el del WARN de refresco del cambio 1.
- `security-best-practices`: no aplica (Java, fuera de los lenguajes soportados); la revisión de log forging/PII se hizo a mano arriba.

## Observaciones fuera de alcance (no bloquean)
- Un 400 del parser HTTP anterior al enrutado (p. ej. cabecera con LF suelto) sale sin `X-Request-Id` ni línea de access; impl.md ya lo documenta. Aceptable.
- Un error con causa Jackson/otra no SQL puede incluir fragmentos del contenido en su mensaje y mantiene la traza por diseño (plan §2.5); revisar cuando se haga el slug de auditoría.
- `exclude-pattern` `^/(q/health|swagger|q/swagger-ui|openapi\.json).*` no puede excluir `/api/v1/...` (comprobado con las 13 filas de T2 y en el jar); `/swaggerXYZ` también se excluiría, irrelevante.
- Hipótesis 7 (`System.Logger` y MDC) queda para el slug 3, como dice impl.md.
- `quarkus.log.console.json.key-overrides=LOGGER_NAME=logger` y `exception-output-type=formatted` desvían del plan con justificación y verificación correctas.
- `ProblemExceptionMapper`: el ERROR `Unexpected error` no lleva `error_code` (se pone después); la línea de access sí. Coherente con el plan.
- Ningún cambio funcional detectado: `ArchitectureTest`, `OpenApiDocumentTest` y `ProblemCatalogTest` verdes; sin cambios en OpenAPI ni `ProblemResponse`.


---

# Ronda 2 — verificación de las correcciones

## Veredicto: APPROVED (Cambios requeridos: ninguno)

### Cambio 1 (WARN de refresco / SQL en logs) — resuelto
- `ErrorLogDescription` ahora es pública en `infrastructure/.../config/ErrorLogDescription.java`; la usan `ProblemExceptionMapper`, `PostgresResumeRepository` (`:86`) y `PostgresSiteContentRepository` (`:128`). El grep de `LOG.*(e, ...)`/`warnf(e` en `src/main` no deja otro sitio que vuelque excepciones (los demás `LOG` son mensajes con `getSimpleName()` o sin excepción). `ArchitectureTest` verde dentro de `verify`.
- Jar de producción con la BD parada: ERROR `Unexpected database error (SQLState=57P01, class=PSQLException)`, 0 campos `stackTrace` en toda la salida, sin `PSQLException:` con mensaje, `refused`, `FATAL`, `Caused by` ni `\tat`. Único `localhost:55433/jdbc:` en la salida: el INFO de arranque de Flyway («Database: jdbc:...»), preexistente y no es una excepción (observación, no bloquea; la URL real de prod lleva el host interno `cv-db`).
- `RefreshWarningLoggingTest` (2 tests: CV y contenido; DataSource proxy que lanza `SQLException` con host/URL/`hunter2`): comprueba SQLState, sin traza y que no salen `hunter2/secreto/jdbc:/refused/5432/PSQLException/\tat`. Mutación en copia (volver a `LOG.warnf(e, ...)`): fallan los dos.

### Cambio 2 (criterio admin único) — resuelto
- Un solo criterio: `config/AdminRoutes.isAdmin` (quita `;...` por segmento y compara con `/api/v1/admin[/...]`). Lo usan `RequestContextHandler:43`, `AdminEdgeGuard:31`, `AdminSessionFilter:27` y `ApiCacheHeaders:19`; `AdminPaths.isAdmin` y sus constantes duplicadas desaparecieron. Quedan solo `startsWith("/api/v1/admin/images")` (`ProblemExceptionMapper:76`, criterio específico de imágenes) y `startsWith("/api/v1/admin")` (`OpenApiResponseFilter:40`, filtro de documentación): no son el criterio de «ruta admin» de runtime; observación.
- `ClientIpLoggingTest.theIpIsLoggedForExactlyTheRoutesTheAdminZoneOwns` (12 filas): `/api/v1/admin`, barra final, `//api/v1//admin`, `/./`, `%61dmin`, `;x=1` (en `admin` y en `auth`), `/ADMIN` y `/adminx` (no admin), `/profile` (no admin). Mutación en copia (sin quitar matrix params): falla en la fila `admin;x=1`.
- Jar: `GET /api/v1/admin;x=1/auth/session` con `X-Client-IP` -> 401 y `ip=192.0.2.5`; `/api/v1/profile;x=1` con `X-Client-IP` y `CF-Connecting-IP` -> `ip=-`; `%61dmin` -> registra IP; 0 apariciones de `198.51.100.x` y de `CANARY-*`.

### Regresión
- `mvn -B -q verify`: exit 0; `ci-summary.py --min-total 90 --min-module 80`: exit 0.
- Las 15 clases de logs/errores/refresco ejecutadas **10 veces**: 10/10 exit 0.
- Jar de producción, pasada rápida: público, 404, 413 (con `Content-Length` declarado), health/swagger/openapi 200, admin, con y sin `X-Request-Id` (válido respetado; inválido con espacios reemplazado por 32 hex): todas las respuestas llevan `X-Request-Id`; JSON válido; 500 real saneado.
- Limpieza: procesos del jar y contenedor `rv-pg` eliminados; sin contenedores propios activos (los `testcontainers-ryuk` se autolimpian).

### Skills consultadas (ronda 2)
- `simplify`: sin hallazgos (la duplicación de `isAdmin` quedó centralizada).
- `strict-typing`: sin hallazgos.
- `testing-strategy`: sin hallazgos (ambos arreglos tienen test que falla al revertirlos).
