# api-admin-cache: implementación

Repo `cv`, sin git de escritura (cambios en el working tree). `mvn -B verify` OK (199 tests de infrastructure; 275 en total según ci-summary) y `ci-summary.py --min-total 90 --min-module 80` OK: total 95,7 %, application 100 %, domain 91,1 %, infrastructure 95,6 %.

## Código
- `application/.../port/out/ContentCacheInvalidator.java`: `invalidate(String kind, Language language)`.
- `infrastructure/.../postgres/PostgresSiteContentRepository.java`: implementa el puerto. Mapa `epochs` (AtomicLong por clave). `invalidate` incrementa la época y elimina la entrada. El refresco anota la época antes de consultar y guarda con `cache.compute(...)` solo si la época sigue igual (atómico frente a `remove`). Si cambió, devuelve lo leído a quien lo pidió pero no lo cachea. La resiliencia no cambia (stale servido si la BD cae; clave recién invalidada sin stale propaga el error). TTL y `cv.resume.cache-ttl` intactos.
- Cableado: el adaptador es `@ApplicationScoped` y se inyecta por tipo `ContentCacheInvalidator`. No hay aún ningún caso de uso que lo consuma, así que `UseCaseConfig` no cambia en este slug; `api-admin-content` lo pasará a `SaveEditableContentService`/`RollbackContentService` en ese archivo. Sin endpoints nuevos.

## Tn -> test
| Tn | Test |
|---|---|
| T113 | `PostgresSiteContentRepositoryTest.aSlowReadStartedBeforeTheInvalidationDoesNotPutTheOldContentBack` (latches sobre el cierre de la conexión: la lectura consultó la BD y espera; se publica versión nueva, se invalida, se libera; la lectura lenta devuelve lo viejo, la siguiente ve lo nuevo y queda cacheado: 2 conexiones). Comprobado por mutación: con `cache.put` plano el test falla. |
| T114 | `...whenTheDatabaseFailsRightAfterAnInvalidationOnlyThatKeyFails` |
| T115 | `...invalidatingOneKeyLeavesTheOthersCached` |
| T111 (parcial) | `ContentCacheInvalidationTest.aNewActiveVersionShowsUpOnTheNextPublicReadOnlyAfterInvalidating` (GET `/api/v1/services` por HTTP: sin invalidar se ve lo viejo, tras invalidar lo nuevo). |

Quedan para `api-admin-content`: T111 en su parte «guardado real» y T112 completo (rollback), que dependen de `SaveEditableContentService`/`RollbackContentService`.

## Criterio -> tests
CA13 (parte de este slug: el cambio se ve sin esperar el TTL y sin romper la resiliencia): T111 parcial, T113, T114, T115 + extras. El resto de CA13 (T22, T26, T112) depende de api-admin-content.

## Extras fuera del plan
- `PostgresSiteContentRepositoryTest.anInvalidationExposesANewVersionThatTheTtlWouldHide`: sin invalidar sigue lo viejo (TTL), tras invalidar lo nuevo.
- `...invalidatingAKeyNeverReadIsHarmless`.
- Utilidad de test `infrastructure/src/test/.../ContentVersions.java` (publicar/revertir una versión de servicios por SQL, restaurando la BD).

## Prueba en vivo
- Jar de producción (`quarkus-run.jar`) contra un Postgres 18 de Docker con el sample cargado: `GET /api/v1/services?lang=es` devolvió «Servicio de ejemplo»; tras insertar por SQL una versión activa nueva («NUEVA») la API siguió sirviendo la vieja (TTL 5 min). Confirmado.
- La mitad «tras invalidar se ve la nueva» no se ejecutó contra ese proceso suelto: sin endpoints no hay cómo invocar el puerto desde fuera. Se cubre dentro de la app real arrancada por `@QuarkusTest` (HTTP + BD real + puerto inyectado): `ContentCacheInvalidationTest`. No se probó `quarkus:dev` literal por la misma razón.

## Decisiones
- `kind` es `String` (no enum) para que el puerto sirva a cualquier contenido, como pide el brief; el dominio de `kind` lo fija `content_version` (CHECK).
- Un refresco que pierde la carrera devuelve igualmente lo que leyó a su solicitante (consistente con su inicio), solo evita cachearlo.
- `invalidate` no toma el candado de la clave: no se bloquea tras una lectura lenta.

## Límites
- Solo una instancia de API; con réplicas haría falta `LISTEN/NOTIFY` (mejora futura).
- Una clave recién invalidada con la BD caída propaga el error (no hay stale), como una clave nunca leída.
- No se ejecutó `/simplify` ni se actualizaron `CLAUDE.md`/`ARCHITECTURE.md` (va en `api-admin-docs-deploy`).

## Correcciones de la ronda 1 (review.md)
- **CR-1:** en `PostgresSiteContentRepository.document` la época se captura ANTES de `cache.get` (dentro del bloque sincronizado), y `refresh` recibe esa época: si la BD falla y la clave se invalidó desde entonces (`epoch(key).get() != epoch`) se propaga el error en vez de servir el stale ya invalidado (además de que `store` descarta el resultado). Test: `PostgresSiteContentRepositoryTest.anInvalidationDuringAFailingRefreshPropagatesTheErrorInsteadOfServingTheOldContent` (latches sobre `getConnection`: el refresco queda a punto de consultar con la BD caída, se invalida, se libera; lanza, y la lectura siguiente también). Comprobado: con el código anterior (sin la comprobación de época en el fallback) falla («Expected ExecutionException ... nothing was thrown»).
- **CR-2:** `...invalidatingAnotherKeyWhileASlowReadIsInFlightStillCachesTheRead` (lectura lenta de services/EN en vuelo, se invalida services/ES, B se cachea: 1 sola conexión). Comprobado: la mutación «invalidate sube la época de todas las claves» ahora FALLA (esperaba 1, fue 2).
- **CR-3:** imports de `PostgresSiteContentRepositoryTest` ordenados.
- Probe del test ampliado con una puerta en `getConnection` (`armSlowConnect`), sin sleeps.
- Verificación: `mvn -B verify` OK (201 tests de infrastructure, 277 en total), ci-summary 90/80 OK (95,7 %); los dos tests de concurrencia (`PostgresSiteContentRepositoryTest` + `ContentCacheInvalidationTest`) 20/20 verdes seguidos.
- OF-1 (kinds arbitrarios): `api-admin-content` debe pasar solo kinds validados.
