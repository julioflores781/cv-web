# impl — api-audit-log

Estado: **HECHO** (todos los hitos). Repo `cv`, cambios solo en el working tree (sin git de escritura). Sin cambios de comportamiento funcional de los servicios: solo se inyecta `AuditLog` y se emite un evento por acción.

Verificación:
- `mvn -B verify` OK (147 pruebas en `application`, 389 en `infrastructure`; `ci-summary.py` cuenta 587 de 587), `python3 scripts/ci-summary.py --min-total 90 --min-module 80` OK: total 96,2 %; application 99,0 %; domain 94,2 %; infrastructure 95,1 %.
- Estabilidad: las 14 clases de audit (los 9 `*ServiceTest` afectados, `AuditEventTest`, `LogAuditLogTest`, `AdminAuditLogTest`, `SensitiveDataNotLoggedTest`, `ArchitectureTest`; 106 tests, con arranque de Quarkus y MinIO cada vez) ejecutadas **10 veces seguidas**: 10/10 verdes.
- Prueba de mutación: añadiendo `"comment", comment` al evento de `SaveEditableContentService` fallan T38 (`SaveEditableContentServiceTest`) y T50 (`aparece en un registro: CANARY-COMMENT-5b8f3a1c`). Revertido.
- Prueba real con el jar de producción (JSON) y con `quarkus:dev` (texto): ver «Prueba real».

## Mapa Tn -> test
`APP` = `cv/application/src/test/java/dev/julioflores/cv/application/`; `INFRA` = `cv/infrastructure/src/test/java/dev/julioflores/cv/infrastructure/`.

| Tn | Test | Archivo |
|---|---|---|
| T31 | `aCorrectLoginRecordsOneSuccessWithoutAnyPassword` | `APP/LoginAdminServiceTest` |
| T32 | `aWrongPasswordAndAMissingAccountRecordALoginFailedWithTheirReason` | `APP/LoginAdminServiceTest` |
| T33 | `aLockedAccountRecordsLoginLockedWithTheWaitAndNeverASuccessEvenWithTheCorrectPassword` | `APP/LoginAdminServiceTest` |
| T34 | `anExhaustedGlobalLimitRecordsLoginRateLimited` | `APP/LoginAdminServiceTest` |
| T35 | `aHashThatNeedsARehashStillRecordsASingleSuccess` | `APP/LoginAdminServiceTest` |
| T36 | `aSuccessfulChangeRecordsPasswordChanged`, `aWrongCurrentPasswordRecordsWrongCurrent`, `aLockedAccountRecordsLockedAndAWeakPasswordRecordsWeak` | `APP/ChangeAdminPasswordServiceTest` |
| T37 | `recordsSessionsRevokedAfterRaisingTheVersion` | `APP/LogoutAllSessionsServiceTest` |
| T38 | `aValidSaveRecordsTheVersionsAndOnlyTheCommentLengthNeverTheTextOrTheContent` + `invalidParityConflictAndRepositoryFailuresRecordNothing` | `APP/SaveEditableContentServiceTest` |
| T39 | `aRollbackRecordsKindLanguageAndBothVersionsEvenIfTheCacheFails` + `conflictMissingVersionAndInvalidSnapshotRecordNothing` | `APP/RollbackContentServiceTest` |
| T40 | `aValidUploadRecordsKeyTypeBytesAndDimensions` + `invalidTooLargeUnsupportedOrFailingStorageUploadsRecordNothing` | `APP/UploadProjectImageServiceTest` |
| T41 | `aDeletionRecordsTheIdAndNothingElse` + `inUseMissingMalformedAndFailingDeletionsRecordNothing` | `APP/DeleteImageServiceTest` |
| T42 | `aRealCleanupAndADryRunRecordTheirCounters` | `APP/CleanupOrphanImagesServiceTest` |
| T43 | `everyReadRecordsLimitReturnedAndPagedWithoutNamesEmailsOrBodies` | `APP/ListContactMessagesServiceTest` |
| T45 | `aLogHandlerThatThrowsNeverBreaksTheCaller` (handler JUL que lanza sobre el logger `audit`) + `aLoggerThatThrowsIsSwallowedByTheAdapter` (el `catch` del adaptador, con un logger JBoss que lanza) | `INFRA/LogAuditLogTest` |
| T47 | `lineBreaksAndControlCharactersCannotForgeASecondLineOrField`, `valuesAreTruncatedTo120CharactersWithoutHalfASurrogatePair`, `nullAndOddKeysAreHandledAndTheDetailsAreSortedAndImmutable`, `aNullDetailsMapIsEmptyAndActionAndOutcomeAreMandatory` | `APP/AuditEventTest` |
| T48 | `aSuccessIsInfoAndAFailureIsWarnWithSortedDetailsAndTheRequestMdc` | `INFRA/LogAuditLogTest` |
| T49 | `theFullAdminFlowLeavesExactlyOneAuditLinePerActionWithItsRequestIdAndTheSentIp` (12 acciones, líneas exactas, nivel INFO/WARN, `client_ip`, `request_id` igual al `X-Request-Id` y presente en la línea de access, ni una línea de más) | `INFRA/AdminAuditLogTest` (recorrido compartido en `INFRA/AdminAuditFlow`) |
| T50 | `theFullAdminFlowLeavesNoCanaryInAnyRecordOfAnyCategory`: contraseña actual y nueva, contraseña errónea, 3 JWT, `$argon2`, el hash real de la BD, comentario, título único del contenido, nombre/correo/mensaje del contacto y su `ip_hash`; busca en mensaje, parámetros, MDC y traza de todos los registros (`LogRecords.dump()`), más `Bearer` y `eyJ`; comprueba que el volcado no está vacío | `INFRA/SensitiveDataNotLoggedTest` |
| T52 | `readsOfContentVersionsSessionAndImagesLeaveNoAuditLine` (contenido, versiones, una versión, sesión, imágenes: access sí, audit no) | `INFRA/AdminAuditLogTest` |
| T54 | `onlyTheAuditAdapterImplementsAuditLogAndApplicationOnlyKnowsTheInterface` (solo `adapter.out.audit` implementa `AuditLog`; `application` no depende de ese paquete; `AuditLog` es interfaz; el paquete se importa y un servicio depende de la interfaz) + `theRequestContextHandlerLivesInConfig` | `INFRA/ArchitectureTest` |

Soporte nuevo: `RecordingAuditLog` en `APP/AdminFakes` (eventos por valor, `only()` exige exactamente uno), `INFRA/AdminAuditFlow` (el recorrido admin completo por HTTP con `CF-Connecting-IP`), `AdminTestSupport.queryString`. Los 9 `*ServiceTest` pasan su `RecordingAuditLog` por constructor.

### Tests extra fuera del plan (anotados)
- `ChangeAdminPasswordServiceTest.withoutAnAccountNothingIsRecordedBecauseItIsNotInTheEventTable` (sin cuenta, `AdminUnauthorizedException`: sin evento).
- `SaveEditableContentServiceTest.aSaveWithoutCommentRecordsItAsAbsentWithLengthZeroAndCountsCodePoints` (sin comentario: `comment_present=false`, longitud 0; la longitud cuenta puntos de código).
- `CleanupOrphanImagesServiceTest.theRecordedGraceIsTheEffectiveOneAndAFailingStorageRecordsNothing` (se registra la gracia efectiva, mínimo 1 h; storage caído: sin evento).
- `ListContactMessagesServiceTest.anEmptyPageIsStillRecordedAsARead`.
- `AuditEventTest.theFactoriesBuildPairsAndRejectAnOddNumberOfArguments`.
- `LogAuditLogTest.aMessageWithPercentSignsIsNotTreatedAsAFormat` (un `%s`/`%n` en un valor no se interpreta).

## Criterios -> tests
- **A7** cada acción de la tabla 4.2 genera su línea con sus campos; los fallos de contenido no auditan; las lecturas no auditan: T31–T43, T48, T49, T52 (y los extras).
- **A8** sin contraseñas, tokens, hashes, comentario, contenido ni datos de contacto en ningún registro: T31, T36, T38, T43 (a nivel de evento), T50 (a nivel de todos los registros), más la prueba real.
- **A9** `audit` nunca rompe una operación: T45; los casos de uso siguen sin frameworks: T54 (más las reglas ya existentes).
- **A4/A6** (parte audit) `request_id` y `client_ip` por MDC en la línea audit: T48, T49.

## Decisiones tomadas
1. **API del puerto/evento.** `AuditLog.record(AuditEvent)`; `AuditEvent(action, outcome, Map<String,String> details)` (record) con fábricas `success(action, k, v, …)` y `failure(action, k, v, …)`. El constructor deja los detalles **ordenados por clave** (TreeMap, inmutables): por eso en la línea `en_version` va antes que `es_version` y no en el orden de la tabla del plan.
2. **Saneado más estricto que el plan.** Claves: solo `[A-Za-z0-9_.-]` (el resto pasa a `_`; claves nulas o en blanco se descartan). Valores: control, saltos de línea **y cualquier espacio** pasan a `_` (así tampoco se puede falsear un campo `k=v` dentro de un valor), nulo = vacío, truncado a 120 sin dejar media pareja suplente.
3. **Adaptador.** `LogAuditLog` (`@ApplicationScoped`, logger JBoss de categoría `audit`, `log.log(INFO|WARN, línea)` sin formato, así que `%` en un valor no se interpreta). El `catch (RuntimeException)` escribe solo `audit log failed: <clase>` por stderr (el logger roto no sirve para avisar). El constructor `LogAuditLog(Logger)` es público para poder probar el `catch`; CDI usa el de cero argumentos.
4. **Orden de los parámetros.** `AuditLog` va tras los puertos de salida y antes de `Clock`/valores de configuración en los constructores (`LoginAdminService(accounts, hasher, issuer, globalLimiter, audit, clock, maxFailures, lock)`, etc.); `UseCaseConfig` es el único sitio de cableado.
5. **Momento de cada evento.** Éxitos: después de la operación (`LOGIN_SUCCESS` tras emitir el token; `PASSWORD_CHANGED` tras emitir el token nuevo; `IMAGE_UPLOADED` tras `put` y URL pública; `IMAGE_DELETED` tras `delete`; `CONTENT_ROLLED_BACK` tras activar e invalidar, antes de releer; `CONTENT_SAVED` tras publicar, invalidar y releer, porque trae las versiones resultantes). Fallos de seguridad: justo antes de lanzar (en `LOGIN_FAILED` por contraseña mala, tras `recordFailure`).
6. **Detalles concretos.** `CONTENT_SAVED`: `comment_present` es sobre el comentario ya recortado (en blanco = ausente) y `comment_length` son puntos de código. `CONTENT_ROLLED_BACK`: `from_version` = base enviada, `to_version` = objetivo. `IMAGES_CLEANUP`: `older_than_hours` es la gracia **efectiva** (mínimo 1 h); `deleted` o `would_delete` son contadores (el otro 0). `MESSAGES_READ`: `limit` es el límite ya acotado (1..100), `returned` el tamaño de la página y `paged` si hay cursor siguiente. `LOGIN_LOCKED`: `retry_after_s` el mismo valor que lleva la excepción.
7. **Sin evento** para `ChangeAdminPassword` sin cuenta (`AdminUnauthorizedException`, no está en la tabla), para validación/paridad/conflicto/not-found de contenido, para imágenes inválidas/grandes/de tipo no soportado/storage caído, y para borrados en uso o inexistentes.
8. Documentación mínima: bullet **Auditoría** en `CLAUDE.md` y párrafo **Auditoría** con la tabla de eventos en `ARCHITECTURE.md` §7. `docs/observability.md` y README son del slug 5.

## Archivos
Main: `application/.../audit/{AuditAction,AuditOutcome,AuditEvent}.java`, `application/.../port/out/AuditLog.java`, los nueve servicios (`service/{LoginAdmin,ChangeAdminPassword,LogoutAllSessions,SaveEditableContent,RollbackContent,UploadProjectImage,DeleteImage,CleanupOrphanImages,ListContactMessages}Service.java`), `infrastructure/.../adapter/out/audit/LogAuditLog.java`, `infrastructure/.../config/UseCaseConfig.java`, `ARCHITECTURE.md`, `CLAUDE.md`.
Tests: los de la tabla, más `AdminFakes` (RecordingAuditLog), `AdminTestSupport.queryString`, `AdminAuditFlow`, y los 9 `*ServiceTest` adaptados al nuevo constructor.

## Prueba real (jar de producción y `quarkus:dev`)
Entorno: jar del `mvn verify` (copia), Postgres 16 y MinIO (`cgr.dev/chainguard/minio`) en Docker con puertos propios, `CV_ADMIN_EDGE_BLOCK=false` (con `true`, `CF-Connecting-IP` en admin da 404 por diseño), sample de `db/sample/V1000__sample_resume.sql`, cuenta creada con `AdminPasswordTool set-password` por pty (contraseña `CANARY-ADMIN-PASS-current-…`), y `curl` con `CF-Connecting-IP: 198.51.100.77`. Recorrido: login ok, login mal ×5, login bloqueado (429), `AdminPasswordTool unlock`, login ok, 5 lecturas (sesión, contenido, versiones, una versión, imágenes), cambio de contraseña débil / actual incorrecta / correcto, guardado con comentario canario y título canario, guardado obsoleto (409), rollback, 2 subidas, borrado, borrado repetido (404), limpieza en ensayo y real, un contacto público con canarios y su lectura admin, sesión con token viejo (401), logout-all y sesión tras logout (401). 29 peticiones.

Resultado del verificador (`verify.py` sobre la salida completa del proceso, 71 líneas, todas JSON válido):
- **20 líneas `audit` para las 20 peticiones auditables; cada una con exactamente una línea cuyo `request_id` es el `X-Request-Id` de su respuesta, `client_ip=198.51.100.77` y su acción esperada.** Las 9 peticiones sin audit (5 lecturas, guardado 409, borrado 404, dos sesiones 401) tienen 0 líneas audit y exactamente 1 línea de access con ese `rid`.
- **0 apariciones** en toda la salida del proceso de: las tres contraseñas (actual, nueva, errónea), los 3 JWT emitidos, el hash Argon2 real de la BD, `$argon2`, `Bearer`, `eyJ`, el comentario, el título único, nombre/correo/mensaje del contacto, `IPHASH` y la IP enviada en la petición pública (`198.51.100.88`).

Líneas reales (JSON de producción, campos recortados a los relevantes; el resto: `timestamp`, `logger:"audit"`, `service:"cv-api"`):
```
INFO  {"message":"action=LOGIN_SUCCESS outcome=success","request_id":"107cbfd7d7b84da5a3a23eae804dee89","client_ip":"198.51.100.77"}
WARN  {"message":"action=LOGIN_FAILED outcome=failure reason=bad_credentials","request_id":"fbc735a552dc48a98d8bd991f2424a7b","client_ip":"198.51.100.77"}
WARN  {"message":"action=LOGIN_LOCKED outcome=failure retry_after_s=899","request_id":"97408fc062334d9083ae16c21c276fc7","client_ip":"198.51.100.77"}
WARN  {"message":"action=PASSWORD_CHANGE_FAILED outcome=failure reason=weak", ...}
WARN  {"message":"action=PASSWORD_CHANGE_FAILED outcome=failure reason=wrong_current", ...}
INFO  {"message":"action=PASSWORD_CHANGED outcome=success","request_id":"af7a55f01e964caf89a3f8a31c5c432f", ...}
INFO  {"message":"action=CONTENT_SAVED outcome=success comment_length=32 comment_present=true en_version=2 es_version=2 kind=services","request_id":"172ebbde811344d78964c4f88e6cc64b", ...}
INFO  {"message":"action=CONTENT_ROLLED_BACK outcome=success from_version=2 kind=services lang=es to_version=1","request_id":"881ef62044904f06bcc0aa7077c0b6e1", ...}
INFO  {"message":"action=IMAGE_UPLOADED outcome=success bytes=149 content_type=image/png height=48 key=site/projects/dafed7e9-7cb5-4e05-ae37-c72e04e627a5.png width=64","request_id":"ba09549539b340c0acacdfacf201824d", ...}
INFO  {"message":"action=IMAGE_DELETED outcome=success id=dafed7e9-7cb5-4e05-ae37-c72e04e627a5","request_id":"43d3e1dce720445eaa76fbe856143142", ...}
INFO  {"message":"action=IMAGES_CLEANUP outcome=success deleted=0 dry_run=true kept=1 older_than_hours=24 would_delete=0","request_id":"0c49686d092b44be8f178fce89fe249f", ...}
INFO  {"message":"action=IMAGES_CLEANUP outcome=success deleted=0 dry_run=false kept=1 older_than_hours=24 would_delete=0","request_id":"19d56e4513984c52b7df80129ab83238", ...}
INFO  {"message":"action=MESSAGES_READ outcome=success limit=10 paged=false returned=1","request_id":"9913f556646545a7b656941ee272dfed", ...}
INFO  {"message":"action=SESSIONS_REVOKED outcome=success","request_id":"53e200db41ba493eb2ba7ba7c86ca348", ...}
```
Una línea completa tal como sale del proceso:
`{"timestamp":"2026-11-12T18:27:03.464684+01:00","logger":"audit","level":"INFO","message":"action=LOGIN_SUCCESS outcome=success","threadName":"executor-thread-1","request_id":"107cbfd7d7b84da5a3a23eae804dee89","client_ip":"198.51.100.77","service":"cv-api"}`.

Modo dev (`mvn quarkus:dev`, texto; BD y MinIO del mismo entorno), con `CF-Connecting-IP: 198.51.100.55`:
```
18:28:42.306 INFO  [f0b1aaa10fad40a5807b0e21e9dfd258] audit action=LOGIN_SUCCESS outcome=success
18:28:42.310 INFO  [f0b1aaa10fad40a5807b0e21e9dfd258] access POST /api/v1/admin/auth/login 200 464ms 365b rid=f0b1aaa10fad40a5807b0e21e9dfd258 err=- ip=198.51.100.55
18:28:42.516 WARN  [a7c24706b16640009bea6c19839f4bce] audit action=LOGIN_FAILED outcome=failure reason=bad_credentials
18:28:42.523 INFO  [a7c24706b16640009bea6c19839f4bce] access POST /api/v1/admin/auth/login 401 205ms 147b rid=a7c24706b16640009bea6c19839f4bce err=ADMIN_INVALID_CREDENTIALS ip=198.51.100.55
```
(La IP no sale en el formato de texto del audit, solo en el access; en JSON `client_ip` es campo plano.) Contenedores y procesos de la prueba parados y borrados; el `cv-db-local` del humano no se tocó.

## Límites / pendiente
- **Una limpieza real con `deleted>0` no se vio en el jar**: el objeto de MinIO tiene fecha real y la gracia mínima es 1 h; el caso (`deleted=1`, `would_delete=1`) lo cubren T42 y T49 con el reloj adelantado.
- (Corregido en la ronda 1, R1) `CONTENT_SAVED` ya no depende de la relectura: si falla tras publicar, se emite sin `es_version`/`en_version` y se relanza la excepción.
- Un fallo del propio logger se traga sin rastro salvo la línea por stderr con la clase del error (contrato «`record` no lanza»).
- Trazabilidad de fuerza bruta (riesgo 14 del plan): `LOGIN_FAILED` no dice cuántos fallos van ni que el último bloqueó; el bloqueo se deduce del siguiente `LOGIN_LOCKED` (visto en la prueba real: 5 `LOGIN_FAILED` y luego `LOGIN_LOCKED retry_after_s=899`).
- Con `CV_ADMIN_EDGE_BLOCK=true` y `CF-Connecting-IP`, el 404 del edge-guard no pasa por ningún servicio: no hay línea audit, solo access (como en el plan). El audit de `cv-web` → API sale con `ip=-` hasta que el panel envíe `X-Client-IP` (riesgo 1 del plan).
- La retención es la rotación de logs de Docker (decisión del plan: sin tabla de auditoría); la rotación va en el slug 5.
- Hip. 7 del plan (`System.Logger` de `application` y MDC) sigue sin verificar: `LogAuditLog` es un adaptador con logger JBoss, no la necesita; la cubrirá el slug 3.

## Correcciones de la ronda 1 (review.md, «Cambios requeridos»)
Verificación final: `mvn -B verify` OK (593 pruebas: 153 en `application`, 389 en `infrastructure`); `ci-summary.py --min-total 90 --min-module 80` OK (total 96,3 %; application 99,0 %; domain 94,2 %; infrastructure 95,1 %). Las 14 clases de audit (112 tests: 87 en `application` + 25 en `infrastructure`) ejecutadas 10 veces seguidas sin fallos (9 de la tanda + 1 de reposición: la primera ejecución de la tanda falló por `Port already bound: 8081` al coincidir con otro Maven de la sesión en la misma máquina; es un problema del entorno, no del código, y la repetición dio 10 verdes consecutivos con arranque de Quarkus y MinIO cada vez).

**R1. `CONTENT_SAVED` independiente de la relectura.** `SaveEditableContentService`: tras `publish` e invalidar, la relectura (`ContentRequests.load`) va en un `try`; si lanza, se emite `CONTENT_SAVED` con `kind`, `comment_present` y `comment_length` (sin versiones, que no se conocen), y se relanza la excepción original; si funciona, el evento lleva además `es_version` y `en_version` como antes. `RollbackContentService` ya emitía antes de releer (sin el problema); se añadió el test que lo fija.
- Tests: `SaveEditableContentServiceTest.aFailingReadAfterPublishingStillRecordsTheSaveWithoutVersionsAndRethrows` (lectura fallida tras `publish` => una línea CONTENT_SAVED sin versiones, excepción propagada, versiones publicadas) y `RollbackContentServiceTest.aFailingReadAfterActivatingStillRecordsTheRollbackAndRethrows`. Soporte: `FakeVersions.failActiveAfter`.

**R2. Tests de «el éxito se emite DESPUÉS de la operación».** Soporte: `ImageFakes.Storage.failOnDelete` (solo fallan `delete`/`deleteAll`).
- `DeleteImageServiceTest.ifTheStorageFailsWhileDeletingAfterTheChecksNothingIsRecorded`.
- `CleanupOrphanImagesServiceTest.ifDeleteAllFailsNoCleanupIsRecorded`.
- `LoginAdminServiceTest.ifRecordingTheSuccessOrIssuingTheTokenFailsNoLoginSuccessIsRecorded` (`recordSuccess` lanza e `issue` lanza).
- `ChangeAdminPasswordServiceTest.ifStoringTheNewPasswordOrIssuingTheTokenFailsNoPasswordChangedIsRecorded` (`changePassword` lanza e `issue` lanza).

**Mutantes `before_*` (copia en el scratchpad, `mut4`, no el repo; `mvn test -pl domain,application`): los 9 caen.**
| Mutante | Cae por |
|---|---|
| before_delete (record antes de `storage.delete`) | `DeleteImageServiceTest.ifTheStorageFailsWhileDeleting…` |
| before_cleanup (record antes del bucle de `deleteAll`) | `CleanupOrphanImagesServiceTest` (T42 y `ifDeleteAllFails…`) |
| before_login_recordSuccess | `LoginAdminServiceTest` (T31, T35, …) |
| before_login_issue (record antes de `issuer.issue`) | `LoginAdminServiceTest.ifRecordingTheSuccess…` |
| before_password_change | `ChangeAdminPasswordServiceTest` (éxito y `ifStoring…`) |
| before_password_issue | `ChangeAdminPasswordServiceTest.ifStoring…` |
| before_upload | `UploadProjectImageServiceTest` (T40) |
| before_rollback | `RollbackContentServiceTest` (T39 y el nuevo) |
| before_save | `SaveEditableContentServiceTest` (T38 y el nuevo) |
La copia sin mutar pasa (rc=0); el repo real no se tocó con los mutantes.
