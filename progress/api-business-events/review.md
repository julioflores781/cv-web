# Review — api-business-events (ronda 1)

## Veredicto: APPROVED

Revisión independiente sobre el working tree de `cv` (solo lo de este slug: `PostgresContactMessageRepository`, `TelegramContactNotifier`, `PostgresSiteContentRepository.invalidate` y sus 4 clases de test; `api-logging-core`/`api-audit-log` no se mezclan). Sin git de escritura, sin editar código.

## Verificación ejecutada por mí
- `mvn -B verify` (Docker): exit 0, 611 pruebas, 0 fallos.
- `python3 scripts/ci-summary.py --min-total 90 --min-module 80`: 611/611, total 96,4 % (application 99,0; domain 94,2; infrastructure 95,3). OK.
- Estabilidad: `ContactMessagesResourceTest`, `PostgresContactMessageRepositoryTest`, `TelegramNotifierLoggingTest`, `ContentCacheInvalidationTest` ×10 seguidas (arranque de Quarkus cada vez): 10/10 verdes.
- Mutación sobre una copia del repo (el repo no se tocó). Todas las mutaciones fallan por el motivo correcto (leí el assert que salta):

| Mutación | Resultado | Test que la mata |
|---|---|---|
| «stored» con nombre / correo / cuerpo / senderKey (IP hash) | KILLED ×4 | `PostgresContactMessageRepositoryTest` (T64, igualdad exacta del mensaje) y T56 |
| id logueado = id+1 | KILLED | T64 |
| honeypot guarda | KILLED | T57 |
| 429 con `save` antes del cupo | KILLED | T56/T58 (cuenta de líneas «stored») |
| 400 con «stored» (save en el camino de error) | KILLED | T59 |
| callback sin restaurar MDC | KILLED | T60 (no aparece registro con el `request_id`) |
| WARN con `response.uri()` (token) | KILLED | T60 (`CANARY-BOT` y exactitud del mensaje) |
| WARN con `getMessage()` de la causa | KILLED | T60 `aDownServer…` |
| callback sin limpiar el MDC al terminar | KILLED | `withoutARequestIdTheCallbackLineHasNone` |
| sin INFO «sent» | KILLED | T60 |
| invalidación sin log / solo un idioma | KILLED ×2 | T61 |

## Prueba real (jar de producción, JSON, Postgres 16 en Docker, Telegram falso en 127.0.0.1)
- Contacto válido con `X-Request-Id: real-valid-0001`: `Contact message stored id=1` (hilo `executor-thread-1`) y `Telegram notification sent` (hilo `ForkJoinPool.commonPool-worker-1`) ambos con `request_id=real-valid-0001`; el servidor falso recibió `/botCANARY-BOT/sendMessage` (el token viaja en la URL, no en logs).
- Honeypot: 201, solo línea access; sin «stored» ni Telegram (el falso no recibió llamada). 400: `err=CONTACT_INVALID`, sin «stored». 429 (sexto envío del mismo remitente, límite 5): `err=CONTACT_RATE_LIMITED`, sin «stored». Los 5 válidos dejaron 5 «stored» con ids 2..6 y 5 llamadas a Telegram.
- Admin con `CF-Connecting-IP: 203.0.113.9` (JWT HS256 forjado con secreto de prueba): PUT → dos INFO `Content cache invalidated kind=services lang=es|en` (`request_id` y `client_ip` por MDC) + auditoría; rollback → un INFO `lang=es`.
- Canarios (nombre, correo, cuerpo, `CANARY-BOT`, chat id, sal, IPs `198.51.100.x`, URL del honeypot, contenido guardado, `sendMessage`, secreto JWT, `Bearer`) en toda la salida: 0 apariciones; la IP `203.0.113.9` solo en `client_ip`/`ip=` de rutas admin (diseño previo). Solo 2 WARN de arranque preexistentes (claves de config no reconocidas).
- Procesos (API, Telegram falso) y contenedor Postgres retirados; los contenedores de Testcontainers los recoge Ryuk (comprobado: ninguno activo).

## Trazabilidad Tn ↔ it()
| Tn | Test (archivo `cv/infrastructure/src/test/java/dev/julioflores/cv/infrastructure/…`) | Hace lo que dice |
|---|---|---|
| T56 | `ContactMessagesResourceTest.aValidMessageLeavesOneStoredLineWithTheRequestIdAndNoPersonalData` (≈l.185) | Sí: una línea INFO con `request_id`, id == fila (consulta SQL), sin nombre/correo/cuerpo/IP en el volcado |
| T57 | `…theHoneypotAnswers201AndLeavesNeitherAStoredLineNorATelegramOne` | Sí para «stored» y fila inexistente. La parte «Telegram» es vacua aquí (Telegram sin configurar en test); la cubre `SubmitContactMessageServiceTest.filledHoneypot…` (no notifica) y mi prueba real. Ver observación 1 |
| T58 | `…anExhaustedQuotaAnswers429WithTheCodeInTheAccessLineAndNoStoredLine` | Sí |
| T59 | `…anInvalidMessageAnswers400AndLeavesNoStoredLine` (l.235) | Sí |
| T60 | `adapter/out/TelegramNotifierLoggingTest` (200, 401/500, caído, URL malformada, sin configurar solo DEBUG, ids propios en 5 envíos, sin id) | Sí: servidor HTTP falso real, `assertNoLeak` (token, nombre, correo, cuerpo, host, `http://`, `sendMessage`), hilo del callback distinto del llamante |
| T61 | `ContentCacheInvalidationTest.aSaveLeaves…`, `aRollbackLeavesExactlyOneInvalidationLine`, `whenTheInvalidatorFails…`, `aRejectedSave…` | Sí: 2 por guardado en orden es/en, 1 por rollback, WARN existente de `application` intacto y con `request_id` |
| T64 | `adapter/out/PostgresContactMessageRepositoryTest.theLoggedIdIsTheOneOfTheStoredRowAndNothingElseIsLogged` (+2 extras) | Sí: id de fila por SQL; un solo registro; el fallo del INSERT sigue propagándose |

Criterios: A11 → T56–T61, T64; A8 → T56, T60, T64; A4 (callback de Telegram) → T60. Todos mapeados.

## Revisión por puntos
1. **`RETURNING id`** (`PostgresContactMessageRepository.java:23,47-50`): mismo INSERT con las mismas 4 columnas; solo cambia `executeUpdate` por `executeQuery` sobre el `RETURNING`; el límite por remitente (`senderKey` → `ip_hash`) y el flujo del servicio no se tocan (`SubmitContactMessageService` sin diff); un fallo sigue siendo `IllegalStateException` sin «stored». El id es el de la fila (T64 + prueba real).
2. **Telegram** (`TelegramContactNotifier.java:62-73,80-90`): MDC copiado antes de `sendAsync` y restaurado en el callback; el `finally` quita las claves de la petición y repone lo previo del hilo (sin fuga: la mutación sin limpieza la detecta un test; en la prueba real cada callback llevó su propio id). Funciona también si el future ya está completo y el callback corre en el hilo llamante (restaura el mismo MDC). WARN solo con código HTTP o `getSimpleName()` de la causa (se desenvuelve `CompletionException`); sin URL, token ni mensaje, incluso con excepciones cuyo mensaje trae la URL (mutación `getMessage()` detectada). Sin configurar: solo `LOG.debug` y no se envía nada.
3. **Invalidación** (`PostgresSiteContentRepository.java:115`): un INFO por `(kind, lang)` en `invalidate`; dos por guardado, uno por rollback, ninguno si el guardado se rechaza (409). Los WARN de `SaveEditableContentService`/`RollbackContentService` siguen igual y no vuelcan SQL.
4. **Hipótesis `System.Logger` + MDC**: la contrasto con mi propia prueba real: el WARN de `application` sale por el LogManager de JBoss, en el hilo de la petición, y el JSON/`LogRecords` leen el MDC de ese hilo, así que lleva `request_id`. T61 lo prueba con un invalidador que falla (`QuarkusMock`). No hace falta puerto ni importar frameworks en `application`; la solución (no tocar nada y probarlo) es la correcta y la más simple. Matiz: vale mientras `application` use `System.Logger` y la ejecución siga en el hilo de la petición (síncrona, como ahora).
5. **Capas/ArchUnit/duplicación/secretos**: `application` sin imports nuevos de framework; los logs de negocio están en adaptadores (§2.4). Sin código muerto. Sin secretos: canarios ficticios en repo público. `LogRecords` pasó a `public` (necesario por el paquete de T60; aceptable).
6. **Comportamiento funcional**: sin cambios en contacto, límite ni caché (solo logs y `RETURNING`); `ContactMessagesResourceTest` previo y 611 pruebas verdes.

## Privacidad
Sin nombre, correo, cuerpo, IP ni hash de remitente en «stored»; sin token en ningún log (ni en excepciones). Verificado en tests, mutaciones y API real.

## Skills consultadas
- `simplify`: sin hallazgos accionables (el diff de main son ~25 líneas; no hay duplicación ni abstracción de más).
- `strict-typing`: sin hallazgos (`Map<String,Object>` es el tipo de `MDC.getMap()`, no un escape).
- `testing-strategy`: sin hallazgos bloqueantes; ver observación 1 (T57/Telegram). Polling en lugar de sleeps, mutaciones y 10 repeticiones verdes.
- `next-best-practices`/`seo-audit`/`ui-ux-pro-max`: no aplican (API Quarkus, sin UI/SEO).
- `clean-ddd-hexagonal` (criterio de capas): sin hallazgos.

## Checkpoints
Los C1–C7 de `cv-web` no aplican a este repo; se aplicó `CLAUDE.md`/`ARCHITECTURE.md` de `cv`: capas y ArchUnit en verde, cobertura ≥90/80, datos ficticios, sin git de escritura.

## Cambios requeridos
Ninguno.

## Observaciones fuera de alcance / para el cierre
1. T57: la aserción «sin Telegram» en `ContactMessagesResourceTest` no puede fallar porque ahí Telegram no está configurado (nunca habría línea INFO); la garantía real está en el test unitario del servicio. Opcional endurecerlo en un slice posterior.
2. Cosmético: orden de imports en `PostgresSiteContentRepository.java:8` (`ErrorLogDescription` entre imports de `domain`) y `TelegramContactNotifier.java:13-15` (`ConcurrentHashMap` antes de `Optional`).
3. El WARN de refresco de `PostgresSiteContentRepository.java:127-130` usa `ErrorLogDescription` (viene de `api-logging-core`/`api-audit-log`, no de este slug).
4. Documentación: `CLAUDE.md`/`ARCHITECTURE.md`/`README` no mencionan aún los eventos de negocio (el plan §3 lo asigna a `docs/observability.md` y a la sección de logs, slice de docs).
5. El WARN de invalidación fallida adjunta la excepción (comportamiento previo, invalidador en memoria): un invalidador futuro con BD debería pasar por `ErrorLogDescription` (ya anotado en impl.md).
6. Riesgos aceptados en el plan: `X-Request-Id` válido fijable por el cliente; no probado contra la API real de Telegram.
