# impl — api-admin-auth

Estado: **hecho**. Código en el working tree de `cv` (sin commits, sin ramas).
Verificación (tras la ronda 1 de revisión): `mvn -B verify` verde (256 pruebas) y `python3 scripts/ci-summary.py --min-total 90 --min-module 80` verde: total 96,5 %, application 100 %, domain 91,1 %, infrastructure 96,6 %.
Prueba real con `mvn quarkus:dev` + curl (ver al final).

## Mapa Tn → test

| Tn | Test |
|---|---|
| T7 | `domain/.../AdminPasswordPolicyTest#acceptsOnlyTwelveToOneTwentyEightDifferentFromTheCurrentOne` |
| T8 | `domain/.../AdminPasswordPolicyTest#lengthCountsCodePointsNotBytes` |
| T9–T15 | `application/.../LoginAdminServiceTest` (T9 `correctPassword...`, T10 `wrongPassword...`, T11 `missingAccount...`, T12 `lockedAccount...`, T13 `anExpiredLock...`, T14 `anExhaustedGlobalLimit...`, T15 `anOldCostHash...`) |
| T16, T17 | `application/.../VerifyAdminSessionServiceTest` |
| T18–T20 | `application/.../ChangeAdminPasswordServiceTest` |
| T21 | `application/.../LogoutAllSessionsServiceTest` |
| T63–T66 | `infrastructure/.../adapter/out/Argon2PasswordHasherTest` |
| T67 | `infrastructure/.../adapter/out/MigrationsTest` (Flyway real en un esquema aparte: V1..V3 y luego V4) |
| T69–T71 | `infrastructure/.../adapter/out/PostgresAdminAccountRepositoryTest` |
| T72–T81 | `infrastructure/.../AdminAuthResourceTest` (T76 ampliado en la ronda 1: campo con tipo erróneo, `[]` y `null` dan 400 `BAD_REQUEST` en `application/problem+json`) |
| T82–T84 | `infrastructure/.../AdminSecurityTest` |
| T85, T86 | `infrastructure/.../ApiCacheHeadersTest` |
| T87 | `infrastructure/.../AdminDisabledTest` (`@TestProfile`, secreto corto) + `AdminNoSecretTest` (`@TestProfile`, secreto vacío: arranca, `/api/v1/profile` 200, login 404 `NOT_FOUND`) |
| T88 | `infrastructure/.../AdminEdgeGuardTest` (`@TestProfile`, `cv.admin.edge-block=true`) |
| T89 | `infrastructure/.../AdminSessionFilterTest` (hilo + BD caída; usa `ThreadRecordingAccountRepository`, alternativa solo de test) |
| T90 | `infrastructure/.../adapter/out/InMemoryRateLimiterTest#theLoginLimitIsTenPerMinute...` (limitador e independencia de los dos beans) + `AdminLoginRateLimitTest` (HTTP, perfil con el límite real de 10/min) |
| T117 (parte auth) | `ProblemCatalogTest` existente cubre solos los códigos nuevos (paridad de claves, título/detalle ES/EN, argumento) + `adminErrorsHaveTheirDocumentedStatuses` |
| T118 (parte auth) | `OpenApiDocumentTest#adminAuthOperationsAreDocumentedWithTagSecurityAndOutputs`, `#adminAuthErrorsUseProblemJsonWithExamplesAndRequestBodiesAreDocumented`, `#problemSchemaListsTheAdminCodes`, y `everyEndpointIsPresentAndOnlyThose` ampliado |
| T121 (parte auth) | `ArchitectureTest#cryptoLibrariesLiveOnlyInOutboundAdaptersAndConfig`, `#domainAndApplicationDoNotUseCryptoOrJwtLibraries`, `#onlyTheSecurityAdapterTouchesArgon2AndJwtBuilding` |

T68 (V5), T91–T95 (CLI), T119, el resto de T117/T118/T120 y `software.amazon` real (aún no hay dependencia) quedan fuera de alcance. Las reglas `software.amazon..` ya están escritas y se aplicarán cuando llegue el slug de imágenes.

## Criterio → tests

- CA1: T10, T11, T64, T73, T74
- CA2: T9, T15, T63, T65, T66, T72, T77
- CA3: T10, T12–T14, T19, T69, T70, T75, T90
- CA4: T7, T8, T16–T21, T71, T78–T81
- CA5: T16, T17, T76, T82–T84, T89
- CA6: T87
- CA7: T85, T86
- CA18: T88
- CA19 (parte auth): T73, T117
- CA20 (parte auth): T118
- CA21 (parte auth): T121
- CA23 (solo V4): T67

## Extras fuera del plan (anotados)

- `AdminAccountTest` (invariantes y `isLockedAt`).
- `LoginAdminServiceTest#aCurrentCostHashIsNotRewritten` (negativo de T15).
- `ChangeAdminPasswordServiceTest#aLockedAccountCannotChangeThePassword` y `#withoutAnAccountTheSessionIsUnauthorized`.
- `Argon2PasswordHasherTest#aTamperedHashWithAbsurdParameters...` (topes de memoria, iteraciones y paralelismo al leer un hash).
- `PostgresAdminAccountRepositoryTest`: `invalidatingSessions...`, `replaceHashOnlyWorks...`, `withoutAnAccountReadsAreEmpty...`.
- `AdminAuthResourceTest`: cambio de contraseña con campos ausentes (400), cuenta bloqueada no puede cambiar contraseña (429), la sesión no expone hash.
- `AdminSecurityTest`: una ruta admin inexistente da 404 genérico; token sin `sv`, payload manipulado y basura.
- `AdminEdgeGuardTest#publicRoutesAreNotAffected...`.
- `ErrorHandlingTest#securityForbiddenIsAProblem403` (+ ruta `/test/boom/forbidden` solo de test) para el mapeo `FORBIDDEN`.
- `ArchitectureTest#theSecurityAdapterIsActuallyAnalysed` (anti falso positivo).

## Decisiones tomadas durante la implementación

1. **Autenticación diferida + `applies-to=JAXRS`.** Con la autenticación proactiva y política de rutas en la capa Vert.x, el 401 sin token/inválido salía como respuesta vacía (sin `application/problem+json`). Con `quarkus.http.auth.proactive=false` y `quarkus.http.auth.permission.*.applies-to=JAXRS` los fallos pasan por `ProblemExceptionMapper` y salen como problem+json con `WWW-Authenticate: Bearer`. Consecuencias: (a) un `Authorization: Bearer` inválido en una ruta pública se ignora (200); T84 ancla este comportamiento real (el plan esperaba 401); (b) una ruta admin que no existe responde 404 genérico en vez de 401 (no se filtra qué rutas hay).
2. **JWK desde un secreto en bruto.** SmallRye no acepta el secreto HS256 sin más (pide JWK). `AdminJwtKeyConfigInterceptor` (`ConfigSourceInterceptor`, registrado en `META-INF/services`) sirve `smallrye.jwt.verify.secretkey` como el JWK de `cv.admin.jwt.secret`; el operador solo pone `CV_ADMIN_JWT_SECRET`. La firma usa `sign(SecretKeySpec(bytes UTF-8))` (con `signWithSecret` la firma no coincidía con la verificación).
3. `mp.jwt.verify.publickey=NONE`: sin esto Quarkus inventa un par RSA en dev/test que ignora el secreto.
4. Tolerancia de reloj: `mp.jwt.verify.clock.skew=5` y `smallrye.jwt.expiration.grace=0` (por defecto SmallRye admite 60 s de token caducado; T83 lo detectó).
5. **Admin deshabilitado** (secreto ausente, vacío o < 32 caracteres): `AdminEdgeGuard` (filtro `preMatching`) responde 404 `NOT_FOUND` a toda ruta `/api/v1/admin`; `AdminConfig` lee el secreto como `Optional<String>` y avisa en el log al arrancar. Se unió al guard de Cloudflare en una sola clase. (La versión inicial de esta decisión era incorrecta: sin la variable la API no arrancaba; corregido en la ronda 1, ver más abajo.)
6. `AdminEdgeGuard` es un filtro JAX-RS, no de Vert.x: con `proactive=false` va antes que la autenticación, así que un 404 sale incluso sin token.
7. Cambio de contraseña con cuenta bloqueada: 429 `ADMIN_LOGIN_LOCKED` (un token robado no debe poder adivinar la contraseña actual sin freno). El plan solo decía que un fallo cuenta para el bloqueo.
8. `changePassword` (SQL) también limpia `failed_attempts` y `locked_until`, como el `set-password` del plan.
9. `replaceHash` (rehash) solo escribe si el hash guardado sigue siendo el esperado (no pisa un cambio de contraseña concurrente).
10. `AdminSessionFilter` no es `nonBlocking`: Quarkus REST lo ejecuta en un worker (comprobado por T89). `GET /auth/session` vuelve a verificar la versión (dos lecturas por PK; despreciable).
11. `InMemoryRateLimiter` ya no es bean: `RateLimiterConfig` produce dos instancias `@Named` (contacto y login). Login global: clave única `admin-login`, 10/min (`cv.admin.login.rate-limit.*`); en test `max=100000` salvo en `AdminLoginRateLimitTest`.
12. `Clock` (UTC) producido en `UseCaseConfig`; los servicios lo reciben por constructor.
13. `Cache-Control: no-store` en toda respuesta de `/api/v1/admin` (también errores).
14. OpenAPI: `bearerAuth`, etiqueta Admin, 401 y cabecera `Cache-Control: no-store` añadidos por `OpenApiResponseFilter`; el filtro no se ejecuta sobre rutas no admin de forma distinta a antes.

## Parámetros de Argon2id

Por defecto (`cv.admin.argon2.*`): **m = 65536 KiB (64 MiB), t = 3, p = 1**, sal de 16 bytes, hash de 32 bytes, formato PHC `$argon2id$v=19$m=…,t=…,p=…$sal$hash`; máximo 2 hashes concurrentes. En tests: m=1024, t=1, p=1. Medido en este Mac (JVM en frío): hash ≈ 240 ms, verificación ≈ 100 ms. **Medir en el NAS real** (R-12). Al leer un hash guardado se rechazan parámetros fuera de m ≤ 1 GiB, t ≤ 64, p ≤ 16.

## Dependencias y ficheros nuevos

`infrastructure/pom.xml`: `quarkus-smallrye-jwt`, `quarkus-smallrye-jwt-build`, `bcprov-jdk18on` (versiones del BOM). Migración `V4__admin_account.sql`. Propiedades `cv.admin.*` y `CV_ADMIN_*` en `application.properties` (secreto solo por entorno; el de test es una constante de `%test`). Variables: `CV_ADMIN_JWT_SECRET`, `CV_ADMIN_SESSION_LIFESPAN`, `CV_ADMIN_LOGIN_MAX_FAILURES`, `CV_ADMIN_LOGIN_LOCK`, `CV_ADMIN_EDGE_BLOCK`.

## Prueba real (curl contra `mvn quarkus:dev`, DevServices Postgres, cuenta creada por SQL con un hash del propio `Argon2PasswordHasher`)

- Login con contraseña mala: 401 `ADMIN_INVALID_CREDENTIALS` (problem+json, `WWW-Authenticate: Bearer`, `no-store`).
- Login correcto: 200 con token; `GET /session`: 200.
- Sin token: 401 `ADMIN_UNAUTHORIZED` en problem+json.
- Cambio de contraseña: 200 con token nuevo; el viejo da 401, el nuevo 200.
- 5 fallos seguidos y un sexto con la contraseña correcta: 429 `ADMIN_LOGIN_LOCKED` con `Retry-After: 899`.
- `logout-all`: 204 y el token queda en 401. Cuerpo vacío en el login: 400.
- Con `CV_ADMIN_EDGE_BLOCK=true`, petición con `CF-Ray`: 404.
- GET público (`/api/v1/services`): conserva `Cache-Control: public, max-age=300` y `Vary: Accept-Language`.
(El perfil público dio 404 en dev solo porque la BD de dev no tiene el CV cargado.)

## Riesgos abiertos

- El comportamiento de la autenticación (decisión 1) difiere del plan en T84 y en las rutas admin inexistentes; si se prefiere 401 uniforme habría que volver a la autenticación proactiva y construir un manejador de fallos propio.
- Argon2 sin medir en el NAS (R-12).
- El bloqueo por cuenta sigue siendo un vector de denegación (R-4); el `unlock` llega con el CLI (slug `api-admin-password-cli`).
- La regla de Cloudflare que bloquea `/api/v1/admin/*` sigue siendo tarea del humano (R-1); `CV_ADMIN_EDGE_BLOCK=true` es solo defensa en profundidad.
- Límite de login en memoria y sin IP: válido con una sola réplica (R-14).
- No se actualizaron README/ARCHITECTURE/CLAUDE ni el compose (slug `api-admin-docs-deploy`).
- El upsert de la cuenta no existe en el código (solo en pruebas por SQL); hasta el CLI hay que crearla a mano.

## Correcciones de la ronda 1 de revisión

- **CR-1 (arranque sin secreto).** Causa: `cv.admin.jwt.secret=${CV_ADMIN_JWT_SECRET:}` resolvía a vacío (= ausente en SmallRye) y `@ConfigProperty(defaultValue = "")` no lo evitaba. Arreglo: se quitó esa línea de `application.properties` (la variable de entorno `CV_ADMIN_JWT_SECRET` se asigna sola a `cv.admin.jwt.secret`) y `AdminConfig` lee `Optional<String>`. `AdminJwtKeyConfigInterceptor` devuelve `null` sin secreto y `mp.jwt.*` no obligan a tener clave: no hacen fallar el arranque. Nuevo `AdminNoSecretTest` (secreto vacío). **Comprobado en ejecución real sin la variable**: con `mvn quarkus:dev` y con el jar empaquetado (perfil prod, contra un Postgres desechable): arranca, aviso `Admin disabled` en el log, `/api/v1/services` 200, `/q/health/ready` 200, `POST /api/v1/admin/auth/login` 404 `NOT_FOUND`. El plan (CA6) queda cumplido.
- **CR-2 (cuerpos con tipo erróneo).** `ProblemExceptionMapper.unreadableBody` mapea `MismatchedInputException` y `JsonProcessingException` a 400 `BAD_REQUEST` en problem+json (hay que nombrar `MismatchedInputException` explícitamente: el mapeador integrado de quarkus-rest-jackson gana frente a su clase padre). T76 ampliado y `passwordChangeWithWrongTypesIsAProblem400` (extra) para `PUT /auth/password`. Nota: Jackson coerciona escalares y registra un único argumento como creador, así que `{"password":5}` y `"x"` se leen como la contraseña `"5"`/`"x"` y dan 401, no 400; es comportamiento de Jackson, sin fuga de información.
- **CR-3 (limpieza).** `AdminPaths` es la única fuente del prefijo (`ADMIN_ROOT`, `ADMIN_PREFIX`, `LOGIN_PATH`) y aloja `sessionVersion(JsonWebToken)`, que antes vivía estático en el filtro; el claim `sv` es una sola constante, `AdminConfig.SESSION_VERSION_CLAIM` (en `config`, porque `adapter.in` no puede importar de `adapter.out`). Imports de `UseCaseConfig` ordenados.

Observaciones del reviewer fuera de alcance: no tocadas (reinicio del contador al expirar el bloqueo, barra final en `/login/`, `ThreadRecordingAccountRepository` global, docs). La del contador es decisión de producto pendiente del humano.
