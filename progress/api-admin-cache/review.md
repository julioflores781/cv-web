# Review api-admin-cache (ronda 1)

## Veredicto final (ronda 2): APPROVED

Ver «Ronda 2» al final. La ronda 1 (CHANGES REQUESTED, CR-1..CR-3) queda abajo como historial.

La época por clave es atómica en lo esencial y T113-T115 son deterministas, pero queda una carrera que rompe la regla explícita «la clave recién invalidada propaga el error», y un hueco de pruebas (la mutación «invalidar sube la época de todas las claves» sobrevive).

## Verificado por mí
- `mvn -B verify`: BUILD SUCCESS (199 tests de infrastructure). `ci-summary.py --min-total 90 --min-module 80`: 275/275, total 95,7 %, application 100 %, domain 91,1 %, infrastructure 95,6 %; umbrales OK. ArchUnit (`ArchitectureTest`) verde.
- Concurrencia: `PostgresSiteContentRepositoryTest` + `ContentCacheInvalidationTest` ejecutados 20 veces seguidas: 20/20 verdes. Los tests usan latches (`queried`/`release` sobre el cierre de la conexión), sin `sleep`; el único temporizador es un timeout de 10 s como red de seguridad.
- Mutaciones (código restaurado y comparado byte a byte):
  - M1 `cache.compute(... epoch ...)` -> `cache.put`: T113 FALLA (`:189 expected "Servicio nuevo" but was "Servicio de ejemplo"`). Bien.
  - M2 `invalidate` sin `cache.remove`: fallan T115, T114 y el extra de TTL. Bien.
  - M3 `invalidate` sube la época de TODAS las claves (`epochs.values().forEach(...)`): **sobrevive, 11/11 verdes**. Ver CR-2.
- TTL: `cv.resume.cache-ttl=PT5M` y `cv.content.cache-ttl=PT5M` sin cambios (el diff de `application.properties` solo añade bloque admin del slug auth). `NOT_FOUND_TTL_NANOS` y `ttlNanos` intactos.
- Atomicidad: `store` usa `cache.compute` y `invalidate` hace `incrementAndGet` y luego `remove` sobre el mismo `ConcurrentHashMap`; cualquier intercalado de «comprobar época + guardar» frente a «subir época + borrar» acaba sin valor viejo cacheado (si compute va primero, remove lo borra; si la época sube primero, compute conserva `current` y remove lo borra). OK.
- Memoria: `cache`, `locks` y `epochs` están indexados por `Key(kind, lang)`; con los 3 kinds reales son 6 entradas. Ver OF-1.
- En vivo: levanté el jar contra Postgres 18 de Docker; mi comprobación quedó **inconclusa** (el sample no se vio como activo en `/services` tras cargarlo con psql, solo comprobé que la API responde 200 con la BD parada tras haber servido `[]`). No añado evidencia propia sobre «sin invalidar se ve lo viejo / tras invalidar lo nuevo» fuera de los `@QuarkusTest`, que sí la dan (HTTP + BD real + puerto inyectado). Contenedor, proceso y puerto limpiados.

## Trazabilidad Tn <-> test
| Tn | Test | ¿Hace lo que dice? |
|---|---|---|
| T113 | `PostgresSiteContentRepositoryTest.aSlowReadStartedBeforeTheInvalidationDoesNotPutTheOldContentBack` (:171-194) | Sí: la lectura consulta, espera, se publica e invalida, se libera; devuelve lo viejo a su solicitante, la siguiente ve lo nuevo y queda cacheado (2 conexiones). Falla sin el chequeo de época. |
| T114 | `...whenTheDatabaseFailsRightAfterAnInvalidationOnlyThatKeyFails` (:197-208) | Sí (TTL 0): clave invalidada con BD caída lanza; EN sigue sirviendo lo último leído. |
| T115 | `...invalidatingOneKeyLeavesTheOthersCached` (:211-226) | Sí, pero solo para claves ya cacheadas; no cubre épocas de claves con lectura en vuelo (CR-2). |
| T111 (parcial) | `ContentCacheInvalidationTest` (:21-36) | Sí: sin invalidar lo viejo, tras invalidar lo nuevo, por HTTP; restaura BD e invalida en `finally`. |
T112 y T111 «guardado real», T22/T26: pendientes en `api-admin-content`, como declara el plan.

## Criterios <-> tests
CA13 (parte de este slug): T111 parcial, T113, T114, T115 + extras. El resto de CA13 queda para el slug siguiente.

## Privacidad
Sin datos personales en el diff; los tests usan el sample ficticio.

## Skills consultadas
- `simplify`: `PostgresSiteContentRepository.java:89-92` (ver CR-1); imports desordenados en el test (CR-3). Sin más duplicación; `ContentVersions` es utilidad de test con un solo uso por kind, aceptable.
- `strict-typing`: sin hallazgos (sin `Object`/raw salvo el `Object` de candados preexistente).
- `testing-strategy`: `PostgresSiteContentRepositoryTest.java:211-226` (CR-2, mutación M3 sobrevive).
- `next-best-practices`, `seo-audit`, `ui-ux-pro-max`: no aplican (repo Java, sin UI/SEO).

## Capas / código muerto
`ContentCacheInvalidator` vive en `application/port/out`, sin imports de framework; la implementación está en el adaptador. ArchUnit verde. El puerto no tiene consumidor aún: justificado por el plan (§7/§14: `SaveEditableContentService`/`RollbackContentService` en `api-admin-content`) y ejercitado por tests. `UseCaseConfig` no cambia en este slug (el diff de ese archivo es del slug auth): coherente, el adaptador se inyecta por tipo.

## Cambios requeridos
- **CR-1 (carrera, resiliencia)** `infrastructure/.../postgres/PostgresSiteContentRepository.java:89-91`. `cached = cache.get(key)` (:89) se lee ANTES de capturar la época (`long epoch = epoch(key).get()`, :91). Si `invalidate` ocurre entre ambas líneas (sube la época y borra la entrada) y la BD falla al refrescar, `refresh` devuelve `stale` (el valor viejo ya invalidado) y `store` lo acepta porque la época capturada ya es la nueva: se repone el contenido viejo con TTL completo, en vez de propagar el error como exige el plan §7 («la clave recién invalidada propaga el error») y el brief. Arreglo: capturar la época antes de leer `cache.get` (p. ej. al entrar al bloque sincronizado, o antes del `cache.get` de :89), de modo que cualquier invalidación posterior descarte tanto el resultado como el stale. Añadir un test determinista (latch o proxy que dispare `invalidate` entre la lectura del stale y la consulta fallida) que lo demuestre.
- **CR-2 (hueco de pruebas)** `PostgresSiteContentRepositoryTest.java` (T115, :211-226). La mutación «`invalidate` sube la época de todas las claves» sobrevive. Falta un test «invalidar la clave A mientras una lectura lenta de la clave B está en vuelo: B SÍ se cachea» (mismo patrón de latches que T113, con `services/EN` o `projects/ES` en vuelo e invalidando `services/ES`). Lo pide el brief («invalidar una clave no toca las demás»).
- **CR-3 (estilo)** `PostgresSiteContentRepositoryTest.java:16-21`: imports fuera de orden (`java.util.concurrent.*`, `java.util.List`, `dev.julioflores...` intercalados entre `java.*`). Ordenarlos como el resto del repo.

## Observaciones fuera de alcance
- OF-1: `invalidate(String kind, ...)` acepta cualquier `kind`; un llamador con kinds arbitrarios haría crecer `epochs` (y `locks`, ya preexistente) sin cota. Hoy solo hay 3 kinds conocidos; `api-admin-content` debe pasar solo valores validados (o el puerto/adaptador rechazar kinds no soportados).
- OF-2: `impl.md` indica que no se ejecutó `/simplify` ni se actualizaron `CLAUDE.md`/`ARCHITECTURE.md`; queda para `api-admin-docs-deploy`.
- OF-3: el working tree mezcla cambios de `api-admin-auth` y `api-admin-password-cli`; no revisados aquí. Solo se evaluó lo de este slug.

---

# Ronda 2: verificación de correcciones

## Veredicto: APPROVED (Cambios requeridos: vacío)

- **CR-1 corregido.** `PostgresSiteContentRepository.java:88-92`: la época se captura dentro del candado ANTES de `cache.get`; `refresh(key, stale, epoch)` (:115-124) propaga el error si la época cambió durante el refresco, y `store` descarta el resultado. Test nuevo `anInvalidationDuringAFailingRefreshPropagatesTheErrorInsteadOfServingTheOldContent` (latches sobre `getConnection`, sin sleeps). En una copia en el scratchpad (repo intacto, comprobado por diff): quitando el chequeo de época del fallback falla en `:248` («Expected ExecutionException ... nothing was thrown»).
- **CR-2 corregido.** `invalidatingAnotherKeyWhileASlowReadIsInFlightStillCachesTheRead`: la mutación «`invalidate` sube la época de todas las claves» ahora falla (`:269 expected <1> but was <2>`).
- **CR-3 corregido.** Imports de `PostgresSiteContentRepositoryTest` ordenados (`:11-29`).
- **T113 sigue matando la mutación** `cache.put` (`:208`).
- `mvn -B verify`: BUILD SUCCESS, 201 tests de infrastructure; `ci-summary.py --min-total 90 --min-module 80`: 277/277, total 95,7 %, application 100 %, domain 91,1 %, infrastructure 95,6 %, umbrales OK.
- Concurrencia: `PostgresSiteContentRepositoryTest` + `ContentCacheInvalidationTest` 20/20 verdes seguidas.
- Resiliencia: `servesTheLastContentWhenTheDatabaseFailsAfterExpiry` y T114 verdes (BD caída sirve lo último leído en claves no invalidadas; la invalidada propaga el error). TTL y `cv.resume.cache-ttl` intactos.
- Limpieza: copia de mutación borrada, ningún contenedor ni proceso de la revisión queda.

## Observación (no bloqueante)
- OF-4: la ventana exacta entre `cache.get` y la captura de época (el orden antiguo) no tiene test propio: invertir esas dos líneas (mutación «época después de leer») sobrevive, porque cubrirlo exige un gancho entre dos sentencias consecutivas. El orden actual es correcto y comentado (`:89-90`); el test nuevo cubre la variante observable (invalidación durante el refresco). Se acepta como límite de lo comprobable de forma determinista.
- OF-1 a OF-3 de la ronda 1 siguen vigentes.
