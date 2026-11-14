# Analysis — api-admin

Slug: `api-admin` (fase 2, repo `repo cv`). Entrada: `cv-web: progress/api-admin/brief.md`. Las decisiones del brief se dan por tomadas. Este plan no incluye código de aplicación ni tests. Lleva SQL de esquema y JSON de contrato porque el brief los pide.

---

## 0. Qué se comprobó

**Leído en `cv`:** `CLAUDE.md`, `ARCHITECTURE.md`, `README.md`, `pom.xml` raíz e `infrastructure/pom.xml`, `application.properties`, migraciones V1 a V3, `SiteContentJsonMapper`, `PostgresSiteContentRepository`, `ContactMessagesResource`, `UseCaseConfig`, `ApiError`, `ErrorCode`, `ProblemExceptionMapper`, `ProblemResponse`, `ApiCacheHeaders`, `OpenApiConfig`, `ArchitectureTest`, `OpenApiDocumentTest`, `ProblemCatalogTest`, `PostgresSiteContentRepositoryTest`, `InMemoryRateLimiter`, `scripts/make-seed.py`, `Dockerfile`, el CI y `deploy/docker-compose.yml`. De `cv-web` leí `deploy/docker-compose.yml`, `lib/projects/images.ts` y `lib/api/types.ts`.

**Referencias de diseño:**
- `padelhub-api/src/media`: puerto + adaptador R2 + controlador de subida.
- `fion-gastronomy`: `login.use-case`, `argon2-password-hasher`, `auth.controller` (throttle 5/min), `jwt.strategy`, `admin/api/login/route.ts` y `proxy.ts`.

**Hechos que condicionan el diseño:**
1. El `pom` raíz importa solo `io.quarkus.platform:quarkus-bom:3.40.1`. Ese BOM gestiona `quarkus-smallrye-jwt` y `quarkus-smallrye-jwt-build` (los grep en `~/.m2` dieron 1 coincidencia cada uno). También gestiona `bcprov-jdk18on` 1.86 y Testcontainers 2.0.5, que incluye `testcontainers-minio`.
2. `quarkus-amazon-s3` **no** está en `quarkus-bom`. Está en `io.quarkus.platform:quarkus-amazon-services-bom:3.40.1` (existe en Maven Central). Ese BOM fija `quarkiverse/quarkus-amazon-services` 3.22.1 y AWS SDK **2.54.13** (leído de los POM en Central). Hay que importar un segundo BOM para usar la extensión.
3. El límite de cuerpo `quarkus.http.limits.max-body-size` es **global**. La referencia HTTP de Quarkus no documenta un límite por ruta. Hoy está en 128K y se puso por el HL7 público. Subir imágenes de 5 MB obliga a cambiarlo (ver R-2).
4. El `ApiCacheHeaders` actual añade `Cache-Control: public, max-age=300` a **todo** GET 200 cuya ruta contenga `api/v1`. Sin cambios cubriría `/api/v1/admin/*`. Hay que excluirlo.
5. `ProblemExceptionMapper.unexpected(Exception)` devolvería 500 para las excepciones de seguridad de Quarkus (`UnauthorizedException` y similares). Hace falta mapearlas explícitamente en el paquete `…adapter.in.rest.error`, porque `ArchitectureTest` solo permite mapear excepciones a HTTP ahí.
6. `InMemoryRateLimiter` es un único bean `@ApplicationScoped` atado a `cv.contact.rate-limit.*`. El login necesita su propia ventana y su propia config.
7. **Inconsistencia a vigilar:** `cv-web/deploy/docker-compose.yml` dice «La API no se publica: solo cv-web la llama por la red interna». El brief (punto 5) habla de `cv-api.floreslab.dev` público. No puedo ver la config del túnel. Va a Riesgos (R-1).

**Dependencias verificadas** (Context7 de `quarkiverse/quarkus-amazon-services`, quarkus.io, Cloudflare, Maven Central):

| Necesidad | Decisión | Verificación |
|---|---|---|
| JWT | `io.quarkus:quarkus-smallrye-jwt` (verificar, `@Authenticated`) + `quarkus-smallrye-jwt-build` (firmar), ambos 3.40.1 | Guías «security-jwt» y «security-jwt-build». Verificación simétrica: `smallrye.jwt.verify.secretkey` o `smallrye.jwt.verify.key.location` con JWK `oct`, más `smallrye.jwt.verify.algorithm=HS256`. Issuer: `mp.jwt.verify.issuer`. Firma: `sign(key)` en código (el default RS256 se cambia con `smallrye.jwt.new-token.signature-algorithm`). Expiración: `smallrye.jwt.new-token.lifespan` (segundos, por defecto 300). |
| Hash | **Argon2id con BouncyCastle** (`org.bouncycastle:bcprov-jdk18on`, 1.86 gestionado por el BOM de Quarkus; clase `Argon2BytesGenerator`) | Java puro, sin JNA ni binarios nativos, importante para la imagen multi-arch `amd64`/`arm64` sobre `eclipse-temurin:21-jre`. |
| S3 → R2 | **AWS SDK v2 directo**: `software.amazon.awssdk:s3` y `url-connection-client`, BOM `software.amazon.awssdk:bom:2.54.13` (la versión que el platform 3.40.1 ya valida) | Doc de Cloudflare R2 para Java: endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, `Region.of("auto")`, `pathStyleAccessEnabled(true)`, `chunkedEncodingEnabled(false)` (la doc dice que el chunked por defecto da 403 por firma). R2 documenta `PutObject`, `DeleteObject`, `DeleteObjects` y `ListObjectsV2` como soportados. |
| Tests R2 | `org.testcontainers:testcontainers-minio` 2.0.5 (gestionado) | El BOM lo lista. |

Sobre checksums: desde AWS SDK Java 2.30.0 la integridad de datos queda activada por defecto. Esto lo cuentan la guía de AWS y varios issues, pero **no lo confirma la página oficial de R2**. Con SDK 2.54.13 el cliente debe construirse con `requestChecksumCalculation(WHEN_REQUIRED)` y `responseChecksumValidation(WHEN_REQUIRED)`. Alternativa: el parámetro `aws.requestChecksumCalculation` o la variable `AWS_REQUEST_CHECKSUM_CALCULATION`. Si se omite, es probable un 400 o 403 en `PutObject` contra R2. Va a Riesgos (R-3), con prueba manual contra el bucket real obligatoria.

---

## 1. Objetivo

Añadir a la API `cv` una zona de administración (`/api/v1/admin/*`) para un **único administrador** que puede:
1. Autenticarse con una contraseña guardada en BD (Argon2id), con sesión JWT invalidable por versión y bloqueo anti fuerza bruta.
2. Editar en caliente servicios, proyectos y arquitectura (`content_version`). Cada guardado crea una versión inmutable, con historial, rollback y control de concurrencia optimista, manteniendo ES y EN con la misma estructura y sin nombre de cliente en los proyectos `anonymous`.
3. Subir y gestionar imágenes de proyectos en Cloudflare R2 (prefijo `site/`, `https://media.floreslab.dev`).
4. Ver el cambio **al instante** en la web: guardar invalida la caché de contenido de la API.

Además: un comando de alta y cambio de contraseña ejecutable en el NAS, variables de entorno nuevas para el compose y el contrato que consumirá el panel de la fase 3.

### Decisiones de diseño (resumen)

| Pregunta del brief | Decisión |
|---|---|
| ¿Documento completo o items sueltos? | **Documento completo por tipo, con ES y EN en una sola operación atómica** (`PUT /admin/content/{kind}`). El panel hace la UX por items en el cliente. Es la unidad de versionado, de concurrencia optimista y de paridad ES/EN. Un PUT por item obligaría a versionar por item. |
| ¿Contacto desde admin? | **Sí, solo lectura, como slug opcional final** (`api-admin-messages`). Cuesta poco y el panel lo agradecerá. Contiene datos personales, así que va a Riesgos para que lo confirme el humano (R-9). |
| ¿Editar `resume`? | **No.** Otro esquema, otro mapper y otras reglas de privacidad (sin teléfono, DNI ni fecha de nacimiento), y el CV lo escribe su dueño a mano. El puerto de invalidación se diseña genérico para cubrirlo si algún día se añade (R-8). |
| ¿JWT con SmallRye? | **Sí, HS256 simétrico.** Firma y verifica la misma API, así que no hace falta clave pública. El claim `sv` (versión de sesión) se compara con la BD **en cada petición admin**. |
| ¿bcrypt o argon2? | **Argon2id vía BouncyCastle**, hash en formato PHC con los parámetros dentro (permite `needsRehash`). |
| ¿Cliente S3? | **AWS SDK v2 directo**, con el cliente construido de forma explícita en el adaptador. |
| ¿Huérfanos? | **Sin tabla de imágenes.** R2 es la fuente de verdad. Una imagen está «referenciada» si su `key` aparece en **cualquier** fila de `content_version`, incluso inactiva. El rollback puede volver a mostrarla, así que nunca se borra algo referenciado por el historial. Huérfana es la subida que nunca se referenció tras un periodo de gracia de 24 h. |
| Reutilizar `RateLimiter`/`ApplicationException` | Sí. Los errores nuevos siguen la regla: `ErrorCode` + `ApiError` + `problems_*.properties`. |

---

## 2. Archivos a crear o tocar (rutas reales)

Raíz del repo: `repo cv`. Abreviaturas: `INF` = `infrastructure/src/main/java/dev/julioflores/cv/infrastructure`, `APP` = `application/src/main/java/dev/julioflores/cv/application`, `DOM` = `domain/src/main/java/dev/julioflores/cv/domain`.

### 2.1 Dominio (`DOM`, sin frameworks)
- `ImageFormat.java`: enum JPEG/PNG/WEBP/GIF con `detect(byte[] header)` por bytes mágicos y `extension()` y `mediaType()`. Nunca confía en el cliente.
- `ProjectImage.java`: record `(key, alt, width, height)` con invariantes (alt ≤ 200, dimensiones > 0).
- `Project.java`: añade `List<ProjectImage> images`. El constructor las **descarta** si el proyecto no es `own` + `public` (mismo patrón que `client` en un anónimo). El mismo criterio de elegibilidad lo usa la web (`canShowImage`).
- `AdminPasswordPolicy.java`: 12..128 caracteres, sin reglas de composición (NIST); rechaza blancos y la repetición de la anterior.

### 2.2 Aplicación (`APP`, sin frameworks)
**Casos de uso de entrada (`port/in`), uno por interfaz:**
- `LoginAdminUseCase`, `VerifyAdminSessionUseCase`, `ChangeAdminPasswordUseCase`, `LogoutAllSessionsUseCase`
- `GetEditableContentUseCase`, `SaveEditableContentUseCase`, `ListContentVersionsUseCase`, `GetContentVersionUseCase`, `RollbackContentUseCase`
- `UploadProjectImageUseCase`, `ListImagesUseCase`, `DeleteImageUseCase`, `CleanupOrphanImagesUseCase`
- Opcional: `ListContactMessagesUseCase`

**Puertos de salida (`port/out`):**
- `AdminAccountRepository`
- `PasswordHasher` (hash, verify, needsRehash)
- `SessionTokenIssuer`
- `ContentVersionRepository`
- `ContentCacheInvalidator`
- `FileStoragePort`
- Para el cuerpo opcional de mensajes: reutiliza `ContactMessageRepository` con un método nuevo de lectura.

**Servicios (`service/`):** uno por caso de uso, con sus excepciones `extends ApplicationException`.

**Paquete nuevo `content/`:**
- Drafts de entrada en crudo: `ServicesDraft`, `ProjectsDraft`, `ArchitectureDraft`.
- `ContentValidator` (porta las reglas de `make-seed.py` más límites y `images`).
- `ContentParity` (ES vs EN).
- `Violation(path, code)`.

Los drafts son necesarios porque el dominio `Project` descarta `client` y `images` en silencio. La validación debe ver el valor crudo para **rechazar**, no solo ocultar.

**`error/ErrorCode.java`:** constantes nuevas (ver §5.3).

### 2.3 Infraestructura (`INF`)
**Entrada REST (`adapter/in/rest/`):**
- `AdminAuthResource` (login, session, password, logout-all)
- `AdminContentResource` (kinds y versiones)
- `AdminImagesResource` (multipart)
- `AdminMessagesResource` (opcional)
- `AdminModels.java` (DTO estrictos)
- `AdminOpenApiExamples.java`
- `AdminSessionFilter.java`: `@ServerRequestFilter` que, tras validar el JWT, compara `sv` con la BD.
- `AdminEdgeGuard.java`: opcional, responde 404 si llega `CF-Ray` o `CF-Connecting-IP` (ver §5.5).
- `error/ApiError.java`: constantes nuevas.
- `error/ProblemExceptionMapper.java`: mapeo explícito de las excepciones de seguridad (401 con `WWW-Authenticate: Bearer`, 403).
- `error/ProblemResponse.java`: campo opcional `errors: [{path, code}]` (solo en `CONTENT_INVALID`).
- `ApiCacheHeaders.java`: excluye `/api/v1/admin` y fija `Cache-Control: no-store` en admin.
- `OpenApiConfig.java`: `@SecurityScheme(bearerAuth)`, etiqueta «Admin» y descripción de errores nuevos.
- `OpenApiResponseFilter.java`: añade 401/403 a las operaciones admin.

**Salida (`adapter/out/`):**
- `postgres/PostgresAdminAccountRepository.java`
- `postgres/PostgresContentVersionRepository.java` (transacción + candado asesor)
- `postgres/SiteContentJsonWriter.java` (inverso exacto de `SiteContentJsonMapper`)
- `postgres/SiteContentJsonMapper.java`: lee `images` (compone `url` con la URL pública)
- `postgres/PostgresSiteContentRepository.java`: implementa `ContentCacheInvalidator` con una época por clave
- `security/Argon2PasswordHasher.java`
- `security/SmallRyeSessionTokenIssuer.java`
- `storage/R2FileStorageAdapter.java`
- `ratelimit/InMemoryRateLimiter.java`: refactor para dos instancias (contacto y login) con config distinta

**Config y herramientas:**
- `config/UseCaseConfig.java`: cableado de todos los casos de uso nuevos.
- `config/R2ClientConfig.java`: `@Produces S3Client` (checksums, path-style y timeouts explícitos).
- `config/AdminConfig.java`: valida al arrancar el secreto JWT y deja el admin deshabilitado si falta.
- `tools/AdminPasswordTool.java`: `main` plano (ver §6).

**Recursos:**
- `resources/db/migration/V4__admin_account.sql`
- `resources/db/migration/V5__content_version_audit.sql`
- `resources/application.properties`
- `resources/problems_es.properties` y `problems_en.properties`

**POM:**
- `pom.xml` raíz: import de `software.amazon.awssdk:bom:2.54.13`.
- `infrastructure/pom.xml`: `quarkus-smallrye-jwt`, `quarkus-smallrye-jwt-build`, `org.bouncycastle:bcprov-jdk18on`, `software.amazon.awssdk:s3`, `software.amazon.awssdk:url-connection-client`, y en test `org.testcontainers:testcontainers-minio`.

### 2.4 Scripts, docs y despliegue (repo `cv`)
- `scripts/admin-password.sh`: wrapper del NAS (ver §6).
- `scripts/make-seed.py`: validar `images` en proyectos (mismas reglas) y mantener el rechazo de `client` en anónimos.
- `scripts/smoke-test.sh`: comprobar que `/api/v1/admin/auth/session` sin token responde 401 con `code`.
- `db/sample/projects.{es,en}.json` y `V1000__sample_resume.sql` (regenerar): un proyecto `own+public` con `images` ficticias.
- `README.md`, `ARCHITECTURE.md` (sección «No hay endpoints de administración» queda obsoleta), `CLAUDE.md`, `deploy/docker-compose.yml`.
- `cv-web: deploy/docker-compose.yml`: variables del §9.
- Tests nuevos: ver §4.

---

## 3. Modelo de datos

### 3.1 `V4__admin_account.sql`
```sql
-- Un único administrador. La fila solo existe cuando se crea la primera contraseña con el comando del NAS: no hay credencial sembrada.
CREATE TABLE admin_account (
    id                  smallint    PRIMARY KEY CHECK (id = 1),       -- imposible tener dos administradores
    password_hash       text        NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
    session_version     integer     NOT NULL DEFAULT 1 CHECK (session_version > 0),
    failed_attempts     integer     NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    locked_until        timestamptz,
    password_changed_at timestamptz NOT NULL DEFAULT now(),
    last_login_at       timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now()
);
```
- `session_version` sube en cada cambio de contraseña, en `logout-all` y en el `set-password` del NAS. Todo JWT con otro `sv` queda inválido.
- `failed_attempts` y `locked_until` se actualizan en **una sola sentencia atómica**: `UPDATE … SET failed_attempts = failed_attempts + 1, locked_until = CASE WHEN failed_attempts + 1 >= :max THEN now() + :lock END … RETURNING …`.
- Un éxito pone `failed_attempts = 0`, `locked_until = NULL` y `last_login_at = now()`.
- Con la cuenta bloqueada se rechaza **incluso la contraseña correcta**, para que el bloqueo frene la fuerza bruta.

### 3.2 `V5__content_version_audit.sql`
```sql
ALTER TABLE content_version
    ADD COLUMN comment text CHECK (comment IS NULL OR char_length(comment) <= 200),
    ADD COLUMN source  text NOT NULL DEFAULT 'seed' CHECK (source IN ('seed', 'admin'));
```
- `source` distingue las versiones del script (`seed`, las filas existentes) de las del panel (`admin`).
- Un rollback **reactiva** una versión existente (cambia `active`). No inserta fila nueva.
- No se toca `resume_version`.

### 3.3 Imágenes: sin tabla nueva
- Clave en R2: `{R2_KEY_PREFIX}projects/{uuid-v4}.{ext}`, es decir `site/projects/9f1c….webp`.
- El UUID lo genera el servidor. La extensión sale del tipo **detectado** por bytes mágicos. El nombre del archivo del cliente se ignora por completo (el adaptador de `padelhub` usaba el nombre original, con riesgo de traversal y de extensión falsa).
- El objeto se sube con `Cache-Control: public, max-age=31536000, immutable` y `Content-Type` detectado. La clave es inmutable, así que la caché del CDN no sirve versiones viejas.

**Forma del proyecto en el JSON almacenado** (campo nuevo; compatible hacia atrás, sin él = lista vacía):
```json
"images": [
  { "key": "site/projects/9f1c2d7e-1111-4a2b-8c3d-aaaaaaaaaaaa.webp",
    "alt": "Panel de reservas con la agenda semanal",
    "width": 1280, "height": 720 }
]
```
- La primera imagen es la **portada**. No hay campo `cover` aparte. Reordenar es cambiar el orden y se versiona gratis.
- El JSON guarda `key`, no la URL. La URL pública (`R2_PUBLIC_URL + "/" + key`) se compone al leer, así que cambiar de dominio de medios no obliga a editar contenido.
- `alt` es traducible: ES y EN llevan su propio texto. `key`, `width` y `height` son iguales en ambos idiomas (regla de paridad).

**Consumo por la web (fase 3):** el DTO público de proyectos añade `images: [{url, alt, width, height}]` (puede ser `[]`). `lib/projects/images.ts` pasa a leer `project.images[0]?.url`. Mantiene `canShowImage` como defensa y conserva `public/projects/<id>.webp` como respaldo hasta migrar. Hay que regenerar los tipos de `lib/api/types.ts` desde el OpenAPI nuevo.

**Referencias** (para borrar y limpiar huérfanas):
```sql
SELECT EXISTS (SELECT 1 FROM content_version WHERE kind = 'projects'
  AND jsonb_path_exists(content, '$.projects[*].images[*] ? (@.key == $k)', jsonb_build_object('k', :key)));
```
Es una consulta de volumen mínimo (un administrador).

### 3.4 Concurrencia en guardado
Una transacción por guardado:
1. `pg_advisory_xact_lock(hashtextextended('content:' || kind || ':' || lang, 0))` para `es` y luego `en`, siempre en ese orden (evita interbloqueos).
2. Leer la versión activa (0 si no hay).
3. Comparar con `baseVersion`. Si difiere, `CONTENT_VERSION_CONFLICT` (409) con la versión actual en `detail`.
4. `UPDATE … SET active = false` y luego `INSERT` con `COALESCE(MAX(version),0)+1`. Es MAX y no activa+1, porque tras un rollback hay versiones posteriores a la activa.
5. Commit, y **solo entonces** invalidar la caché.

Esto convive con `make-seed.py`, que hace lo mismo sin candado. Si coinciden, la restricción `UNIQUE(kind, lang, version)` hace perder a uno de los dos, sin corrupción.

---

## 4. Contrato REST admin

Prefijo `/api/v1/admin`. Todo es JSON, errores `application/problem+json` (RFC 7807 con `code`). El idioma de los mensajes de error sigue `?lang` > `Accept-Language` > español. Salvo `auth/login`, todo exige `Authorization: Bearer <jwt>`.

### 4.1 Auth

**`POST /auth/login`**
```json
{ "password": "una frase larga y secreta" }
```
200:
```json
{ "accessToken": "eyJhbGciOiJIUzI1NiJ9…", "tokenType": "Bearer", "expiresAt": "2026-11-12T20:15:00Z" }
```
- 401 `ADMIN_INVALID_CREDENTIALS`. El mensaje es el mismo para contraseña mala y para cuenta inexistente. Se verifica contra un hash falso para igualar tiempos.
- 429 `ADMIN_LOGIN_LOCKED`, con `Retry-After` en segundos.
- 429 `ADMIN_LOGIN_RATE_LIMITED`, límite global de 10 por minuto.
- 422 `CONTENT_INVALID` no aplica aquí. Un cuerpo vacío o sin `password` da 400 `BAD_REQUEST`.

JWT, claims: `iss=cv-api`, `aud=cv-admin`, `sub=admin`, `sv`, `jti`, `iat`, `exp` (por defecto 8 h), `groups=["admin"]`.

**`GET /auth/session`**: 200 `{ "authenticated": true, "expiresAt": "…", "passwordChangedAt": "…" }`. Sirve de sonda para el panel. Con sesión inválida: 401 `ADMIN_UNAUTHORIZED`.

**`PUT /auth/password`**
```json
{ "currentPassword": "…", "newPassword": "otra frase larga y secreta" }
```
200: igual que el login, con un token **nuevo** (el `sv` subió; así el panel no pierde su propia sesión).
- 403 `ADMIN_CURRENT_PASSWORD_WRONG`. No es 401, para que el panel no lo confunda con sesión caducada. Cuenta para el bloqueo igual que un login fallido.
- 422 `ADMIN_WEAK_PASSWORD`.

**`POST /auth/logout-all`**: 204. Sube `session_version` e invalida todas las sesiones, la propia incluida.

### 4.2 Contenido (`kind` ∈ `services` | `projects` | `architecture`)

Los documentos son la **forma almacenada** (la misma que `db/sample/*.json` y `make-seed.py`), no el DTO público.

**`GET /content/{kind}`**
```json
{
  "kind": "projects",
  "languages": {
    "es": { "version": 3, "publishedAt": "2026-11-10T18:02:11Z", "source": "admin", "comment": "Añadido proyecto X",
            "content": { "projects": [ { "id": "proyecto-publico", "title": "…", "summary": "…", "relation": "own",
              "role": "Backend y web", "disclosure": "public", "client": "Ejemplo S.A.", "clientLabel": "empresa ficticia",
              "startDate": "2022-01", "stack": ["Java","Quarkus"], "highlights": ["…"],
              "links": [{ "label": "Ver", "url": "https://example.com/p" }],
              "images": [{ "key": "site/projects/9f1c…webp", "url": "https://media.floreslab.dev/site/projects/9f1c…webp",
                           "alt": "Panel de reservas", "width": 1280, "height": 720 }] } ] } },
    "en": { "version": 3, "publishedAt": "…", "source": "admin", "comment": null, "content": { "projects": [ … ] } }
  },
  "parity": { "ok": true, "differences": [] }
}
```
Si un idioma no tiene nada publicado: `{ "version": 0, "content": null }`. Eso **no** es un error (igual que los GET públicos).

**`PUT /content/{kind}`**: guardado atómico bilingüe.
```json
{
  "baseVersions": { "es": 3, "en": 3 },
  "comment": "Cambio de precio",
  "documents": { "es": { "services": [ … ] }, "en": { "services": [ … ] } }
}
```
200 devuelve el mismo cuerpo que `GET /content/{kind}` con las versiones nuevas. Errores:
- 409 `CONTENT_VERSION_CONFLICT`.
- 422 `CONTENT_INVALID`, con `errors`:
```json
{ "type": "about:blank", "title": "Contenido no válido", "status": 422, "code": "CONTENT_INVALID",
  "detail": "El contenido tiene 2 errores.",
  "errors": [ { "path": "es.projects[1].client", "code": "ANONYMOUS_CLIENT_FORBIDDEN" },
              { "path": "en.projects[0].images", "code": "IMAGES_NOT_ALLOWED_FOR_PROJECT" } ] }
```
- 422 `CONTENT_PARITY_BROKEN`: ES y EN no tienen la misma estructura.
- 413 `CONTENT_TOO_LARGE`.

Códigos de violación: `REQUIRED`, `TOO_LONG`, `TOO_MANY`, `UNKNOWN_FIELD`, `DUPLICATE_ID`, `INVALID_ID`, `INVALID_VALUE`, `INVALID_DATE`, `INVALID_URL`, `ANONYMOUS_CLIENT_FORBIDDEN`, `CLIENT_REQUIRED`, `IMAGES_NOT_ALLOWED_FOR_PROJECT`, `IMAGE_KEY_INVALID`, `PARITY_MISMATCH`.

**`GET /content/{kind}/{lang}/versions?limit=50`**
```json
{ "kind": "services", "lang": "es", "versions": [
  { "version": 5, "active": false, "publishedAt": "…", "source": "admin", "comment": "…" },
  { "version": 4, "active": true,  "publishedAt": "…", "source": "seed",  "comment": null } ] }
```

**`GET /content/{kind}/{lang}/versions/{version}`**: una instantánea (`version`, `active`, `content`). 404 `CONTENT_VERSION_NOT_FOUND`.

**`POST /content/{kind}/{lang}/rollback`**
```json
{ "baseVersion": 5, "targetVersion": 3 }
```
- 200 con la versión activa y `parity`.
- `baseVersion` es la activa que ve el panel; si no coincide, 409.
- Reactiva la versión; no crea una nueva. Un guardado posterior toma `MAX+1`, así que el historial conserva todo. Es compatible con `make-seed.py --rollback`.
- 404 si `targetVersion` no existe.
- 422 `CONTENT_INVALID` si la versión destino ya no pasa la validación vigente, por ejemplo una instantánea anterior que referenciaba imágenes en un proyecto que ya no es elegible. No se reactiva.

### 4.3 Imágenes

**`POST /images`**: `multipart/form-data` con la parte `file`. Sin `projectId` ni `folder`: la subida solo deja el objeto en R2 y devuelve su clave. La asociación ocurre al **guardar** el proyecto.
201:
```json
{ "key": "site/projects/9f1c2d7e-1111-4a2b-8c3d-aaaaaaaaaaaa.webp",
  "url": "https://media.floreslab.dev/site/projects/9f1c2d7e-1111-4a2b-8c3d-aaaaaaaaaaaa.webp",
  "contentType": "image/webp", "bytes": 183422, "width": 1280, "height": 720 }
```
- 400 `IMAGE_INVALID`: falta la parte, o los bytes no son una imagen soportada. Se ignora el `Content-Type` y el nombre que mande el cliente.
- 413 `IMAGE_TOO_LARGE` (> 5 MB).
- 415 `IMAGE_UNSUPPORTED_TYPE`: SVG, HEIC y similares. Solo JPEG, PNG, WebP y GIF.
- 503 `IMAGE_STORAGE_UNAVAILABLE`: R2 caído o sin configurar. El guardado de contenido nunca depende de R2.

**`GET /images`**
```json
{ "images": [ { "key": "site/projects/9f1c….webp", "url": "…", "bytes": 183422,
                "lastModified": "2026-11-10T18:00:00Z", "referenced": true } ] }
```
Lista el prefijo `site/projects/` con `ListObjectsV2`. `referenced` indica si algún `content_version` la usa.

**`DELETE /images/{id}`**: `id` es el UUID de la clave. 204. 404 `IMAGE_NOT_FOUND`. 409 `IMAGE_IN_USE` si **cualquier versión** la referencia.

**`POST /images/cleanup?dryRun=true&olderThanHours=24`**: borra las no referenciadas por ninguna versión y más antiguas que la gracia (mínimo 1 h). Responde `{ "dryRun": true, "deleted": [], "wouldDelete": ["site/projects/…"] , "kept": 4 }`. Usa `DeleteObjects` por lotes de hasta 1000.

### 4.4 Mensajes de contacto (opcional, `api-admin-messages`)
**`GET /contact-messages?limit=50&before=<id>`**: paginación por clave (`created_at DESC, id`).
```json
{ "messages": [ { "id": 41, "name": "Ada Ejemplo", "email": "ada@example.com", "body": "…", "createdAt": "…" } ], "next": "40" }
```
Nunca se devuelve `ip_hash`. Solo lectura; el borrado queda fuera de alcance.

---

## 5. Seguridad

### 5.1 Autenticación y sesión
- Todo `/api/v1/admin/**` exige JWT válido: política `quarkus.http.auth.permission.*` con `authenticated` para `/api/v1/admin/*` y `permit` solo para `/api/v1/admin/auth/login`.
- Tras validar la firma, `AdminSessionFilter` consulta `session_version` por clave primaria **en cada petición** (una fila, coste despreciable) y compara con `sv`. No hay caché, así que la invalidación es inmediata. Un `sv` distinto da 401 `ADMIN_UNAUTHORIZED`.
- El filtro hace JDBC bloqueante. Debe ejecutarse fuera del hilo de eventos de Vert.x (verificar con una prueba; ver R-5).
- Sin refresh tokens, sin roles. Sesión de 8 h (`cv.admin.session.lifespan`). Logout individual no existe: solo `logout-all`.
- Con `quarkus-smallrye-jwt` activo, cualquier petición pública que lleve un `Authorization: Bearer` malformado puede responder 401. Es inocuo, pero hay que anclarlo con una prueba y no depender de memoria.

### 5.2 Contraseña
- Argon2id, parámetros por defecto `m=65536 KiB (64 MiB), t=3, p=1`, configurables (`cv.admin.argon2.*`). Van dentro del hash PHC, así que se puede subir el coste y `needsRehash` actualiza el hash tras un login correcto.
- Hasta 2 hashes concurrentes (semáforo) para limitar la memoria bajo carga.
- Sal aleatoria de 16 bytes con `SecureRandom`.
- Verificación sin cuenta: se verifica igual contra un hash falso válido, para igualar tiempos y no revelar si existe el administrador.
- Nunca se registra la contraseña, el token ni la cabecera `Authorization`.

### 5.3 Anti fuerza bruta, tres capas
1. **Bloqueo por cuenta** en BD: 5 fallos consecutivos bloquean 15 min (`cv.admin.login.max-failures`, `cv.admin.login.lock`). Se reinicia con un login correcto. El comando del NAS tiene `unlock`.
2. **Límite global** en memoria: 10 intentos por minuto en total. Es una instancia `RateLimiter` aparte, con su propia config.
3. La IP real no es fiable detrás de `cv-web`, que llama desde dentro de la red. Por eso **no** se limita por IP; con un único administrador, el límite por cuenta es el correcto.
- Contrapartida: cualquiera con acceso al login puede bloquear al administrador 15 min (R-4). Se mitiga con el bloqueo corto y con el comando `unlock`.

### 5.4 Protección de `/api/v1/admin/*` frente a Internet
Orden de preferencia:
1. **Mejor: que no sea alcanzable desde fuera.** Hoy el compose de `cv-web` no publica la API y solo `cv-web` la llama por la red interna. Si el túnel no apunta a `cv-api`, no hay nada que proteger. Hay que confirmarlo (R-1).
2. Si existe el host público `cv-api.floreslab.dev`: regla de Cloudflare (WAF custom rule, o ruta sin servicio en el túnel) que **bloquee** `starts_with(http.request.uri.path, "/api/v1/admin")`. Se hace en el panel de Cloudflare, no en el repo.
3. **Defensa en profundidad en la propia API:** `AdminEdgeGuard` responde 404 a cualquier petición admin que lleve `CF-Ray` o `CF-Connecting-IP`. Todo lo que pasa por el túnel de Cloudflare lleva esas cabeceras. La llamada interna de `cv-web` no las lleva. Se activa con `CV_ADMIN_EDGE_BLOCK=true`. **Obligación para la fase 3:** `cv-web` no debe reenviar cabeceras `CF-*` al llamar a la API.
- CORS: los endpoints admin no los llama el navegador, así que no se añade ningún origen. El `QUARKUS_HTTP_CORS_ORIGINS` público no cambia.

### 5.5 Qué ve Swagger
- **Visibles**, con etiqueta «Admin», `bearerAuth` y todos sus errores documentados. El repo es público y el código ya muestra las rutas, así que ocultarlas no aporta; la protección real es la red (§5.4) más el JWT.
- Flag `cv.admin.openapi.enabled` (por defecto `true`); en `false` un filtro OASF quita `/api/v1/admin/**` y el esquema de seguridad.
- «Try it out» no sirve sin un token. Solo el login lo emite, y lo hace con la contraseña real.

### 5.6 Imágenes
- Validación por **bytes mágicos** (primeros 12 bytes). Se ignoran `Content-Type` y nombre. SVG rechazado: puede contener script.
- 5 MB como máximo. Nombre y clave generados por el servidor.
- Solo `own` + `public` pueden llevar imágenes (regla del dominio + rechazo en la validación). Una captura de un proyecto de empleador o anónimo podría desvelar al cliente.
- Pendiente recomendado (R-6): quitar metadatos EXIF al subir.

### 5.7 Privacidad y datos
- Los proyectos `anonymous` nunca guardan `client`: el validador **rechaza** el guardado (`ANONYMOUS_CLIENT_FORBIDDEN`) y el dominio lo descarta además al leer. Dos barreras.
- Los tests solo usan el CV ficticio (Ada Ejemplo). Ningún secreto en el repo: las variables son de entorno.
- Los mensajes de contacto (opcional) contienen datos personales; solo salen con JWT válido y sin `ip_hash`.

---

## 6. Comando de alta y cambio de contraseña en el NAS

**Diseño:** `scripts/admin-password.sh` ejecuta, dentro del contenedor `cv-api`, la clase `dev.julioflores.cv.infrastructure.tools.AdminPasswordTool` con el classpath del fast-jar del `Dockerfile` (`WORKDIR /app`, con `app/*`, `lib/main/*` y `lib/boot/*`). Hay que comprobar el classpath exacto en el primer arranque real.
- Usa **el mismo `Argon2PasswordHasher`** que la API. Hash y verificación no pueden divergir.
- Se conecta a la BD con `QUARKUS_DATASOURCE_*`, que ya están en el entorno del contenedor. No lee ni escribe credenciales en el host.
- Lee la contraseña desde la terminal sin eco (`System.console().readPassword`), pide confirmación y valida la política. No acepta la contraseña como argumento, para no dejarla en el historial ni en `ps`.

Uso en el NAS (con terminal):
```bash
docker exec -it cv-api sh -c 'java -cp "app/*:lib/main/*:lib/boot/*" dev.julioflores.cv.infrastructure.tools.AdminPasswordTool set-password'
docker exec -it cv-api … AdminPasswordTool unlock      # quita el bloqueo por intentos fallidos
docker exec -it cv-api … AdminPasswordTool status      # existe cuenta, bloqueada hasta cuándo, cuándo cambió la contraseña
```
El wrapper `scripts/admin-password.sh` encapsula el comando largo (`./admin-password.sh set-password`).

`set-password` hace un **upsert** (crea la fila si no existe; si existe, cambia el hash). Al cambiar: `session_version = session_version + 1`, `failed_attempts = 0`, `locked_until = NULL` y `password_changed_at = now()`. Es lo que permite recuperar el acceso si se pierde la contraseña, e invalida todas las sesiones.

**Alternativa descartada:** bcrypt con `pgcrypto` (`crypt(pw, gen_salt('bf'))`) en un script de shell con `psql`. El script sería más corto, pero deja la contraseña dentro de una sentencia SQL, tiene el límite de 72 bytes de bcrypt y no es memoria-dura. Se prefirió Argon2id con código propio, que también se prueba mejor.

---

## 7. Invalidación de la caché de contenido

- `PostgresSiteContentRepository` implementa también el puerto nuevo `ContentCacheInvalidator.invalidate(kind, lang)`.
- Cada clave lleva una **época** (contador). `invalidate` la incrementa y elimina la entrada. Un `refresh` que empezó antes de la invalidación **no** guarda su resultado si la época cambió. Sin esto, una lectura lenta que consultó la BD antes del commit podría reponer el contenido viejo justo después de invalidar.
- `SaveEditableContentService` y `RollbackContentService` llaman a `invalidate` **después** del commit, para ES y EN. Si la invalidación fallara, el guardado ya está hecho; el peor caso es esperar el TTL de 5 min, y se registra un aviso.
- El repositorio sigue sirviendo «lo último leído» si la BD cae al refrescar; invalidar no rompe esa resiliencia (si la BD cae justo tras invalidar, no hay valor viejo que servir y se propaga el error, como ya ocurre con una clave nunca leída).
- El CV (`cv.resume.cache-ttl`) **no se toca** en este alcance (R-8).
- La web ya lee sin caché, así que ve el cambio al instante. Cualquier otro consumidor que pase por el CDN de Cloudflare sí respeta `max-age=300` de los GET públicos: la frescura inmediata solo vale para quien lee sin pasar por caché.
- Solo vale para **una instancia** de API (es el caso del NAS). Con réplicas habría que usar `LISTEN/NOTIFY` de Postgres.

---

## 8. Criterios de aceptación (verificables)

- **CA1** Sin la fila de `admin_account`, el login devuelve 401 `ADMIN_INVALID_CREDENTIALS` con el mismo mensaje y un tiempo comparable al de una contraseña mala.
- **CA2** Un login correcto devuelve un JWT HS256 con `iss`, `aud`, `sub`, `sv`, `jti`, `exp`; `GET /auth/session` con ese token da 200.
- **CA3** Tras 5 fallos consecutivos el login devuelve 429 `ADMIN_LOGIN_LOCKED` con `Retry-After`, incluso con la contraseña correcta. Pasado el bloqueo, un login correcto reinicia el contador.
- **CA4** Cambiar la contraseña (con la actual) invalida los tokens anteriores (401) y devuelve un token nuevo que sí funciona. `logout-all` invalida todos los tokens. El comando del NAS también.
- **CA5** Toda ruta bajo `/api/v1/admin` salvo el login responde 401 `ADMIN_UNAUTHORIZED` (problem+json con `WWW-Authenticate: Bearer`) sin token, con firma incorrecta, caducado, con otro `iss`/`aud` o con `sv` viejo. Nunca 500.
- **CA6** Si falta `CV_ADMIN_JWT_SECRET` (o es corto), la API arranca, los endpoints públicos funcionan y el admin queda deshabilitado con un aviso en el log.
- **CA7** Las respuestas admin llevan `Cache-Control: no-store` y **nunca** `public, max-age=300`. Los GET públicos conservan su cabecera.
- **CA8** `PUT /content/{kind}` crea una versión nueva en ES y EN en una transacción, deja una sola activa por (kind, lang), conserva las anteriores sin tocarlas y guarda `source='admin'` y `comment`. Si algo falla, no queda ninguna de las dos.
- **CA9** Un `baseVersion` obsoleto da 409 `CONTENT_VERSION_CONFLICT` y no cambia nada. Dos guardados simultáneos con la misma base: uno gana y el otro recibe 409.
- **CA10** Un proyecto `anonymous` con `client` se rechaza (422). `public`+`employer` sin `client` se rechaza. Los ids son únicos y tienen el formato permitido. Solo se aceptan enlaces `https`.
- **CA11** ES y EN con distinta estructura se rechazan (`CONTENT_PARITY_BROKEN`) con el detalle de las diferencias.
- **CA12** Rollback: reactiva la versión destino y desactiva la activa; un guardado posterior usa `MAX+1`; el resultado es compatible con `make-seed.py --rollback`.
- **CA13** Tras guardar o hacer rollback, un `GET /api/v1/{services|projects|architecture}` inmediato devuelve el contenido nuevo (sin esperar el TTL), también bajo lecturas concurrentes (sin reponer valor viejo).
- **CA14** La subida acepta JPEG/PNG/WebP/GIF ≤ 5 MB según sus **bytes**, ignora el `Content-Type` y el nombre del cliente, y devuelve una clave `site/projects/<uuid>.<ext>` generada por el servidor. SVG, ejecutables o un `.jpg` falso se rechazan.
- **CA15** Un proyecto `own`+`public` con `images` las expone en `GET /api/v1/projects` como `images[].url`; en uno de empleador o anónimo no salen nunca, aunque estén en la BD.
- **CA16** `DELETE /images/{id}` devuelve 409 si **cualquier** versión (activa o histórica) referencia la imagen. `cleanup` borra solo las huérfanas con más de la gracia, y en `dryRun` no borra nada.
- **CA17** Con R2 caído o sin configurar, la subida da 503 `IMAGE_STORAGE_UNAVAILABLE` y el resto de la API, incluido guardar contenido, sigue funcionando.
- **CA18** Con `CV_ADMIN_EDGE_BLOCK=true`, una petición admin con `CF-Ray` o `CF-Connecting-IP` recibe 404.
- **CA19** Cada código nuevo está en `ErrorCode`/`ApiError` y en `problems_es/en.properties` (`ProblemCatalogTest` verde).
- **CA20** `/openapi.json` documenta todas las operaciones admin con descripción, `bearerAuth`, request y todas sus salidas con ejemplos (`OpenApiDocumentTest` verde).
- **CA21** `ArchitectureTest` verde, con reglas nuevas: `software.amazon..` y `org.bouncycastle..` solo en `adapter.out`/`config`; `application` y `domain` sin ellas.
- **CA22** `mvn -B verify` verde con cobertura ≥ 90 % total y ≥ 80 % por módulo (`scripts/ci-summary.py`).
- **CA23** `V4` y `V5` aplican sobre una BD con V1..V3 más el seed sin tocar datos existentes.
- **CA24** `scripts/smoke-test.sh` verifica el 401 admin y sigue verde con el CV de ejemplo.
- **CA25** Ningún secreto ni dato real en el repo: `R2_*`, `CV_ADMIN_JWT_SECRET` y la contraseña solo llegan por entorno o por la terminal.

---

## 9. Variables de entorno nuevas (compose de cv-web, servicio `cv-api`)

```yaml
      # Administración (fase 2). Sin CV_ADMIN_JWT_SECRET el admin queda deshabilitado y la API pública sigue funcionando.
      CV_ADMIN_JWT_SECRET: CAMBIA-por-32-bytes-aleatorios   # openssl rand -base64 48
      CV_ADMIN_SESSION_LIFESPAN: PT8H
      CV_ADMIN_LOGIN_MAX_FAILURES: "5"
      CV_ADMIN_LOGIN_LOCK: PT15M
      CV_ADMIN_EDGE_BLOCK: "true"
      # Imágenes en Cloudflare R2 (mismo bucket que padelhub, prefijo site/). Vacío = subida de imágenes deshabilitada.
      R2_ACCESS_KEY_ID: ""
      R2_SECRET_ACCESS_KEY: ""
      R2_ENDPOINT: https://CAMBIA-account-id.r2.cloudflarestorage.com
      R2_BUCKET_NAME: CAMBIA-bucket
      R2_PUBLIC_URL: https://media.floreslab.dev
      R2_KEY_PREFIX: site/
```
- Recomendado: un **token de R2 propio** de `cv`, con permiso de lectura y escritura solo sobre ese bucket, para poder rotarlo sin afectar a `padelhub`. El brief reutiliza bucket y dominio, no necesariamente la credencial.
- Mismos nombres `R2_*` que `padelhub-api`, como pide el brief.
- Se añaden también a `cv: deploy/docker-compose.yml`.
- `application.properties` mapea con valor por defecto vacío (`${R2_ACCESS_KEY_ID:}`) para que la API arranque sin ellas.
- Si `cv-web` pasa a tener memoria limitada, la API necesita ≥ 256 MB libres por el coste de Argon2 (64 MiB × 2 concurrentes) más la subida.

---

## 10. Contrato que consumirá el panel (fase 3, repo `cv-web`)

El panel llama **solo desde sus route handlers** (servidor Node), nunca desde el navegador.

| Panel (`cv-web`) | API | Notas |
|---|---|---|
| `POST /admin/api/login` | `POST /api/v1/admin/auth/login` | En 200 guarda `accessToken` en cookie httpOnly `cv_admin_token`: `Secure`, `SameSite=Strict`, `Path=/admin`, `Max-Age` hasta `expiresAt`. El token **no** llega al JS del cliente. Modelo: `fion-gastronomy/apps/frontend/src/app/admin/api/login/route.ts`. |
| `GET /admin/api/session` | `GET …/auth/session` | 401 → borrar cookie y redirigir al login. |
| `POST /admin/api/password` | `PUT …/auth/password` | Sustituye la cookie con el token nuevo de la respuesta. |
| `POST /admin/api/logout` | `POST …/auth/logout-all` (o solo borrar cookie) | Borrar la cookie no invalida el token; `logout-all` sí. |
| `GET/PUT /admin/api/content/[kind]` | `GET/PUT …/content/{kind}` | El panel edita items en cliente y envía el documento completo con las dos `baseVersions`. En 409 muestra «alguien cambió esto» y recarga. |
| historial y rollback | `GET …/versions`, `POST …/rollback` | Enviar siempre `baseVersion`. |
| `POST /admin/api/images` | `POST …/images` | Reenviar el `multipart` tal cual. Los route handlers de Next no tienen el tope de 1 MB de las server actions. Hay que comprobarlo en el despliegue standalone. |
| `GET/DELETE …/images`, `POST …/images/cleanup` | igual | |

Reglas para el panel:
- `proxy.ts` solo comprueba la **presencia** de la cookie; la autoridad es la API (patrón de `fion-gastronomy`).
- Un 401 con `code=ADMIN_UNAUTHORIZED` borra la cookie y redirige al login con el parámetro «sesión caducada».
- Un 429 `ADMIN_LOGIN_LOCKED` muestra el tiempo restante de `Retry-After`. Un 429 `ADMIN_LOGIN_RATE_LIMITED` pide esperar.
- **CSRF:** `SameSite=Strict` más comprobación de `Origin` en los route handlers que mutan.
- **No reenviar cabeceras `CF-*`** a la API (rompería el `AdminEdgeGuard`).
- Mensajes para el usuario según el `code`, no según el texto de la API.
- La web pública lee `project.images[0].url` del endpoint público. Sin caché: el cambio se ve al instante.

---

## 11. Plan de tests (catálogo completo)

Convenciones: todos los tests de `infrastructure` son `@QuarkusTest` con Testcontainers (también los de adaptadores, para sumar cobertura, regla de `CLAUDE.md`). Los de `application` y `domain` son unitarios con fakes. Las peticiones HTTP van dentro del test, no en `@BeforeAll`. Los datos son el CV ficticio de Ada Ejemplo.

### 11.1 Dominio

| # | Test | Archivo | Tipo | Cubre |
|---|---|---|---|---|
| T1 | **Dado** cabeceras de JPEG, PNG, WebP y GIF reales **cuando** se detecta el formato **entonces** devuelve el formato correcto con su extensión y tipo | `domain/src/test/.../ImageFormatTest.java` | unit | CA14 |
| T2 | **Dado** bytes de SVG, de un ejecutable, vacíos, o de menos de 12 bytes **cuando** se detecta **entonces** no hay formato soportado | ídem | unit | CA14 |
| T3 | **Dado** un archivo con cabecera PNG pero extensión y tipo declarados `.jpg` **cuando** se detecta **entonces** gana PNG (se ignora lo declarado) | ídem | unit | CA14 |
| T4 | **Dado** un proyecto `own`+`public` con imágenes **cuando** se construye **entonces** conserva las imágenes y su orden | `domain/src/test/.../ProjectImagesTest.java` | unit | CA15 |
| T5 | **Dado** un proyecto de empleador, o uno anónimo, con imágenes **cuando** se construye **entonces** la lista queda vacía | ídem | unit | CA15 |
| T6 | **Dado** una imagen con `alt` de más de 200 caracteres, o con ancho o alto 0 o negativo **cuando** se construye **entonces** lanza | ídem | unit | CA10 |
| T7 | **Dado** contraseñas de 11, 12, 128 y 129 caracteres, en blanco, o igual a la anterior **cuando** se valida **entonces** acepta solo 12..128 distintas de la anterior | `domain/src/test/.../AdminPasswordPolicyTest.java` | unit | CA4 |
| T8 | **Dado** una contraseña con emoji o caracteres acentuados **cuando** se valida **entonces** la longitud cuenta caracteres (code points), no bytes | ídem | unit | CA4 |

### 11.2 Aplicación (fakes, sin Quarkus)

| # | Test | Archivo | Tipo | Cubre |
|---|---|---|---|---|
| T9 | **Dado** una cuenta y la contraseña correcta **cuando** hace login **entonces** emite un token con su `session_version` y reinicia los fallos | `application/src/test/.../LoginAdminServiceTest.java` | unit | CA2 |
| T10 | **Dado** una contraseña incorrecta **cuando** hace login **entonces** lanza `ADMIN_INVALID_CREDENTIALS` y suma un fallo | ídem | unit | CA1, CA3 |
| T11 | **Dado** que no existe cuenta **cuando** hace login **entonces** lanza el mismo error y se invoca igualmente la verificación contra el hash falso | ídem | unit | CA1 |
| T12 | **Dado** 5 fallos consecutivos **cuando** hace el sexto intento, incluso con la contraseña correcta, **entonces** lanza `ADMIN_LOGIN_LOCKED` con los segundos restantes y no verifica el hash | ídem | unit | CA3 |
| T13 | **Dado** un bloqueo ya vencido **cuando** hace login correcto **entonces** entra y limpia el bloqueo | ídem | unit | CA3 |
| T14 | **Dado** el límite global agotado **cuando** hace login **entonces** lanza `ADMIN_LOGIN_RATE_LIMITED` sin consultar la BD | ídem | unit | CA3 |
| T15 | **Dado** un hash con parámetros antiguos **cuando** el login es correcto **entonces** guarda un hash nuevo con los parámetros vigentes | ídem | unit | CA2 |
| T16 | **Dado** un `sv` igual al de la BD **cuando** se verifica la sesión **entonces** es válida | `…/VerifyAdminSessionServiceTest.java` | unit | CA4, CA5 |
| T17 | **Dado** un `sv` distinto, o que no existe cuenta, **cuando** se verifica **entonces** es inválida | ídem | unit | CA4, CA5 |
| T18 | **Dado** la contraseña actual correcta y una nueva válida **cuando** la cambia **entonces** guarda el hash, sube `sv` y devuelve un token con el `sv` nuevo | `…/ChangeAdminPasswordServiceTest.java` | unit | CA4 |
| T19 | **Dado** una contraseña actual incorrecta **cuando** la cambia **entonces** lanza `ADMIN_CURRENT_PASSWORD_WRONG`, cuenta como fallo y no cambia nada | ídem | unit | CA4, CA3 |
| T20 | **Dado** una nueva contraseña débil o igual a la actual **cuando** la cambia **entonces** lanza `ADMIN_WEAK_PASSWORD` | ídem | unit | CA4 |
| T21 | **Dado** una sesión válida **cuando** pide `logout-all` **entonces** sube `sv` | `…/LogoutAllSessionsServiceTest.java` | unit | CA4 |
| T22 | **Dado** un servicio bilingüe válido **cuando** se guarda con las `baseVersions` correctas **entonces** publica ES y EN, invalida la caché de ambos después de publicar y devuelve las versiones nuevas | `…/SaveEditableContentServiceTest.java` | unit | CA8, CA13 |
| T23 | **Dado** una `baseVersion` obsoleta en cualquiera de los dos idiomas **cuando** se guarda **entonces** lanza `CONTENT_VERSION_CONFLICT`, no publica nada y no invalida | ídem | unit | CA9 |
| T24 | **Dado** un contenido inválido o con paridad rota **cuando** se guarda **entonces** lanza `CONTENT_INVALID` o `CONTENT_PARITY_BROKEN` antes de tocar el repositorio | ídem | unit | CA10, CA11 |
| T25 | **Dado** que el repositorio falla al publicar **cuando** se guarda **entonces** propaga el error y no invalida la caché | ídem | unit | CA8 |
| T26 | **Dado** que la invalidación lanza una excepción tras publicar **cuando** se guarda **entonces** el guardado se considera hecho, se registra un aviso y no se propaga | ídem | unit | CA13 |
| T27 | **Dado** el primer guardado de un tipo sin nada publicado **cuando** se guarda con `baseVersion` 0 **entonces** crea la versión 1 | ídem | unit | CA8 |
| T28 | **Dado** un documento de proyectos con un anónimo con `client` **cuando** se valida **entonces** hay una violación `ANONYMOUS_CLIENT_FORBIDDEN` con su ruta (`es.projects[1].client`) | `…/ContentValidatorTest.java` | unit | CA10 |
| T29 | **Dado** un proyecto público de un empleador sin `client` **cuando** se valida **entonces** `CLIENT_REQUIRED` | ídem | unit | CA10 |
| T30 | **Dado** ids repetidos, con mayúsculas fuera de formato o vacíos **cuando** se valida **entonces** `DUPLICATE_ID` o `INVALID_ID` | ídem | unit | CA10 |
| T31 | **Dado** enlaces `javascript:`, `http:` o sin esquema **cuando** se valida **entonces** `INVALID_URL` | ídem | unit | CA10 |
| T32 | **Dado** fechas con mes 13, formato libre o fin anterior al inicio **cuando** se valida **entonces** `INVALID_DATE` | ídem | unit | CA10 |
| T33 | **Dado** un precio negativo, sin moneda o no numérico **cuando** se valida **entonces** `INVALID_VALUE` | ídem | unit | CA10 |
| T34 | **Dado** un estado de adaptador fuera de `in-this-api`/`production`/`experiment` **cuando** se valida **entonces** `INVALID_VALUE` | ídem | unit | CA10 |
| T35 | **Dado** listas vacías (sin servicios, sin proyectos, sin puertos) **cuando** se valida **entonces** es válido (la web omite la sección) | ídem | unit | CA10 |
| T36 | **Dado** textos o listas por encima de los límites **cuando** se valida **entonces** `TOO_LONG` o `TOO_MANY` | ídem | unit | CA10 |
| T37 | **Dado** un proyecto de empleador, o anónimo, con `images` **cuando** se valida **entonces** `IMAGES_NOT_ALLOWED_FOR_PROJECT` | ídem | unit | CA10, CA15 |
| T38 | **Dado** una clave de imagen con `..`, fuera del prefijo, con otra extensión o que no es un UUID **cuando** se valida **entonces** `IMAGE_KEY_INVALID` | ídem | unit | CA10, CA14 |
| T39 | **Dado** campos opcionales ausentes (`price`, `client`, `endDate`, `images`, `links`) **cuando** se valida **entonces** es válido | ídem | unit | CA10 |
| T40 | **Dado** ES y EN con los mismos ids y campos neutros **cuando** se compara **entonces** hay paridad | `…/ContentParityTest.java` | unit | CA11 |
| T41 | **Dado** un id que falta en un idioma, otro orden, o distinto `price`, `relation`, `disclosure`, `status`, fechas, `key` de imagen **cuando** se compara **entonces** lista cada diferencia con su ruta | ídem | unit | CA11 |
| T42 | **Dado** textos distintos (título, resumen, `alt`, etiquetas) en cada idioma **cuando** se compara **entonces** no cuenta como diferencia | ídem | unit | CA11 |
| T43 | **Dado** una versión destino existente y la base correcta **cuando** se hace rollback **entonces** reactiva la destino, invalida la caché y devuelve la paridad | `…/RollbackContentServiceTest.java` | unit | CA12, CA13 |
| T44 | **Dado** una `baseVersion` que no es la activa **cuando** se hace rollback **entonces** `CONTENT_VERSION_CONFLICT` | ídem | unit | CA9, CA12 |
| T45 | **Dado** una versión destino inexistente **cuando** se hace rollback **entonces** `CONTENT_VERSION_NOT_FOUND` | ídem | unit | CA12 |
| T46 | **Dado** que la versión destino ya no pasa la validación vigente **cuando** se hace rollback **entonces** `CONTENT_INVALID` y no se reactiva | ídem | unit | CA12 |
| T47 | **Dado** un historial de varias versiones **cuando** se lista con límite **entonces** vienen de la más nueva a la más antigua, con `active` correcto y respetando el límite | `…/ListContentVersionsServiceTest.java` | unit | CA8 |
| T48 | **Dado** un tipo sin nada publicado **cuando** se lee **entonces** devuelve `version 0` y contenido nulo, no un error | `…/GetEditableContentServiceTest.java` | unit | CA8 |
| T49 | **Dado** un tipo desconocido **cuando** se pide **entonces** error de validación (404 `NOT_FOUND`) | ídem | unit | CA8 |
| T50 | **Dado** un archivo JPEG válido de 100 KB **cuando** se sube **entonces** se envía a almacenamiento con una clave `site/projects/<uuid>.jpg` generada, el tipo detectado y la caché inmutable | `…/UploadProjectImageServiceTest.java` | unit | CA14 |
| T51 | **Dado** un archivo de 5 MB + 1 byte **cuando** se sube **entonces** `IMAGE_TOO_LARGE` sin llamar al almacenamiento | ídem | unit | CA14 |
| T52 | **Dado** un archivo vacío o que no es imagen **cuando** se sube **entonces** `IMAGE_INVALID` | ídem | unit | CA14 |
| T53 | **Dado** un SVG **cuando** se sube **entonces** `IMAGE_UNSUPPORTED_TYPE` | ídem | unit | CA14 |
| T54 | **Dado** nombre y tipo del cliente falsos (`../../x.php`, `text/html`) **cuando** se sube una imagen real **entonces** se ignoran y la clave no los contiene | ídem | unit | CA14 |
| T55 | **Dado** que el almacenamiento falla **cuando** se sube **entonces** `IMAGE_STORAGE_UNAVAILABLE` | ídem | unit | CA17 |
| T56 | **Dado** una imagen referenciada por una versión activa o histórica **cuando** se borra **entonces** `IMAGE_IN_USE` sin tocar el almacenamiento | `…/DeleteImageServiceTest.java` | unit | CA16 |
| T57 | **Dado** una imagen sin referencias **cuando** se borra **entonces** se elimina del almacenamiento; una inexistente da `IMAGE_NOT_FOUND` | ídem | unit | CA16 |
| T58 | **Dado** objetos huérfanos viejos, huérfanos recientes y referenciados **cuando** se limpia **entonces** borra solo los huérfanos más viejos que la gracia | `…/CleanupOrphanImagesServiceTest.java` | unit | CA16 |
| T59 | **Dado** `dryRun=true` **cuando** se limpia **entonces** informa de lo que borraría y no borra nada | ídem | unit | CA16 |
| T60 | **Dado** más de 1000 huérfanas **cuando** se limpia **entonces** borra por lotes de 1000 como máximo | ídem | unit | CA16 |
| T61 | **Dado** una gracia menor que el mínimo (1 h) **cuando** se limpia **entonces** se aplica el mínimo | ídem | unit | CA16 |
| T62 | **Dado** una lista de mensajes y un cursor **cuando** se listan **entonces** salen de más nuevo a más antiguo, sin `ip_hash` y con el siguiente cursor (solo si se hace `api-admin-messages`) | `…/ListContactMessagesServiceTest.java` | unit | R-9 |

### 11.3 Infraestructura: seguridad y auth (`@QuarkusTest`)

| # | Test | Archivo | Tipo | Cubre |
|---|---|---|---|---|
| T63 | **Dado** una contraseña **cuando** se hashea **entonces** el hash es PHC `$argon2id$v=19$m=…,t=…,p=…`, y dos hashes de la misma contraseña difieren | `infrastructure/src/test/.../adapter/out/Argon2PasswordHasherTest.java` | integración | CA2 |
| T64 | **Dado** un hash válido **cuando** se verifica con la contraseña correcta, con una incorrecta y con un hash corrupto o de otro algoritmo **entonces** true, false y false (sin excepción) | ídem | integración | CA1 |
| T65 | **Dado** un hash con menos coste que el vigente **cuando** se consulta `needsRehash` **entonces** true | ídem | integración | CA2 |
| T66 | **Dado** una contraseña muy larga (128) o con Unicode **cuando** se hashea y verifica **entonces** funciona | ídem | integración | CA2 |
| T67 | **Dado** la migración V4 sobre una BD con V1..V3 **cuando** se aplica **entonces** la tabla existe, rechaza `id <> 1`, rechaza hashes que no son argon2id y no tiene filas | `…/adapter/out/MigrationsTest.java` | integración | CA23 |
| T68 | **Dado** la migración V5 sobre el seed existente **cuando** se aplica **entonces** las filas previas quedan con `source='seed'` y `comment` nulo; `source` solo admite `seed`/`admin` | ídem | integración | CA23 |
| T69 | **Dado** una cuenta **cuando** se registran fallos concurrentes (hilos) **entonces** el contador es exacto y el bloqueo se aplica una vez superado el máximo | `…/adapter/out/PostgresAdminAccountRepositoryTest.java` | integración | CA3 |
| T70 | **Dado** un éxito tras fallos **cuando** se registra **entonces** `failed_attempts=0`, `locked_until` nulo y `last_login_at` fijado | ídem | integración | CA3 |
| T71 | **Dado** un cambio de contraseña **cuando** se persiste **entonces** sube `session_version` y se actualiza `password_changed_at` en la misma sentencia | ídem | integración | CA4 |
| T72 | **Dado** el login con la contraseña correcta **cuando** se llama a `POST /auth/login` **entonces** 200 con `accessToken`, `tokenType` y `expiresAt`; el JWT trae `iss`, `aud`, `sub`, `sv`, `jti`, `exp` y está firmado con HS256 | `…/AdminAuthResourceTest.java` | integración REST | CA2 |
| T73 | **Dado** una contraseña incorrecta **cuando** se llama al login **entonces** 401 `ADMIN_INVALID_CREDENTIALS` con el mensaje en ES por defecto y en EN con `?lang=en` | ídem | integración REST | CA1, CA19 |
| T74 | **Dado** una BD sin cuenta **cuando** se llama al login **entonces** 401 idéntico (mismo cuerpo) al de contraseña incorrecta | ídem | integración REST | CA1 |
| T75 | **Dado** 5 fallos **cuando** se llama de nuevo, con la contraseña correcta, **entonces** 429 `ADMIN_LOGIN_LOCKED` y la cabecera `Retry-After` | ídem | integración REST | CA3 |
| T76 | **Dado** un cuerpo vacío, sin `password`, JSON malformado o un tipo de contenido incorrecto **cuando** se llama al login **entonces** 400 `BAD_REQUEST` o 415, nunca 500 | ídem | integración REST | CA5 |
| T77 | **Dado** un token válido **cuando** se llama a `GET /auth/session` **entonces** 200 con `authenticated` y `passwordChangedAt` | ídem | integración REST | CA2 |
| T78 | **Dado** el cambio de contraseña correcto **cuando** se llama a `PUT /auth/password` **entonces** 200 con token nuevo; el token viejo da 401 y el nuevo 200; el login con la contraseña vieja falla | ídem | integración REST | CA4 |
| T79 | **Dado** una contraseña actual incorrecta **cuando** se cambia **entonces** 403 `ADMIN_CURRENT_PASSWORD_WRONG` (no 401) | ídem | integración REST | CA4 |
| T80 | **Dado** una contraseña nueva débil **cuando** se cambia **entonces** 422 `ADMIN_WEAK_PASSWORD` | ídem | integración REST | CA4 |
| T81 | **Dado** dos tokens válidos **cuando** se llama a `logout-all` con uno **entonces** 204 y ambos pasan a dar 401 | ídem | integración REST | CA4 |
| T82 | **Dado** cada ruta admin que aparece en `/openapi.json` (se recorre dinámicamente, salvo el login) **cuando** se llama sin token **entonces** 401 `ADMIN_UNAUTHORIZED` en `application/problem+json` con `WWW-Authenticate: Bearer` | `…/AdminSecurityTest.java` | integración REST | CA5 |
| T83 | **Dado** un token con firma de otra clave, caducado, con `iss` o `aud` distintos, con `alg=none` o con `sv` viejo **cuando** se llama a una ruta admin **entonces** 401 en todos los casos | ídem | integración REST | CA5 |
| T84 | **Dado** una petición a un endpoint público con un `Authorization: Bearer` inválido **cuando** se llama **entonces** se documenta y comprueba el comportamiento real (200 o 401) y la prueba lo ancla | ídem | integración REST | CA5 |
| T85 | **Dado** un token válido **cuando** se llama a una ruta admin **entonces** la respuesta lleva `Cache-Control: no-store` y no `public, max-age=300` | `…/ApiCacheHeadersTest.java` | integración REST | CA7 |
| T86 | **Dado** un GET público 200 **cuando** se llama **entonces** conserva `Cache-Control: public, max-age=300` y `Vary: Accept-Language` | ídem | integración REST | CA7 |
| T87 | **Dado** el perfil `admin-disabled` (sin `CV_ADMIN_JWT_SECRET` o con uno corto) **cuando** arranca la API **entonces** arranca, `/api/v1/profile` responde 200 y `/api/v1/admin/auth/login` responde 404 `NOT_FOUND`, con un aviso en el log | `…/AdminDisabledTest.java` (`@TestProfile`) | integración REST | CA6 |
| T88 | **Dado** `CV_ADMIN_EDGE_BLOCK=true` **cuando** una petición admin lleva `CF-Ray` o `CF-Connecting-IP` **entonces** 404; sin esas cabeceras funciona | `…/AdminEdgeGuardTest.java` | integración REST | CA18 |
| T89 | **Dado** una petición admin a una ruta pública **cuando** el filtro de sesión consulta la BD **entonces** no se ejecuta en el hilo de eventos (no lanza «blocking operation»), y con la BD caída responde 5xx genérico sin filtrar detalles internos | `…/AdminSessionFilterTest.java` | integración REST | CA5 |
| T90 | **Dado** el límite global de login **cuando** se superan 10 intentos en un minuto **entonces** 429 `ADMIN_LOGIN_RATE_LIMITED`, y el límite de contacto (`cv.contact.rate-limit`) sigue siendo independiente | `…/adapter/out/InMemoryRateLimiterTest.java` (ampliado) | integración | CA3 |
| T91 | **Dado** el comando `set-password` con entrada simulada **cuando** no hay cuenta **entonces** crea la fila con un hash argon2id válido que luego permite el login | `…/AdminPasswordToolTest.java` | integración | CA4, CA25 |
| T92 | **Dado** el comando `set-password` con cuenta existente **cuando** se ejecuta **entonces** cambia el hash, sube `session_version`, limpia bloqueo e intentos | ídem | integración | CA4 |
| T93 | **Dado** una contraseña débil o una confirmación distinta **cuando** se ejecuta `set-password` **entonces** sale con error y no toca la BD | ídem | integración | CA4 |
| T94 | **Dado** una cuenta bloqueada **cuando** se ejecuta `unlock` **entonces** se limpia el bloqueo y los intentos; `status` informa sin mostrar el hash | ídem | integración | CA3 |
| T95 | **Dado** argumentos desconocidos o ausentes **cuando** se ejecuta la herramienta **entonces** imprime el uso y sale con código distinto de 0 | ídem | integración | CA25 |

### 11.4 Infraestructura: contenido, caché y contrato (`@QuarkusTest`)

| # | Test | Archivo | Tipo | Cubre |
|---|---|---|---|---|
| T96 | **Dado** el seed de ejemplo **cuando** se llama a `GET /content/services` **entonces** 200 con ES y EN en versión 1, `source`, `content` y `parity.ok` | `…/AdminContentResourceTest.java` | integración REST | CA8 |
| T97 | **Dado** un tipo sin publicar (BD limpia en ese tipo) **cuando** se lee **entonces** 200 con `version 0` y `content null` | ídem | integración REST | CA8 |
| T98 | **Dado** un guardado válido **cuando** se llama a `PUT /content/services` **entonces** 200, versiones nuevas en ES y EN, una sola activa por idioma y las anteriores intactas en BD | ídem | integración REST | CA8 |
| T99 | **Dado** un guardado con `baseVersions` obsoletas **cuando** se llama **entonces** 409 `CONTENT_VERSION_CONFLICT` y la BD no cambia | ídem | integración REST | CA9 |
| T100 | **Dado** dos guardados simultáneos (hilos) con la misma base **cuando** se ejecutan **entonces** uno recibe 200 y el otro 409, sin versiones duplicadas | ídem | integración REST | CA9 |
| T101 | **Dado** un fallo a mitad de transacción (el inglés viola una restricción) **cuando** se guarda **entonces** tampoco queda la versión de español | `…/adapter/out/PostgresContentVersionRepositoryTest.java` | integración | CA8 |
| T102 | **Dado** un anónimo con `client` en el JSON **cuando** se guarda **entonces** 422 `CONTENT_INVALID` con `errors[0].path` y `code` correctos y nada se persiste | `…/AdminContentResourceTest.java` | integración REST | CA10 |
| T103 | **Dado** un campo desconocido en el cuerpo **cuando** se guarda **entonces** 422 (`UNKNOWN_FIELD`), no se ignora en silencio | ídem | integración REST | CA10 |
| T104 | **Dado** ES y EN con estructura distinta **cuando** se guarda **entonces** 422 `CONTENT_PARITY_BROKEN` con las diferencias | ídem | integración REST | CA11 |
| T105 | **Dado** un cuerpo mayor que el límite de contenido **cuando** se guarda **entonces** 413 `CONTENT_TOO_LARGE` | ídem | integración REST | CA10 |
| T106 | **Dado** un guardado de proyectos **cuando** se lee el JSON almacenado **entonces** coincide con la forma de `db/sample` (el escritor es el inverso exacto del lector: ida y vuelta sin pérdida) | `…/adapter/out/SiteContentJsonWriterTest.java` | integración | CA8 |
| T107 | **Dado** el historial con varias versiones **cuando** se llama a `GET …/versions` **entonces** orden descendente, `active` correcto y límite aplicado | `…/AdminContentResourceTest.java` | integración REST | CA8 |
| T108 | **Dado** una versión existente e inexistente **cuando** se pide `GET …/versions/{n}` **entonces** 200 con su contenido y 404 `CONTENT_VERSION_NOT_FOUND` respectivamente | ídem | integración REST | CA8 |
| T109 | **Dado** una versión antigua **cuando** se hace rollback **entonces** queda activa, un `GET` público devuelve su contenido y un guardado posterior crea `MAX+1` | ídem | integración REST | CA12 |
| T110 | **Dado** el rollback hecho con `make-seed.py --rollback` **cuando** la API lee **entonces** el estado es coherente con el de un rollback del panel (misma regla de `active`) | ídem | integración REST | CA12 |
| T111 | **Dado** un guardado **cuando** se lee `GET /api/v1/services` justo después (sin esperar el TTL de 5 min) **entonces** devuelve el contenido nuevo | `…/ContentCacheInvalidationTest.java` | integración REST | CA13 |
| T112 | **Dado** un rollback **cuando** se lee el público justo después **entonces** devuelve el contenido restaurado | ídem | integración REST | CA13 |
| T113 | **Dado** una lectura lenta que consultó la BD antes de un guardado **cuando** termina después de invalidar **entonces** no repone el valor viejo (la época cambió) | `…/adapter/out/PostgresSiteContentRepositoryTest.java` (ampliado) | integración | CA13 |
| T114 | **Dado** una invalidación **cuando** la BD cae justo después **entonces** se propaga el error en esa clave y las demás claves siguen sirviendo lo último leído | ídem | integración | CA13 |
| T115 | **Dado** una invalidación de un (kind, lang) **cuando** se lee otro tipo o idioma **entonces** sigue en caché (no se hace una consulta de más) | ídem | integración | CA13 |
| T116 | **Dado** un servicio, proyecto y arquitectura **cuando** se guardan **entonces** `GET` público refleja los cambios incluyendo `disclosure` y sin `client` en los anónimos | `…/SiteContentEndpointsTest.java` (ampliado) | integración REST | CA10 |
| T117 | **Dado** cada código de error nuevo **cuando** se ejecuta `ProblemCatalogTest` **entonces** tiene `ApiError`, título y detalle en ES y EN y paridad de claves | `…/error/ProblemCatalogTest.java` (existente) | unit | CA19 |
| T118 | **Dado** `/openapi.json` **cuando** se inspecciona **entonces** todas las rutas admin existen (y solo esas), con `operationId`, etiqueta «Admin», `bearerAuth`, request, ejemplos y las salidas 200/401/403/409/422/500 que correspondan | `…/OpenApiDocumentTest.java` (ampliado) | integración | CA20 |
| T119 | **Dado** `cv.admin.openapi.enabled=false` **cuando** se inspecciona `/openapi.json` **entonces** no aparecen rutas admin ni `bearerAuth` | `…/OpenApiAdminHiddenTest.java` (`@TestProfile`) | integración | CA20 |
| T120 | **Dado** el esquema `Problem` **cuando** se inspecciona **entonces** el enum de `code` coincide con `ApiError` y `errors` está documentado | `…/OpenApiDocumentTest.java` | integración | CA19, CA20 |
| T121 | **Dado** las clases de los tres módulos **cuando** corre `ArchitectureTest` **entonces** pasan las reglas existentes más: `software.amazon..` y `org.bouncycastle..` solo en `adapter.out`/`config`; `application` y `domain` no las usan; solo `adapter.out.security` toca JWT/Argon2 | `…/ArchitectureTest.java` (ampliado) | unit | CA21 |

### 11.5 Infraestructura: imágenes y R2 (MinIO con Testcontainers)

| # | Test | Archivo | Tipo | Cubre |
|---|---|---|---|---|
| T122 | **Dado** un MinIO con bucket **cuando** el adaptador sube un objeto **entonces** existe con la clave, el `Content-Type` y el `Cache-Control` inmutable, y devuelve la URL pública compuesta | `…/adapter/out/R2FileStorageAdapterTest.java` | integración | CA14 |
| T123 | **Dado** un objeto existente **cuando** se borra **entonces** deja de existir; borrar uno inexistente no falla | ídem | integración | CA16 |
| T124 | **Dado** varios objetos bajo `site/projects/` y otros fuera **cuando** se lista **entonces** solo salen los del prefijo, con `lastModified` y tamaño, paginando por encima de 1000 | ídem | integración | CA16 |
| T125 | **Dado** el cliente construido **cuando** se inspecciona su configuración **entonces** región `auto`, path-style, `chunkedEncodingEnabled(false)` y checksums `WHEN_REQUIRED` | `…/config/R2ClientConfigTest.java` | integración | CA14 |
| T126 | **Dado** un almacenamiento caído o con credenciales erróneas **cuando** se sube **entonces** responde con el tiempo máximo configurado (sin colgar) y `IMAGE_STORAGE_UNAVAILABLE` | `…/adapter/out/R2FileStorageAdapterTest.java` | integración | CA17 |
| T127 | **Dado** `R2_*` sin configurar **cuando** se arranca **entonces** la API arranca y la subida responde 503 `IMAGE_STORAGE_UNAVAILABLE` | `…/AdminImagesResourceTest.java` (`@TestProfile`) | integración REST | CA17 |
| T128 | **Dado** un PNG real **cuando** se llama a `POST /images` (multipart) **entonces** 201 con `key`, `url`, `contentType`, `bytes`, `width` y `height` | `…/AdminImagesResourceTest.java` | integración REST | CA14 |
| T129 | **Dado** un archivo `foto.jpg` con `Content-Type: image/jpeg` pero con contenido HTML o SVG **cuando** se sube **entonces** 400 o 415 y no hay objeto en MinIO | ídem | integración REST | CA14 |
| T130 | **Dado** un archivo de más de 5 MB **cuando** se sube **entonces** 413 `IMAGE_TOO_LARGE` sin dejar objeto | ídem | integración REST | CA14 |
| T131 | **Dado** una petición sin la parte `file`, o con dos partes **cuando** se sube **entonces** 400 `IMAGE_INVALID` | ídem | integración REST | CA14 |
| T132 | **Dado** una subida **cuando** se inspecciona el archivo temporal del servidor **entonces** se eliminó al terminar la petición | ídem | integración REST | CA14 |
| T133 | **Dado** una subida sin token **cuando** se llama **entonces** 401 antes de leer el cuerpo | ídem | integración REST | CA5 |
| T134 | **Dado** un proyecto `own`+`public` guardado con `images` **cuando** se llama a `GET /api/v1/projects` **entonces** salen `images[].url` compuestas con `R2_PUBLIC_URL`, `alt`, `width` y `height`, en el orden guardado | `…/SiteContentEndpointsTest.java` (ampliado) | integración REST | CA15 |
| T135 | **Dado** una imagen en la BD de un proyecto de empleador o anónimo **cuando** se llama al GET público **entonces** `images` vacío | ídem | integración REST | CA15 |
| T136 | **Dado** proyectos sin el campo `images` (datos antiguos, `db/sample` actual) **cuando** se llama al GET público **entonces** `images: []` y nada falla | ídem | integración REST | CA15 |
| T137 | **Dado** el tamaño máximo global de cuerpo ampliado **cuando** se envía un cuerpo de más de 128 KB a un endpoint público (HL7, contacto) **entonces** sigue respondiendo 413 | `…/Hl7ResourceTest.java` y `…/ContactMessagesResourceTest.java` (ampliados) | integración REST | CA14, R-2 |
| T138 | **Dado** una imagen referenciada solo por una versión histórica **cuando** se llama a `DELETE /images/{id}` **entonces** 409 `IMAGE_IN_USE`; sin referencias, 204 y el objeto desaparece | `…/AdminImagesResourceTest.java` | integración REST | CA16 |
| T139 | **Dado** `GET /images` con objetos referenciados y no **cuando** se llama **entonces** `referenced` es correcto en cada uno | ídem | integración REST | CA16 |
| T140 | **Dado** huérfanas viejas, huérfanas recientes y referenciadas **cuando** se llama a `cleanup` **entonces** borra solo las huérfanas más viejas que la gracia; con `dryRun=true` no borra nada | ídem | integración REST | CA16 |
| T141 | **Dado** un guardado de proyectos que referencia una `key` inexistente en R2 **cuando** se guarda **entonces** se acepta el formato (la validación no consulta R2) y se documenta el comportamiento | `…/AdminContentResourceTest.java` | integración REST | CA10 (ver R-7) |
| T142 | **Dado** `GET /contact-messages` con mensajes de ejemplo **cuando** se llama con token **entonces** salen paginados sin `ip_hash`; sin token, 401 (solo si se hace `api-admin-messages`) | `…/AdminMessagesResourceTest.java` | integración REST | R-9 |

### 11.6 Scripts, smoke y entorno

| # | Test | Archivo | Tipo | Cubre |
|---|---|---|---|---|
| T143 | **Dado** un `projects.*.json` con `images` válidas, inválidas (clave mala, proyecto no elegible) y con `client` en un anónimo **cuando** se ejecuta `make-seed.py` **entonces** acepta las válidas y sale con error en las demás | `scripts/test_make_seed.py` (`python3 -m unittest`, a añadir al CI) | unit | CA10 |
| T144 | **Dado** el seed regenerado de `db/sample` con un proyecto con `images` **cuando** se aplica en el CI **entonces** el smoke test pasa | `scripts/smoke-test.sh` | smoke | CA24 |
| T145 | **Dado** una instancia en marcha **cuando** el smoke test llama a `/api/v1/admin/auth/session` sin token **entonces** 401 con `code` | `scripts/smoke-test.sh` | smoke | CA24 |
| T146 | **Dado** el repositorio completo **cuando** se ejecuta `mvn -B verify` y `scripts/ci-summary.py --min-total 90 --min-module 80` **entonces** pasa | CI (`.github/workflows/ci.yml`) | build | CA22 |
| T147 | **Dado** el repositorio **cuando** se busca con `grep` cualquier valor de `R2_*`, `CV_ADMIN_JWT_SECRET` o una contraseña real **entonces** no aparece; el compose solo trae `CAMBIA-…` | revisión manual en review | manual | CA25 |

**Manual obligatorio (no automatizable en CI):**
- Subida real contra el bucket de R2 con la configuración de checksums del R-3.
- Ejecutar `admin-password.sh` en el NAS.
- Comprobar en Cloudflare que `/api/v1/admin/*` no es alcanzable desde fuera (R-1).

**Cobertura de criterios:** CA1 (T10, T11, T64, T73, T74) · CA2 (T9, T15, T63, T65, T66, T72, T77) · CA3 (T10, T12–T14, T19, T69, T70, T75, T90, T94) · CA4 (T7, T8, T16–T21, T71, T78–T81, T91–T93) · CA5 (T16, T17, T76, T82–T84, T89, T133) · CA6 (T87) · CA7 (T85, T86) · CA8 (T22, T25, T27, T47–T49, T67, T68, T96–T98, T101, T106–T108) · CA9 (T23, T44, T99, T100) · CA10 (T24, T28–T39, T102, T103, T105, T116, T141, T143) · CA11 (T24, T40–T42, T104) · CA12 (T43–T46, T109, T110) · CA13 (T22, T26, T111–T115) · CA14 (T1–T3, T38, T50–T54, T122, T125, T128–T132, T137) · CA15 (T4, T5, T37, T134–T136) · CA16 (T56–T61, T123, T124, T138–T140) · CA17 (T55, T126, T127) · CA18 (T88) · CA19 (T73, T117, T120) · CA20 (T118–T120) · CA21 (T121) · CA22 (T146) · CA23 (T67, T68) · CA24 (T144, T145) · CA25 (T91, T95, T147).

---

## 12. Datos y resiliencia

- **BD caída:** el repositorio de contenido público sigue sirviendo lo último leído (comportamiento existente). Las rutas admin responden 5xx genérico (`UNEXPECTED`) sin detalles internos. No hay sesión sin BD: el login y el filtro de sesión necesitan la tabla (por diseño, para que la invalidación sea inmediata).
- **R2 caído o sin configurar:** solo falla la subida, la lista y el borrado de imágenes (503). Guardar contenido y leer la web siguen funcionando. Timeouts explícitos en el cliente S3: intento 5 s, llamada total 10 s, un solo reintento.
- **Admin deshabilitado:** sin secreto JWT válido la API pública arranca igual (CA6). No se rompe un despliegue por olvidar una variable.
- **Subida con éxito y guardado fallido:** la imagen queda huérfana en R2 y la recoge `cleanup`. El guardado de contenido no depende de R2, así que un fallo del almacenamiento no pierde ediciones.
- **Dos pestañas del panel:** la segunda en guardar recibe 409. No se pisan versiones.
- **Datos antiguos:** los proyectos sin `images` y las filas con `source='seed'` siguen leyéndose (CA15, CA23).
- **Imágenes y rollback:** como una imagen referenciada por el historial nunca se borra, hacer rollback jamás deja un enlace roto.
- **Sin migraciones destructivas:** V4 crea una tabla; V5 solo añade columnas con valor por defecto.

---

## 13. Alternativas descartadas

1. **Items sueltos (un endpoint por servicio, proyecto o puerto).** Obliga a versionar por item, complica la concurrencia (¿qué versión es «la de la base»?) y rompe la paridad ES/EN. Se descartó a favor del documento completo bilingüe.
2. **`quarkus-amazon-s3` (extensión Quarkiverse).** Exige un segundo BOM (`quarkus-amazon-services-bom`) y su configuración documentada expone `checksum-validation` (respuesta) pero no el cálculo de checksum de **petición**, que es el ajuste crítico para R2. Con el SDK directo todo es explícito y testeable. Contrapartida: se pierde la integración CDI y los dev services, que aquí no hacen falta (MinIO ya cubre los tests).
3. **bcrypt (con `BcryptUtil` de Elytron o con `pgcrypto`).** Más simple, pero límite de 72 bytes y no memoria-dura. Argon2id es la primera opción de OWASP y el coste extra es una clase.
4. **`argon2-jvm` (`de.mkammerer`, 2.12).** Usa JNA con binarios nativos; riesgo en la imagen multi-arch. BouncyCastle es Java puro y ya está gestionado por el BOM de Quarkus.
5. **JWT asimétrico (RS256/ES256).** Firma y verifica el mismo servicio. Una clave PEM en variables de entorno añade complejidad sin beneficio.
6. **Tabla `site_image` con un registro por imagen.** Duplicaría el estado de R2 y habría que reconciliarlo. Listar el prefijo en R2 y cruzar con las referencias del JSON es más simple y no puede desincronizarse.
7. **Reactivar por copia (rollback que inserta una versión nueva con el contenido viejo).** Duplica contenido y no es compatible con `make-seed.py --rollback`. Se eligió mover el puntero `active`.
8. **Limitar el login por IP.** Con `cv-web` delante, la IP que ve la API es siempre la interna. Se limita por cuenta.
9. **Ocultar los endpoints admin de Swagger.** El repo es público y las rutas se ven en el código. La protección real es la red más el JWT.
10. **Secreto compartido adicional entre `cv-web` y la API (cabecera `X-Gateway-Key`).** Redundante con JWT, aislamiento de red y `AdminEdgeGuard`.
11. **Caché de `session_version` en memoria.** Ahorra una consulta por PK en un panel de un solo usuario y retrasaría la invalidación. Se consulta en cada petición.

---

## 14. Slugs hijos recomendados (orden y dependencias)

Todos en el repo `cv`, salvo el último bloque, que es fase 3. Cada uno pasa por analyst → tests → implementación → review.

| Orden | Slug | Contenido | Depende de | Tests |
|---|---|---|---|---|
| 1 | `api-admin-auth` | V4, `AdminPasswordPolicy`, `PasswordHasher` + Argon2id, JWT (emisión y verificación HS256), `AdminSessionFilter`, login/session/password/logout-all, bloqueo por cuenta, límite global, mapeo de excepciones de seguridad (401/403), `ApiCacheHeaders` sin admin, `AdminEdgeGuard`, `AdminConfig`, `bearerAuth` en OpenAPI, refactor de `InMemoryRateLimiter` | — | T7–T21, T63–T66, T67, T69–T90, T117–T118 (parcial), T121 (parcial) |
| 1b | `api-admin-password-cli` | `AdminPasswordTool` (`set-password`, `unlock`, `status`) + `scripts/admin-password.sh`; comprobar el classpath del fast-jar en el contenedor | 1 | T91–T95 |
| 2 | `api-admin-cache` | Puerto `ContentCacheInvalidator`, época por clave en `PostgresSiteContentRepository`, pruebas de concurrencia. Puede ir en paralelo con 1 | — | T111 (parcial), T113–T115 |
| 3 | `api-admin-content` | V5, drafts, `ContentValidator`, `ContentParity`, `SiteContentJsonWriter`, `ContentVersionRepository` (transacción + candado), guardado bilingüe, historial, rollback, errores `CONTENT_*`, OpenAPI y ejemplos | 1, 2 | T22–T49, T96–T112, T116, T120, T141 |
| 4 | `api-admin-images` | `ImageFormat`, `ProjectImage`, `Project.images`, `FileStoragePort`, `R2FileStorageAdapter`, `R2ClientConfig`, endpoints de imágenes, `cleanup`, DTO público con `images`, ajuste de `max-body-size`, `make-seed.py` con `images`, `db/sample`. **Spike previo de 1 h con el bucket real** (R-3) | 3 | T1–T6, T37, T38, T50–T61, T122–T139, T143 |
| 5 | `api-admin-docs-deploy` | README, ARCHITECTURE, CLAUDE (hacia dónde se movió «No hay endpoints de administración»), compose de `cv` y de `cv-web`, smoke test, CI (Python y cobertura), checklist de Cloudflare, tipos regenerados para la web | 1–4 | T144–T147 |
| 6 (opcional) | `api-admin-messages` | `GET /admin/contact-messages` paginado | 1 | T62, T142 |

Fase 3 (repo `cv-web`, fuera de este plan): `web-admin-shell` (login, cookie, `proxy.ts`), `web-admin-content` (editores por tipo con ES/EN, historial y rollback), `web-admin-images` (subida y selector de portada), `web-admin-public-images` (la web pública pasa a leer `project.images[]`). Dependen de `api-admin-auth` en adelante, y la última de `api-admin-images`.

---

## 15. Riesgos y dudas

- **R-1 (alto). ¿La API es pública hoy?** El brief habla de `cv-api.floreslab.dev` público; el compose de `cv-web` dice que la API no se publica. No pude ver la config del túnel. Si existe el host público, hay que bloquear `/api/v1/admin/*` en Cloudflare (regla WAF o sin servicio en el túnel) **antes** de desplegar el admin. `AdminEdgeGuard` ayuda, pero no sustituye la regla. Decisión humana.
- **R-2 (alto). Límite global de cuerpo.** `quarkus.http.limits.max-body-size` es global (128K hoy, por el HL7). Subirlo a unos 6 MB abre los endpoints públicos a cuerpos grandes. Mitigación propuesta: filtro previo por `Content-Length` que rechace > 128 KB fuera de `/api/v1/admin/`, más los topes de aplicación existentes (64 KB HL7). Esto no cubre del todo el `Transfer-Encoding: chunked`. **Es el primer spike de `api-admin-images`.** Si no queda sólido, alternativa: dividir la subida en una ruta de Vert.x aparte con su propio límite.
- **R-3 (alto). Compatibilidad AWS SDK 2.54.13 con R2.** La guía de AWS y varios issues indican que desde 2.30 los checksums se envían por defecto y pueden dar error con R2; la página oficial de R2 no lo confirma. El plan fija `WHEN_REQUIRED`, `chunkedEncodingEnabled(false)`, path-style y región `auto`. MinIO no reproduce los fallos de R2. **Prueba manual con el bucket real obligatoria** antes de dar el slug por cerrado.
- **R-4 (medio). Bloqueo como arma.** Cualquiera que llegue al login puede bloquear al administrador 15 min con 5 intentos. Se mitiga con el bloqueo corto, el comando `unlock` y el aislamiento de red (R-1). Alternativa a evaluar: retardo progresivo en vez de bloqueo duro.
- **R-5 (medio). Hilo del filtro de sesión.** `AdminSessionFilter` hace JDBC bloqueante. Hay que comprobar que no corre en el hilo de eventos (T89). Si lo hiciera, habría que mover la comprobación a un `SecurityIdentityAugmentor` con ejecución bloqueante.
- **R-6 (medio). EXIF en las imágenes.** Una captura o foto puede llevar geolocalización. Se recomienda re-codificar JPEG/PNG para quitar metadatos (WebP y GIF no los trae el JDK sin plugin). Queda fuera del alcance mínimo; decisión del humano.
- **R-7 (bajo). Claves sin comprobar en R2.** Al guardar un proyecto no se verifica que la imagen exista en R2 (ahorra una llamada y evita acoplar el guardado a R2). El panel solo ofrece claves que vienen de una subida o del listado. Un cliente directo podría guardar una clave inexistente: queda una imagen rota en la web, no un error.
- **R-8 (bajo). `resume` fuera del admin.** Se deja fuera por esquema y privacidad. `ContentCacheInvalidator` se diseña genérico por si luego se quiere. Si el humano lo pide, es un slug nuevo.
- **R-9 (medio). Mensajes de contacto en el admin.** Recomendado, como slug opcional de solo lectura. Son datos personales (nombre, correo, cuerpo): decisión del humano. Borrado y marcado como leído quedan fuera.
- **R-10 (medio). Regla de paridad ES/EN.** La defino como: mismos ids y orden en cada nivel, y mismos campos neutros (`price`, `relation`, `disclosure`, fechas, `status`, `key`, `width`, `height`, `client`); lo demás es traducible. Es una interpretación mía de «misma estructura». Confirmar con el humano antes de implementar `ContentParity`.
- **R-11 (medio). Contraseña únicamente, sin usuario.** El login pide solo la contraseña (`sub=admin`), a diferencia de `fion-gastronomy`, que usa email + contraseña. Con un único administrador y bloqueo por cuenta, el usuario no añade seguridad real. Añadir un campo `username` más adelante es una migración trivial. Confirmar.
- **R-12 (medio). Coste de Argon2 en el NAS.** 64 MiB y t=3 en Java puro pueden tardar cientos de ms en una CPU de NAS. Los parámetros son configurables y van dentro del hash; ajustarlos tras medir en el NAS real.
- **R-13 (bajo). Frescura en el CDN.** Los GET públicos llevan `max-age=300`. La web los lee sin caché y verá el cambio al instante; otro consumidor que pase por el CDN de Cloudflare verá cambios con hasta 5 min de retraso. Se puede añadir una purga en el futuro.
- **R-14 (bajo). Una sola instancia.** El limitador en memoria y la invalidación de caché asumen una réplica (es el caso del NAS). Con varias hay que pasar a Postgres (`LISTEN/NOTIFY`) o Redis.
- **R-15 (bajo). Límites de contenido.** Los topes numéricos de §4 (títulos 120, resúmenes 600, 60 proyectos…) son valores razonables míos, no del brief. Revisar con el contenido real.
- **R-16 (bajo). Testcontainers 2.x.** El módulo es `testcontainers-minio` (no `minio`, nombres de la serie 1.x). El BOM de Quarkus ya lo gestiona (2.0.5), pero hay que comprobar su compatibilidad con la configuración actual de Quarkus DevServices.
- **R-17 (bajo). `quarkus.http.auth` y el comportamiento con tokens inválidos en rutas públicas.** Se ancla con T84 en lugar de asumirlo.
- **Pendiente (no es del brief):** `ARCHITECTURE.md` afirma «No hay endpoints de administración: el CV se actualiza desde el pipeline». Hay que reescribir esa línea en `api-admin-docs-deploy`.

Sources:
- [Cloudflare R2: AWS SDK for Java](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-java/)
- [Cloudflare R2: S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/)
- [Quarkus: Using JWT RBAC](https://quarkus.io/guides/security-jwt)
- [Quarkus: Build, sign and encrypt JWT tokens](https://quarkus.io/guides/security-jwt-build)
- [Quarkus: HTTP reference](https://quarkus.io/guides/http-reference)
- [Quarkiverse Amazon Services (Context7)](https://github.com/quarkiverse/quarkus-amazon-services)
- [AWS SDK for Java 2.x: data integrity with checksums](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/s3-checksums.html)
- [AWS SDK for Java v2 issue 5824](https://github.com/aws/aws-sdk-java-v2/issues/5824)

---

## 16. Decisiones del humano sobre los riesgos (2026-11-12)

- **R-1:** la API **es pública** (`cv-api.floreslab.dev`). Hay que bloquear `/api/v1/admin/*` en Cloudflare (regla WAF o sin ruta en el túnel) antes de desplegar el admin (tarea del humano, checklist en `api-admin-docs-deploy`); `AdminEdgeGuard` con `CV_ADMIN_EDGE_BLOCK=true` queda como defensa en profundidad y es **obligatorio** en el compose.
- **R-2:** **sí limitar**: los endpoints públicos conservan su límite de 128 KB; el límite alto (5 MB + multipart) solo aplica a `/api/v1/admin/images`. Si el filtro por `Content-Length` no es sólido (p. ej. `chunked`), usar la alternativa de ruta aparte con su propio límite. Es el primer spike de `api-admin-images`.
- **R-3:** aceptado; prueba manual obligatoria con el bucket real de R2 antes de cerrar `api-admin-images`.
- **R-4 (credencial de R2):** **token propio de `cv`**, con permisos solo sobre el bucket (lo crea el humano).
- **R-9 (mensajes de contacto en el admin):** **sí**, se hace el slug `api-admin-messages` (solo lectura, sin `ip_hash`).
- **R-6 (EXIF):** sin respuesta del humano; **fuera de alcance** por ahora (queda como mejora futura anotada).
- **R-10 (paridad ES/EN), R-11 (login solo con contraseña), R-12 (parámetros de Argon2 a medir en el NAS):** aceptados tal como están en el plan.
- **Orden de ejecución acordado (secuencial, un slug a la vez):** `api-admin-auth` → `api-admin-password-cli` → `api-admin-cache` → `api-admin-content` → `api-admin-images` → `api-admin-messages` → `api-admin-docs-deploy`.
