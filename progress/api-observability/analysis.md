# Analysis — api-observability

Estado: plan completo. No he escrito código, tests ni archivos. Solo he leído y consultado documentación.

## 0. Lo comprobado (con fuentes)

**Repo `cv`**
- `application.properties` no tiene nada de logging. `pom.xml` fija Quarkus 3.40.1.
- Los logs existentes son:
  - `AdminConfig`: WARN de admin deshabilitado.
  - `PostgresResumeRepository` y `PostgresSiteContentRepository`: WARN de refresco de BD.
  - `TelegramContactNotifier`: solo nombre de clase o código HTTP, bien.
  - `ProblemExceptionMapper.unexpected`: `LOG.error("Unexpected error", e)` con traza completa.
  - `SaveEditableContentService` y `RollbackContentService`: `System.Logger` WARN al fallar la invalidación de caché.
- `ArchitectureTest.applicationOnlyKnowsTheDomain` prohíbe `jakarta`, `io.quarkus`, `com.fasterxml` y `microprofile` en `application`. Por eso el audit necesita un puerto de salida.
- `RequestBodyLimits` ya es un handler Vert.x de `Router` (`config/`) que responde 413 antes de JAX-RS. Un `ContainerResponseFilter` no vería ese 413.
- `AdminEdgeGuard` (preMatching) devuelve 404 a toda ruta admin con `CF-Ray` o `CF-Connecting-IP` cuando `CV_ADMIN_EDGE_BLOCK=true`. **En producción esto está en true.**
- `ContactMessagesResource` ya toma `CF-Connecting-IP`, lo hashea con sal y solo guarda el hash.
- `ThreadRecordingAccountRepository` (test) lanza un mensaje con `password=hunter2` y la URL JDBC. Eso demuestra que un `IllegalStateException` de BD puede acabar en `LOG.error(..., e)`. Ver Riesgo 6.
- El surefire de `infrastructure` ya fija `java.util.logging.manager=org.jboss.logmanager.LogManager`.
- No hay Awaitility en el proyecto.
- El compose (`cv-web/deploy/docker-compose.yml`) usa `curl http://localhost:8080/q/health/ready` en `cv-api` y `fetch('/api/health/')` en `cv-web`. `cv-web/lib/api/health.ts` llama a `/q/health/ready` por la red interna. Ninguno tiene `logging:` configurado.
- `cv-api` está en la red `padelhub_default`, la misma que cloudflared.

**Quarkus 3.40.1**
- Extensión `quarkus-logging-json`:
  - Existe en Maven Central 3.40.1. Descargué el jar y `JsonLogConfig$JsonConfig` expone `enabled`, `mdcFlatFields`, `excludedKeys`, `keyOverrides`, `additionalField` y `logFormat`.
  - Por defecto sustituye el formato de consola. La guía manda `%dev/%test.quarkus.log.console.json.enabled=false`. (quarkus.io/guides/logging)
  - `quarkus.log.console.json.mdc.flat-fields=true` escribe el MDC como campos raíz. Aplica a console y file.
- Access log (guía http-reference):
  - Propiedades: `quarkus.http.access-log.{enabled,pattern,exclude-pattern,category,masked-headers}`.
  - Tokens útiles: `%m`, `%U` (path), `%s`, `%D` (ms), `%B`, `%{o,header}`, `%{X,mdc-key}` (MDC de Vert.x), `%{d,key}`.
  - `%q` es el query string, `%h` y `%a` son la IP del cliente, y `%r` lleva la línea completa con query.
  - Que `%U` excluya la query es una inferencia de la página, no algo declarado; lo cubre T6.
  - `%D` y los tiempos exigen `quarkus.http.record-request-start-time=true`.
  - El valor por defecto de `category` es `io.quarkus.http.access-log`.
- MDC: Quarkus lo guarda en el **duplicated context de Vert.x**. Se mantiene tras llamadas async, en `ManagedExecutor` y en `executeBlocking`. (guías logging y duplicated-context). Un `MDC.put` en un handler Vert.x temprano llega a los hilos de trabajo.
- Gestión (management-interface-reference):
  - Con `quarkus.management.enabled=true`, health, Micrometer e info pasan a `0.0.0.0:9000/q`. **Eso movería `/q/health/ready` fuera del 8080** y rompería el compose y `cv-web`.
  - `quarkus.smallrye-health.management.enabled` (por defecto `true`, según all-config) permite dejar health en el puerto principal.
  - OpenAPI también se declara endpoint de gestión; si Swagger/OpenAPI se mueven hay que comprobarlo.
  - `quarkus-micrometer-registry-prometheus` 3.40.1 existe.
- Captura de logs en pruebas:
  - **`LogCapture` no existe** en `quarkus-junit` 3.40.1: comprobé el jar y no hay clases `LogCapture`, `LogCollect*` ni `InMemoryLog*`.
  - Queda el camino estándar: un `java.util.logging.Handler` propio (el LogManager de JBoss es JUL) registrado en los loggers. Los registros son `org.jboss.logmanager.ExtLogRecord` y dan `getMdcCopy()`.

**Repo `cv-web`**
- Next 16.4.5. `instrumentation.ts` exporta `register` y `onRequestError(err, {path, method, headers}, {routePath, routeType, ...})`. `onRequestError` se introdujo en 15.0 y se llama «al capturar el servidor el error». Que corra en el standalone hay que **demostrarlo con un test de runtime** (W17).
- `proxy.ts` corre antes de las rutas y aparece en el árbol de la fase 3 (`tests/runtime/proxy-ready.test.ts`, matcher `/admin/:path*`). Solo puede haber un proxy. Un `proxy.ts` global colisionaría con el de la fase 3 y no conoce el estado de la respuesta.
- `lib/api/request.ts` usa `node:http(s)` con cabeceras exactas, reintento y timeout. `lib/api/contact.ts` envía solo `Content-Type` y `CF-Connecting-IP`. `app/api/health/route.ts` y `app/api/contact/route.ts` son route handlers `force-dynamic`. `tests/helpers/standalone.ts` ya expone `log()` (stdout + stderr del servidor).

## 1. Objetivo
La API y la web dejan trazas útiles y sin datos personales, con tres piezas:
1. Una línea de access log por petición.
2. Un `request_id` que cruza web → API → logs → respuesta.
3. Una categoría `audit` con las acciones del admin.

Los logs son JSON en producción y texto en dev/test. Los tests capturan los logs y prueban dos cosas: que existe la línea esperada y que **nunca** salen datos sensibles. Las métricas quedan fuera de esta entrega, con la decisión planteada en Riesgos.

## 2. Diseño recomendado

**2.1 Request id y contexto: un handler Vert.x propio** (`infrastructure/config/RequestContextHandler.java`, mismo patrón que `RequestBodyLimits`, en `Router` con orden muy temprano). Hace seis cosas:
- Lee `X-Request-Id` y lo acepta solo si cumple `^[A-Za-z0-9._-]{8,64}$`. Si no, genera 32 hex (UUID sin guiones). Un id ajeno inválido nunca se refleja.
- Pone el id en `response.headers` antes de `next()`. Así sale en todas las respuestas, también en el 413 temprano y en los 404.
- Hace `MDC.put("request_id", id)`.
- Solo si la ruta es `/api/v1/admin*`, lee `CF-Connecting-IP` y luego `X-Client-IP`. Los valida como IP literal (clase `ClientIp`, sin DNS) y los pone en `MDC client_ip`. **En rutas públicas `client_ip` no se escribe jamás.** Eso es una garantía estructural, no una convención.
- El handler corre antes de `AdminEdgeGuard`, así que el 404 de una sonda a admin queda en el log con su IP, que es justo lo que interesa.
- `ProblemExceptionMapper` añade `MDC error_code` (el código de `ApiError`) en cada respuesta de problema. No toca `ProblemResponse` ni el OpenAPI.

**2.2 Access log: el integrado de Quarkus**, no un filtro propio.
- Ve también los 413 de `RequestBodyLimits` y los 404 de enrutado. Un `ContainerResponseFilter` no.
- Tiene `exclude-pattern`.
- `%{X,request_id}` y `%{X,error_code}` leen el MDC.
- Controlo el query string con `%U`, y la IP solo entra por `%{X,client_ip}`. Nunca uso `%h`, `%a`, `%r` ni `%{ALL_REQUEST_HEADERS}`.
- Contra: en JSON es un `message` de texto, no campos propios. Para filtrar basta `grep`, y el `request_id` sale además como campo plano. La alternativa (handler propio) está en Alternativas descartadas.

**2.3 Auditoría con puerto de salida**
- `application/port/out/AuditLog.java`: `void record(AuditEvent event)`. El contrato dice que no debe lanzar.
- `application/audit/AuditEvent.java`: `AuditAction action`, `AuditOutcome outcome` (`SUCCESS`/`FAILURE`) y `Map<String,String> details`.
  - El constructor sanea saltos de línea y caracteres de control, y trunca valores a 120 caracteres. Así no se pueden falsear líneas del log.
- `application/audit/AuditAction.java`: enum cerrado.
- Adaptador `infrastructure/adapter/out/audit/LogAuditLog.java`:
  - Escribe en el logger `audit` con `LOG.info/warn("action=… outcome=… k=v …")`.
  - Captura cualquier excepción del logger.
  - El `request_id` y la IP los aportan el MDC y el pantalla de pattern; el adaptador no toca la IP.
- Cableado solo en `UseCaseConfig`; los servicios reciben `AuditLog` por constructor.
- Los servicios emiten el evento **después** de que la operación tuvo éxito (en los éxitos) o justo antes de lanzar (en los fallos de seguridad). Los fallos de validación, conflicto o not-found del contenido no generan evento de audit: ya quedan en el access log con `err=<CODE>`.

**2.4 Eventos de negocio** (INFO, sin puerto nuevo)
- `PostgresContactMessageRepository`: tras insertar, `Contact message stored id=<n>`. Hay que añadir `RETURNING id` al INSERT. Solo el id.
- `TelegramContactNotifier`: INFO `Telegram notification sent` y los WARN actuales. Para que el callback async lleve `request_id`, copia el MDC antes del envío y lo restaura en el callback.
- `PostgresSiteContentRepository` (implementa `ContentCacheInvalidator`): INFO `Content cache invalidated kind=… lang=…`. Los WARN de refresco no cambian.

**2.5 Logs de errores sin datos**
- `ProblemExceptionMapper.unexpected` deja de volcar el mensaje de excepciones SQL o JDBC. Nueva utilidad `ErrorLogDescription` en `adapter/in/rest/error`, con estas reglas:
  - Si algún `cause` de la cadena es `java.sql.SQLException`, se loguea `Unexpected database error (SQLState=…, class=…)` sin traza ni mensaje, porque los mensajes de PSQL pueden traer la fila completa («Failing row contains …»).
  - El resto sigue con traza completa.
- Aplicar lo mismo a los tres WARN de refresco de BD es opcional (ver Riesgo 6).

**2.6 Configuración** (`infrastructure/src/main/resources/application.properties`)
```
quarkus.log.console.json.enabled=true                      # lo trae la extensión; lo dejo explícito
%dev.quarkus.log.console.json.enabled=false
%test.quarkus.log.console.json.enabled=false
quarkus.log.console.json.mdc.flat-fields=true
quarkus.log.console.json.additional-field."service".value=cv-api
quarkus.log.console.json.excluded-keys=sequence,loggerClassName,processName,processId,threadId,hostName
quarkus.log.console.json.key-overrides=loggerName=logger   # comprobar sintaxis real en T21
%dev.quarkus.log.console.format=%d{HH:mm:ss.SSS} %-5p [%X{request_id}] %c{1.} %s%e%n
%test.quarkus.log.console.format=<igual>
quarkus.http.record-request-start-time=true
quarkus.http.access-log.enabled=true
quarkus.http.access-log.category=access
quarkus.http.access-log.pattern=%m %U %s %Dms %Bb rid=%{X,request_id} err=%{X,error_code} ip=%{X,client_ip}
quarkus.http.access-log.exclude-pattern=^/(q/health|swagger|q/swagger-ui|openapi\.json).*
quarkus.log.category."audit".level=INFO
# gestión: NO se activa en esta entrega (quarkus.management.enabled queda false)
```

**2.7 Lado web (`cv-web`)**
- No se usa `proxy.ts`.
- `lib/log.ts` (`logEvent(level, event, fields)`):
  - Emite una línea JSON por stdout (INFO) o stderr (WARN/ERROR).
  - Claves: `timestamp`, `level`, `service:"cv-web"`, `event`, `request_id` y campos primitivos permitidos.
  - Descarta claves de una lista negra, convierte `Error` en su nombre de clase y reemplaza saltos de línea.
  - Es la única puerta a `console.*`.
- `lib/request-id.ts`: `newRequestId()` (32 hex).
- `lib/api/request.ts`:
  - Un id por `requestJson`, enviado en `X-Request-Id`, reutilizado en los reintentos.
  - Loguea un WARN por intento fallido (`event=api_call`, `path` sin query, `status`/`outcome`, `attempt`, `duration_ms`).
  - Éxito: **silencio**, porque la API ya registra cada lectura.
- `lib/api/contact.ts`: acepta `requestId`, lo manda en `X-Request-Id` y sigue sin reenviar nada más.
- `app/api/contact/route.ts`: un id por POST, un INFO `event=contact` con `outcome` y `status`, y cabecera de respuesta `X-Request-Id`.
- `app/api/health/route.ts`: loguea solo cuando está degradado (WARN).
- `lib/pdf/*`: el `console.warn` actual pasa por `logEvent`.
- `instrumentation.ts` (nuevo, raíz): `onRequestError` registra `event=render_error`, `route_path`, `route_type`, `method`, `path` sin query, `digest` y la clase del error.
- No hay línea por visita de página: el standalone no ofrece un hook con estado y duración sin `proxy.ts` (ver Riesgo 12).

## 3. Archivos a crear o tocar

**`cv`** (rutas bajo `repo cv`)
- `infrastructure/pom.xml`: `+ io.quarkus:quarkus-logging-json`.
- `infrastructure/src/main/resources/application.properties`: bloque de la 2.6.
- Nuevos:
  - `infrastructure/src/main/java/dev/julioflores/cv/infrastructure/config/RequestContextHandler.java`
  - `…/config/ClientIp.java`, `…/config/RequestIds.java`
  - `…/adapter/out/audit/LogAuditLog.java`
  - `…/adapter/in/rest/error/ErrorLogDescription.java`
  - `application/src/main/java/dev/julioflores/cv/application/port/out/AuditLog.java`
  - `application/src/main/java/dev/julioflores/cv/application/audit/{AuditEvent,AuditAction,AuditOutcome}.java`
- Modificados:
  - `…/adapter/in/rest/error/ProblemExceptionMapper.java`: MDC `error_code` y `unexpected` saneado.
  - `…/config/UseCaseConfig.java`: inyecta `AuditLog`.
  - Servicios (constructor + eventos): `LoginAdminService`, `ChangeAdminPasswordService`, `LogoutAllSessionsService`, `SaveEditableContentService`, `RollbackContentService`, `UploadProjectImageService`, `DeleteImageService`, `CleanupOrphanImagesService`, `ListContactMessagesService`.
  - `…/adapter/out/postgres/PostgresContactMessageRepository.java` (`RETURNING id`, INFO).
  - `…/adapter/out/postgres/PostgresSiteContentRepository.java` (INFO de invalidación).
  - `…/adapter/out/telegram/TelegramContactNotifier.java` (INFO y MDC en el callback).
  - Opcional: `PostgresResumeRepository`.
- Tests: ver el plan de tests.
- Documentación:
  - `docs/observability.md` (nuevo).
  - `README.md`, `ARCHITECTURE.md` y `CLAUDE.md` (sección de logs).
  - `scripts/smoke-test.sh`: comprobar `X-Request-Id`.

**`cv-web`**
- Nuevos: `lib/log.ts`, `lib/request-id.ts`, `instrumentation.ts`, `tests/runtime/logging.test.ts`.
- Modificados: `lib/api/request.ts`, `lib/api/contact.ts`, `lib/api/health.ts` (id), `app/api/contact/route.ts`, `app/api/health/route.ts`, `lib/pdf/build-cv-pdf.ts` (u otro punto donde esté el `console.warn`).
- Tests de unidad y de runtime junto a cada archivo (ver W1–W21).
- `deploy/docker-compose.yml`: `logging:` json-file con rotación en `cv-api` y `cv-web` (más su test del compose).
- `docs/web-standards.md`: sección «Logs».

## 4. Campos de cada log

**4.1 Access log** (categoría `access`)
- Se registra: método, path sin query, estado, duración en ms, bytes de respuesta, `request_id`, `error_code` (solo en respuestas de problema), `client_ip` (solo admin y solo si es IP válida).
- NO se registra:
  - Query string (incluye `lang` y cualquier otro parámetro).
  - Ninguna cabecera: ni `Authorization`, `Cookie`, `User-Agent` ni `Referer`.
  - Cuerpos.
  - IP en rutas públicas.
  - Sujeto o claims del JWT.

Ejemplos (texto en dev; en prod es el `message` del JSON):
```
GET /api/v1/resume 200 12ms 1534b rid=7f3a9c1e5b2d4f60a1b2c3d4e5f60718 err=- ip=-
GET /api/v1/experience/nope 404 3ms 214b rid=… err=EXPERIENCE_NOT_FOUND ip=-
POST /api/v1/hl7/translate 413 1ms 0b rid=… err=- ip=-
POST /api/v1/admin/auth/login 401 84ms 190b rid=… err=ADMIN_INVALID_CREDENTIALS ip=203.0.113.9
GET /api/v1/admin/content/services 404 0ms 210b rid=… err=NOT_FOUND ip=203.0.113.9   # sonda desde el túnel con edge-block
```

**4.2 Audit** (categoría `audit`; INFO si es éxito, WARN si es fallo de seguridad)
- Cada línea lleva `action`, `outcome` y los campos de la tabla.
- Se añaden por MDC: `request_id` y `client_ip`.
- NO: contraseñas (actual o nueva), tokens, hash, `Authorization`, cuerpos, texto del comentario, contenido de mensajes de contacto, nombres de cliente.

| action | outcome | campos |
|---|---|---|
| `LOGIN_SUCCESS` | success | – |
| `LOGIN_FAILED` | failure | `reason=bad_credentials` o `no_account` |
| `LOGIN_LOCKED` | failure | `retry_after_s` |
| `LOGIN_RATE_LIMITED` | failure | – |
| `PASSWORD_CHANGED` | success | – |
| `PASSWORD_CHANGE_FAILED` | failure | `reason=wrong_current`, `locked` o `weak` |
| `SESSIONS_REVOKED` | success | – |
| `CONTENT_SAVED` | success | `kind`, `es_version`, `en_version`, `comment_present`, `comment_length` |
| `CONTENT_ROLLED_BACK` | success | `kind`, `lang`, `from_version`, `to_version` |
| `IMAGE_UPLOADED` | success | `key`, `content_type`, `bytes`, `width`, `height` |
| `IMAGE_DELETED` | success | `id` |
| `IMAGES_CLEANUP` | success | `dry_run`, `older_than_hours`, `deleted`, `would_delete`, `kept` |
| `MESSAGES_READ` | success | `limit`, `returned`, `paged` |

Ejemplos:
```
INFO  [audit] action=LOGIN_SUCCESS outcome=success                                   (request_id=…, client_ip=203.0.113.9)
WARN  [audit] action=LOGIN_FAILED outcome=failure reason=bad_credentials             (request_id=…, client_ip=203.0.113.9)
INFO  [audit] action=CONTENT_SAVED outcome=success kind=projects es_version=7 en_version=7 comment_present=true comment_length=23
INFO  [audit] action=IMAGES_CLEANUP outcome=success dry_run=false older_than_hours=24 deleted=3 would_delete=0 kept=12
```

**4.3 Negocio** (INFO, públicos, sin IP)
```
INFO [cv.contact] Contact message stored id=41                      (request_id)
INFO [cv.contact] Telegram notification sent                        (request_id, vía MDC restaurado)
WARN [cv.contact] Telegram notification rejected with HTTP 401      (sin URL, sin token)
INFO [cv.content] Content cache invalidated kind=services lang=es
WARN … Cannot refresh the 'es' resume; serving the last one read    (existente)
ERROR … Unexpected database error (SQLState=23502, class=PSQLException)   (nuevo; sin mensaje ni traza)
```

**4.4 Web (`cv-web`, JSON por línea)**
```
{"timestamp":"2026-11-12T10:15:30.123Z","level":"warn","service":"cv-web","event":"api_call","request_id":"…","path":"/api/v1/resume","outcome":"http_error","status":503,"attempt":1,"duration_ms":412}
{"timestamp":"…","level":"info","service":"cv-web","event":"contact","request_id":"…","outcome":"sent","status":201,"duration_ms":183}
{"timestamp":"…","level":"info","service":"cv-web","event":"contact","request_id":"…","outcome":"rejected","status":429,"code":"CONTACT_RATE_LIMITED","duration_ms":96}
{"timestamp":"…","level":"warn","service":"cv-web","event":"health","request_id":"…","outcome":"degraded","status":503}
{"timestamp":"…","level":"error","service":"cv-web","event":"render_error","route_path":"/[[...slug]]","route_type":"render","method":"GET","path":"/","digest":"1234567","error":"ApiFetchError"}
```
- Se registra: evento, resultado, estado, código de problema, intentos, duración, path sin query y clase del error.
- NO se registra:
  - `name`, `email`, `message` ni `website` del formulario.
  - Ninguna IP, ni `CF-Connecting-IP`.
  - Cookies ni cabeceras.
  - Mensajes de error de causa (pueden llevar URLs).
  - Cuerpos de la API.
  - La URL base de la API.

## 5. Criterios de aceptación (verificables)
- **A1** Todo endpoint público y admin deja una línea `access` con método, path, estado, duración y bytes; el path no incluye el query string (T1–T4, T6).
- **A2** Health, Swagger y OpenAPI no generan línea de access (T5).
- **A3** Toda respuesta lleva `X-Request-Id`. Se acepta el del cliente solo si cumple el patrón; si no, se genera uno nuevo y el inválido nunca se refleja (T7–T10, T4).
- **A4** El `request_id` está en el access log, en los registros de audit y en los de negocio de esa petición. También está en los logs emitidos desde hilos de trabajo y en peticiones concurrentes sin mezclas (T11–T13).
- **A5** `error_code` aparece en las líneas de respuestas de problema (T13, T14).
- **A6** Ningún registro de ninguna categoría contiene una IP en endpoints públicos, aunque la petición traiga `CF-Connecting-IP`. En admin la IP solo aparece si es válida (T15–T17).
- **A7** Cada acción de la tabla 4.2 genera su línea `audit` con sus campos. Los fallos de contenido no generan audit. Una lectura de contenido (GET) no genera audit (T31–T49, T52).
- **A8** Ningún registro contiene contraseñas, tokens, hashes, `Authorization`, cuerpos, texto de comentario ni datos de mensajes de contacto; tampoco el mensaje de excepciones SQL o JDBC (T20, T24, T25, T50).
- **A9** `audit` nunca rompe una operación (T45). Los casos de uso siguen sin importar frameworks (T54).
- **A10** En producción los logs son JSON válido de una línea por registro, con `request_id` plano y `service=cv-api`. En dev y test son texto con `[request_id]` (T21–T23).
- **A11** Contacto recibido, notificación de Telegram e invalidación de caché dejan INFO con solo ids, y el honeypot o un rechazo no dejan «stored» (T56–T61, T64).
- **A12** `/q/health/ready` y `/q/health/live` siguen en el puerto 8080 con 200, y la gestión no está activada (T29).
- **A13** La web registra: fallos de llamadas a la API con id, contacto, health degradado, errores de render y fallo del PDF, siempre sin datos personales (W1–W21).
- **A14** La web envía `X-Request-Id` a la API en lecturas, health y contacto, y es el mismo que sale en su log (W6, W12, W14, W17, W18).
- **A15** El compose tiene rotación de logs en `cv-api` y `cv-web` y sus healthchecks no cambian (D1). La documentación explica cómo leer y buscar por `request_id` (D3).

## 6. Plan de tests

Convenciones. Abreviaturas:
- `INFRA` = `cv: infrastructure/src/test/java/dev/julioflores/cv/infrastructure/`
- `APP` = `cv: application/src/test/java/dev/julioflores/cv/application/`
- `WEB` = `cv-web: `

Soporte nuevo:
- `INFRA/LogRecords.java`: `Handler` JUL que se engancha al logger raíz en `@BeforeEach` y se quita en `@AfterEach`. Guarda `ExtLogRecord` y ofrece `all()`, `byLogger(name)` y `await(predicate, timeout)`. La espera es necesaria porque la línea de access sale **al terminar la respuesta**, tras volver RestAssured; no hay Awaitility, así que el polling se hace a mano.
- `LogRecords.dump()` serializa para la búsqueda negativa: mensaje formateado, parámetros, valores del MDC y traza completa de cada registro.

### 6.1 Slug 1 — `api-logging-core`
- **T1** — **Dado** la app arrancada **cuando** `GET /api/v1/profile` **entonces** se emite exactamente una línea en `access` con `GET /api/v1/profile 200`, duración y bytes, y `rid=` igual a la cabecera `X-Request-Id` de la respuesta. `INFRA/AccessLogTest.java` (QuarkusTest). Cubre A1, A3.
- **T2** — **Dado** cada endpoint público (profile, impact, experience, experience/{id}, skills, education, contact, resume, services, projects, architecture, `POST hl7/translate`, `POST contact/messages`) **cuando** se llama **entonces** hay una línea con su método, path y estado correctos. `AccessLogTest` (parametrizado). A1.
- **T3** — **Dado** una ruta inexistente **cuando** se pide **entonces** hay línea con 404 y su path. `AccessLogTest`. A1.
- **T4** — **Dado** un POST a HL7 con `Content-Length` mayor que 128 KB **cuando** `RequestBodyLimits` responde 413 **entonces** hay línea con 413 y la respuesta lleva `X-Request-Id`. `AccessLogTest`. A1, A3. Prueba que el log ve lo que un filtro JAX-RS no vería.
- **T5** — **Dado** health ready/live, `/swagger/` y `/openapi.json` **cuando** se piden (200) **entonces** no hay ninguna línea en `access`. `AccessLogTest`. A2.
- **T6** — **Dado** `GET /api/v1/profile?lang=en&token=CANARY-Q` **cuando** se completa **entonces** ningún registro contiene `CANARY-Q`, `token=` ni `lang=`. `AccessLogTest`. A1.
- **T7** — **Dado** una petición sin `X-Request-Id` **cuando** responde **entonces** la cabecera es de 32 hex y es la misma que `rid=` de la línea. `RequestIdTest.java` (QuarkusTest). A3.
- **T8** — **Dado** `X-Request-Id: abc-123_XYZ.789` **cuando** responde **entonces** la respuesta y el log traen ese valor. `RequestIdTest`. A3.
- **T9** — **Dado** ids inválidos (65 caracteres, con espacios, `<script>`, vacío, no ASCII, 7 caracteres) **cuando** se envían (algunos vía `RawHttp`) **entonces** se genera uno nuevo y el valor inválido no aparece en cabeceras ni en logs. `RequestIdTest`. A3.
- **T10** — **Dado** dos peticiones seguidas sin id **cuando** responden **entonces** los ids generados son distintos. `RequestIdTest`. A3.
- **T11** — **Dado** una ruta de prueba `LogProbeResource` (test-only, estilo `BoomResource`) que registra una línea en el hilo de eventos y otra tras pasar a un hilo de trabajo bloqueante (`@Blocking`, JDBC) **cuando** se llama con id propio **entonces** ambos registros llevan `request_id` igual al de la petición. `INFRA/RequestContextPropagationTest.java`. A4. Verifica la hipótesis de la propagación del MDC.
- **T12** — **Dado** 20 peticiones concurrentes con ids distintos a la ruta de T11 **cuando** terminan **entonces** cada registro lleva el id de su petición y ninguno se mezcla. `RequestContextPropagationTest`. A4.
- **T13** — **Dado** `BoomResource` (500) **cuando** se llama **entonces** el ERROR `Unexpected error` lleva `request_id`, la línea de access es 500 con `err=UNEXPECTED`, y la cabecera coincide. `INFRA/ErrorHandlingTest.java` (ampliar). A4, A5.
- **T14** — **Dado** `GET /api/v1/experience/nope` **cuando** responde 404 **entonces** la línea trae `err=EXPERIENCE_NOT_FOUND`. `AccessLogTest`. A5.
- **T15** — **Dado** peticiones públicas (incluido el POST de contacto) con `CF-Connecting-IP: 203.0.113.9` y `X-Client-IP: 203.0.113.10` **cuando** se completan **entonces** ningún registro de ninguna categoría contiene esas IPs y las líneas traen `ip=-`. `INFRA/ClientIpLoggingTest.java`. A6.
- **T16** — **Dado** `POST /api/v1/admin/auth/login` con `CF-Connecting-IP: 203.0.113.9` **cuando** responde **entonces** la línea trae `ip=203.0.113.9`; con `CF-Connecting-IP: not-an-ip` trae `ip=-`; con solo `X-Client-IP` válida, usa esa. `ClientIpLoggingTest`. A6.
- **T17** — **Dado** `ClientIp.parse` **cuando** recibe IPv4, IPv6, IPv6 con zona, `null`, vacío, hostname, más de 45 caracteres o salto de línea **entonces** devuelve la IP válida o vacío y no hace resolución DNS. `INFRA/ClientIpTest.java` (unitario puro). A6.
- **T18** — **Dado** `RequestIds.accept` **cuando** recibe los bordes del patrón (7/8/64/65, guiones, puntos, mayúsculas, `null`) **entonces** acepta solo los válidos. `INFRA/RequestIdsTest.java` (unitario). A3.
- **T19** — **Dado** `CV_ADMIN_EDGE_BLOCK=true` y una petición admin con `CF-Ray` y `CF-Connecting-IP` **cuando** `AdminEdgeGuard` responde 404 **entonces** hay línea 404 con `ip=` y `rid`. `INFRA/AdminEdgeGuardTest.java` (ampliar). A6.
- **T20** — **Dado** una petición admin con `Authorization: Bearer CANARY-TOKEN-1` (token inválido) y otra con un JWT real **cuando** se completan **entonces** ningún registro contiene el token, `Bearer` ni el valor de la cabecera. `INFRA/SensitiveDataNotLoggedTest.java`. A8.
- **T21** — **Dado** un perfil de prueba con JSON activado hacia un archivo (`quarkus.log.file.json.*`) y las mismas claves de `application.properties` **cuando** se hacen peticiones y se provoca un error con traza **entonces** cada línea del archivo es JSON válido, tiene `timestamp`, `level`, `message`, `service=cv-api` y `request_id` plano (sin `mdc` anidado), no tiene las claves excluidas y la traza queda en un campo de una sola línea. `INFRA/JsonLogFormatTest.java` (QuarkusTest con `QuarkusTestProfile`). A10. Valida `key-overrides` y `excluded-keys`.
- **T22** — **Dado** el perfil JSON de T21 **cuando** se pide un endpoint público **entonces** la línea de access en JSON no contiene IP y el campo `message` sigue el patrón. `JsonLogFormatTest`. A6, A10.
- **T23** — **Dado** el perfil de test por defecto **cuando** se leen las propiedades **entonces** `quarkus.log.console.json.enabled` es `false` y el formato contiene `%X{request_id}`. `INFRA/LogConfigTest.java`. A10.
- **T24** — **Dado** `ThreadRecordingAccountRepository.failReads=true` (mensaje con `password=hunter2` y `jdbc:postgresql://secreto:5432/db`) **cuando** se llama a una ruta admin **entonces** la respuesta es 500 problem+json, y ningún registro contiene `hunter2` ni `secreto`. `SensitiveDataNotLoggedTest`. A8. Cubre un caso real del repo.
- **T25** — **Dado** `ErrorLogDescription.describe` con `IllegalStateException → PSQLException(mensaje con «Failing row contains (1, Ada, ada@x.test, texto secreto)»)` **cuando** se describe **entonces** el texto trae clase y SQLState y no incluye el mensaje, los valores ni la traza; con una excepción sin SQL conserva traza. `INFRA/ErrorLogDescriptionTest.java` (unitario). A8.
- **T29** — **Dado** la app **cuando** se piden `/q/health/ready` y `/q/health/live` en el puerto principal **entonces** responden 200 y la propiedad `quarkus.management.enabled` es `false`. `INFRA/HealthStaysOnMainPortTest.java`. A12.

### 6.2 Slug 2 — `api-audit-log` (unitarios con `RecordingAuditLog` en `APP/AdminFakes.java`)
- **T31** — **Dado** contraseña correcta **cuando** `login` **entonces** un evento `LOGIN_SUCCESS` y ninguna contraseña en `toString()`. `APP/LoginAdminServiceTest.java`. A7, A8.
- **T32** — **Dado** contraseña incorrecta **y** sin cuenta **cuando** `login` **entonces** `LOGIN_FAILED` con `reason=bad_credentials` y `reason=no_account` respectivamente. `LoginAdminServiceTest`. A7.
- **T33** — **Dado** cuenta bloqueada (también con la contraseña correcta) **cuando** `login` **entonces** `LOGIN_LOCKED` con `retry_after_s` y sin evento de éxito. `LoginAdminServiceTest`. A7.
- **T34** — **Dado** límite global agotado **cuando** `login` **entonces** `LOGIN_RATE_LIMITED`. `LoginAdminServiceTest`. A7.
- **T35** — **Dado** hash que necesita rehash **cuando** `login` correcto **entonces** un único `LOGIN_SUCCESS`. `LoginAdminServiceTest`. A7.
- **T36** — **Dado** `ChangeAdminPasswordService` **cuando** cambia bien, con actual incorrecta, bloqueada o contraseña débil **entonces** `PASSWORD_CHANGED` o `PASSWORD_CHANGE_FAILED` con `reason=wrong_current`, `locked` o `weak`, sin contraseñas en los detalles. `APP/ChangeAdminPasswordServiceTest.java`. A7, A8.
- **T37** — **Dado** `logoutAll` **cuando** se ejecuta **entonces** `SESSIONS_REVOKED`. `APP/LogoutAllSessionsServiceTest.java`. A7.
- **T38** — **Dado** un guardado válido **cuando** `save` **entonces** `CONTENT_SAVED` con `kind`, versiones y `comment_present`/`comment_length`, y ningún texto del comentario ni del contenido en los detalles. **Dado** contenido inválido, paridad rota o conflicto **entonces** no hay evento. `APP/SaveEditableContentServiceTest.java`. A7, A8.
- **T39** — **Dado** rollback correcto **cuando** `rollback` **entonces** `CONTENT_ROLLED_BACK` con `kind`, `lang`, `from_version`, `to_version`; con conflicto, versión inexistente o contenido inválido, ninguno. `APP/RollbackContentServiceTest.java`. A7.
- **T40** — **Dado** una subida válida **cuando** `upload` **entonces** `IMAGE_UPLOADED` con clave, tipo, bytes y dimensiones; imagen inválida, demasiado grande o storage caído, ninguno. `APP/UploadProjectImageServiceTest.java`. A7.
- **T41** — **Dado** borrado correcto **cuando** `delete` **entonces** `IMAGE_DELETED` con `id`; en uso o no encontrada, ninguno. `APP/DeleteImageServiceTest.java`. A7.
- **T42** — **Dado** limpieza real y limpieza `dryRun` **cuando** `cleanup` **entonces** `IMAGES_CLEANUP` con `dry_run` y los contadores correctos. `APP/CleanupOrphanImagesServiceTest.java`. A7.
- **T43** — **Dado** `ListContactMessagesService` **cuando** `list` **entonces** `MESSAGES_READ` con `limit`, `returned`, `paged`, y ni nombres, ni correos ni cuerpos. `APP/ListContactMessagesServiceTest.java`. A7, A8.
- **T47** — **Dado** `AuditEvent` **cuando** los detalles traen saltos de línea, caracteres de control, valores de más de 120 caracteres o claves nulas **entonces** se sanean y truncan y no se puede forjar una segunda línea. `APP/AuditEventTest.java`. A7, A9.
- **T45** — **Dado** `LogAuditLog` con un `Handler` de logging que lanza **cuando** `record` **entonces** no propaga la excepción. `INFRA/LogAuditLogTest.java`. A9.
- **T48** — **Dado** `LogAuditLog` **cuando** registra éxito y fallo **entonces** hay una línea en el logger `audit` (INFO el éxito, WARN el fallo) con `action=… outcome=…` y los detalles ordenados, con `request_id` y `client_ip` en el MDC de una petición admin. `LogAuditLogTest`. A7.
- **T49** — **Dado** el flujo admin completo por HTTP (login ok, login mal, cambio de contraseña, logout-all, guardado, rollback, subida, borrado, limpieza `dry_run` y real, lectura de mensajes) con `CF-Connecting-IP` **cuando** se ejecuta **entonces** hay exactamente una línea `audit` por acción con la acción esperada, el `request_id` igual al `X-Request-Id` de la respuesta y la IP enviada. `INFRA/AdminAuditLogTest.java`. A4, A6, A7.
- **T50** — **Dado** el mismo flujo con canarios (contraseña actual y nueva, JWT, prefijo `$argon2`, texto del comentario, strings únicos en el contenido guardado, nombre, correo y mensaje de un contacto) **cuando** termina **entonces** ninguno de los canarios aparece en **ningún** registro de ninguna categoría (mensaje, parámetros, MDC y traza). `SensitiveDataNotLoggedTest`. A8.
- **T52** — **Dado** `GET` de contenido, versiones, sesión e imágenes **cuando** se llaman **entonces** no hay registro `audit` (solo access). `AdminAuditLogTest`. A7.
- **T54** — **Dado** `ArchitectureTest` **cuando** corre **entonces** pasan las reglas actuales más: solo `adapter.out.audit` implementa `AuditLog`, `application` solo depende de él como interfaz, y `RequestContextHandler` está en `config`. `INFRA/ArchitectureTest.java` (ampliar, con aserción anti falso positivo de que el paquete se importa). A9.

### 6.3 Slug 3 — `api-business-events`
- **T56** — **Dado** un mensaje válido **cuando** `POST /api/v1/contact/messages` **entonces** hay un INFO `Contact message stored id=<n>` con `request_id` y sin nombre, correo, cuerpo ni IP. `INFRA/ContactMessagesResourceTest.java` (ampliar). A11.
- **T57** — **Dado** el campo `website` relleno **cuando** se envía **entonces** responde 201 y no hay línea «stored» ni de Telegram. `ContactMessagesResourceTest`. A11.
- **T58** — **Dado** cupo agotado **cuando** se envía **entonces** 429, la línea de access trae `err=CONTACT_RATE_LIMITED` y no hay «stored». `ContactMessagesResourceTest`. A11.
- **T59** — **Dado** un mensaje inválido **cuando** se envía **entonces** 400 y no hay «stored». `ContactMessagesResourceTest`. A11.
- **T60** — **Dado** `TelegramContactNotifier` contra un servidor HTTP falso (token canario `CANARY-BOT`) **cuando** responde 200, 401, 500 y está caído, y también sin configurar **entonces** hay INFO `sent`, WARN con solo el código HTTP, WARN con solo la clase del error, y solo DEBUG sin configurar; el `request_id` del hilo de la petición llega a los registros del callback; el token canario no aparece nunca. `INFRA/adapter/out/TelegramNotifierLoggingTest.java`. A11, A8.
- **T61** — **Dado** `PUT /admin/content/{kind}` **cuando** guarda **entonces** hay un INFO por idioma `Content cache invalidated kind=… lang=…` (dos), y uno tras un rollback; si el invalidador falla, se mantiene el WARN existente. `INFRA/ContentCacheInvalidationTest.java` (ampliar). A11.
- **T64** — **Dado** `PostgresContactMessageRepository.save` **cuando** inserta **entonces** el id que se loguea coincide con la fila guardada. `INFRA/adapter/out/PostgresContactMessageRepositoryTest.java`. A11.
- Sin test nuevo: los WARN de refresco de BD se conservan tal cual (comportamiento existente).

### 6.4 Slug 4 — `web-logging` (Vitest, `WEB`)
- **W1** — **Dado** `logEvent('info', 'contact', {…})` **cuando** se llama **entonces** escribe una sola línea JSON válida en stdout con `timestamp`, `level`, `service:"cv-web"`, `event`, `request_id` y los campos; WARN y ERROR van a stderr. `lib/log.test.ts`. A13.
- **W2** — **Dado** campos con objeto, función, circular o un `Error` **cuando** se registra **entonces** los objetos y funciones se descartan y el `Error` queda como su nombre de clase. `lib/log.test.ts`. A13.
- **W3** — **Dado** un valor con `\r\n`, comillas o más de 200 caracteres **cuando** se registra **entonces** sigue siendo una línea y el valor sale truncado y saneado. `lib/log.test.ts`. A13.
- **W4** — **Dado** campos con claves de la lista negra (`password`, `token`, `authorization`, `cookie`, `email`, `message`, `name`, `ip`, `body`, `website`) **cuando** se registran **entonces** se omiten. `lib/log.test.ts`. A13.
- **W5** — **Dado** `newRequestId` **cuando** se llama varias veces **entonces** son 32 hex distintos. `lib/request-id.test.ts`. A14.
- **W6** — **Dado** `requestJson` contra una API falsa **cuando** pide un recurso **entonces** envía `X-Request-Id`, y con un reintento usa el mismo id en ambos intentos. `lib/api/request.test.ts` (ampliar). A14.
- **W7** — **Dado** API con 503 **cuando** `requestJson` falla tras reintento **entonces** hay un WARN por intento con `event=api_call`, `path` sin query, `status=503`, `attempt`, `duration_ms` y `request_id`, sin host, sin query y sin cuerpo. `lib/api/request.test.ts`. A13.
- **W8** — **Dado** timeout o conexión rechazada **cuando** falla **entonces** WARN con `outcome=timeout` o `unreachable` y solo la clase o el código del error. `lib/api/request.test.ts`. A13.
- **W9** — **Dado** JSON roto o forma incorrecta **cuando** falla **entonces** WARN `outcome=invalid_response`. `lib/api/request.test.ts`. A13.
- **W10** — **Dado** una respuesta correcta **cuando** `requestJson` termina **entonces** no se emite ninguna línea. `lib/api/request.test.ts`. A13.
- **W11** — **Dado** API sana **cuando** `GET /api/health/` **entonces** 200 y ningún log; con API caída, 503 y un WARN `event=health outcome=degraded` con `request_id`. `app/api/health/route.test.ts`. A13.
- **W12** — **Dado** `checkApi` **cuando** consulta la API **entonces** envía `X-Request-Id`. `lib/api/health.test.ts`. A14.
- **W13** — **Dado** cada resultado de `forwardContact` (sent, rejected 400, rejected 429, upstream-error, timeout, unreachable) y las validaciones propias (415, 413, JSON roto, campo inválido) **cuando** se hace `POST /api/contact/` **entonces** hay una línea `event=contact` con `outcome`, `status` y, si procede, `code` o `reason` (nombre del campo, nunca su valor); la respuesta lleva `X-Request-Id`; el nivel es INFO para rechazos y validaciones y WARN para errores aguas arriba. `app/api/contact/route.test.ts`. A13, A14.
- **W14** — **Dado** un POST con canarios en `name`, `email`, `message`, `website` y `CF-Connecting-IP`, en éxito y con la API caída **cuando** se completa **entonces** ninguna línea contiene esos canarios ni la IP; `forwardContact` envía solo `Content-Type`, `X-Request-Id` y la IP válida. `app/api/contact/route.test.ts`, `lib/api/contact.test.ts` (ampliar). A13, A14.
- **W15** — **Dado** una causa de error cuyo mensaje trae una URL con un token canario **cuando** `requestJson` la registra **entonces** el log no contiene ni la URL ni el token. `lib/api/request.test.ts`. A13.
- **W16** — **Dado** `onRequestError` con `request.path` con query, cabeceras con `cookie` y `authorization` canarios y un error con digest **cuando** se llama **entonces** hay un ERROR `render_error` con `route_path`, `route_type`, `method`, `path` sin query, `digest` y clase del error, sin cabeceras ni mensaje. `instrumentation.test.ts`. A13.
- **W17** — **Dado** el servidor standalone contra una API falsa que responde 500 **cuando** `GET /` **entonces** la página es 500, el log del servidor trae una línea `api_call` con su `request_id` (la misma `X-Request-Id` que recibió la API falsa) y una línea `render_error`. `tests/runtime/logging.test.ts` (lento; usa `startStandalone().log()`). A13, A14. Es la prueba de que `instrumentation.ts` funciona en el standalone.
- **W18** — **Dado** el standalone con API falsa sana **cuando** `GET /api/health/` y un `POST /api/contact/` válido con canarios **entonces** health no deja líneas, el contacto deja exactamente una línea sin canarios, y la API falsa recibió el mismo `X-Request-Id` que la línea. `tests/runtime/logging.test.ts`. A13, A14.
- **W19** — **Dado** que el render del PDF falla **cuando** se pide **entonces** hay un WARN estructurado `event=pdf_render_failed` con `lang` y clase del error, y la ruta responde 404 como antes. `lib/pdf/build-cv-pdf.test.ts` (ampliar). A13.
- **W20** — **Dado** el layout del contenedor **cuando** se construye **entonces** el standalone incluye el `instrumentation` compilado y el `Dockerfile` y su `HEALTHCHECK` no cambian. `tests/runtime/docker-layout.test.ts` (ampliar). A13.
- **W21** — **Dado** el código de `lib`, `app` y `components` **cuando** se escanea (helper estilo `secret-scan`) **entonces** no hay `console.` fuera de `lib/log.ts`. `tests/log-gate.test.ts`. A13.

### 6.5 Slug 5 — `ops-log-docs`
- **D1** — **Dado** `deploy/docker-compose.yml` **cuando** se parsea **entonces** `cv-api` y `cv-web` tienen `logging.driver=json-file` con `max-size` y `max-file`, y los dos `healthcheck.test` son exactamente los actuales. Test existente del compose en `cv-web` (ampliar). A15.
- **D2** — **Dado** `scripts/smoke-test.sh` contra la imagen **cuando** pide `/api/v1/profile` con y sin `X-Request-Id` **entonces** la respuesta lleva la cabecera, y devuelve el mismo valor cuando se envía uno válido. Se ejecuta en el CI. A3, A15.
- **D3** — **Dado** `docs/observability.md` **cuando** se revisa **entonces** documenta formato de cada log, dónde leerlos en el NAS (Portainer: Containers → `cv-api` → Logs; `docker logs`) y cómo buscar por `request_id` y por `audit`. Verificación por revisión (no automatizable). A15.

### 6.6 Slug 6 — `api-metrics` (diferido; solo esbozo)
- **M1** — **Dado** `quarkus.management.enabled=true` y `quarkus.smallrye-health.management.enabled=false` **cuando** se piden `/q/health/ready` y `/q/metrics` en el puerto principal **entonces** health 200 y métricas 404.
- **M2** — **Dado** el puerto de gestión de test **cuando** se pide `/q/metrics/prometheus` **entonces** hay `http_server_requests` con la ruta como plantilla (sin ids sueltos) y sin etiquetas con datos personales.
- **M3** — **Dado** el compose **cuando** se revisa **entonces** no publica el 9000 y los healthchecks no cambian.

## 7. Privacidad y seguridad
- En endpoints públicos nunca hay IP, query string, cabeceras ni cuerpos: la IP solo se escribe en el MDC en rutas `/api/v1/admin*`.
- `request_id` es un valor opaco, validado y sin relación con el usuario.
- Log forging: `AuditEvent` sanea los detalles, el id de cliente se valida y el logger web sanea.
- Excepciones de BD: sin mensaje ni traza (T24, T25), porque los mensajes de PSQL pueden traer filas con datos de contacto.
- El token de Telegram forma parte de la URL de envío: el notificador solo loguea clases y códigos, y T60 lo prueba con un token canario.
- El repo es público: ningún secreto ni dato real en tests; los canarios son cadenas ficticias.
- Retención: Docker rota los logs, así que un audit antiguo se pierde. No hay tabla de auditoría (decisión, ver Alternativas).

## 8. Datos y resiliencia
- Fallos del log: `AuditLog` no lanza (T45); si falla el logging, la operación sigue.
- Rendimiento: el access log es síncrono pero barato; el único coste extra es el handler Vert.x (un UUID y un MDC por petición).
- Sin estado nuevo en BD. Una sola instancia de API (ya asumido).
- La web no pierde disponibilidad por logs: `logEvent` no lanza y usa solo `console`.
- Rotación: `max-size` y `max-file` en el compose limitan el volumen en el NAS; sin eso Docker no rota por defecto (Riesgo 13).

## 9. Alternativas descartadas
- **Filtro JAX-RS propio para el access log**: no ve el 413 de `RequestBodyLimits` ni los rechazos previos al enrutado, y duplica lo que ya hace Quarkus.
- **Handler Vert.x propio para el access log** (campos JSON estructurados): daría campos nativos (`status`, `duration_ms`) pero reimplementa exclusiones y formato. Es el plan B si T1 y T22 muestran que `%{X,…}` no resuelve el MDC del handler propio.
- **Auditoría en el adaptador de entrada** (en los recursos, sin puerto): no sabría la causa real (bloqueo, límite) y mezcla seguridad con transporte.
- **Auditoría en BD (tabla `audit_log`)**: persiste más, pero añade migración, retención y acceso; excesivo para un solo administrador.
- **`proxy.ts` en la web** para request id y log por visita: solo ve el inicio de la petición, choca con el `proxy.ts` de la fase 3 y no da estado ni duración.
- **`quarkus.log.console.json` también en dev/test**: peor lectura; la guía recomienda texto en dev.
- **Métricas ahora**: ver Riesgo 2.

## 10. Riesgos y dudas
**Decisiones pendientes del humano**
1. **IP en logs públicos.** Recomiendo NO registrarla (valor por defecto del plan). La IP solo se registra en rutas admin.
   - **Conflicto en producción:** con `CV_ADMIN_EDGE_BLOCK=true`, cualquier petición admin con `CF-Connecting-IP` recibe 404, y la llamada legítima de `cv-web` (red interna) no la lleva.
   - Por eso el plan lee también `X-Client-IP`, que el panel de la fase 3 de `cv-web` deberá enviar con la IP del navegador.
   - Hasta entonces, el audit sale con `ip=-` salvo sondas desde el túnel (T19, que sí quedan con IP y son útiles para fuerza bruta).
   - `X-Client-IP` es falsificable por quien alcance el contenedor desde la red interna, y solo afecta a la fidelidad del log. Hay que confirmar que el humano acepta esta cabecera nueva.
2. **Métricas ahora o después.** Recomiendo **después** (slug 6), sin bloquear logs, auditoría ni request id.
   - Activar `quarkus.management.enabled=true` mueve health, y por tanto `/q/health/ready`, al 9000 y rompe el compose y `cv-web`; solo se evita con `quarkus.smallrye-health.management.enabled=false`.
   - Habría que comprobar además que OpenAPI/Swagger no se mueven.
   - `cv-api` comparte red con cloudflared (`padelhub_default`), así que un 9000 sin autenticación sería alcanzable desde esa red. Habría que activar `quarkus.management.auth` o limitar el host.

**Desviaciones o decisiones de diseño que conviene validar**
3. **Comentario del guardado.** El brief pide registrar el comentario. Recomiendo registrar solo `comment_present` y `comment_length`: es texto libre y el repo es público. Si se quiere el texto, truncar a 80 caracteres.
4. **`request_id` en el cuerpo problem+json.** El brief lo propone. Recomiendo **solo la cabecera** `X-Request-Id`, que está en todas las respuestas incluso cuando el cuerpo no es problem+json. Añadir un campo al cuerpo cambia `ProblemResponse`, el OpenAPI y la regeneración de `lib/api/schema.d.ts` en `cv-web`. Queda como mejora posterior.
5. **Documentar `X-Request-Id` en OpenAPI** (cabecera de respuesta en todas las operaciones y parámetro opcional): coherente con `CLAUDE.md`, pero `OpenApiDocumentTest` y el tipado de `cv-web` cambian. Lo dejo fuera de esta entrega salvo que el humano lo pida.
6. **Mensajes de BD.** Los tres WARN de refresco de BD (`PostgresResumeRepository`, `PostgresSiteContentRepository`) imprimen la excepción con su mensaje (puede llevar host o URL, no filas). Recomiendo aplicarles también `ErrorLogDescription`; está marcado opcional en el slug 1.

**Hipótesis sin verificar, que cubren los tests**
7. **`System.Logger` y MDC:** los logs de `application` usan `System.Logger`. Que lleven `request_id` depende de cómo JBoss LogManager los enruta; no lo comprobé. Si no lo hacen, esos WARN saldrían sin id y habría que pasarlos por el puerto o por JBoss Logging. Lo cubre T11/T13 de forma indirecta; añadir un caso explícito en el slug 3.
8. **MDC en el callback de Telegram** (hilo de `HttpClient`): hay que copiar y restaurar el mapa a mano; lo cubre T60.
9. **`%{X,request_id}` y `exclude-pattern`:** no probé que el handler Vert.x propio rellene el MDC que lee el access log, ni la semántica exacta de `exclude-pattern` (si compara el path completo o un prefijo). Lo cubren T1, T5 y T11. El plan B es el handler propio de la sección 9.
10. **`key-overrides` y `excluded-keys`:** nombres y sintaxis tomados del jar, sin probar. Si T21 falla, se acepta el formato por defecto y se ajusta el cableado de la web.
11. **Honeypot invisible:** un envío con el campo trampa responde 201 sin dejar rastro (T57 solo prueba la ausencia de «stored»). Ver bots requeriría un evento nuevo desde `SubmitContactMessageService`; lo dejo fuera.

**Web**
12. **Sin log por visita de página.** El standalone de Next no ofrece un hook con estado y duración sin `proxy.ts`; las visitas se ven por el access log de la API (4 lecturas por render) y por Cloudflare. Las lecturas correctas son silenciosas a propósito (W10). `onRequestError` en el standalone no está demostrado hasta W17; si falla, el fallback es capturar el error en la propia página y loguearlo allí.

**Operación**
13. **Rotación de logs:** Docker `json-file` no rota por defecto. El `logging:` con `max-size: 10m` y `max-file: 5` por servicio (en el compose y su test) va en el slug 5. Confirmar con el humano cuánto espacio da el NAS.
14. **Trazabilidad de fuerza bruta:** `recordFailure` no devuelve el recuento de fallos ni si bloqueó la cuenta, así que el momento del bloqueo solo se deduce del siguiente `LOGIN_LOCKED`. Cambiarlo toca el puerto, el adaptador y los fakes; no lo propongo.
15. **Estabilidad de tests:** la línea de access sale después de que RestAssured recibe la respuesta; los tests deben esperar con polling (`LogRecords.await`), no asumirla inmediata.
16. **Estado del repo `cv`:** hay muchos archivos modificados sin commit (`git status`: `ci.yml`, `ARCHITECTURE.md`, `CLAUDE.md`, `README.md`, `ErrorCode.java`, `ContactMessageRepository.java`, etc.). El slug 3 toca `PostgresContactMessageRepository` y servicios cercanos; conviene que esos cambios estén integrados antes de empezar para no mezclar.

## 11. Slugs hijos recomendados (orden y dependencias)
1. **`api-logging-core`** (cv) — sin dependencias. Extensión JSON, configuración, `RequestContextHandler`, `ClientIp`, `RequestIds`, access log, `error_code`, `ErrorLogDescription`, `LogRecords` y los tests T1–T25 y T29.
2. **`api-audit-log`** (cv) — depende de 1 (MDC, IP, `LogRecords`). Puerto `AuditLog`, `AuditEvent`, adaptador, cambios en los nueve servicios y tests T31–T54.
3. **`api-business-events`** (cv) — depende de 1; puede ir en paralelo con 2. Contacto, Telegram, invalidación de caché y tests T56–T64.
4. **`web-logging`** (cv-web) — depende de 1 solo para que la API ya acepte y devuelva `X-Request-Id` (se puede desarrollar en paralelo con 2 y 3). `lib/log.ts`, id en las llamadas, contacto, health, PDF, `instrumentation.ts` y tests W1–W21.
5. **`ops-log-docs`** (cv + cv-web) — depende de 1 y 4. Rotación en el compose (D1), smoke (D2) y `docs/observability.md` más enlaces (D3).
6. **`api-metrics`** (cv, **diferido** hasta la decisión del humano) — depende de 1. Micrometer/Prometheus en gestión interna con health en el puerto principal (M1–M3).

Archivos relevantes:
- `cv: infrastructure/src/main/resources/application.properties`
- `cv: infrastructure/src/main/java/dev/julioflores/cv/infrastructure/config/RequestBodyLimits.java`
- `cv: infrastructure/src/main/java/dev/julioflores/cv/infrastructure/adapter/in/rest/error/ProblemExceptionMapper.java`
- `cv: infrastructure/src/main/java/dev/julioflores/cv/infrastructure/config/UseCaseConfig.java`
- `cv: infrastructure/src/test/java/dev/julioflores/cv/infrastructure/ArchitectureTest.java`
- `cv-web: lib/api/request.ts`
- `cv-web: app/api/contact/route.ts`
- `cv-web: deploy/docker-compose.yml`
