# review — api-admin-content

**Veredicto final: APPROVED** (ronda 2). Los 4 cambios de la ronda 1 están aplicados y verificados; la ronda 1 queda debajo como histórico.

## Ronda 2
- `mvn -B verify` verde: 373 pruebas, 0 fallos. `ci-summary` 90/80 verde: total 96,2 %, application 98,7 %, domain 91,1 %, infrastructure 95,6 %.
- **Cambio 1 (candado).** `PostgresContentVersionRepositoryTest#publishWaitsForTheAdvisoryLockAndThenSeesTheVersionThatWonTheRace` y `#publishTakesTheSpanishLockBeforeTheEnglishOneAndCompletesWhenItIsFree` son deterministas: retienen el candado en otra conexión y afirman bloqueo, ausencia de escritura, el conflicto posterior y el orden ES→EN. **Mutación en una copia** (en `lock()` quité el `statement.execute()` del candado; la copia se borró): ambas pruebas fallan (líneas 247 y 288). T100 de `AdminContentResourceTest` queda justificado como prueba extremo a extremo del reparto 200/409, con un comentario que remite a las pruebas del candado.
- **Cambio 2.** `isPublished()` y `currentVersion()` ya no existen en el código ni en los tests.
- **Cambio 3.** `ListContentVersionsService` solo acota `limit` y delega; el contrato del puerto (`ContentVersionRepository.list`) dice que viene ya ordenado y recortado.
- **Cambio 4.** `AdminContentResource.configureStrict` desactiva las coerciones de escalares. En vivo: `"comment":5`, `"baseVersions":{"es":"1"}`, `1.0`, `1.5`, `true` y `"baseVersion":"1"` en rollback dan 400 `BAD_REQUEST` problem+json, y la BD no cambia (v1).
- **Flujo en vivo, sin regresión:**
  - 401 sin token.
  - PUT válido con un decimal (1500.5): 200, v2.
  - GET público inmediato con el título nuevo.
  - 409 `CONTENT_VERSION_CONFLICT`.
  - 422 `INVALID_ID`.
  - 422 `CONTENT_PARITY_BROKEN`.
  - Historial correcto (2 activa, 1 inactiva).
  - Rollback 200 con el público inmediato.
  - Anónimo con `client`: `ANONYMOUS_CLIENT_FORBIDDEN`.
  - BD: 0 duplicados, 1 activa por tipo e idioma, 0 errores en el log.
  - Mi ráfaga concurrente de esta ronda dio 422 por un fallo de mi propio guion (ES v1 con precio distinto al de EN v2, paridad rota), no por el código. La concurrencia real quedó verificada en la ronda 1 (15 rondas de 8 hilos) y ahora por las pruebas deterministas del candado.
- Limpieza: API detenida, contenedor `rvw-pg` eliminado, copia mutada borrada. No hay procesos ni contenedores de prueba, ni imágenes creadas.
- Las observaciones fuera de alcance de la ronda 1 siguen vigentes y no bloquean.

---
## Ronda 1 (histórico: CHANGES REQUESTED)

**Veredicto de la ronda 1: CHANGES REQUESTED.** Hay 4 cambios pequeños. El diseño y el comportamiento en vivo son correctos y no hay nada bloqueante de seguridad ni de datos.

## Verificación propia
- `mvn -B verify`: verde, 371 pruebas, 0 fallos, 0 omitidas. `ArchitectureTest` 13/13, `ProblemCatalogTest` 9/9, `OpenApiDocumentTest` 27/27.
- `python3 scripts/ci-summary.py --min-total 90 --min-module 80`: verde. Total 96,2 %, application 98,7 %, domain 91,1 %, infrastructure 95,6 %.
- El árbol de trabajo mezcla slugs previos (auth, password-cli, cache). Revisé solo lo de contenido y no encontré mezcla indebida. `UseCaseConfig`, `ProblemExceptionMapper` y `PostgresSiteContentRepository` traen cambios de otros slugs, que no evalúo.

## Prueba en vivo (jar de producción, Postgres 18 desechable con `db/sample`, curl y Python)
- Login 200. Las 5 rutas sin token dan 401 `ADMIN_UNAUTHORIZED`; con token falso, 401.
- `GET /admin/content/services` da 200 con `Cache-Control: no-store`, ES/EN v1, `source: seed` y `parity.ok`.
- `PUT` válido da 200 con v2 `source: admin`. El `GET /api/v1/services` público refleja el cambio de inmediato en ES y EN, sin esperar el TTL.
- Repetir el mismo `PUT` da 409 `CONTENT_VERSION_CONFLICT`.
- 422 `CONTENT_INVALID` con `errors` de rutas exactas: `es.projects[1].client` / `ANONYMOUS_CLIENT_FORBIDDEN`, `en.projects[0].links[0].url` / `INVALID_URL`, `es.extra` y `es.projects[0].images` / `UNKNOWN_FIELD`, `INVALID_ID`, precio negativo, moneda en minúsculas y `REQUIRED`. Un cuerpo con campos inválidos no persiste nada.
- Paridad rota: 422 `CONTENT_PARITY_BROKEN` con `projects[i].id`.
- Documentos vacíos (`{"services":[]}`, `{}`) son válidos. Un `client` vacío o en blanco en un anónimo no cuenta. Un público de ejemplo editado sale en la API pública con `client`; el anónimo sale con `client: null`. El JSON almacenado del anónimo no trae la clave `client`.
- Cuerpos malformados (`{{`, `[]`, `null`, vacío, `"x"`), tipos erróneos, campo extra fuera de `documents`, anidamiento de 2000 niveles y `baseVersions` negativa: 400 `BAD_REQUEST` genérico, sin trazas ni internos. Anidamiento de 900 dentro de `services`: 422 `INVALID_VALUE`.
- 413 `CONTENT_TOO_LARGE` como `problem+json` por encima de 96 KB.
- Tipo, idioma o versión desconocidos, o no numérica: 404 `NOT_FOUND` genérico. Versión inexistente: 404 `CONTENT_VERSION_NOT_FOUND`.
- Historial en orden descendente con `active` correcto. `limit=0` se acota a 1 y `limit=9999` a 200.
- Rollback: 409 si la base no es la activa, 404 si el destino no existe, 400 con destino 0 y 404 con idioma `fr`. Un rollback válido mueve `active` sin crear versión, y el público lo ve al instante.
- Una versión destino inyectada que incumple las reglas actuales (id `BAD ID`) da 422 y no se reactiva.
- Compatibilidad con `make-seed.py --rollback es --kind services` aplicado a mano tras guardados del panel: la API lo lee de forma coherente (ES 17, EN 18) y el siguiente guardado toma `MAX+1` por idioma (19/19).
- **Concurrencia real:** 15 rondas de 8 hilos simultáneos con la misma base (6 guardados y 2 rollbacks, con barrera). Resultado en las 15: exactamente un 200 y siete 409. BD final: 1 activa por idioma, 18 versiones por idioma consecutivas, 0 duplicados por (kind, lang, version), sin interbloqueos ni errores en el log.
- Limpieza hecha: API detenida, contenedor `rvw-pg` eliminado. No quedan procesos ni contenedores de prueba. No se creó ninguna imagen (se reutilizó `postgres:18`).

## Revisión de los puntos pedidos
1. **Transacción y candado.** `PostgresContentVersionRepository.publish` hace una transacción por escritura, con `pg_advisory_xact_lock` en el orden fijo ES→EN (el orden sale de `Language.values()` en el `LinkedHashMap`; el rollback toma un solo candado, así que no hay ciclo posible). Compara con la base dentro del candado y usa `MAX+1` en el `INSERT`. Si falla EN, no queda ES (T101 con trigger real; también comprobado en vivo con rondas). Convivencia con `make-seed.py` por `UNIQUE(kind, lang, version)`: correcta; la colisión daría 500 genérico (ver observaciones).
2. **Caché.** `SaveEditableContentService:56-60` y `RollbackContentService:43-49` invalidan solo después de que `publish`/`activate` han hecho commit, en ES y EN en el guardado y en el idioma tocado en el rollback. Si el repositorio falla, no se invalida (T25). Si la invalidación falla, se avisa y no se propaga (T26). El T22 comprueba que las filas ya existen al invalidar. En vivo, el público se actualiza al instante.
3. **Validador frente a `make-seed.py`.** `ContentValidator` cubre todas las reglas del script (ids, enums, `anonymous`+`client`, `public`+`employer` sin `client`, precio `from`≥0 y moneda, `adapter.status`) y las endurece (formatos, fechas, https, límites, `UNKNOWN_FIELD`). Valida el árbol en crudo, así que ve el `client` de un anónimo antes de que el dominio lo descarte. El dominio sigue descartándolo al leer (T116b y comprobado en vivo con SQL directo en los tests).
4. **`SiteContentJsonWriter`.** Es el inverso del lector. `canonical` pasa por lector→dominio→escritor antes de guardar. T106 compara los 8 sample, ida y vuelta, y la forma almacenada en BD. Enteros como enteros y sin nulos.
5. **Paridad (R-10).** Ids y orden por posición y campos neutros `price`, `relation`, `disclosure`, `client`, `startDate`, `endDate`, `status`, tal como R-10. Rutas sin prefijo de idioma. En GET es informativa y al guardar rechaza. Las claves de imagen quedan para el slug de imágenes.
6. **Rollback.** Mueve `active` dentro del candado, valida el destino con las reglas vigentes y es compatible con `make-seed.py --rollback`. T110 ejecuta el script real contra la BD, y también lo hice en vivo.
7. **Seguridad y robustez.** Todas las rutas están bajo `/api/v1/admin/*`, con la política `authenticated` y `@SecurityRequirement`. 401 sin token comprobado en vivo y en `AdminSecurityTest`. Los errores son `problem+json` sin internos. Ver cambio 4 y la observación sobre >128 KB.
8. **Código.** Capas respetadas (ArchUnit verde), un caso de uso por interfaz, cableado solo en `UseCaseConfig`, sin secretos, sin duplicación relevante con código previo. Hallazgos de código muerto abajo.

## Trazabilidad Tn ↔ test
Revisé cada Tn del alcance contra su test y todos hacen lo que dice la tabla. Lo verificado de forma especial:
- **T22–T27:** `SaveEditableContentServiceTest`, incluido el orden «filas escritas antes de invalidar» y el fallo de invalidación (T22, T25, T26).
- **T28–T36, T39:** `ContentValidatorTest`, con ruta y código exactos.
- **T40–T42:** `ContentParityTest`.
- **T43–T46:** `RollbackContentServiceTest`.
- **T47–T49:** `ListContentVersionsServiceTest` y `GetEditableContentServiceTest`.
- **T68:** `MigrationsTest` (Flyway real V1..V4 con fila, luego V5).
- **T96–T99, T102–T105, T107–T109:** `AdminContentResourceTest`, con BD real.
- **T101:** `PostgresContentVersionRepositoryTest` (trigger solo de la prueba, que lo elimina en `@AfterEach`).
- **T106:** `SiteContentJsonWriterTest` + parte BD en el test del repositorio.
- **T110:** ejecuta el `make-seed.py` real.
- **T111, T112:** `ContentCacheInvalidationTest`.
- **T116:** `SiteContentEndpointsTest`.
- **T120:** `OpenApiDocumentTest`.
- **T100** pasa, pero con la salvedad del cambio 1.

Lo dejado para el slug de imágenes está anotado y justificado en `impl.md`: T37, T38, T141, y `images` hoy es `UNKNOWN_FIELD` (lo prueba `unknownFieldsAreRejectedAtEveryLevel`; comprobado en vivo). Cada criterio CA8–CA13, CA19, CA20 (contenido) y CA23 (V5) mapea al menos a un Tn del alcance.

## Skills consultadas
- **simplify** (aplicada a mano, sin ejecutar la skill): el hallazgo es código muerto y duplicación defensiva (cambio 3).
- **strict-typing:** `AdminContentResource.java:268-270` y el cambio 4 (coerción silenciosa de escalares).
- **testing-strategy:** `AdminContentResourceTest.java:250-279` (cambio 1: el test de concurrencia no es determinista).
- **quarkus-patterns:** sin hallazgos adicionales (JDBC directo con transacción manual y candado asesor, coherente con el resto del adaptador).
- **security-best-practices:** no aplica (Java). Revisión manual: sin secretos, sin filtración de internos.

## Cambios requeridos
1. **Test de concurrencia no determinista (testing-strategy).** `AdminContentResourceTest.java:250-279` (T100) pasa igual si las dos peticiones se ejecutan en secuencia, porque la compuerta no garantiza solapamiento. El brief pide «tests de concurrencia deterministas».
   - **Qué falta:** no hay ninguna prueba que demuestre que el candado asesor es lo que serializa. Sin candado, el segundo hilo daría una violación de `UNIQUE` (500), no un 409, pero solo si coinciden en el tiempo.
   - **Qué añadir, en `PostgresContentVersionRepositoryTest`:** (a) abre una conexión, toma `pg_advisory_xact_lock(hashtextextended('content:services:es',0))` y deja la transacción abierta; (b) lanza `publish` en otro hilo; (c) afirma que sigue bloqueado tras unos cientos de ms y que no escribió nada; (d) en la conexión mantenida, cambia la versión activa y haz commit; (e) afirma que `publish` termina con `ContentVersionConflictException`. Opcional: lo mismo con el candado de EN para fijar el orden ES→EN.
2. **Código muerto de producción (simplify).** `ContentVersion.java:17` (`isPublished()`) y `ContentVersionConflictException.java:18` (`currentVersion()`) solo se usan en tests: elimínalos y ajusta los tests (la versión ya va en los `args` del mensaje y se prueba por ahí).
3. **Duplicación defensiva (simplify).** `ListContentVersionsService.java:21-25` reordena y recorta lo que `PostgresContentVersionRepository.LIST` ya devuelve ordenado y limitado en SQL. Deja el acotado de `limit` y quita el `sorted(...).limit(...)`, o ajusta el contrato del puerto («ya ordenado y limitado») y su test.
4. **Coerción silenciosa de tipos (strict-typing).** `AdminContentResource.java:268-270`: el lector «estricto» solo desactiva los campos desconocidos, y Jackson sigue coaccionando escalares.
   - **Comprobado en vivo:** `"comment":5` se guardó como `"5"` (versión 3, en BD); `"baseVersions":{"es":"1"}` se aceptó como 1.
   - **Arreglo:** desactiva `MapperFeature.ALLOW_COERCION_OF_SCALARS` en ese lector (o `DeserializationFeature.FAIL_ON_...`) para que un tipo equivocado dé 400, como pide §7. Añade un test.

## Observaciones fuera de alcance (no bloquean)
- Un cuerpo > 128 KB lo corta Vert.x con un 413 vacío, sin `problem+json`. Ocurre igual en el endpoint público de contacto, que lo comparte, y R-2 lo retoca en el slug de imágenes. El tramo 96–128 KB sí sale como `CONTENT_TOO_LARGE`. Ya está anotado en `impl.md`.
- Si `make-seed.py` y el panel publican a la vez, el perdedor choca con `UNIQUE (kind, lang, version)` y recibe un 500 genérico en vez de un 409. Es raro (un solo administrador) y no corrompe nada; se podría mapear el `23505` a `CONTENT_VERSION_CONFLICT`.
- `SaveEditableContentService:61` y `RollbackContentService:50` leen el estado tras confirmar. Si esa lectura fallara, el cliente vería un 500 aunque el guardado ya está hecho. Es mínimo; se puede documentar.
- Pendientes ya anotados por el slug: `README`/`ARCHITECTURE`/`CLAUDE.md` y `make-seed.py` sin `images`.
- `SiteContentJsonWriterTest` está en `adapter/out/postgres/`, no en `adapter/out/` como decía el plan (T106). Sin consecuencias.
