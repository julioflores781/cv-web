# review — api-audit-log

## Veredicto final (ronda 2): APPROVED

R1 y R2 de la ronda 1 verificados y corregidos; «Cambios requeridos» vacío (ver «Ronda 2» al final). Lo que sigue es el texto de la ronda 1, conservado como histórico.

## Ronda 1 — veredicto de entonces: CHANGES_REQUESTED

El diseño, el cableado, la privacidad y el comportamiento real son correctos (verificados de forma independiente). Se rechaza por dos hallazgos accionables:
(R1) la auditoría de `CONTENT_SAVED` se pierde si falla la relectura posterior a un guardado ya publicado, y
(R2) cuatro casos de «el éxito se emite DESPUÉS de la operación» no tienen ningún test que lo proteja (mutantes supervivientes).
Todo lo demás está verde. Repo `cv`, solo lectura; nada de `api-logging-core` se ha mezclado en este veredicto.

## Verificación propia
- `mvn -B verify` (Docker): BUILD SUCCESS; 389 pruebas en `infrastructure` y 147 en `application` (+ `domain`), `ci-summary.py` = **587 de 587**.
- `python3 scripts/ci-summary.py --min-total 90 --min-module 80`: rc=0; total 96,2 %; application 99,0 %; domain 94,2 %; infrastructure 95,1 %. `OpenApiDocumentTest` y `ProblemCatalogTest` en verde (contratos REST intactos; ningún archivo de OpenAPI ni de problemas tocado por este slug).
- Estabilidad: las 14 clases de audit (106 tests, 81 en `application` + 25 en `infrastructure`) ejecutadas **10 veces seguidas sobre una copia**: 10/10 verdes, sin flakiness.
- Mutación sobre una copia (`scratchpad/mut`, no el repo; todas las clases recompiladas tras `touch`):

| Mutante | Resultado |
|---|---|
| Registrar el comentario en `CONTENT_SAVED` | cae: `SaveEditableContentServiceTest` (T38 y extra), `SensitiveDataNotLoggedTest` (T50), `AdminAuditLogTest` (T49) |
| Registrar el cuerpo de un mensaje en `MESSAGES_READ` | cae: `ListContactMessagesServiceTest` (T43 y extra), T49, T50 |
| Audit en fallo de validación de contenido | cae: `invalidParityConflictAndRepositoryFailuresRecordNothing` (T38) |
| Audit en conflicto/fallo de `publish` | cae: el mismo test (T38) |
| Éxito ANTES de la operación: guardado | cae: T38, T49 |
| Éxito ANTES de la operación: subida | cae: `invalidTooLargeUnsupportedOrFailingStorageUploadsRecordNothing` (T40) |
| Éxito ANTES de la operación: **borrado de imagen** | **SOBREVIVE** (ver R2) |
| Éxito ANTES de la operación: **login** (antes de `recordSuccess`/`issue`) | **SOBREVIVE** (R2) |
| Éxito ANTES de la operación: **cambio de contraseña** (antes de `changePassword`) | **SOBREVIVE** (R2) |
| Éxito ANTES de la operación: **limpieza real** (antes de `deleteAll`) | **SOBREVIVE** (R2) |
| Quitar saneado de saltos de línea/espacios/claves | cae: `AuditEventTest` (2 tests, T47) |
| Quitar el truncado a 120 | cae: `AuditEventTest.valuesAreTruncated…` (T47) |
| `LogAuditLog` deja propagar la excepción | cae: `LogAuditLogTest.aLoggerThatThrowsIsSwallowedByTheAdapter` (T45). Nota: el test JUL `aLogHandlerThatThrowsNeverBreaksTheCaller` no cae solo, porque el LogManager ya traga el fallo del handler; lo que protege el `catch` es el segundo test (bien pensado) |

- **Prueba real** con el jar de producción (JSON), Postgres 16 y MinIO en Docker, cuenta creada con `AdminPasswordTool set-password` por pty, 36 peticiones con `CF-Connecting-IP: 198.51.100.77` (login ok, 5 fallos, bloqueado ×2, unlock, lecturas ×5, contraseña débil/actual incorrecta/ok, guardado con comentario `CANARY-COMMENT…\r\nINJECT action=LOGIN_SUCCESS`, guardado obsoleto 409, guardado inválido 422, rollback ok/409/404, subida ok y subida inválida 400, borrado ok y repetido 404, limpieza ensayo y real, mensajes con canarios, token viejo 401, petición sin IP y con IP inválida, logout-all, sesión tras logout 401; además, en un intento previo, 8 `LOGIN_RATE_LIMITED` reales por el límite global de 10/min):
  - 56 líneas de log, **todas JSON válido**; 20 líneas `audit` para las 20 peticiones auditables, cada una con exactamente una línea cuyo `request_id` = `X-Request-Id` de su respuesta, `client_ip` = la enviada, nivel WARN/INFO correcto y la acción/campos de la tabla §4.2. Las 16 peticiones sin audit (lecturas, 409, 422, 404, 400, 401) tienen 0 líneas audit y 1 línea access. Una línea access por petición.
  - Sin IP o con IP inválida: `client_ip` ausente y `ip=-` en el access (la IP solo sale en admin y solo si es válida).
  - Canarios con **0 apariciones** en toda la salida: contraseñas actual, nueva y errónea, los 3 JWT, `$argon2`, `Bearer`, `eyJ`, el comentario (y su inyección `INJECT`), título único, nombre/correo/cuerpo del contacto, `IPHASH`. Solo hay loggers `access` y `audit`.
  - Procesos y contenedores (`rv-pg`, `rv-minio`, jar, Ryuk) parados y borrados.

## Trazabilidad Tn ↔ it()
Todas existen y hacen lo que dicen (mapa de `impl.md` verificado test a test; los positivos usan `RecordingAuditLog.only()`, que falla con 0 o ≥2 eventos, así que «exactamente uno» está comprobado).

| Tn | Test | Veredicto |
|---|---|---|
| T31 | `LoginAdminServiceTest.aCorrectLoginRecordsOneSuccessWithoutAnyPassword` (:127) | OK |
| T32 | `…aWrongPasswordAndAMissingAccountRecordALoginFailedWithTheirReason` (:137) | OK (`bad_credentials` y `no_account`) |
| T33 | `…aLockedAccountRecordsLoginLockedWithTheWait…` (:152) | OK |
| T34 | `…anExhaustedGlobalLimitRecordsLoginRateLimited` (:161) | OK |
| T35 | `…aHashThatNeedsARehashStillRecordsASingleSuccess` (:169) | OK |
| T36 | `ChangeAdminPasswordServiceTest` (3 tests) | OK (cambia, actual incorrecta, bloqueada, débil; sin contraseñas) |
| T37 | `LogoutAllSessionsServiceTest.recordsSessionsRevokedAfterRaisingTheVersion` | OK |
| T38 | `SaveEditableContentServiceTest` (2 + extra de longitud en code points) | OK |
| T39 | `RollbackContentServiceTest` (2) | OK |
| T40 | `UploadProjectImageServiceTest` (2) | OK |
| T41 | `DeleteImageServiceTest` (2) | OK en contenido; **no protege el orden** (R2) |
| T42 | `CleanupOrphanImagesServiceTest` (+ extra de gracia efectiva) | OK en contenido; **no protege el orden** (R2) |
| T43 | `ListContactMessagesServiceTest` (+ página vacía) | OK |
| T45 | `LogAuditLogTest` (2 tests; el segundo es el que realmente muerde) | OK |
| T47 | `AuditEventTest` (4 + extra de fábricas) | OK |
| T48 | `LogAuditLogTest.aSuccessIsInfoAndAFailureIsWarn…` | OK (nivel, orden, MDC) |
| T49 | `AdminAuditLogTest.theFullAdminFlow…` | OK (12 pasos, línea exacta, nivel, IP, `request_id` = cabecera y presente en access, sin líneas de más) |
| T50 | `SensitiveDataNotLoggedTest.theFullAdminFlow…` | OK (volcado de mensaje, parámetros, MDC y traza; no vacío) |
| T52 | `AdminAuditLogTest.readsOf…` | OK |
| T54 | `ArchitectureTest.onlyTheAuditAdapterImplementsAuditLog…` + `theRequestContextHandlerLivesInConfig` | OK, con aserciones anti falso positivo |

Criterios A7–A9: cubiertos por los Tn anteriores. Hueco menor (no bloqueante): T49/T50 por HTTP no recorren los fallos de seguridad (bloqueado, rate-limited, contraseña débil/incorrecta); solo los cubren las pruebas unitarias y mi prueba real, que sí los vio.

## (1) Capas
- `application` sin frameworks: `AuditEvent`/`AuditAction`/`AuditOutcome`/`AuditLog` solo usan `java.*`; `ArchitectureTest` sigue aplicando la regla de capas y la nueva (solo `adapter.out.audit` implementa `AuditLog`; `application` no depende de ese paquete). Sin hallazgos.
- Cableado solo en `UseCaseConfig.java` (9 productores con `AuditLog` inyectado); `LogAuditLog` es `@ApplicationScoped` en `adapter.out.audit`. Sin hallazgos.

## (2) Un evento por acción en todos los caminos (leído línea a línea y probado en real)
Login (rate-limited, sin cuenta, bloqueada, mala, ok, rehash), cambio de contraseña (bloqueada, actual incorrecta, débil, ok; sin cuenta = `AdminUnauthorizedException`, sin evento, fuera de la tabla), logout-all, guardado/rollback (solo éxito; inválido, paridad, conflicto, not-found, inexistente: ninguno), subida/borrado (solo éxito), limpieza (un solo `record` por rama: ensayo `would_delete`, real `deleted`; gracia efectiva), mensajes (una vez por llamada, también página vacía). Sin dobles eventos. Lecturas sin audit. Nombres, outcome, campos y niveles coinciden con §4.2 (los detalles van ordenados por clave, desviación declarada y aceptable).

## (3) Limitación declarada: `CONTENT_SAVED` tras releer → debe corregirse (R1)
No es aceptable como está. Un guardado es la acción administrativa más sensible del slug y el audit existe justo para que «se publicó» quede registrado; hoy, si `ContentRequests.load` lanza después de `versions.publish` (un fallo transitorio de BD justo tras el commit), la petición da 500 y **no queda constancia de un cambio de contenido que sí se aplicó y que la caché ya sirve**. Además es una asimetría con `RollbackContentService`, que registra antes de releer y por eso no tiene el problema (y su test lo cubre: «…EvenIfTheCacheFails»). La corrección es barata y no cambia el comportamiento funcional: emitir el evento inmediatamente después de invalidar la caché y antes de la relectura, y si las versiones resultantes no se conocen sin releer, hacer la relectura «mejor esfuerzo» para los campos `es_version`/`en_version` (si falla, emitir con `kind`, `comment_present`, `comment_length` y sin versiones, y relanzar la excepción original); o, alternativa más simple, no relacionar las versiones con la relectura (`es_base`/`en_base` ya son conocidos). Requiere un test nuevo: repositorio cuya lectura falla tras `publish` ⇒ una línea `CONTENT_SAVED` y la excepción se propaga.
- `application/src/main/java/dev/julioflores/cv/application/service/SaveEditableContentService.java:66-74`.

## (4) Log forging
`AuditEvent.java:55-82` y `AuditEventTest`: `\r\n`, tabuladores, NUL, ESC, NEL, U+2028/2029 y comillas quedan neutralizados (espacios y separadores pasan a `_`, claves solo `[A-Za-z0-9_.-]`, claves nulas/en blanco descartadas, valor nulo = vacío, truncado a 120 sin media pareja suplente, `%` no se interpreta). En real: el comentario con `\r\nINJECT action=LOGIN_SUCCESS` no llegó a ningún registro. Además, ningún valor de texto libre llega a un evento (`kind`, `lang`, `id`, `key` están validados antes). Observación fuera de alcance: los caracteres de formato Unicode (`Cf`, p. ej. U+202E o U+200B) no se sustituyen; no permiten forjar líneas y no hay ruta de texto libre, así que no bloquea.

## (5) Privacidad
Sin hallazgos: 0 canarios en tests y en la prueba real (ver arriba); `client_ip` solo en admin y solo válida; no hay MDC nuevo salvo el de logging-core. El único `System.err` del adaptador escribe solo el nombre de clase.

## (6) Comportamiento funcional y contratos
Los diffs de los nueve servicios solo añaden `AuditLog` por constructor y las llamadas `record`; los refactors (`graceHours`, `retryAfter`, variable `session`, `saved`) son equivalentes. `OpenApiDocumentTest` y `ProblemCatalogTest` verdes. Sin hallazgos.

## (7) Duplicación / código muerto / secretos
Sin secretos ni datos reales (canarios ficticios). Sin código muerto. Nit no accionable: `AuditEvent.value()` repite `c == ' '` (U+00A0 escrito como literal) tras `Character.isSpaceChar`, que ya lo cubre; no afecta.

## Skills consultadas
- `simplify`: sin hallazgos de reutilización/simplificación en el diff del slug (el `record()` privado de `CleanupOrphanImagesService.java:67` y `ListContactMessagesService.java:39` evita duplicación). Nit ya mencionado en (7), no accionable.
- `strict-typing`: sin hallazgos (Java tipado; `Map<String,String>` explícito, sin `Object` salvo `Object...` deliberado en las fábricas de `AuditEvent.java:46-60`, convertido con `String.valueOf`).
- `testing-strategy`: el cambio se centra en tests: ver R2 (`DeleteImageServiceTest.java:73`, `CleanupOrphanImagesServiceTest.java:117`, `LoginAdminServiceTest.java:127-177`, `ChangeAdminPasswordServiceTest`) y el hueco menor de T49/T50 sobre fallos de seguridad por HTTP.
- `next-best-practices`, `seo-audit`, `ui-ux-pro-max`: no aplican (API Quarkus, sin UI ni metadata).

## Checkpoints
`CHECKPOINTS.md` es del repo `cv-web` y no aplica a este slug de API; equivalentes de `CLAUDE.md` de `cv`: capas/ArchUnit OK, un caso de uso = una interfaz OK, cableado solo en `UseCaseConfig` OK, cobertura ≥90/80 OK, datos ficticios OK, sin Co-Authored-By en el repo (no hay commit).

## Cambios requeridos (ronda 1; resueltos en la ronda 2)
**R1. `CONTENT_SAVED` no debe depender de la relectura.** `SaveEditableContentService.java:66-74`. Emitir el evento aunque `ContentRequests.load` falle (con las versiones solo si se pudieron leer) y relanzar la excepción original; añadir el test que lo prueba (lectura fallida tras `publish` ⇒ una línea `CONTENT_SAVED`, excepción propagada, sin versiones o con ellas según se decida).

**R2. Tests que protejan «éxito después de la operación» en cuatro servicios** (mutantes supervivientes; el requisito del brief y de §2.3 hoy solo se garantiza para guardado y subida):
- `DeleteImageService.java:37-38`: añadir un test en el que `storage.delete` falle tras comprobar que existe y no está en uso ⇒ `audit.events` vacío (el test actual `inUseMissingMalformedAndFailingDeletionsRecordNothing`, `DeleteImageServiceTest.java:73`, hace fallar el storage antes y no detecta mover el `record` antes de `Storage.run(delete)`).
- `CleanupOrphanImagesService.java:56-63`: test con `storage.deleteAll` fallando (ahora solo se prueba el fallo de `list`, `CleanupOrphanImagesServiceTest.java:117`) ⇒ sin evento de limpieza real.
- `LoginAdminService.java:79-85`: test con `accounts.recordSuccess()` (o `issuer.issue`) lanzando ⇒ ningún `LOGIN_SUCCESS`.
- `ChangeAdminPasswordService.java:62-65`: test con `accounts.changePassword` (o `issuer.issue`) lanzando ⇒ ningún `PASSWORD_CHANGED`.
Tras añadirlos, repetir los mutantes «before_*» de esta tabla: deben caer.

## Observaciones fuera de alcance
- Limpieza real con fallo parcial: si `deleteAll` falla en un lote posterior al primero, ya se borraron objetos y no hay audit (`CleanupOrphanImagesService.java:58-63`). Hoy es coherente con «éxito tras la operación»; si se quisiera rastro de los parciales, sería un evento de fallo nuevo (decisión de producto; fuera de la tabla §4.2).
- `LOGIN_FAILED` / `PASSWORD_CHANGE_FAILED` se emiten tras `recordFailure`: si esa escritura falla, no hay audit del intento; improbable y el 500 queda en access (riesgo 14 del plan ya documentado).
- `LogAuditLog` captura `RuntimeException`, no `Error`; correcto para el contrato.
- El audit de `cv-web` → API sale con `ip=-` hasta que el panel envíe `X-Client-IP` (riesgo 1 del plan, ya anotado por el implementer).
- Una limpieza real con `deleted>0` no se vio en el jar (la gracia mínima es 1 h); la cubren T42 y T49 con el reloj adelantado.

---

# Ronda 2 — verificación de R1 y R2

## Veredicto: APPROVED. Cambios requeridos: ninguno.

- **R1 (resuelto)** `SaveEditableContentService.java:63-84`: tras `publish` e invalidar, la relectura va en `try`; si lanza, se emite `CONTENT_SAVED` con `kind`, `comment_present`, `comment_length` (sin versiones) y se relanza la excepción original; si no, el evento lleva además `es_version`/`en_version`. Un solo evento por camino. Test: `SaveEditableContentServiceTest.aFailingReadAfterPublishingStillRecordsTheSaveWithoutVersionsAndRethrows`; `RollbackContentServiceTest.aFailingReadAfterActivatingStillRecordsTheRollbackAndRethrows` fija que el rollback ya emitía antes de releer.
- **R2 (resuelto)** los cuatro tests existen y hacen lo que dicen: `DeleteImageServiceTest.ifTheStorageFailsWhileDeletingAfterTheChecksNothingIsRecorded`, `CleanupOrphanImagesServiceTest.ifDeleteAllFailsNoCleanupIsRecorded`, `LoginAdminServiceTest.ifRecordingTheSuccessOrIssuingTheTokenFailsNoLoginSuccessIsRecorded`, `ChangeAdminPasswordServiceTest.ifStoringTheNewPasswordOrIssuingTheTokenFailsNoPasswordChangedIsRecorded` (soporte `ImageFakes.Storage.failOnDelete`, que solo hace fallar `delete`/`deleteAll`).
- **Mutantes sobre una copia (fuentes tocadas para forzar recompilación)**: ahora caen todos los «éxito antes de la operación»: before_delete (nuevo test de borrado), before_login (nuevo de login), before_password (nuevo de contraseña), before_cleanup (nuevo de limpieza), before_save (T38/T49 y el test de R1), before_upload (T40). Siguen cayendo «registrar el comentario» (T38, T49, T50) y «`LogAuditLog` propaga» (`aLoggerThatThrowsIsSwallowedByTheAdapter`). Recorrida la lectura de los nueve servicios: ningún éxito se emite antes de la operación (login e `issue` tras `recordSuccess`/rehash; contraseña tras `changePassword`+`issue`; logout-all tras `invalidateSessions`; rollback tras `activate`+invalidación; subida tras `put`; borrado tras `delete`; limpieza real tras `deleteAll`; ensayo sin escritura; mensajes tras la lectura).
- `mvn -B verify`: BUILD SUCCESS, 593 de 593 (46 domain + 153 application + 389 infrastructure); `ci-summary.py --min-total 90 --min-module 80` rc=0, total 96,3 %.
- Estabilidad: las 14 clases de audit (87 + 25 = 112 tests) ×10 sobre una copia: **10/10 verdes**. Sobre `Port already bound: 8081`: es un puerto fijo de los `@QuarkusTest` del módulo, así que dos Maven simultáneos en la misma máquina chocan; no es una carrera interna (un solo Maven con las clases en serie, 10 ejecuciones y 1 verify completo sin ese fallo; yo mismo ejecuté los lotes en serie por eso). Recomendación operativa, no bloqueante: no lanzar dos builds a la vez.
- Real (jar de producción, JSON, Postgres+MinIO en Docker, `CF-Connecting-IP`): 36 peticiones, 56 líneas todas JSON válido, **20 líneas audit para las 20 peticiones auditables** (una por petición, `request_id` = cabecera de respuesta, IP enviada, nivel INFO/WARN, campos de §4.2, `CONTENT_SAVED` con `es_version`/`en_version`), 0 audit en lecturas/409/422/404/400/401, `ip=-` sin IP o con IP inválida, y **0 canarios** (contraseñas, 3 JWT, `$argon2`, `Bearer`, `eyJ`, comentario con inyección, título, contacto, `IPHASH`).
- Limpieza: jar, contenedores `rv-pg`/`rv-minio` y Ryuk parados y borrados.

Skills consultadas (ronda 2): `simplify` sin hallazgos (el `try/catch` de R1 duplica dos líneas de `record` pero evita relectura doble y es legible); `strict-typing` sin hallazgos; `testing-strategy` sin hallazgos (los cuatro mutantes supervivientes ya caen).
