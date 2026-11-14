# impl — api-admin-images

Estado: **hecho**. Código en el working tree de `cv` (sin commits ni ramas; los slugs 1-4 siguen en el mismo working tree sin cerrar).
Verificación (tras la ronda 1): `mvn -B verify` verde en 2 ejecuciones completas seguidas (456 pruebas: 46 domain + 113 application + 297 infrastructure, 0 omitidas) y `python3 scripts/ci-summary.py --min-total 90 --min-module 80` verde: total 96,3 %, application 98,8 %, domain 94,2 %, infrastructure 95,3 %. (La versión anterior de este párrafo decía «verde» con una prueba intermitente: ver ronda 1.) `python3 -m unittest discover -s scripts -p 'test_*.py'`: 7 pruebas verdes. Prueba en vivo con el jar de producción + Postgres 18 + MinIO + curl (abajo).
Hitos: spike del límite → dominio/validación/aplicación → R2 → REST → seed. Todos cerrados. `/simplify` no se ejecutó.

## Spike R-2 (límite de cuerpo) — resultado
- Quarkus solo tiene `quarkus.http.limits.max-body-size` global. Su handler (orden -2 del router de Vert.x) rechaza con 413 si `Content-Length` supera el tope, y si no, deja en el contexto la clave interna `io.quarkus.max-request-size`, que `VertxInputStream` aplica byte a byte (cubre `chunked`).
- Solución (sin ruta aparte): `quarkus.http.limits.max-body-size=6M` + `config/RequestBodyLimits` (`@Observes Router`, orden -1, justo después). En TODO salvo `POST /api/v1/admin/images`: `Content-Length > cv.http.max-body-size` (131072) → 413 + `Connection: close`; sin longitud declarada (`chunked`) sustituye la clave interna por 128 KB. El límite de 5 MB de la imagen lo aplica la aplicación (`IMAGE_TOO_LARGE`, problema+json); entre 5 MB y 6 MB sale ese problema, por encima de 6 MB el servidor corta (413 sin cuerpo; `chunked` > 6 MB → `ProblemExceptionMapper.ioFailure` lo traduce a `IMAGE_TOO_LARGE` en imágenes y a 413 sin cuerpo en el resto).
- Medido con curl contra el jar: HL7 y contacto con 200 KB / 3 MB, con `Content-Length` y con `Transfer-Encoding: chunked`: siempre 413. Con el filtro neutralizado (`CV_HTTP_MAX_BODY_SIZE=6291456`) un JSON de contacto chunked de 300 KB pasa (400 de validación): el filtro es lo que corta. La alternativa (ruta aparte) no hizo falta.
- Riesgo: la clave `io.quarkus.max-request-size` es interna de Quarkus. T137 (ampliado a chunked) falla si una actualización la cambia.

## Mapa Tn → test (rutas relativas a `cv/`; `infra` = `infrastructure/src/test/java/dev/julioflores/cv/infrastructure`)
| Tn | Test |
|---|---|
| T1, T2, T3 | `domain/.../ImageFormatTest#realHeadersOfEachFormat…`, `#svgExecutablesEmptyOrTooShortContent…`, `#thePngSignatureWinsWhateverTheClientDeclared…` |
| T4, T5, T6 | `domain/.../ProjectImagesTest#anOwnPublicProjectKeepsItsImagesAndTheirOrder`, `#employerAndAnonymousProjectsDropTheirImages`, `#anImageWithATooLongAltOrNonPositiveSizeIsRejected` |
| T37, T38 | `application/.../ContentValidatorTest#employerOrAnonymousProjectsCannotCarryImages`, `#anImageKeyWithDotsOutsideThePrefix…IsRejected` |
| T50-T55 | `application/.../UploadProjectImageServiceTest` (T50 `aValidJpegIsStored…`, T51 `fiveMegabytesPlusOneByte…`, T52 `emptyOrNonImageContentIsInvalid`, T53 `anSvgIsAnUnsupportedType`, T54 `theClientsNameAndDeclaredType…`, T55 `aFailingStorageIsImageStorageUnavailable`) |
| T56, T57 | `application/.../DeleteImageServiceTest#anImageReferencedByAnActiveOrHistoricVersion…`, `#anUnreferencedImageIsDeleted…` |
| T58-T61 | `application/.../CleanupOrphanImagesServiceTest#onlyOldOrphansAreDeleted`, `#aDryRunReports…`, `#deletionsGoInBatchesOfAtMostAThousand`, `#aGraceBelowTheMinimumIsRaisedToOneHour` |
| T122, T123, T124, T126 | `infra/adapter/out/R2FileStorageAdapterTest` (MinIO) — T126 en dos pruebas: servicio caído (puerto cerrado y TEST-NET-1 sin respuesta, < 15 s) y credenciales erróneas |
| T125 | `infra/config/R2ClientConfigTest#theClientUsesRegionAutoThePathStyle…` |
| T127 | `infra/AdminImagesStorageUnavailableTest#everyImageOperationIs503…` (clase aparte, no `@TestProfile`: R2 sin configurar es el valor por defecto de las pruebas) |
| T128-T133 | `infra/AdminImagesResourceTest` (T128 `aRealPngIsStored…`, T129 `aJpgThatIsReallyHtmlOrSvg…`, T130 `aFileOverFiveMegabytes…`, T131 `withoutTheFilePartOrWithTwoOfThem…`, T132 `theTemporaryFileOfAnUpload…`, T133 `withoutATokenEveryImageRoute…`) |
| T134-T136 | `infra/SiteContentEndpointsTest#anOwnPublicProjectsSavedImagesComeOut…`, `#imagesStoredOnEmployerOrAnonymousProjectsNeverComeOut`, `#projectsWithoutTheImagesFieldGiveAnEmptyList…` |
| T137 | `infra/Hl7ResourceTest#bodiesOverTheFixedPublicLimit…` y `infra/ContactMessagesResourceTest#bodiesOverTheFixedPublicLimit…` (140 KB/300 KB y 4 MB, con longitud y `chunked`, vía `RawHttp`) |
| T138-T140 | `infra/AdminImagesResourceTest#anImageReferencedOnlyByAHistoricVersion…`, `#theListSaysWhichImagesAreReferenced…`, `#cleanupDeletesOnlyOldOrphansAndADryRunDeletesNothing` (usa `TestClockConfig` para adelantar el reloj) |
| T141 | `infra/AdminContentResourceTest#anImageKeyThatDoesNotExistInTheStorageIsAccepted…` |
| T143 | `scripts/test_make_seed.py` (7 pruebas) |

## Criterio → tests
- CA14: T1-T3, T38, T50-T54, T122, T125, T128-T132, T137 · CA15: T4, T5, T37, T134-T136 · CA16: T56-T61, T123, T124, T138-T140 · CA17: T55, T126, T127 · CA5 (imágenes): T133 + `AdminSecurityTest#everyAdminRouteInOpenApi…` · CA10: T6, T37, T38, T141, T143 · CA21: `ArchitectureTest#theAwsSdkIsOnlyUsed…` · CA19/CA20 (imágenes): `ProblemCatalogTest#imageErrors…`, `OpenApiDocumentTest#adminImageOperations…`.

## Extras fuera del plan
- Domain: `ImageFormatTest` (tipos conocidos no soportados, dimensiones de cada formato incl. WebP VP8/VP8L, cabeceras truncadas, saltos de segmentos JPEG), `ProjectImagesTest` (listas inmutables, constructor de 12 argumentos, forma de `ImageKey`).
- Application: `ContentValidatorTest` (imágenes válidas, campos/tamaños/cantidad), `ContentParityTest#imagesAreComparedByKeyWidthAndHeight…`, `DeleteImageServiceTest` (ids no UUID, fallo de almacenamiento), `CleanupOrphanImagesServiceTest#objectsThatAreNotProjectImages…`, `ListImagesServiceTest`.
- Infra: `AdminImagesResourceTest` (JPEG/WebP/GIF, nombre y tipo del cliente ignorados, > 6 MB, chunked > 6 MB, no multipart, id no UUID, listado vacío, gracia < 1 h), `AdminImagesStorageUnavailableTest#savingContentAndReadingThePublicApiKeepWorking…` (CA17), `AdminContentResourceTest#imagesOnAnAnonymousProject…` (422 con rutas, paridad rota), `R2FileStorageAdapterTest` (`deleteAll`, sin configurar), `R2ClientConfigTest` (tiempos y reintento), `PostgresImageReferenceRepositoryTest`, `SiteContentEndpointsTest#theSampleProject…`, `OpenApiDocumentTest`, `ProblemCatalogTest`, `ArchitectureTest`. `SiteContentJsonWriterTest` (T106) ya cubre el ida y vuelta de `images` porque el sample ahora las lleva.
- Utilidades de test: `MinioSupport`, `MinioTestResource`, `ImageFiles`, `RawHttp`, `TestClockConfig` (reloj alternativo con desfase, 0 por defecto).

## Código nuevo / tocado (repo `cv`)
- domain: `ImageFormat`, `ImageDimensions`, `ImageKey`, `ProjectImage`, `Project.images` (se descartan si no es `own`+`public`; constructor de 12 argumentos conservado).
- application: `content/ContentValidator` (+`images`, `IMAGES_NOT_ALLOWED_FOR_PROJECT`, `IMAGE_KEY_INVALID`), `ContentParity` (+imágenes), `image/*`, puertos `FileStoragePort` e `ImageReferenceRepository`, 4 casos de uso + servicios, 6 excepciones `Image*`, `ErrorCode` (+6).
- infrastructure: `AdminImagesResource/Models/Examples`, `ApiModels` (`ProjectDto.images`), `ProjectsResource`, `ApiError` + `problems_es|en`, `ProblemExceptionMapper.ioFailure`, `SiteContentJsonMapper/Writer` (`images`), `PostgresImageReferenceRepository` (`jsonb_path_exists` sobre TODAS las filas de `content_version`), `adapter/out/storage/R2FileStorageAdapter`, `config/R2Settings`, `R2ClientConfig`, `RequestBodyLimits`, `UseCaseConfig` (+4), `application.properties` (`R2_*` vacíos, 6M, `cv.http.max-body-size`), POMs (BOM `software.amazon.awssdk:bom:2.54.13`, `s3` sin apache/netty, `url-connection-client`, `testcontainers-minio`).
- seed: `scripts/make-seed.py` (valida `images`, mantiene el rechazo de `client` en anónimos), `scripts/test_make_seed.py`, `db/sample/projects.{es,en}.json` (imagen ficticia en `proyecto-publico`) y `V1000__sample_resume.sql` regenerado.

## Decisiones tomadas durante la implementación
1. **URL pública fuera del mapper.** El JSON y el dominio guardan solo `key`; la URL se compone en la capa REST con `FileStoragePort.publicUrl` (solo depende de `R2_PUBLIC_URL`). Sin `R2_PUBLIC_URL` el GET público devuelve `images: []` (no URLs rotas). El brief decía «el mapper compone `url`»; así el dominio y el mapper siguen sin conocer R2.
2. **`R2_KEY_PREFIX` no existe**: la clave es siempre `site/projects/<uuid>.<ext>` (el validador y el seed la comprueban con la misma expresión). El plan §9 lo listaba; el slug de docs/deploy debe quitarlo del compose.
3. **`alt` obligatorio** (hasta 200) en cada imagen; ancho y alto enteros 1..20000; máximo 10 imágenes por proyecto; `images` vacío o ausente es válido en cualquier proyecto.
4. **Paridad ES/EN**: `images` se compara por posición (cantidad y `key`/`width`/`height` iguales; `alt` traducible). Rutas `projects[i].images[j].key`.
5. **Detección**: `ImageFormat.detect` exige ≥ 12 bytes; el tipo «SVG/HEIC/BMP/TIFF/ICO» (reconocido, no admitido) da `IMAGE_UNSUPPORTED_TYPE` (415) y lo que no se reconoce `IMAGE_INVALID` (400). Las dimensiones se leen de la cabecera (sin decodificar); una cabecera truncada es `IMAGE_INVALID`.
6. **Sin `@Consumes(multipart)` en `POST /images`**: con él un cuerpo de otro tipo daba 415 ANTES de la autenticación y rompía CA5 (sin token siempre 401). Ahora no-multipart con sesión = 400 `IMAGE_INVALID`.
7. `DELETE /images/{id}` busca la clave por prefijo `site/projects/<uuid>.` (el id no lleva extensión). `cleanup` por defecto es `dryRun=true`, `olderThanHours=24`, mínimo 1; no toca objetos que no tengan forma de clave de proyecto.
8. Cualquier fallo del SDK (red, credenciales, 5xx, tiempo) → `IMAGE_STORAGE_UNAVAILABLE` (503); el mensaje del SDK solo queda como causa para el log.
9. **MinIO en las pruebas**: las imágenes `minio/minio` ya no se pueden descargar (ni Docker Hub ni Quay con etiquetas fijas); se usa `cgr.dev/chainguard/minio:latest` (sobrescribible con `-Dcv.test.minio-image=`). Las clases que lo necesitan usan `@QuarkusTestResource(restrictToAnnotatedClass = true)`; el resto de pruebas tiene R2 sin configurar.

## Límites y riesgos abiertos
- La clave interna `io.quarkus.max-request-size` (ver spike). Entre 6 MB y el corte, el cliente puede ver un cierre de conexión en vez del 413 (el servidor responde y cierra); en vivo, un `chunked` de 7 MB dio 413 y un `IllegalStateException: Response has already been written` en el log (inocuo).
- Un cuerpo abortado a mitad de una subida puede dejar un archivo temporal hasta reiniciar el contenedor (los normales se borran al terminar la petición: T132). Mejora: limpiar `quarkus.http.body.uploads-directory` al arrancar.
- Carrera conocida y aceptada: `DELETE` comprueba referencias y borra sin candado; un guardado simultáneo que referencie esa imagen podría dejarla rota (un solo administrador). `cleanup` la evita con la gracia ≥ 1 h.
- R-3 solo está probado contra MinIO; R2 real es prueba manual (abajo). R-6 (EXIF) fuera de alcance por decisión del humano: las imágenes se guardan tal cual.
- El CI (`.github/workflows/ci.yml`) aún no ejecuta `scripts/test_make_seed.py` ni se actualizaron README/ARCHITECTURE/CLAUDE/smoke test/compose: es del slug `api-admin-docs-deploy` (T144-T147).
- Una instancia de API (invalidación y limitador en memoria), como en los slugs anteriores.

## Prueba en vivo (jar de producción, Postgres 18, MinIO, curl)
Con `R2_*` apuntando al MinIO, secreto JWT, cuenta creada con `AdminPasswordTool` (con pty) y el sample cargado:
- Subidas válidas: PNG (declarado `image/jpeg`), GIF, JPEG y WebP → 201 con clave `site/projects/<uuid>.<ext>` del servidor, tipo y dimensiones detectados (64×48, 20×10, 80×60, 1280×720); los cuatro objetos están en el bucket.
- `.jpg` con HTML → 400 `IMAGE_INVALID`; SVG → 415 `IMAGE_UNSUPPORTED_TYPE`; 5 MB + 1 → 413 `IMAGE_TOO_LARGE`; sin token → 401 `ADMIN_UNAUTHORIZED`. Listado con `referenced`.
- `PUT /content/projects` con la imagen en `proyecto-publico` (own+public) → 200; `GET /api/v1/projects` da `images[0].url` (`https://media.example.test/site/projects/….png`) con el `alt` en ES y en EN (`?lang=en`); el proyecto anónimo da `images: []`.
- `DELETE` de la referenciada → 409 `IMAGE_IN_USE`; de una huérfana → 204 y desaparece del bucket. `cleanup?dryRun=true&olderThanHours=1` → `{"dryRun":true,"deleted":[],"wouldDelete":[],"kept":4}`.
- Límites: HL7 con 300 KB por `Content-Length` y por `chunked`: 413; login con 300 KB: 413; imágenes con `chunked` de 7 MB: 413.
- Contenedores y proceso de la prueba eliminados.

## Prueba manual contra R2 real (la hace el humano; el implementer no tiene credenciales)
Requisitos: bucket de R2 con dominio público, token de R2 **propio de `cv`** con lectura/escritura solo sobre ese bucket.
1. Arrancar la API (o el compose) con `R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL=https://<dominio público sin barra>` y `CV_ADMIN_JWT_SECRET`; crear la contraseña con `scripts/admin-password.sh set-password`.
2. `TOKEN=$(curl -s -X POST $API/api/v1/admin/auth/login -H 'Content-Type: application/json' -d '{"password":"…"}' | jq -r .accessToken)`
3. Subir: `curl -i -H "Authorization: Bearer $TOKEN" -F "file=@captura.png" $API/api/v1/admin/images` → esperado 201 con `key`/`url`. Abrir la `url` en el navegador (debe verse; cabecera `Cache-Control: public, max-age=31536000, immutable`; `curl -I <url>`).
4. Listar: `curl -H "Authorization: Bearer $TOKEN" $API/api/v1/admin/images` (usa `ListObjectsV2`).
5. Asociar: `PUT /api/v1/admin/content/projects` con la `key` en `images` de un proyecto `own`+`public` (ES y EN, mismo `key`/`width`/`height`) y comprobar `GET /api/v1/projects` → `images[0].url`.
6. `DELETE /api/v1/admin/images/<uuid>` de la usada → 409; subir otra, `DELETE` → 204; `POST /api/v1/admin/images/cleanup?dryRun=true` y luego `dryRun=false&olderThanHours=1` (usa `DeleteObjects`) → ver que borra solo las huérfanas.
7. Si algún paso devuelve 503 `IMAGE_STORAGE_UNAVAILABLE`, mirar el log (la causa del SDK se registra) y probar, en este orden, los ajustes de `config/R2ClientConfig.build`:
   - **400/403 `SignatureDoesNotMatch` o `XAmzContentSHA256Mismatch` en PutObject**: confirmar `chunkedEncodingEnabled(false)` y `pathStyleAccessEnabled(true)` (`serviceConfiguration()`); si persiste, poner `httpClient` con `Expect: 100-continue` desactivado o subir con `RequestBody.fromBytes` (ya lo hace).
   - **400 `InvalidRequest`/`Unsupported header 'x-amz-checksum-*'` o 403 en PutObject/DeleteObjects**: forzar `REQUEST_CHECKSUM = WHEN_REQUIRED` (ya está) y `RESPONSE_CHECKSUM = WHEN_REQUIRED` (ya está); como respaldo, el entorno `AWS_REQUEST_CHECKSUM_CALCULATION=when_required` y `AWS_RESPONSE_CHECKSUM_VALIDATION=when_required`.
   - **`DeleteObjects` falla pero `DeleteObject` funciona**: es `deleteAll`; sustituir por un bucle de `delete` en `R2FileStorageAdapter.deleteAll` (cleanup sigue por lotes de 1000).
   - **403 `AccessDenied` solo al listar/borrar**: el token no tiene permiso de lectura/escritura sobre el bucket.
   - **Tiempo agotado**: subir `cv.r2.connect-timeout` / `cv.r2.request-timeout` (`PT5S` / `PT10S`).
   - **`NoSuchBucket` / 404**: `R2_BUCKET_NAME` mal o endpoint de otra cuenta; con path-style el bucket va en la ruta.

## Correcciones de la ronda 1 (review.md)
1. **Prueba intermitente** `aBodyOverTheSixMegabyteServerCeilingIsCutWithAPlain413` (fallaba en 4 de 8 ejecuciones): con 7 MB por enviar el servidor responde 413 y cierra, y RestAssured lanzaba `ClientProtocolException` (comprobada, el `catch (RuntimeException)` no la atrapaba). Ahora la prueba (`aBodyOverTheSixMegabyteServerCeilingIsRejectedAndNothingIsStored`) usa `RawHttp.postWithLengthAuthorized` (JDK `HttpClient` en HTTP/1.1) y `RawHttp.send` trata cualquier `IOException` (respuesta perdida por el cierre) como «rechazado»; lo que afirma es el 413 y que no queda ningún objeto en MinIO. Demostración: `AdminImagesResourceTest` 10 de 10 ejecuciones aisladas verdes (18 pruebas) y 2 `mvn -B verify` completos seguidos verdes (456/456), más ci-summary 90/80 y los 7 tests de Python.
2. **`IMAGE_NOT_FOUND` con `{0}` sin sustituir**: `ImageNotFoundException` ahora pasa `id` como argumento. Prueba nueva `AdminImagesResourceTest#theDetailsOfTheDeleteErrorsNameTheImageAndLeaveNoUnsubstitutedPlaceholder` (404 y 409 del borrado, ES y EN: el detalle contiene el id/la clave y ningún `{`). Además `ProblemCatalogTest#noDetailLeavesAnUnsubstitutedPlaceholder…` comprueba para TODOS los `ApiError` y idiomas que, dados tantos argumentos como marcadores, no queda ninguno sin rellenar (fija el contrato del catálogo; que cada excepción pase sus argumentos solo lo detectan las pruebas de recurso, no hay forma genérica sin instanciar cada excepción).
3. Menores: el patrón UUID vive solo en `ImageKey` (`ImageKey.isUuid`, usado por `DeleteImageService`); `R2FileStorageAdapter` importa `Function`. No se aplicaron las observaciones fuera de alcance (url vacía sin `R2_PUBLIC_URL` en el listado, sugerencias del guion manual): la (a) del guion queda como paso extra del humano: `curl -I <url>` debe dar el `Content-Type` correcto desde el dominio público.
