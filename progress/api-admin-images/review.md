# review — api-admin-images

**Veredicto final (ronda 2): APPROVED.** Los 2 cambios de la ronda 1 están corregidos y verificados; «Cambios requeridos» queda vacío.

## Ronda 2 — verificación de las correcciones

1. **Prueba del límite de 6 MB determinista**: `AdminImagesResourceTest#aBodyOverTheSixMegabyteServerCeilingIsRejectedAndNothingIsStored` ahora usa `RawHttp.postWithLengthAuthorized` (JDK `HttpClient`). Ejecuté `AdminImagesResourceTest` aislado 10 veces: 10/10 verdes (18 pruebas cada una). `mvn -B verify` completo 2 veces seguidas: BUILD SUCCESS ambas (297 en infrastructure; 456 en total según `ci-summary`). La afirmación de `impl.md` es reproducible.
2. **`IMAGE_NOT_FOUND`**: `ImageNotFoundException.java:9` pasa `id`. En vivo, `DELETE /images/<uuid inexistente>` da 404 sin `{0}` en ES («…id «1111…»») y EN («…id '1111…'»); el 409 sigue nombrando la clave. Prueba nueva `theDetailsOfTheDeleteErrorsNameTheImageAndLeaveNoUnsubstitutedPlaceholder` (404 y 409, ES y EN). **Mutación en una copia** (quitado el argumento `id`, copia en el scratchpad, ya borrada): la prueba falla con `es: No existe ninguna imagen con el id «{0}». ==> expected: <true> but was: <false>`. Sin la mutación pasa.
3. **`ProblemCatalogTest`**: `noDetailLeavesAnUnsubstitutedPlaceholder…` recorre todos los `ApiError` e idiomas y comprueba que con tantos argumentos como marcadores no queda ninguno sin rellenar. Es correcto pero acotado (fija el contrato del catálogo, no que cada excepción pase sus argumentos; eso lo cubre la prueba de recurso, como declara el propio comentario). Los tests de estados y mensajes de imágenes añadidos son exactos.
4. **UUID sin duplicados**: el patrón vive solo en `ImageKey` (`ImageKey.isUuid`, usado por `DeleteImageService.java:22`). `R2FileStorageAdapter` importa `Function`.
5. **Regresión**: `ci-summary --min-total 90 --min-module 80` verde (total 96,3 %; application 98,8 %, domain 94,2 %, infrastructure 95,3 %); Python 7/7 verdes. Pasada en vivo (jar + Postgres 18 + MinIO): subida PNG y GIF 201, listado con `referenced`, `PUT` de contenido, `GET /api/v1/projects` con `images[0].url`, `DELETE` 409 de la referenciada y 204 de la huérfana, cleanup dryRun, HL7 chunked de 200 KB → 413. Sin regresiones. Contenedores, proceso e imagen de prueba eliminados.
6. **Guion manual contra R2 real** (`impl.md`): correcto y completo; con el paso extra `curl -I <url>` (debe dar `200`, el `Content-Type` de la imagen y `Cache-Control: public, max-age=31536000, immutable` desde el dominio público) cubre la sugerencia (a) de la ronda 1.

Observación nueva (no bloquea): `RawHttp.send` (`infrastructure/src/test/.../RawHttp.java:44-48`) convierte cualquier `IOException` en «413». Esto hace T137 menos estricto: un reset de conexión del servidor en vez de un 413 pasaría. En esta revisión el 413 real se vio en vivo con curl (HL7 y contacto, `Content-Length` y chunked), así que no hay riesgo hoy; sería más sólido limitar esa conversión a cuerpos que superan el límite alto.

### NO verificado (lista final)
- Nada contra Cloudflare R2 real (firma con `chunkedEncodingEnabled(false)`, `DeleteObjects` con checksums `WHEN_REQUIRED`, `Cache-Control` servido por el dominio público): es del humano, con el guion de `impl.md`.
- `cleanup` real sobre huérfanas envejecidas en vivo (MinIO no permite fijar `lastModified`): solo T58-T60 y T140 (reloj de pruebas).
- Lotes de más de 1000 contra un almacenamiento real.
- Que una futura versión de Quarkus conserve la clave interna `io.quarkus.max-request-size` (la detecta T137, con la salvedad de arriba).
- Despliegue con compose/NAS, regla de Cloudflare para `/api/v1/admin/*` y `api-admin-docs-deploy`.

---
# Ronda 1 (historial; los cambios requeridos ya están corregidos)

**Veredicto de la ronda 1: CHANGES REQUESTED.**
Revisión independiente en el working tree de `cv` (solo lo de imágenes; no se mezclan -auth, -password-cli, -cache ni -content). Sin edición de código ni git de escritura.

## Cambios requeridos

1. **Prueba intermitente que deja `mvn -B verify` en rojo.** `infrastructure/src/test/java/dev/julioflores/cv/infrastructure/AdminImagesResourceTest.java:175-183` (`aBodyOverTheSixMegabyteServerCeilingIsCutWithAPlain413`).
   - Hecho: en mi primer `mvn -B verify` completo falló (`ClientProtocolException`, `upload:85`). La repetí aislada y falló 3 de 3. En una ejecución completa posterior (con `-Dmaven.test.failure.ignore`) y en 2 ejecuciones aisladas más pasó (454/454). En total falló en 4 de 8 ejecuciones.
   - Causa: cuando el servidor responde 413 y cierra con 7 MB aún por enviar, RestAssured lanza `ClientProtocolException`, una excepción comprobada que Java lanza sin declarar. El `catch (RuntimeException cut)` no la atrapa. Según el momento del corte el cliente ve el 413 o el error de protocolo.
   - La regla del brief es «tests deterministas». Corrección: atrapar `IOException`/`Exception` (o usar `RawHttp`, como T137), y afirmar solo lo que sí es estable: que no queda objeto en MinIO. Aquí `impl.md` declara «verify verde», lo cual no es reproducible.

2. **`IMAGE_NOT_FOUND` devuelve el texto con el marcador sin sustituir.** `application/src/main/java/dev/julioflores/cv/application/service/ImageNotFoundException.java:9`.
   - Reproducido en vivo: `DELETE /api/v1/admin/images/<uuid inexistente>` da 404 con `"detail":"No existe ninguna imagen con el id «{0}»."`. Lo mismo en EN (`problems_en.properties:65`).
   - Causa: el constructor no pasa `id` como argumento (`ImageInUseException` sí pasa `key`). Corrección: `super(ErrorCode.IMAGE_NOT_FOUND, "...", id)`.
   - `ProblemCatalogTest` no lo detecta porque solo mira que existan las claves. Falta una prueba que compruebe que el detalle del 404 de borrado no contiene `{0}`.

## Verificación ejecutada

| Comprobación | Resultado |
|---|---|
| `mvn -B verify` | **Rojo en la 1.ª ejecución** (294 verdes, 1 error: cambio requerido 1). Con la prueba pasando: 454 de 454 (46 domain + 113 application + 295 infrastructure), 0 omitidas |
| `python3 scripts/ci-summary.py --min-total 90 --min-module 80` | Verde: total 96,3 %, application 98,8 %, domain 94,5 %, infrastructure 95,3 % (rc 0) |
| `python3 -m unittest discover -s scripts -p 'test_*.py'` | 7 pruebas verdes |
| ArchUnit | `ArchitectureTest#theAwsSdkIsOnlyUsedByTheStorageAdapterAndItsClientConfig` (con comprobación anti falso positivo) y reglas de BouncyCastle (`...:111-148`) verdes. `software.amazon..` solo en `adapter.out`/`config` |
| `ProblemCatalogTest`, `OpenApiDocumentTest` | Verdes |
| Secretos en el repo | Sin hallazgos: `R2_*` solo como `${R2_X:}` en `application.properties:48-53`; las credenciales de MinIO están solo en el soporte de pruebas (`MinioSupport`/`MinioTestResource`), de usar y tirar |

## Prueba en vivo (jar de producción + Postgres 18 + MinIO + curl; todo limpiado)

- **Subida válida de los 4 formatos** (con `Content-Type: image/jpeg` y `filename=../../evil.php` falsos): 201, clave `site/projects/<uuid>.<ext>` de servidor, tipo y dimensiones por bytes (PNG 64x48, JPEG 80x60, GIF 20x10, WebP VP8X 1280x720). Los 5 objetos estaban en el bucket con esas claves.
- **Falsos**: HTML con `.jpg`/`image/jpeg` → 400 `IMAGE_INVALID`; SVG y SVG con `.jpg` → 415 `IMAGE_UNSUPPORTED_TYPE`; dos partes o ninguna parte `file` → 400.
- **Tamaño**: 5 242 880 bytes exactos → 201; +1 byte → 413 `IMAGE_TOO_LARGE`; 7 MB (Content-Length y chunked) → 413 sin cuerpo.
- **Sin token**: 401 `ADMIN_UNAUTHORIZED` con cuerpo pequeño, con 5 MB y con un cuerpo no multipart (sin `@Consumes` a propósito: correcto).
- **Spike del límite (R-2), reproducido con curl real** contra HL7, contacto y login, con cuerpos válidos para su tipo (200 KB y 5 MB, y 100 MB en streaming): siempre 413 tanto con `Content-Length` como con `Transfer-Encoding: chunked`. (Con cuerpos «aaaa» inválidos el chunked da 415/400 porque el parser aborta antes de leer: no es prueba válida, la rehice con JSON/HL7 bien formados). Solo `POST /api/v1/admin/images` admite hasta 5 MB (3 MB chunked multipart → 201). El mecanismo (`RequestBodyLimits`, clave interna `io.quarkus.max-request-size`) funciona; el riesgo de que una actualización de Quarkus lo rompa lo cubre T137 con `RawHttp` chunked.
- **Flujo de contenido**: `PUT /content/projects` con la imagen en `proyecto-publico` (own+public) → 200; `GET /api/v1/projects` da `images[0].url` compuesta con `R2_PUBLIC_URL`, con `alt` ES y EN (`?lang=en`). Paridad rota en `width` → 422 `CONTENT_PARITY_BROKEN` con ruta; clave `../x.png` → 422 `IMAGE_KEY_INVALID`; imágenes en proyecto anónimo → 422 `IMAGES_NOT_ALLOWED_FOR_PROJECT`.
- **Privacidad**: inyecté por SQL una imagen en el proyecto anónimo activo; el GET público sigue dando `images: []`.
- **Referencias**: tras guardar una v3 sin imágenes, la PNG queda solo en la v2 histórica → `DELETE` 409 `IMAGE_IN_USE` y `referenced=true` en el listado; huérfana → 204 y desaparece del bucket; repetir → 404 (con el defecto 2).
- **Cleanup**: `dryRun` por defecto, `olderThanHours=0` sube a la gracia mínima de 1 h; con objetos recientes `kept` y nada borrado (real y dryRun).
- **R2 caído** (`docker pause` de MinIO): subida y listado dan 503 `IMAGE_STORAGE_UNAVAILABLE` en ~20 s (2 intentos x 10 s, acotado, sin colgar) y el `GET /api/v1/projects` sigue 200.
- **Imagen Docker** (usuario `app`, `/app` es de root): la subida multipart funciona, sin problema de permisos para el archivo temporal.
- Respuestas admin con `Cache-Control: no-store`.

## Trazabilidad Tn ↔ test (comprobada contra el código)

T1-T3 `ImageFormatTest`; T4-T6 `ProjectImagesTest`; T37/T38 `ContentValidatorTest`; T50-T55 `UploadProjectImageServiceTest` (SVG → `IMAGE_UNSUPPORTED_TYPE`, 5 MB+1 sin llamar al almacenamiento, nombre/tipo ignorados); T56/T57 `DeleteImageServiceTest`; T58-T61 `CleanupOrphanImagesServiceTest` (T60 comprueba lotes `[1000,1000,500]`); T122-T126 `R2FileStorageAdapterTest` + `R2ClientConfigTest` (T125 inspecciona región/path-style/chunked/checksums/tiempos); T127 `AdminImagesStorageUnavailableTest` (503 en ES y EN, y guardado de contenido sigue vivo); T128-T133 y T138-T140 `AdminImagesResourceTest` (T132 compara `target/test-uploads` antes/después); T134-T136 `SiteContentEndpointsTest`; T137 `Hl7ResourceTest`/`ContactMessagesResourceTest` (140 KB y 4 MB, longitud y chunked); T141 `AdminContentResourceTest`; T143 `scripts/test_make_seed.py`. Todos existen y hacen lo que describen. Fallo de trazabilidad: ninguna prueba cubre el texto del detalle de `IMAGE_NOT_FOUND` (cambio 2).
Criterios CA14-CA17, CA19-CA21: cada uno mapeado a pruebas verdes (ver el «Criterio → tests» de `impl.md`, que es correcto).

## Revisión por puntos pedidos

1. **Límite de cuerpo**: correcto y probado (arriba). `RequestBodyLimits.java:46-58` falla cerrado (cualquier otra ruta o variante de ruta queda en 128 KB).
2. **Subida**: bytes mágicos (`ImageFormat.detect`, mínimo 12 bytes), clave de servidor sin traversal (`ImageKey` con regex completa, UUID en minúsculas), 401 antes de leer, archivo temporal borrado (`delete-uploaded-files-on-end`). Sin hallazgos.
3. **R2**: configuración idéntica a la documentación vigente de Cloudflare (`aws-sdk-java`: región `auto`, `endpointOverride`, `pathStyleAccessEnabled(true)`, `chunkedEncodingEnabled(false)`; la página no dice nada de checksums, así que `WHEN_REQUIRED` en petición y respuesta es la decisión prudente del plan, R-3). Timeouts 5 s/10 s y 1 reintento; verificado en vivo. Sin credenciales: API arranca y la subida da 503 sin afectar al guardado.
4. **Referencias**: `jsonb_path_exists`/`jsonb_path_query` sobre todas las filas de `content_version` (`PostgresImageReferenceRepository.java:21-30`): verificado con versión histórica. Cleanup por lotes de 1000, gracia mínima 1 h, `dryRun` por defecto.
5. **Privacidad**: el dominio descarta `images` si no es own+public (`Project.java:37`), el validador y `make-seed.py` rechazan, el JSON guarda `key` y la URL se compone al servir. Sin hallazgos.
6. **Seed**: `db/sample` con una imagen ficticia (`00000000-0000-4000-8000-000000000001.webp`, `example.com`, Ada Ejemplo); `V1000` regenerado; sin datos reales.
7. **Capas/duplicación/código muerto**: sin hallazgos de relevancia en lo propio del slug.

## Skills consultadas
- `simplify`: `ImageFormat.java`, `ImageKey.java`, `UploadProjectImageService.java`, `AdminImagesResource.java:104-120`: sin hallazgos accionables más allá de los cambios requeridos (`impl.md` admite que `/simplify` no se ejecutó, pero el diff se ve limpio). Nota: `DeleteImageService.java:11` repite el UUID regex de `ImageKey.java:12` (dos copias del patrón, más la de `make-seed.py`); menor.
- `strict-typing`: sin hallazgos (Java tipado completo; `R2FileStorageAdapter.java:99` usa `java.util.function.Function` con nombre completo en vez de `import`, solo estilo).
- `security-best-practices`: no aplica (el skill solo cubre python/js/ts/go); la revisión de seguridad Java va en los puntos 2, 3 y 5.
- `testing-strategy`: `AdminImagesResourceTest.java:175-183`: prueba intermitente (cambio 1).
Las skills de web (`next-best-practices`, `seo-audit`, `ui-ux-pro-max`) no aplican a este slug de API.

## Observaciones fuera de alcance (no bloquean)
- `cv.r2.request-timeout=PT10S` por intento: una subida de 5 MB necesita ≥ ~4 Mbps de subida sostenida en el NAS. Con una línea doméstica lenta podría dar 503 espurio. Es configurable (`cv.r2.request-timeout`); conviene mencionarlo en el despliegue.
- Un JPEG/PNG con cabecera válida y HTML/script detrás pasa y se sirve como `image/jpeg`; no es ejecutable en ese tipo (SVG sí está bloqueado). EXIF fuera de alcance por decisión del humano (R-6).
- Carrera `DELETE` frente a guardado simultáneo (un solo administrador, aceptada en `impl.md`). Archivo temporal de subida abortada: queda hasta reiniciar.
- `ListImagesService.java` usa la clave como `url` cuando no hay `R2_PUBLIC_URL`; no es URL válida, aunque no se expone al público. Mejor devolver vacío/`null`.
- CI sin `scripts/test_make_seed.py`, README/ARCHITECTURE/compose y quitar `R2_KEY_PREFIX`: es de `api-admin-docs-deploy`.

## Guion de la prueba manual contra R2 (`impl.md`): correcto y completo
Cubre variables, login, subida con comprobación de `Cache-Control` público, listado (`ListObjectsV2`), asociación vía PUT, 409/204 y cleanup (`DeleteObjects`), y una tabla de ajustes por síntoma. Dos sugerencias: (a) el paso 3 debe verificar también que la `url` responde con el `Content-Type` correcto desde el dominio público de R2; (b) el ajuste «`Expect: 100-continue` desactivado» no existe en el código actual (la subida ya usa `RequestBody.fromBytes`), es solo un último recurso.

## NO verificado
- Nada contra Cloudflare R2 real (compatibilidad de `DeleteObjects` con `WHEN_REQUIRED`, firma con `chunkedEncodingEnabled(false)`, 403 de checksum): es del humano, con el guion de arriba.
- `cleanup` real sobre huérfanas envejecidas en vivo: MinIO no permite fijar `lastModified`. Lo cubren T58-T60 y T140 (reloj de pruebas adelantado), no lo vi con curl.
- Lotes de más de 1000 contra un almacenamiento real (solo con fakes y paginación del listado en MinIO).
- Comportamiento tras una actualización de Quarkus que cambie la clave interna del límite (lo detecta T137).
- Instalación con compose/NAS, Cloudflare/túnel ni `api-admin-docs-deploy`.
