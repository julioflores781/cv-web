# review — api-admin-auth

Revisor: independiente (no se tomó nada de `impl.md` sin comprobarlo). Repo revisado: `cv` (working tree, sin commits).

## Veredicto final (ronda 2): APPROVED

CR-1, CR-2 y CR-3 verificados (ver "Ronda 2" al final). La ronda 1 queda debajo como histórico; sus "Cambios requeridos" están resueltos.

## Veredicto ronda 1: CHANGES REQUESTED

Hay un fallo funcional grave (CA6/T87: sin `CV_ADMIN_JWT_SECRET` la API **no arranca**) y un incumplimiento del contrato de errores (T76). El resto de la seguridad está bien hecha y verificada en vivo.

## Verificación ejecutada por mí

- `mvn -B verify`: BUILD SUCCESS, 254 pruebas, 0 fallos.
- `python3 scripts/ci-summary.py --min-total 90 --min-module 80`: verde. Total 96,4 %, application 100 %, domain 91,1 %, infrastructure 96,5 %.
- `ArchitectureTest` (13 pruebas), `ProblemCatalogTest` (8) y `OpenApiDocumentTest`: verdes, incluidas las reglas y comprobaciones nuevas.
- API arrancada por mí (`mvn quarkus:dev`, DevServices Postgres, cuenta creada por SQL con un hash generado por `Argon2PasswordHasher` con los parámetros de producción m=65536, t=3, p=1). Procesos y contenedores limpiados al terminar.

Resultados en vivo (todo coincide con el contrato salvo lo indicado en "Cambios requeridos"):

| Prueba | Resultado |
|---|---|
| Login con contraseña mala | 401 `ADMIN_INVALID_CREDENTIALS`, `problem+json`, `WWW-Authenticate: Bearer`, `Cache-Control: no-store` |
| Login correcto, `GET /session` | 200 |
| Sin token | 401 `ADMIN_UNAUTHORIZED` problem+json |
| Cuenta inexistente vs. contraseña mala | mismo cuerpo; tiempos 0,18-0,22 s en ambos casos (el hash falso iguala tiempos) |
| 5 fallos, y login correcto con la cuenta bloqueada | 429 `ADMIN_LOGIN_LOCKED`, `Retry-After: 899`; también bloquea el cambio de contraseña |
| 8 fallos en paralelo | los 8 cuentan: `failed_attempts = 8`, bloqueo aplicado (contador exacto) |
| Límite global de 10 por minuto | 429 `ADMIN_LOGIN_RATE_LIMITED` |
| Cambio de contraseña | token viejo 401, token nuevo 200, contraseña vieja 401, la nueva 200; contraseña actual mala 403 (no 401); débil o igual 422 |
| `logout-all` | 204, todos los tokens a 401 |
| Tokens: `alg=none`, `None`, HS384 con el secreto real, `sv` como string, float o enorme, `Bearer` solo, `Basic`, cabecera de 20 KB | siempre 401, nunca 500 |
| `CV_ADMIN_EDGE_BLOCK=true` con `CF-Ray` / `cf-connecting-ip` | 404 también con `//`, `/` final, `%61dmin`, `/./`, `/x/../`, `;a=1`, `%2F`; sin cabeceras CF las mismas variantes siguen exigiendo token |
| GET público | conserva `Cache-Control: public, max-age=300` y `Vary: Accept-Language`; un `Bearer` basura no le afecta |
| Contraseña de 100 KB / 200 KB | 401 en 0,19 s / 413 |
| Logs | sin contraseñas, tokens ni `Authorization`; el secreto solo se usa por config |
| **Arranque sin `CV_ADMIN_JWT_SECRET`** | **FALLA: la API no arranca** (ver CR-1) |

## Trazabilidad Tn ↔ it()

Cada Tn del alcance tiene un test real que hace lo que dice la descripción (leídos uno a uno):

- T7, T8: `AdminPasswordPolicyTest`.
- T9-T15: `LoginAdminServiceTest` (T11 comprueba que se verifica una vez contra el hash falso; T12 comprueba 600 s y que no se verifica el hash; T14 hace explotar `find()` si se consulta).
- T16, T17: `VerifyAdminSessionServiceTest`.
- T18-T20: `ChangeAdminPasswordServiceTest` (T20 cubre corta, igual a la actual y en blanco).
- T21: `LogoutAllSessionsServiceTest`.
- T63-T66: `Argon2PasswordHasherTest` (PHC, sal distinta, hash corrupto, otro algoritmo, `needsRehash`, 128 `ñ`, emoji).
- T67: `MigrationsTest` (Flyway real en esquema aparte, V1..V3 y luego V4, rechaza `id<>1`, hash no argon2id, `session_version=0`).
- T69: `PostgresAdminAccountRepositoryTest` con 8 hilos reales, contador exacto (24).
- T70, T71: ídem.
- T72-T81: `AdminAuthResourceTest`.
- T82-T84: `AdminSecurityTest`. T82 recorre `/openapi.json` dinámicamente. T83 cubre firma ajena, caducado, iss, aud, `sv` distinto, `alg=none`, payload manipulado, basura y sin `sv`.
- T85, T86: `ApiCacheHeadersTest`.
- T87: `AdminDisabledTest`. **Cubre solo el secreto corto; la mitad «sin secreto» no está cubierta y está rota (CR-1).**
- T88: `AdminEdgeGuardTest`.
- T89: `AdminSessionFilterTest` (nombre del hilo sin `eventloop`; BD caída da 500 `UNEXPECTED` sin detalles).
- T90: `InMemoryRateLimiterTest` + `AdminLoginRateLimitTest` (límite real por HTTP).
- T117: `ProblemCatalogTest` (existente + `adminErrorsHaveTheirDocumentedStatuses`).
- T118: `OpenApiDocumentTest` (3 pruebas nuevas + `everyEndpointIsPresentAndOnlyThose`).
- T121: `ArchitectureTest` (3 reglas + anti falso positivo).

**T76:** cubre cuerpo vacío, `{}`, JSON cortado y content-type erróneo, pero no un campo con tipo incorrecto, que hoy rompe el contrato (CR-2).

## Trazabilidad criterios ↔ tests

CA1 (T10, T11, T64, T73, T74), CA2, CA3, CA4, CA5, CA7, CA18, CA19 (parte auth), CA21 (parte auth), CA23 (V4, T67): cubiertos y comprobados en vivo. **CA6: no se cumple** (CR-1). CA20 (parte auth): cubierto.

## Revisión de seguridad (con rigor)

Correcto, comprobado en código y en vivo:

- **Argon2id** (`Argon2PasswordHasher`): BouncyCastle, m=64 MiB, t=3, p=1, sal de 16 bytes con `SecureRandom`, hash de 32, formato PHC `$argon2id$v=19$m,t,p$sal$hash`. Verificación con `MessageDigest.isEqual` (tiempo constante). Un hash corrupto o de otro algoritmo da `false` sin excepción. Topes al leer parámetros (m ≤ 1 GiB, t ≤ 64, p ≤ 16). Semáforo de 2 y la memoria se reserva dentro de `generateBytes` (comprobado con `javap`: `allocateMemory` es privado y se llama desde `generateBytes`), así que el semáforo sí acota la memoria.
- **Hash falso** sin cuenta (`LoginAdminService:55`), con los parámetros vigentes. Tiempos iguales medidos.
- **JWT**: HS256 fijado (`smallrye.jwt.verify.algorithm`), `alg=none`/HS384 rechazados, `iss`/`aud`/`exp` validados, gracia de caducidad 0 con 5 s de skew de reloj, secreto mínimo 32 caracteres, `mp.jwt.verify.publickey=NONE` para que no valga un par RSA inventado.
- **`sv` contra la BD en cada petición** (`AdminSessionFilter`), sin caché, en un hilo trabajador (T89), con `sv` ausente, no numérico o fuera de rango dando 401. Además la política `authenticated` de `quarkus.http.auth.permission` es una segunda barrera (falla cerrado, también con `/login/`).
- **Bloqueo atómico**: una sola sentencia `UPDATE ... failed_attempts + 1 ... CASE` (exacto bajo concurrencia, probado con hilos y por HTTP).
- **Mensajes**: mismo 401 para cuenta inexistente y contraseña mala; 403 y no 401 en contraseña actual incorrecta; `Retry-After` presente; el cambio de contraseña con la cuenta bloqueada responde 429 (un token robado no puede adivinar la actual).
- **`Cache-Control: no-store`** en toda respuesta admin (también errores y 404) y los GET públicos intactos. **`AdminEdgeGuard`**: sin bypass por variantes de ruta.
- **Sin 500** ante tokens o cuerpos malformados (salvo BD caída, que da 500 genérico sin detalles). No se filtran detalles internos (T89 y `ErrorHandlingTest`).
- **Secretos en el repo**: ninguno real. El secreto de test es una constante bajo `%test`; el de producción solo por entorno; `private/` está en `.gitignore` y sin trackear.
- **Capas**: `domain` y `application` sin librerías de crypto/JWT; el cableado solo en `UseCaseConfig`; las reglas ArchUnit nuevas pasan.

## Skills consultadas

- `simplify`: duplicación en `AdminSessionFilter.java:18` (`"/api/v1/admin/"`) frente a `AdminPaths.java:17` (el mismo prefijo escrito dos veces); `AdminSessionFilter.java:20` (`SESSION_VERSION_CLAIM = "sv"`) duplica `SmallRyeSessionTokenIssuer.java:22`; `AdminSessionFilter.sessionVersion` es estático y lo usa `AdminAuthResource.java:113` (acoplamiento entre dos clases por un helper de paquete). Orden de imports roto en `UseCaseConfig.java:45-46` (`java.time.Clock` entre `jakarta.*`) y `:12-22`. Ver CR-3.
- `strict-typing`: sin hallazgos (sin `Object` evitable salvo `jwt.getClaim`, que es la API de MicroProfile y se discrimina con `instanceof`).
- `testing-strategy`: la cobertura de T87 y T76 deja huecos (CR-1, CR-2); resto sin hallazgos.
- `security-best-practices`: no aplica (Java, fuera de python/js/ts/go). Se hizo la revisión de seguridad manual descrita arriba.
- `next-best-practices`, `seo-audit`, `ui-ux-pro-max`: no aplican (API Quarkus, sin UI ni SEO).

## Checkpoints C1–C7

Los `CHECKPOINTS.md` y `web-standards` son de cv-web y no aplican a un cambio de la API `cv`; se evaluaron las reglas de `cv/CLAUDE.md`:

- Capas y un caso de uso por interfaz: OK.
- Errores con código estable (`ErrorCode`, `ApiError`, `problems_*.properties`, `ProblemCatalogTest` verde): OK.
- Swagger completo (`OpenApiDocumentTest` verde): OK.
- `@QuarkusTest` para adaptadores, sin HTTP en `@BeforeAll`: OK.
- Cobertura ≥ 90 % y ≥ 80 % por módulo: OK.
- CV ficticio: OK.
- Sin secretos: OK.

## Cambios requeridos

**CR-1 (bloqueante). Sin `CV_ADMIN_JWT_SECRET` la API no arranca (CA6, T87 incumplidos).**
Reproducido: `mvn quarkus:dev` sin la variable da `ConfigurationException: Failed to load config value of type class java.lang.String for: cv.admin.jwt.secret` y toda la API (también la pública) responde 500. Causa: `application.properties:46` (`cv.admin.jwt.secret=${CV_ADMIN_JWT_SECRET:}`) resuelve a cadena vacía, que SmallRye trata como valor ausente, y `AdminConfig.java:27` usa `defaultValue = ""`, que tampoco lo evita. Es grave: desplegar esta imagen sin añadir antes el secreto al compose tumba el CV público. `impl.md` (decisión 5) afirma lo contrario y T87 solo prueba un secreto corto.
Arreglo esperado: leer el secreto como `Optional<String>` (o equivalente que admita vacío o ausente), manteniendo `enabled()` y el aviso; comprobar que `AdminJwtKeyConfigInterceptor` y `mp.jwt.*` no hacen fallar el arranque sin clave. Añadir un test (perfil que deje el secreto vacío o ausente) que compruebe que arranca, `/api/v1/profile` da 200 y `/api/v1/admin/auth/login` da 404 `NOT_FOUND`; y probarlo también con una ejecución real sin la variable.

**CR-2. Un campo con tipo incorrecto rompe el contrato de errores (T76, CA5).**
`POST /api/v1/admin/auth/login` con `{"password":{"a":1}}` o `{"password":["a"]}` responde 400 con `application/json` y cuerpo `{"objectName":"Class","attributeName":"password","line":1,"column":13,"value":null}` (el cuerpo por defecto de Quarkus, que además revela nombres internos). Con `[]` o `"x"` responde 400 con cuerpo vacío y sin tipo. Lo mismo en `PUT /auth/password`. No es 500 ni filtra secretos, pero el contrato (§4) y T76 piden `400 BAD_REQUEST` en `application/problem+json`.
Arreglo esperado: mapear en `ProblemExceptionMapper` (paquete `…adapter.in.rest.error`) los fallos de deserialización de Jackson (`MismatchedInputException` y similares) a `BAD_REQUEST`, y ampliar T76 con un cuerpo de tipo erróneo y con `[]`, comprobando `code=BAD_REQUEST` y `Content-Type: application/problem+json`.

**CR-3. Limpieza de duplicación e imports.**
- `AdminSessionFilter.java:18,20`: reutilizar `AdminPaths` (que debería exponer el prefijo y la ruta de login) y una única constante del claim `sv` (`SmallRyeSessionTokenIssuer.SESSION_VERSION_CLAIM`). El filtro ya usa `AdminPaths.normalized`, así que el prefijo debe vivir solo ahí.
- `AdminSessionFilter.sessionVersion` (usado desde `AdminAuthResource.java:113`): moverlo a un sitio común (p. ej. `AdminPaths`/una clase de apoyo del paquete) para que el recurso no dependa del filtro.
- `UseCaseConfig.java:12-22,45-46`: reordenar los imports (los nuevos están intercalados fuera de orden, y `java.time.Clock` va entre dos `jakarta`).

## Observaciones fuera de alcance

- Tras expirar un bloqueo, `failed_attempts` sigue en 5 y un único fallo más (`FAILURE` en `PostgresAdminAccountRepository.java:22-24`, `failed_attempts + 1 >= ?`) vuelve a bloquear 15 min. Es más estricto que «5 fallos consecutivos» y agrava el R-4 (bloqueo como arma). CA3 se cumple (un login correcto reinicia el contador). Valorar reiniciar el contador al expirar el bloqueo; decisión de producto.
- `POST /api/v1/admin/auth/login/` (barra final) da 401 `ADMIN_UNAUTHORIZED` en vez de entrar al login (la política `permit` no encaja con la barra). Falla cerrado, solo es incómodo.
- El hash falso se calcula en el constructor del caso de uso (perezoso por `@ApplicationScoped`), así que el primer login tras arrancar cuesta dos hashes. Sin efecto de seguridad real.
- En `LoginAdminService`, un fallo en vuelo que acabe después de que otro bloquee la cuenta no se anula, pero un acierto concurrente sí resetea el bloqueo (`recordSuccess`). Acotado por el límite global de 10/min.
- La regla ArchUnit «solo `adapter.out.security` toca JWT/Argon2» se implementó como «solo `adapter.out.security` usa BouncyCastle y `io.smallrye.jwt.build`». `adapter.in.rest` usa `JsonWebToken` para verificar. Es defendible; conviene dejarlo escrito en el plan.
- `ThreadRecordingAccountRepository` (`@Alternative @Priority(1)`) sustituye al repositorio real en **todos** los `@QuarkusTest` del módulo, no solo en T89. Funciona porque delega, pero conviene saberlo.
- No se probó un arranque con el jar empaquetado (perfil prod); la comprobación en vivo fue con `quarkus:dev`. Hacerlo al cerrar CR-1.
- `ARCHITECTURE.md`/`README.md`/`CLAUDE.md`/compose siguen sin actualizar (slug `api-admin-docs-deploy`): `ARCHITECTURE.md` aún dice que no hay endpoints de administración. Argon2 sin medir en el NAS (R-12) y regla de Cloudflare (R-1) siguen siendo tareas del humano.


## Ronda 2

Cambios requeridos: ninguno (CR-1, CR-2 y CR-3 resueltos).

- `mvn -B verify`: BUILD SUCCESS, 256 pruebas. `ci-summary.py --min-total 90 --min-module 80`: verde (total 96,5 %, application 100 %, domain 91,1 %, infrastructure 96,6 %).
- CR-1: con la API real sin `CV_ADMIN_JWT_SECRET`, con `corto` y con la variable vacía, arranca; `/api/v1/services` da 200 (`/profile` da 404 solo porque la BD de dev no tiene el CV cargado), `/api/v1/admin/auth/login` da 404 `NOT_FOUND` y el log trae `Admin disabled: CV_ADMIN_JWT_SECRET is missing or shorter than 32 characters`. El secreto se lee como `Optional<String>` (`AdminConfig.java`) y ya no se declara en `application.properties`. Existe `AdminNoSecretTest` (secreto vacío) además de `AdminDisabledTest` (corto). Con un secreto válido todo funciona como antes.
- CR-2: en vivo, `{"password":{"a":1}}`, `{"password":["a"]}`, `[]` y `"x"` en login, y tres cuerpos erróneos en `PUT /auth/password`, dan 400 `BAD_REQUEST` en `application/problem+json`, sin `objectName` ni nombres internos. Mapeo de Jackson en `ProblemExceptionMapper`; `AdminAuthResourceTest` (T76, líneas ~127 y ~211) los cubre.
- CR-3: el prefijo y la ruta de login viven solo en `AdminPaths`; el claim `sv` es una única constante (`AdminConfig.SESSION_VERSION_CLAIM`) usada por el emisor y por `AdminPaths.sessionVersion`; el helper ya no es estático del filtro; los imports de `UseCaseConfig` están ordenados.
- Regresión (curl): sesión 200 y sin token 401; cambio de contraseña (token viejo 401, nuevo 200); 5 fallos y después 429 con `Retry-After: 899` aun con la contraseña correcta; GET público con `Cache-Control: public, max-age=300`.
- Limpieza: sin procesos de Quarkus, sin contenedores de Postgres ni Ryuk y puerto 18080 libre.

Las observaciones fuera de alcance de la ronda 1 siguen vigentes (informativas).
