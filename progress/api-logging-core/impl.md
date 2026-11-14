# impl — api-logging-core

Estado: **HECHO** (todos los hitos; incluye las correcciones de la ronda 1 del reviewer, ver sección final). Repo `cv`, cambios solo en el working tree (sin git de escritura). Sin cambios de comportamiento de endpoints salvo la cabecera `X-Request-Id`.

Verificación: `mvn -B verify` OK (531 pruebas, 0 fallos: 366 en `infrastructure`); `python3 scripts/ci-summary.py --min-total 90 --min-module 80` OK (total 96,1 %; application 98,8 %, domain 94,2 %, infrastructure 95,0 %). Estabilidad: las 13 clases de pruebas de logs (72 tests) ejecutadas **12 veces seguidas** con arranque de Quarkus cada vez: 12/12 verdes. Prueba de mutación: con `%U` en el patrón fallan T6 y `LogConfigTest` (el test sí detecta una fuga de query).

## Mapa Tn -> test
| Tn | Test | Archivo (`cv/infrastructure/src/test/java/dev/julioflores/cv/infrastructure/`) |
|---|---|---|
| T1 | `oneAccessLineWithMethodPathStatusDurationAndBytesAndTheResponseRid` | `AccessLogTest` |
| T2 | `everyPublicEndpointLeavesItsLine` (parametrizado, 13 filas) | `AccessLogTest` |
| T3 | `anUnknownRouteLeavesA404Line` | `AccessLogTest` |
| T4 | `anOversizedDeclaredBodyIsLoggedAs413AndAnswersWithTheRid` (socket crudo, `Content-Length: 200000`) | `AccessLogTest` |
| T5 | `healthSwaggerAndOpenApiLeaveNoAccessLine` (con petición centinela: sin sleeps) | `AccessLogTest` |
| T6 | `theQueryStringNeverReachesAnyRecord` | `AccessLogTest` |
| T7 | `withoutAnIdTheApiGeneratesOneOf32HexThatMatchesTheLog` | `RequestIdTest` |
| T8 | `aValidClientIdIsEchoedAndLogged` | `RequestIdTest` |
| T9 | `invalidIdsAreReplacedAndNeverReflected` (6 casos por socket crudo) + `anInvalidIdViaRestAssuredIsReplacedToo` | `RequestIdTest` |
| T10 | `twoRequestsWithoutAnIdGetDifferentIds` | `RequestIdTest` |
| T11 | `theEventLoopAndTheWorkerThreadBothCarryTheRequestId` (+ variante `@Blocking`) | `RequestContextPropagationTest` (+ `LogProbeResource`) |
| T12 | `twentyConcurrentRequestsNeverMixTheirIds` | `RequestContextPropagationTest` |
| T13 | `theUnexpectedErrorIsLoggedWithTheRequestIdAndTheAccessLineSaysUnexpected` | `ErrorHandlingTest` (ampliado) |
| T14 | `aProblemResponseCarriesItsCodeInTheLine` | `AccessLogTest` |
| T15 | `publicRequestsNeverLogTheIpEvenIfTheyCarryTheHeaders` (incluye POST de contacto) | `ClientIpLoggingTest` |
| T16 | `adminLoginsLogTheValidIpAndIgnoreInvalidOnes` | `ClientIpLoggingTest` |
| T17 | `acceptsIpv4AndIpv6Literals`, `anIpv6ZoneIsDroppedAndAnInvalidZoneRejected`, `rejectsEverythingThatIsNotALiteral`, `neverResolvesNames` | `ClientIpTest` |
| T18 | `acceptsOnlyTheEdgesOfThePattern` | `RequestIdsTest` |
| T19 | `theProbeBlockedByTheEdgeGuardStillLeavesItsLineWithTheIpAndTheRid` | `AdminEdgeGuardTest` (ampliado) |
| T20 | `neitherAnInvalidNorAValidTokenNorTheAuthorizationHeaderAreLogged` | `SensitiveDataNotLoggedTest` |
| T21 | `everyLineIsOneJsonObjectWithTheFlatFieldsAndWithoutTheExcludedKeys` | `JsonLogFormatTest` |
| T22 | `theAccessLineInJsonHasNoIpAndItsMessageFollowsThePattern` | `JsonLogFormatTest` |
| T23 | `testsRunWithTextLogsThatShowTheRequestId` | `LogConfigTest` |
| T24 | `aDatabaseFailureOnAnAdminRouteLeaksNoMessageAndLogsOnlyClassAndSqlState` | `SensitiveDataNotLoggedTest` |
| T25 | `aDatabaseErrorKeepsOnlyTheClassAndTheSqlState`, `anErrorWithoutSqlKeepsItsFullTrace` | `config/ErrorLogDescriptionTest` |
| T29 | `healthAnswers200OnTheMainPortAndManagementIsOff` | `HealthStaysOnMainPortTest` |

Soporte de pruebas nuevo: `LogRecords` (handler JUL, `await` por polling de 10 ms con tope de 5 s, `awaitAccessLine`, `dump()` con mensaje, parámetros, MDC y traza con causas), `LogProbeResource` (test-only, oculto en OpenAPI), `RawResponses` (socket HTTP/1.1 crudo para cabeceras arbitrarias y el 413 por longitud declarada).

### Tests extra fuera del plan (anotados)
- `RequestIdsTest.generatedIdsAre32HexAndDifferent`; `RequestIdTest.theHeaderIsOnEveryKindOfResponse` (404, 405, 500, 401).
- `ClientIpTest.firstValidSkipsInvalidCandidatesInOrder`; `ClientIpLoggingTest.anInvalidCloudflareHeaderFallsBackToXClientIpAndTheCloudflareOneWinsWhenValid`; `ClientIpLoggingTest.aBadIpNeverReachesAnyRecord` (host y tabulador no llegan a ningún registro).
- `ErrorLogDescriptionTest`: SQL enterrado en la cadena de causas, SQLState inesperado (no se copia texto del driver), causa autorreferente sin bucle.
- `LogConfigTest.theAccessLogPatternNeverUsesTokensThatLeakTheQueryTheIpOrHeaders` (garantía de privacidad del patrón).

## Criterios -> tests
- **A1** línea de access con método, ruta, estado, duración y bytes, sin query: T1, T2, T3, T4, T6.
- **A2** sin línea para health/swagger/openapi: T5.
- **A3** `X-Request-Id` en toda respuesta (404 y 413 temprano incluidos), inválidos nunca reflejados: T1, T4, T7, T8, T9, T10 (+ extra de 404/405/500/401).
- **A4** `request_id` en access, errores y hilos de trabajo, sin mezclas: T11, T12, T13.
- **A5** `error_code` en respuestas de problema: T13, T14.
- **A6** sin IP en rutas públicas; en admin solo si es válida: T15, T16, T17, T19, T22.
- **A8** sin tokens, `Authorization`, ni mensajes SQL/JDBC: T20, T24, T25.
- **A10** JSON válido de una línea, `request_id` plano, `service=cv-api`; texto con `[request_id]` en dev/test: T21, T22, T23.
- **A12** health en el 8080 y gestión desactivada: T29.

## Resultado de las hipótesis del plan (§10)
- **Hip. 9 — `%{X,request_id}` / MDC de un handler Vert.x propio: CONFIRMADA.** El MDC puesto en `RequestContextHandler` lo lee el access log (también en 404 de enrutado y en el 413 temprano, que no pasan por JAX-RS) y llega al hilo de trabajo (T11, T12). El plan B (handler propio de access log) no hizo falta.
- **Hip. 9 — `exclude-pattern`: CONFIRMADA.** `^/(q/health|swagger|q/swagger-ui|openapi\.json).*` compara la ruta; T5 y el jar de producción no dejan línea para health, swagger y openapi.
- **REFUTADA (corregida, no es plan B): `%U` NO excluye la query.** En `RequestURLAttribute` es `request.uri()` y la línea salió `GET /api/v1/profile?lang=en&token=CANARY-Q 200` (visto en el jar). La ruta sin query es **`%R`** (`RequestPathAttribute` → `request.path()`). Patrón final: `%m %R %s %Dms %Bb rid=%{X,request_id} err=%{X,error_code} ip=%{X,client_ip}`. Un token ausente sale como `-`. T6 y `LogConfigTest` lo vigilan (comprobado por mutación).
- **Hip. 10 — `excluded-keys`: CONFIRMADA** con los nombres JSON (`sequence,loggerClassName,processName,processId,threadId,hostName,ndc`; se añadió `ndc`, que salía vacío). **`key-overrides`: la sintaxis del plan era incorrecta**: `loggerName=logger` falla al arrancar (`No enum constant ...StructuredFormatter.Key.LOGGERNAME`); la clave es el nombre del enum: **`LOGGER_NAME=logger`** (valores: `LOGGER_NAME`, `LEVEL`, `MESSAGE`, `TIMESTAMP`, `STACK_TRACE`, …). Se verificó con el jar y con T21.
- **Añadido: `exception-output-type=formatted`.** Por defecto la traza sale como objeto `exception{frames:[…]}`; con `formatted` sale como un campo `stackTrace` de texto (sigue siendo una línea JSON). Nota: el valor empieza por `: ` (quirk del formateador).
- **Hip. 7 (`System.Logger` de `application` y MDC): NO verificada aquí** (ningún T de este slug la cubre; pertenece al slug 3 `api-business-events`, T11/T13 solo la cubren con loggers JBoss).
- **Hallazgo de pruebas:** el `ExtLogRecord` lee el MDC del hilo que escribe de forma perezosa; un handler de captura debe llamar a `copyAll()` en `publish` o el MDC sale vacío (lo hace `LogRecords`).
- `LogCapture` no existe en Quarkus 3.40.1 (confirmado); se usa `LogRecords`.

## Decisiones tomadas
1. **Orden del handler -3**, antes de `RequestBodyLimits` (-1), para que el 413 temprano lleve `X-Request-Id` y MDC (T4).
2. **`ClientIp`**: acepta IPv4 estricta (sin ceros a la izquierda) e IPv6 literal (`InetAddress` con al menos un `:` y solo `[0-9A-Fa-f:.]`, que no hace DNS). Una zona (`%eth0`) se **descarta** del valor devuelto. Prioridad `CF-Connecting-IP` y, si falta **o no es válida**, `X-Client-IP`. Solo en `/api/v1/admin` y `/api/v1/admin/*`.
3. **`ErrorLogDescription`** (paquete `config`, pública; en la ronda 1 se movió desde `adapter.in.rest.error`): `describe(Throwable)` devuelve `Described(message, thrown)`; con un `SQLException` en la cadena (hasta 20 niveles) el mensaje es `Unexpected database error (SQLState=…, class=…)` y `thrown=null` (ni mensaje ni traza); si no, `Unexpected error` con la traza. El SQLState solo se copia si cumple `[0-9A-Z]{5}`.
4. **(Corregida en la ronda 1)** `ErrorLogDescription` se movió a `config` (pública) y se usa también en los WARN de refresco de BD (`PostgresResumeRepository`, `PostgresSiteContentRepository`). Ver «Correcciones de la ronda 1».
5. **`ThreadRecordingAccountRepository` (test) ahora lanza `IllegalStateException("Could not read the admin account", SQLException(mensaje con hunter2 y la URL JDBC, "08006"))`**, igual que el repositorio real (que envuelve un `SQLException`). El plan (§2.5, §0) y T24 son coherentes solo así: con un `IllegalStateException` sin causa SQL la traza completa sigue saliendo por diseño. `AdminSessionFilterTest` sigue verde.
6. `error_code` se pone en el MDC dentro de `ProblemExceptionMapper.builder(...)` (cubre negocio, 401, 403, 400, transporte, 500). El ERROR `Unexpected error` se emite **antes** y no lleva `error_code` (sí `request_id`); la línea de access sí trae `err=UNEXPECTED`. El 413 sin cuerpo de `ioFailure` no pone código (`err=-`), como en el plan.
7. **T21 con archivo**: el perfil copia las claves `quarkus.log.console.json.*` de `application.properties` a `quarkus.log.file.json.*` (menos `enabled`), así se prueba la sintaxis real. El nombre del archivo es fijo (`target/json-log-test.log`, borrado al arrancar el perfil) porque perfil y test se cargan en cargadores distintos.
8. Documentación mínima: bullet **Logs** en `CLAUDE.md` y **Trazabilidad** en `ARCHITECTURE.md`. `docs/observability.md`, README y smoke son del slug 5.
9. No se tocaron OpenAPI, `ProblemResponse` ni `management` (decisiones del humano 2 y 4).

## Archivos
Main (`cv/infrastructure/src/main/`): `config/RequestContextHandler.java`, `config/ClientIp.java`, `config/RequestIds.java`, `config/ErrorLogDescription.java`, `adapter/in/rest/error/ProblemExceptionMapper.java` (MDC + sanear `unexpected`), `resources/application.properties` (bloque de logs), `infrastructure/pom.xml` (`quarkus-logging-json`). Docs: `CLAUDE.md`, `ARCHITECTURE.md`. Tests: los de la tabla más `LogRecords`, `LogProbeResource`, `RawResponses`, y cambios en `ThreadRecordingAccountRepository`, `ErrorHandlingTest`, `AdminEdgeGuardTest`.

## Ejemplos reales de líneas
Producción (jar con JSON, `CV_ADMIN_EDGE_BLOCK=true`; en consola):
```
{"timestamp":"2026-11-12T17:41:47.064536+01:00","logger":"access","level":"INFO","message":"GET /api/v1/profile 200 95ms 278b rid=25c9d82645804c6c9d976a780ca9fcbc err=- ip=-","threadName":"executor-thread-1","request_id":"25c9d82645804c6c9d976a780ca9fcbc","service":"cv-api"}
GET /api/v1/profile 200 0ms 278b rid=mi-id-123456 err=- ip=-          # con X-Request-Id propio; con ?lang=en&token=CANARY-Q y CF-Connecting-IP la línea sale sin query y con ip=-
GET /api/v1/nada 404 12ms 123b rid=b7c3… err=NOT_FOUND ip=-
POST /api/v1/hl7/translate 413 0ms 0b rid=c296… err=- ip=-            # 413 temprano de RequestBodyLimits, con X-Request-Id en la respuesta
POST /api/v1/admin/auth/login 404 1ms 123b rid=b8c1… err=NOT_FOUND ip=203.0.113.9     # edge-block por CF-Connecting-IP
POST /api/v1/admin/auth/login 401 112ms 147b rid=124d… err=ADMIN_INVALID_CREDENTIALS ip=2001:db8::7   # solo X-Client-IP
```
Health, swagger y openapi: **ninguna línea**. `CF-Connecting-IP` en pública: `ip=-` y sin `client_ip` en el JSON.
Error 500 real (BD parada, jar de producción):
```
{"…","logger":"…ProblemExceptionMapper","level":"ERROR","message":"Unexpected database error (SQLState=57P01, class=PSQLException)","request_id":"9c62…","client_ip":"203.0.113.9","service":"cv-api"}
{"…","logger":"access","message":"POST /api/v1/admin/auth/login 500 5ms 123b rid=9c62… err=UNEXPECTED ip=203.0.113.9","error_code":"UNEXPECTED","client_ip":"203.0.113.9",…}
```
Dev (`quarkus:dev`, texto): `17:42:08.302 INFO  [dev-req-123456] access GET /api/v1/profile 404 2ms 140b rid=dev-req-123456 err=RESUME_NOT_FOUND ip=-` (404 por no haber CV cargado en el DevServices). Los logs sin petición salen con `[]`.
JSON de un 500 con traza (T21): `{"…","level":"ERROR","message":"Unexpected error","request_id":"…","stackTrace":": java.lang.IllegalStateException: …\n\tat …"}`.

## Límites / pendiente
- Hip. 7 (`System.Logger` y MDC) sin verificar (slug 3).
- El `message` del JSON de access es texto, no campos propios (decisión del plan, §2.2); `request_id`, `error_code` y `client_ip` sí son campos planos.
- Un `X-Request-Id` o `X-Client-IP` los puede fijar cualquiera que llegue al contenedor (solo afecta a la fidelidad del log; riesgo ya aceptado en el plan).
- Una IP IPv6 con zona se registra sin la zona; un 400 del parser HTTP anterior al enrutado no pasa por el handler (sin línea ni cabecera).
- El `exception-output-type=formatted` pone la traza completa de errores NO SQL (por diseño); los mensajes de esas excepciones pueden salir (p. ej. `BoomResource` en test).
- En el log de la consola, WARN antiguas de Quarkus «Unrecognized configuration key quarkus.flyway.placeholder-replacement / quarkus.jacoco.includes» ya existían antes (no se tocaron).
- Entorno: Docker Desktop se cayó una vez durante la sesión y se relanzó; no afecta al resultado. El contenedor `cv-db-local` previo del humano no fue tocado por mí (mis pruebas usaron un Postgres propio en 55432, ya borrado).

## Correcciones de la ronda 1 (review.md, «Cambios requeridos»)
1. **A8, WARN de refresco de BD.** `ErrorLogDescription` (y su `Described`) ahora es **pública en `config`** (compatible con `outboundAdaptersDoNotUseInboundOnes`; `adapter.out` -> `config` ya estaba permitido). La usan `ProblemExceptionMapper`, `PostgresResumeRepository` y `PostgresSiteContentRepository`: `LOG.warnf(described.thrown(), "Cannot refresh the '%s' resume (%s); serving the last one read", …, described.message())`; con SQL/JDBC en la cadena sale `Unexpected database error (SQLState=…, class=…)` sin traza. Revisado con grep todo `LOG.*` de `main`: no queda otro log de excepción SQL (Telegram solo loguea clase/código; los `System.Logger` de `SaveEditableContentService` y `RollbackContentService` loguean la excepción del invalidador de caché, que es un `remove` en memoria, sin SQL; `application` no puede importar `config`).
   - Test nuevo `RefreshWarningLoggingTest` (resume y site content): DataSource que cae con `SQLException("Connection to secreto:5432 refused; jdbc:postgresql://secreto:5432/db password=hunter2", "08001")` tras una lectura buena; sirve lo último leído y el WARN trae `SQLState=08001`, sin traza (`getThrown()==null`) y el volcado completo no contiene `hunter2`, `secreto`, `jdbc:`, `refused`, `5432`, `PSQLException` ni `\tat `.
   - Jar de producción con BD parada (TTL de caché 1 s): `{"logger":"…PostgresResumeRepository","level":"WARN","message":"Cannot refresh the 'es' resume (Unexpected database error (SQLState=57P01, class=PSQLException)); serving the last one read","request_id":"bbd5…"}`; sin `stackTrace` ni host.
2. **Paridad de rutas admin.** Nuevo `config/AdminRoutes` (público) con `ROOT`, `PREFIX` e `isAdmin(path)`: **único criterio**; quita los parámetros de matriz (`;[^/]*`) antes de comparar. Lo usan `RequestContextHandler`, `AdminEdgeGuard`, `AdminSessionFilter` y `ApiCacheHeaders`; se eliminaron `AdminPaths.isAdmin`/`ADMIN_ROOT`/`ADMIN_PREFIX` y `RequestContextHandler.isAdmin` (sin duplicación). `AdminPaths.normalized` se mantiene (barra final/inicial sobre `UriInfo.getPath()`).
   - Test nuevo `ClientIpLoggingTest.theIpIsLoggedForExactlyTheRoutesTheAdminZoneOwns` (parametrizado, 12 variantes por socket crudo, con `X-Client-IP`): admin (IP registrada) para `/api/v1/admin/auth/session`, `/api/v1/admin`, `/api/v1/admin/`, barra final, `//api/v1//admin/...`, `/./`, `%61dmin`, `admin;x=1/auth/session` y `auth;x=1/session`; no admin (`ip=-`) para `/api/v1/ADMIN/...`, `/api/v1/adminx/...` y `/api/v1/profile`.
   - Jar: `GET /api/v1/admin;x=1/auth/session` con `X-Client-IP: 192.0.2.5` -> `401 … err=ADMIN_UNAUTHORIZED ip=192.0.2.5` (antes `ip=-`); `/api/v1/ADMIN/...` -> `404 … ip=-`.
3. Verificación: `mvn -B verify` OK (550 pruebas, 380 en `infrastructure`, 0 fallos); `ci-summary.py --min-total 90 --min-module 80` OK (total 96,1 %; application 98,8 %; domain 94,2 %; infrastructure 95,0 %). Las 14 clases de logs (86 tests, ahora con `RefreshWarningLoggingTest` y las variantes de ruta) se repitieron **10 veces seguidas**: 10/10 verdes.
4. Límite actualizado: el `Unexpected error` de errores NO SQL conserva traza y mensaje por diseño; los WARN de refresco ya no vuelcan nada de errores SQL.
