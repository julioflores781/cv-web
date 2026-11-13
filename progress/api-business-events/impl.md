# impl — api-business-events

Estado: **HECHO** (T56–T61 y T64 + extras). Repo `cv`, solo working tree (sin git de escritura). Sin cambios de comportamiento de contacto ni de caché; solo logs.

Verificación: `mvn -B verify` OK (611 pruebas, 0 fallos; 407 en `infrastructure`); `python3 scripts/ci-summary.py --min-total 90 --min-module 80` OK (total 96,4 %; application 99,0 %; domain 94,2 %; infrastructure 95,3 %). Estabilidad: las 4 clases de eventos (ContactMessagesResourceTest, PostgresContactMessageRepositoryTest, TelegramNotifierLoggingTest, ContentCacheInvalidationTest) ejecutadas **10 veces seguidas** (arranque de Quarkus cada vez): 10/10 verdes. Sin sleeps fijos: el callback de Telegram se espera con `LogRecords.await` (polling 10 ms) y el access log con `awaitAccessLine`.

## Mapa Tn -> test (`cv/infrastructure/src/test/java/dev/julioflores/cv/infrastructure/`)
| Tn | Test | Archivo |
|---|---|---|
| T56 | `aValidMessageLeavesOneStoredLineWithTheRequestIdAndNoPersonalData` (id == fila; sin nombre, correo, cuerpo ni IP) | `ContactMessagesResourceTest` |
| T57 | `theHoneypotAnswers201AndLeavesNeitherAStoredLineNorATelegramOne` | `ContactMessagesResourceTest` |
| T58 | `anExhaustedQuotaAnswers429WithTheCodeInTheAccessLineAndNoStoredLine` | `ContactMessagesResourceTest` |
| T59 | `anInvalidMessageAnswers400AndLeavesNoStoredLine` | `ContactMessagesResourceTest` |
| T60 | `a200Leaves...` (INFO sent + request_id en el hilo del callback), `a401And500...` (WARN solo con el código), `aDownServer...` (solo la clase), `aMalformedUrl...`, `withoutConfigurationOnlyADebugLine...` (solo DEBUG, nada enviado); token `CANARY-BOT` nunca en el volcado | `adapter/out/TelegramNotifierLoggingTest` |
| T61 | `aSaveLeavesOneInvalidationLinePerLanguageWithTheRequestId` (2), `aRollbackLeavesExactlyOneInvalidationLine` (1), `whenTheInvalidatorFailsTheExistingWarnsStayAndCarryTheRequestId` (WARN existente) | `ContentCacheInvalidationTest` |
| T64 | `theLoggedIdIsTheOneOfTheStoredRowAndNothingElseIsLogged` | `adapter/out/PostgresContactMessageRepositoryTest` |

## Criterios -> tests
- **A11** (contacto, Telegram e invalidación dejan INFO con solo ids; honeypot/rechazos sin «stored»): T56–T61, T64.
- **A8** (sin datos personales ni token): T56 (volcado sin nombre/correo/cuerpo/IP), T60 (`assertNoLeak`: sin `CANARY-BOT`, nombre, correo, cuerpo, `127.0.0.1`, `http://`, `sendMessage`), T64.
- **A4** (request_id en hilos de trabajo): T60 (callback en hilo de `HttpClient`/ForkJoinPool) y la hipótesis 7 (ver abajo).

## Tests extra fuera del plan
- `PostgresContactMessageRepositoryTest.twoSavesLogTheirOwnDistinctIds` y `aFailedInsertStillThrowsAndLogsNoStoredLine` (el fallo se sigue propagando y no deja «stored»).
- `TelegramNotifierLoggingTest.eachCallbackCarriesItsOwnRequestIdAndLeavesNoneBehind` (5 envíos seguidos, cada uno con su id) y `withoutARequestIdTheCallbackLineHasNone`.
- `ContentCacheInvalidationTest.aRejectedSaveLeavesNoInvalidationLine` (409 de versión: sin línea).
- `LogRecords` pasó a `public` (con sus métodos) porque T60 debe estar en el paquete `adapter.out`.

## Cambios en main
- `PostgresContactMessageRepository`: INSERT con `RETURNING id` y `LOG.infof("Contact message stored id=%d")`.
- `TelegramContactNotifier`: INFO `Telegram notification sent`; copia del MDC (`org.jboss.logging.MDC.getMap()`) antes de `sendAsync`, restaurado en el callback y limpiado en `finally` (el hilo es de un pool; se repone lo que tuviera). El WARN de fallo ahora desenvuelve `CompletionException` y loguea la clase de la causa (`ConnectException`, no `CompletionException`). Siguen sin URL ni token. Sin configurar: solo DEBUG.
- `PostgresSiteContentRepository.invalidate`: INFO `Content cache invalidated kind=… lang=…`.

## Hipótesis 7 (`System.Logger` de `application` y MDC): CONFIRMADA, no hizo falta cambiar nada
Los `System.Logger` de `SaveEditableContentService` y `RollbackContentService` los enruta el LogManager de JBoss y **sí** llevan `request_id` (el MDC se lee del mismo hilo). Probado en T61 con un invalidador que falla (subclase de `PostgresSiteContentRepository` instalada con `QuarkusMock`): `WARN [cc-…] d.j.c.a.s.SaveEditableContentService Saved services/es but could not invalidate its cache; it expires with its TTL: java.lang.IllegalStateException: …` con el `request_id` de la petición. No se tocó el puerto ni se importó ningún framework en `application`.

## Decisiones
1. Sin puerto ni evento nuevo en `application`: los logs de negocio están en los adaptadores, como pide el plan (§2.4).
2. El honeypot no deja rastro (decisión del plan, riesgo 11); T57 lo cubre.
3. Los WARN de invalidación fallida se conservan tal cual (con la excepción adjunta, como antes): el invalidador es en memoria y no lanza SQL.

## Ejemplos reales (jar de producción, JSON; Postgres en Docker; Telegram falso en 127.0.0.1 vía `CV_CONTACT_TELEGRAM_API_URL`; token `CANARY-BOT`)
```
{"…","logger":"…PostgresContactMessageRepository","level":"INFO","message":"Contact message stored id=1","threadName":"executor-thread-1","request_id":"real-valid-0001","service":"cv-api"}
{"…","logger":"access","message":"POST /api/v1/contact/messages 201 183ms 0b rid=real-valid-0001 err=- ip=-",…}
{"…","logger":"…TelegramContactNotifier","level":"INFO","message":"Telegram notification sent","threadName":"ForkJoinPool.commonPool-worker-1","request_id":"real-valid-0001","service":"cv-api"}
honeypot:  access 201 rid=real-honey-0001 (sin «stored» ni Telegram)
400:       access POST … 400 rid=real-invalid-0001 err=CONTACT_INVALID (sin «stored»)
429:       access POST … 429 rid=real-limit-0001 err=CONTACT_RATE_LIMITED (sin «stored»)
PUT admin: INFO …PostgresSiteContentRepository "Content cache invalidated kind=services lang=es" / "lang=en" (request_id real-save-0001, client_ip 203.0.113.9), luego audit CONTENT_SAVED
Rollback:  una sola línea "kind=services lang=es" (request_id real-roll-0001)
```
Resultado: 5 «stored» (los 5 envíos válidos) y el servidor falso de Telegram recibió 5 llamadas; el honeypot, el 400 y el 429 no dejaron «stored» ni llamada. El callback corre en `ForkJoinPool.commonPool-worker-1` y lleva el `request_id` original. Canarios buscados en TODA la salida de consola (nombre, correo, mensaje, token `CANARY-BOT`, chat id, sal, IP `198.51.100.x`, URL del honeypot, `sendMessage`): **0 apariciones**. Solo hay 2 WARN de arranque previos (claves de configuración no reconocidas de Quarkus, ya existentes). Postgres y servidores falsos retirados al acabar. Token admin forjado con HS256 con el secreto de prueba (la contraseña real es de terminal).

## Límites
- El WARN de invalidación fallida adjunta la excepción (traza completa); es el comportamiento previo y el invalidador actual no lanza SQL, pero un invalidador futuro con BD debería pasar por `ErrorLogDescription`.
- Varias invalidaciones sin petición (arranque, helpers de test, `ContentVersions.restore`) salen sin `request_id`, como corresponde.
- Un `X-Request-Id` válido lo puede fijar el cliente (riesgo ya aceptado en el plan).
- Instancia única de API; el MDC del callback depende de `org.jboss.logging.MDC` (el mismo que usa el LogManager).
- No se probó contra la API real de Telegram (solo servidor falso).
