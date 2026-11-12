# impl — api-admin-content

Estado: **hecho**. Código en el working tree de `cv` (sin commits ni ramas; sin git de escritura).
Verificación: `mvn -B verify` verde (373 pruebas, 0 omitidas; ver ronda 1) y `python3 scripts/ci-summary.py --min-total 90 --min-module 80` verde: total 96,2 %, application 98,7 %, domain 91,1 %, infrastructure 95,6 % (igual tras la ronda 1). Los tests de concurrencia (`AdminContentResourceTest`, `PostgresContentVersionRepositoryTest`, `ContentCacheInvalidationTest`) pasaron 5/5 seguidos.
Prueba en vivo con el jar de producción + Postgres 18 desechable + curl (abajo).

## Hitos (orden de trabajo)
H1 dominio+aplicación (T22–T49) → H2 persistencia (V5, writer, repositorio) y REST (recurso, modelos, errores, OpenAPI, cableado) → H3 tests de infraestructura, verify y prueba en vivo. Todos cerrados.

## Código nuevo (repo `cv`)
- `application/content/`: `ContentKind`, `ViolationCode`, `Violation`, `ContentValidator`, `ContentParity`, `ContentVersion`, `ContentVersionSummary`, `EditableContent`, `SaveContentCommand`.
- `application/port/out/ContentVersionRepository` (active, find, list, publish, activate); `port/in/`: `GetEditableContentUseCase`, `SaveEditableContentUseCase`, `ListContentVersionsUseCase`, `GetContentVersionUseCase`, `RollbackContentUseCase`; servicios con el mismo nombre `*Service` + excepciones `ContentNotFound`, `ContentVersionConflict`, `ContentVersionNotFound`, `ContentInvalid`, `ContentParityBroken` (base `ContentViolationsException`), `ContentTooLarge`; `ErrorCode`: `NOT_FOUND`, `CONTENT_VERSION_CONFLICT`, `CONTENT_VERSION_NOT_FOUND`, `CONTENT_INVALID`, `CONTENT_PARITY_BROKEN`, `CONTENT_TOO_LARGE`.
- `infrastructure/.../postgres/`: `PostgresContentVersionRepository`, `SiteContentJsonWriter`; `db/migration/V5__content_version_audit.sql` (literal del plan §3.2).
- `infrastructure/.../rest/`: `AdminContentResource` (+ `AdminContentModels`, `AdminContentExamples`), `ApiError`/`problems_es|en.properties` (5 códigos nuevos), `ProblemResponse.errors` (`[{path, code}]`, solo si hay), `ProblemExceptionMapper` (rellena `errors`), `UseCaseConfig` (5 casos de uso; reutiliza el `ContentCacheInvalidator` de api-admin-cache y la seguridad/`bearerAuth` de api-admin-auth), `cv.admin.content.max-bytes` (`CV_ADMIN_CONTENT_MAX_BYTES`, 98304).
- Rutas: `GET|PUT /api/v1/admin/content/{kind}`, `GET .../{kind}/{lang}/versions[?limit]`, `GET .../versions/{n}`, `POST .../{kind}/{lang}/rollback`.

## Mapa Tn → test
| Tn | Test |
|---|---|
| T22 | `SaveEditableContentServiceTest#aValidBilingualSavePublishesBothAndInvalidatesTheCacheAfterwards` (comprueba que se invalida con las dos filas ya escritas) |
| T23 | `...#aStaleBaseVersionInEitherLanguageIsAConflictThatPublishesAndInvalidatesNothing` |
| T24 | `...#invalidOrNonParallelContentIsRejectedBeforeTouchingTheRepository` |
| T25 | `...#whenTheRepositoryFailsTheErrorPropagatesAndTheCacheIsNotInvalidated` |
| T26 | `...#aFailingInvalidationAfterPublishingDoesNotUndoOrPropagate` |
| T27 | `...#theFirstSaveOfAKindWithNothingPublishedCreatesVersionOne` |
| T28–T36, T39 | `ContentValidatorTest` (T28 `anAnonymousProjectWithAClientIsRejectedWithItsPath`, T29 `aPublicEmployerProjectWithoutClientIsRejected`, T30 `repeatedMalformedOrEmptyIdsAreRejected`, T31 `onlyHttpsLinksWithAHostAreAccepted`, T32 `invalidDatesAreRejected`, T33 `aNegativeMissingOrNonNumericPriceIsRejected`, T34 `anAdapterStatusOutsideTheClosedSetIsRejected`, T35 `emptyListsAreValid`, T36 `textsAndListsAboveTheirLimitsAreRejected`, T39 `absentOptionalFieldsAreValid`) |
| T40, T41, T42 | `ContentParityTest#sameIdsAndNeutralFieldsMeanParity`, `#aMissingIdADifferentOrderOrADifferentNeutralFieldIsListedWithItsPath`, `#translatableTextsDoNotCountAsDifferences` |
| T43–T46 | `RollbackContentServiceTest` (`rollingBackReactivatesTheTarget...`, `aBaseThatIsNotTheActiveVersionIsAConflict`, `aMissingTargetVersionIsNotFound`, `aTargetThatNoLongerPassesTodaysValidationIsNotReactivated`) |
| T47 | `ListContentVersionsServiceTest#historyComesNewestFirstWithTheRightActiveFlagAndRespectsTheLimit` |
| T48, T49 | `GetEditableContentServiceTest#aKindWithNothingPublishedIsVersionZero...`, `#anUnknownKindIsANotFoundError` |
| T68 | `MigrationsTest#v5AddsAuditColumnsToExistingRowsWithoutTouchingThemAndEnforcesItsChecks` (Flyway real en esquema aparte: V1..V4 con una fila, luego V5) |
| T96 | `AdminContentResourceTest#theSeedIsReadAsVersionOneInBothLanguagesWithItsSourceAndParity` |
| T97 | `...#aKindWithNothingPublishedIsVersionZeroWithNullContentNotAnError` |
| T98 | `...#aValidSaveCreatesNewVersionsInBothLanguagesKeepsOneActiveAndLeavesThePastIntact` |
| T99 | `...#staleBaseVersionsAreAConflictAndTheDatabaseDoesNotChange` |
| T100 | `...#twoSimultaneousSavesWithTheSameBaseGiveOneWinnerAndOneConflict` (dos hilos con compuerta; siempre {200, 409}; sin versiones duplicadas) |
| T101 | `PostgresContentVersionRepositoryTest#aFailureWhileWritingEnglishAlsoLeavesNoSpanishVersion` (trigger solo de la prueba que falla el INSERT en inglés) |
| T102 | `AdminContentResourceTest#anAnonymousProjectWithAClientIsRejectedAndNothingIsStored` |
| T103 | `...#anUnknownFieldInTheDocumentsIsRejectedNotIgnored` |
| T104 | `...#esAndEnWithADifferentStructureAreRejectedWithTheirDifferences` |
| T105 | `...#aBodyAboveTheContentLimitIsTooLarge` |
| T106 | `SiteContentJsonWriterTest#writingWhatTheMapperReadsGivesBackTheSampleDocumentsOfEveryKindAndLanguage` + `#theRoundTripIsLosslessInBothDirections`; parte BD: `PostgresContentVersionRepositoryTest#theStoredJsonOfAProjectSaveHasTheShapeOfTheSample...` |
| T107, T108 | `AdminContentResourceTest#historyIsDescendingWithTheRightActiveFlagAndTheLimitApplied`, `#aSnapshotIsReadByNumberAndAMissingOneIsNotFound` |
| T109 | `...#anOldVersionBecomesActiveThePublicReadSeesItAndALaterSaveTakesTheMaximumPlusOne` |
| T110 | `...#aRollbackLeavesTheSameStateAsMakeSeedRollback` (ejecuta el `make-seed.py --rollback` real contra la BD; se omite solo si no hay `python3`: aquí corrió) |
| T111 | `ContentCacheInvalidationTest#aRealSaveShowsUpOnTheVeryNextPublicRead` (el parcial de api-admin-cache sigue) |
| T112 | `ContentCacheInvalidationTest#aRealRollbackShowsUpOnTheVeryNextPublicRead` |
| T116 | `SiteContentEndpointsTest#savedServicesProjectsAndArchitectureShowUpInTheNextPublicReadWithDisclosureAndNoAnonymousClient` + `#anAnonymousClientWrittenStraightIntoTheDatabaseIsStillNeverExposed` |
| T120 | `OpenApiDocumentTest#problemSchemaDocumentsTheErrorsListAndTheContentCodes` (+ el existente `problemSchemaListsEveryStableErrorCode` ya compara el enum con `ApiError`) |
| T117 (parte contenido) | `ProblemCatalogTest` existente cubre los códigos nuevos solo + `#contentErrorsHaveTheirDocumentedStatusesAndMessages` |

Fuera de este slug (dependen de `images`): **T37, T38** (reglas `IMAGES_NOT_ALLOWED_FOR_PROJECT`, `IMAGE_KEY_INVALID`), **T141**. Hoy `images` es un campo desconocido (`UNKNOWN_FIELD`; lo prueba `ContentValidatorTest#unknownFieldsAreRejectedAtEveryLevel`), así que el slug de imágenes solo tiene que añadirlo al validador, al lector y al escritor. T118/T119/T121 no estaban en el alcance (T118 queda ampliado, ver extras).

## Criterio → tests
- CA8: T98, T101, T96, T97, T107, T108, T22, T27, T47, T48, T49, T106
- CA9: T23, T44, T99, T100
- CA10: T24, T28–T36, T39, T102, T103, T105, T116
- CA11: T24, T40–T42, T104
- CA12: T43–T46, T109, T110
- CA13: T22, T26, T43, T111, T112 (+ T113–T115 de api-admin-cache)
- CA19 (contenido): T117 · CA20 (contenido): T120 + extra de OpenAPI · CA23 (V5): T68
- CA10/15 en lo que toca a contenido sin imágenes: T116

## Extras fuera del plan (anotados)
- `ContentValidatorTest`: `anAnonymousProjectWithABlankOrNullClientIsNotAnError`, `duplicateIdsAreCheckedInPortsAndWithinEachPort`, `unknownFieldsAreRejectedAtEveryLevel` (T103 a nivel de aplicación), `wrongShapesAreReportedInsteadOfThrowing`, `allViolationsAreReportedTogetherUnderTheGivenRoot`.
- `ContentParityTest`: precios numéricamente iguales / blanco vs ausente, un idioma ausente, formas que no encajan.
- `SaveEditableContentServiceTest`: comentario largo, comentario en blanco/recortado, base 0 sobre una versión existente, tipo desconocido. `RollbackContentServiceTest`: sin nada publicado, invalidación que falla, tipo/idioma desconocidos y mayúsculas. `ListContentVersionsServiceTest`/`GetEditableContentServiceTest`: instantánea por número, paridad rota informada sin rechazar.
- `AdminContentResourceTest`: tipo/idioma/versión desconocidos (404 genérico), cuerpos mal formados o incompletos (400), cuerpos de rollback estrictos, primer guardado con base 0, forma almacenada canónica sin nulos, mensaje de conflicto en inglés, todas las rutas exigen sesión, sesión revocada, `Cache-Control: no-store`.
- `PostgresContentVersionRepositoryTest`: `publish` (siguiente versión, source, comment), conflicto sin escribir, `MAX+1` tras mover el puntero, `activate` (base y destino), `list`, documento almacenado que no es objeto.
- `SiteContentJsonWriterTest`: idempotencia, cliente anónimo descartado por el escritor, enteros/decimales, campos desconocidos descartados, documentos vacíos.
- `OpenApiDocumentTest#adminContentOperationsAreDocumentedWithTagSecurityRequestsAndEveryOutput` (T118 ampliado a las rutas de contenido; `everyEndpointIsPresentAndOnlyThose` incluye las 4 rutas nuevas). `AdminSecurityTest#everyAdminRouteInOpenApiExceptLoginRejectsARequestWithoutToken` ahora sustituye los `{param}` por un valor (antes asumía rutas sin parámetros).
- `ContentVersions` (utilidad de test): `snapshot`/`restore` de `content_version` para que las pruebas que escriben dejen la BD y la caché como estaban.

## Decisiones tomadas durante la implementación
1. **Drafts = árboles en crudo.** `ServicesDraft`/`ProjectsDraft`/`ArchitectureDraft` del plan no existen como clases: el validador trabaja sobre `Map`/`List`/`String`/`Number` tal como llegan de Jackson (en `application` no hay JSON). Hacen lo mismo (ver el valor crudo, p. ej. `client` de un anónimo, para RECHAZAR) con menos código. `SaveContentCommand` lleva los dos mapas.
2. **El escritor normaliza lo que se guarda.** `PostgresContentVersionRepository.publish` hace `SiteContentJsonWriter.canonical(kind, doc)` = lector → dominio → escritor, ANTES de abrir la transacción. Lo guardado es siempre algo que la API pública sabe leer, con forma única (sin nulos, sin campos desconocidos, enteros como enteros). `images` (siguiente slug) debe añadirse a lector y escritor a la vez.
3. **Forma de `PUT`/`rollback` como bytes + lector estricto.** Los recursos reciben `byte[]` para poder (a) medir el cuerpo y responder 413 `CONTENT_TOO_LARGE` como problema, y (b) leer con `FAIL_ON_UNKNOWN_PROPERTIES` (DTO estrictos: un campo que no está en el contrato fuera de `documents` es 400; dentro de `documents` es 422 `UNKNOWN_FIELD`). `@JsonIgnoreProperties(ignoreUnknown=false)` no basta: Quarkus desactiva esa característica globalmente.
4. **Límite de contenido: 96 KB** (`cv.admin.content.max-bytes`, 98304), por debajo del tope duro de 128 KB de Quarkus, para que el rechazo salga como problema. Es el cuerpo completo (ES + EN).
5. **Códigos de violación.** Precio con importe negativo/no numérico/sin moneda: `INVALID_VALUE` (T33), moneda = 3 mayúsculas. Un id vacío o mal formado: `INVALID_ID`; ausente: `REQUIRED`. `endDate` sin `startDate`, o anterior: `INVALID_DATE`. Un `client` en blanco o nulo en un anónimo no cuenta (igual que `make-seed.py`). Límites: títulos 120-160, resúmenes 600-800, 30 servicios, 50 proyectos, 20 puertos, 20 adaptadores por puerto, 30 tecnologías, 20 logros, 10 enlaces, comentario 200.
6. **Paridad (R-10 tal cual).** Ids y orden por posición en servicios, proyectos, puertos y adaptadores; neutros: `price`, `relation`, `disclosure`, `client`, `startDate`, `endDate`, `status`. `stack`, `highlights` y `links` no se comparan (no están en R-10). Las rutas de las diferencias van sin prefijo de idioma (`projects[1].relation`); un id distinto es `projects[i].id`, y un elemento que sobra/falta es `projects[i]`. En GET es informativa (`parity.differences` con `{path, code: PARITY_MISMATCH}`); al guardar, rota = 422 con las mismas diferencias en `errors`. `errors` de `ProblemResponse` se amplió a `CONTENT_PARITY_BROKEN` (el plan lo limitaba a `CONTENT_INVALID`, pero T104 pide el detalle de las diferencias).
7. **Rollback devuelve el cuerpo completo de `GET /content/{kind}`** (versión activa de ES y EN y paridad), no solo el idioma tocado: el panel no necesita otra lectura y la paridad necesita ambos. Rollback de un idioma puede romper la paridad; se informa, no se bloquea.
8. **Tipo o idioma desconocido = 404 `NOT_FOUND`** genérico (nuevo `ErrorCode.NOT_FOUND`, reutiliza el `ApiError`/mensaje existente), como una ruta inexistente. El idioma de la ruta es estricto (`es`/`en`, minúsculas), a diferencia del `?lang`, que es tolerante.
9. **`limit` del historial** acotado a 1..200 por el servicio (0 o negativo → 1). El servicio reordena y recorta además de la consulta (la consulta ya ordena en SQL).
10. **Invalidación:** tras el commit, ES y EN en guardado, solo el idioma en rollback; si falla se registra un aviso (`System.Logger`, sin dependencias en `application`) y no se propaga. El servicio solo pasa `kind` ya validado al puerto (cierra el OF-1 de api-admin-cache).
11. **Concurrencia:** una transacción por escritura, `pg_advisory_xact_lock(hashtextextended('content:{kind}:{lang}',0))` ES y luego EN, comparación con la base dentro del candado, `UPDATE active=false` y `INSERT ... COALESCE(MAX(version),0)+1`. Convive con `make-seed.py` (sin candado) por el `UNIQUE (kind, lang, version)`.
12. `parity` de GET con un idioma sin publicar y el otro sí: una diferencia `{path:"es"|"en"}`; con ambos sin publicar: ok.

## Prueba en vivo (jar de producción, Postgres 18 desechable con el sample Ada Ejemplo, curl)
- Login 200; `GET /content/services`: 200, `Cache-Control: no-store`, ES y EN versión 1, `source: seed`, `parity.ok`.
- Caché primada con `GET /api/v1/services?lang=es|en` (títulos de ejemplo) → `PUT` válido: 200 con versiones 2/2, `source: admin`, `comment`; el siguiente `GET /api/v1/services` ya trae los títulos editados en ES y EN (TTL de 5 min sin esperar).
- Mismo `PUT` otra vez: 409 `CONTENT_VERSION_CONFLICT` (detalle con la versión activa). Anónimo con `client` + URL `http://`: 422 `CONTENT_INVALID` con `errors` `es.projects[1].client / ANONYMOUS_CLIENT_FORBIDDEN` y `en.projects[0].links[0].url / INVALID_URL`. Paridad rota (con `?lang=en`): 422 `CONTENT_PARITY_BROKEN` en inglés con tres diferencias. Campo desconocido: 422 `UNKNOWN_FIELD`. Cuerpo > 96 KB: 413 `CONTENT_TOO_LARGE`.
- Historial, versión 1 (200) y 9 (404 `CONTENT_VERSION_NOT_FOUND`). Rollback es 2→1: 200, el público ES vuelve a lo viejo y EN conserva lo editado de inmediato; base obsoleta 409, destino inexistente 404. Un guardado posterior toma `MAX+1` (3/3).
- Proyectos guardados: el público anónimo sale con `client` nulo, `clientLabel` actualizado y el nombre real no aparece en el cuerpo; el JSON almacenado del anónimo no tiene la clave `client`.
- `make-seed.py --rollback es --kind services` aplicado sobre la BD tras los cambios del panel: la API lo lee de forma coherente (versión activa 2, historial 3 inactiva/2 activa/1 inactiva).
- Sin token: 401 `ADMIN_UNAUTHORIZED`; tipo `resume`/idioma `fr`: 404 `NOT_FOUND`.

## Límites y riesgos abiertos
- Un cuerpo > 128 KB lo corta Quarkus/Vert.x con un 413 sin `problem+json` (anterior a JAX-RS); solo entre 96 y 128 KB el 413 es un problema documentado. Para el panel basta (el límite real de contenido es 96 KB).
- Los documentos se leen/validan como `Double` para decimales (JSON → `Double`); el precio se normaliza con `BigDecimal(n.toString())`. Importes tipo `0.1+0.2` no se tocan, pero no se garantiza precisión de más de 15-17 dígitos (el tope validado es 1.000.000.000).
- La invalidación sigue siendo de una sola instancia (api-admin-cache).
- No se actualizaron `README.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `scripts/make-seed.py` (sigue sin conocer `images`) ni el smoke test: es del slug `api-admin-docs-deploy`/`images`. No se ejecutó `/simplify`.
- `rollback` valida la versión destino sola; no impide que quede una paridad rota entre idiomas (se informa en `parity`).

## Correcciones de la ronda 1 (review.md)
Verificación tras los cambios: `mvn -B verify` verde (373 pruebas) y `ci-summary.py --min-total 90 --min-module 80` verde (total 96,2 %, application 98,7 %, domain 91,1 %, infrastructure 95,6 %). Las pruebas de concurrencia (repositorio + REST) pasaron 3/3 seguidas.
1. **T100 determinista.** El solapamiento no se puede forzar desde HTTP, así que la prueba que demuestra la serialización está en `PostgresContentVersionRepositoryTest#publishWaitsForTheAdvisoryLockAndThenSeesTheVersionThatWonTheRace`: una conexión toma `pg_advisory_xact_lock(hashtextextended('content:services:es',0))` con la transacción abierta, `publish` corre en otro hilo, se afirma que sigue bloqueado tras 700 ms y que no escribió nada, la conexión mantenida publica la versión 2 de ES y confirma, y `publish` termina con `ContentVersionConflictException` (args `["es","2"]`), sin escribir EN. Opcional hecho: `#publishTakesTheSpanishLockBeforeTheEnglishOneAndCompletesWhenItIsFree` (con el candado de EN ocupado, `pg_try_advisory_xact_lock` de ES desde otra conexión da false = publish ya lo tiene; al liberar EN termina y publica 2/2). El T100 de `AdminContentResourceTest` se conserva como prueba extremo a extremo del reparto 200/409 sin duplicados, con un comentario que explica que su papel no es forzar el solapamiento.
2. **Código muerto** eliminado: `ContentVersion.isPublished()` y `ContentVersionConflictException.currentVersion()` (y su campo); los tests comprueban ahora `args()` (`["es","3"]`) y `active()` falso.
3. **`ListContentVersionsService`** solo acota `limit` a 1..200 y delega; el contrato del puerto (`ContentVersionRepository.list`) dice «ya ordenado y recortado». El fake de aplicación honra orden y límite, y el test T47 sigue verificando orden, `active`, límite y acotado.
4. **Coerción de escalares.** `MapperFeature.ALLOW_COERCION_OF_SCALARS=false` no bastaba para texto←número ni entero←texto/decimal, así que el lector de `AdminContentResource` (copia del `ObjectMapper`) usa `coercionConfigFor` (Textual: rechaza entero/decimal/booleano; Integer: rechaza texto, vacío, decimal y booleano) y desactiva `ACCEPT_FLOAT_AS_INT`, además de `FAIL_ON_UNKNOWN_PROPERTIES`. Tests: `malformedAndIncompleteBodiesAreBadRequestsWithProblemJson` (`"es":"1"`, `"en":true`, `"es":1.5`, `"comment":5`, `"comment":true`) y `rollbackBodiesAreStrict` (`"baseVersion":"1"`, `"targetVersion":"1"`, `1.5`) dan 400 `BAD_REQUEST` problem+json. Los documentos (`Map<String,Object>`) no se ven afectados.
   En vivo (jar de producción + Postgres desechable + curl): `{"baseVersions":{"es":"1",...}}`, `{"es":1.5}` y `"comment":5` → 400 `BAD_REQUEST` `application/problem+json`, la BD sigue en versión 1/1; un PUT válido → 200.
