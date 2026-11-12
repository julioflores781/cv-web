# review — api-admin-password-cli

## Veredicto: APPROVED (ronda 2)

Ronda 1 pidió CHANGES (ver abajo, ya resuelto). Ronda 2: corrección verificada, sin regresión, sin cambios requeridos.

## Verificación ejecutada
- `mvn -B verify`: BUILD SUCCESS, 190 pruebas en infrastructure, 0 fallos. `ci-summary.py --min-total 90 --min-module 80`: OK (total 95,6 %, application 100 %, domain 91,1 %, infrastructure 95,4 %; paquete `tools` 86,4 %).
- Alcance: solo he revisado `tools/`, `PostgresAdminAccountRepository` (upsertPassword/unlock), `Argon2PasswordHasher` (constructor público), `scripts/admin-password.sh` y `AdminPasswordToolTest`; el resto del working tree es de api-admin-auth y no se ha mezclado.
- Docker real: imagen construida desde el `Dockerfile`, Postgres 18, API en contenedor (readiness UP, Flyway V4). `scripts/admin-password.sh` ejecutado bajo un pty real (`docker exec -it`) dentro del contenedor: classpath `app/*:lib/main/*:lib/boot/*` correcto.
  - `status` sin cuenta: "Account: none". `set-password` ok crea la cuenta; login API 200.
  - Token T1 válido (200); segundo `set-password` => T1 401, contraseña vieja 401, nueva 200, `session_version`=2.
  - 5 fallos => `status` muestra bloqueo y 5 intentos; el login con la buena durante el bloqueo no entra; `unlock` => BD `failed_attempts=0, locked_until NULL`, hash y sesión intactos; login 200 (justo tras unlock hubo 429 `ADMIN_LOGIN_RATE_LIMITED`, que es el límite por IP de 10/min de la API, no el bloqueo de cuenta; tras la ventana, 200).
  - Contraseña corta: error, nada cambia. Comando desconocido: uso y código 2. Sin TTY: error claro y código 1 (sin eco a stdin).
  - Hash en BD `$argon2id$v=19$m=65536,t=3,p=1$...`; `status` no lo muestra; `docker logs` sin rastro de las contraseñas; `/proc/1/cmdline` y argumentos sin contraseña (no existe argumento de contraseña).
  - Limpieza: contenedores `rvcli-*`, red e imagen eliminados (0 restos).

## Trazabilidad Tn ↔ it()
| Tn | Test (`AdminPasswordToolTest`) | Comprobado |
|---|---|---|
| T91 | `setPasswordWithoutAnAccountCreatesItAndTheLoginWorks` (:78) | Crea fila, `$argon2id$`, verify con el hasher, versión 1, login 200, no imprime hash ni contraseña. OK |
| T92 | `setPasswordOnAnExistingAccountChangesTheHashBumpsTheVersionAndClearsTheLock` (:93) | Hash cambia, sv 1->2, intentos 0, bloqueo NULL, token viejo 401, login nuevo 200. OK |
| T93 | `aWeakPasswordOrADifferentConfirmationFailsWithoutTouchingTheDatabase` (:115) | Corta, confirmación distinta, solo espacios; fila idéntica antes/después; sin cuenta no se crea. OK |
| T94 | `unlockClearsTheLockAndStatusReportsWithoutShowingTheHash` (:133) | Status sin hash/"argon2"; unlock limpia, no toca hash ni sv; login 200. OK |
| T95 | `unknownOrMissingArgumentsPrintTheUsageAndExitNonZero` (:162) | Sin args, desconocido, extra, mayúsculas, `--password=`: código 2 y uso. OK |

Criterios: CA4 (T91-T93, más prueba real del token), CA3 (T94 + prueba real de 5 fallos/unlock), CA25 (T91, T95 + revisión: sin argumento de contraseña, sin secretos en el repo/script). Cubiertos.

## Revisión de requisitos
- Sin duplicar: usa `Argon2PasswordHasher` (constructor hecho público, `Argon2PasswordHasher.java:43`), `AdminPasswordPolicy.isAcceptable` (`AdminPasswordTool.java:188`) y `PostgresAdminAccountRepository`. Parámetros Argon2 desde `application.properties` + env, sin segunda fuente de verdad. OK.
- Sin eco / nunca por argumento: `console.readPassword` (`AdminPasswordTool.java:87`); sin consola se niega (`:174`); `parse` exige exactamente 1 argumento. El `char[]` se pone a cero (`:206`). OK.
- Upsert y `unlock` en una sola sentencia (`PostgresAdminAccountRepository.java:31-34, 36`): sube `session_version`, limpia intentos/bloqueo, fija `password_changed_at`. OK.
- Script: `set -euo pipefail`, variables entrecomilladas, `"$@"`, `exec`, sin secretos. `-it` fijo, aceptable y documentado. shellcheck no disponible; leído a mano: sin hallazgos.
- Puerto `AdminAccountRepository` no ampliado; ArchUnit verde.

## Skills consultadas
- `simplify`: sin hallazgos accionables (`AdminPasswordTool.java` es compacto; los métodos extra del repositorio están justificados fuera del puerto).
- `strict-typing`: sin hallazgos (sin raw types; `PasswordReader` tipada).
- `security-best-practices`: ver cambio requerido 1. Nit no bloqueante en observaciones.
- `testing-strategy`: el cableado de `main` solo se cubre en el contenedor (86,4 % en `tools`), aceptable; falta el test del cambio requerido 1.

## Cambios requeridos
Vacío en ronda 2. (Ronda 1, resuelto en `AdminPasswordTool.java:98-101,118-121,182-185`:)
1. **Fuga de la URL JDBC (posibles credenciales) en un stack trace.** `AdminPasswordTool.java:109` (`dataSource.setUrl(url)`) lanza `IllegalArgumentException("URL invalid <url completa>")` si la URL no es válida, y `main` solo captura `IllegalStateException` (`:91`). Reproducido en el contenedor: con `QUARKUS_DATASOURCE_JDBC_URL='jdbc:postgresql://rvcli-pg:5432/cv?user=postgres&password=SECRETXYZ&bad=%zz'` imprime la traza con `password=SECRETXYZ`; con `mysql://x` también traza y la URL. Incumple "errores sin filtrar credenciales de BD" y "sin traza". Corrige envolviendo `setUrl` (y en general el cableado) en un mensaje fijo tipo `Invalid QUARKUS_DATASOURCE_JDBC_URL` sin eco del valor, capturando `RuntimeException` en `main`/`fromEnvironment`, y añade un test en `theEnvironmentWiringRejectsAMissingDatabaseOrAnInvalidSetting` (:232) que compruebe el mensaje sin la URL.

## Observaciones fuera de alcance
- La contraseña pasa por un `String` inmutable (`AdminPasswordTool.java:205`) mientras dura la ejecución; inevitable con `AdminPasswordPolicy(String)` y la API de `PasswordHasher(String)`. Sin acción.
- Sin `-Djava.util.logging.manager=...` la JVM imprime un `ERROR` inofensivo de logmanager al salir; el script ya lo fija. Quien copie el comando "equivalente sin wrapper" debe incluirlo (impl.md ya lo lista).
- No verificado: NAS real / arm64, Argon2 64 MiB en el NAS (R-12), ausencia de eco con un humano mirando.

## Ronda 2 (verificación de la corrección)
- Código: `main` captura `IllegalStateException` (mensaje propio sin secretos) y `RuntimeException` (mensaje fijo `UNEXPECTED`, sin excepción ni traza), código 1; `setUrl` envuelto con mensaje fijo sin la URL (`:118-121`); `run` captura `RuntimeException` igual (`:182`); los fallos de BD salen como "Could not read/update the admin account" sin causa. Solo no se capturan `Error` de JVM (OOM, etc.), fuera de alcance.
- Tests nuevos (`AdminPasswordToolTest.java:240-304`): URL inválida (3 variantes), BD inaccesible y credenciales erróneas, y excepción inesperada con texto secreto; todos aseveran que ni salida ni mensajes contienen `SECRETXYZ` (`assertNoSecretsAnywhere`) y el mensaje fijo exacto.
- En vivo (imagen real, stdout+stderr, marcador `SECRETXYZ`/host/usuario/`Exception`/`at`): URL inválida con `password=SECRETXYZ` => `Error: QUARKUS_DATASOURCE_JDBC_URL is not a valid PostgreSQL JDBC URL`, rc=1; BD inaccesible (10.255.255.1), credenciales erróneas y host inexistente => `Error: Could not read the admin account`, rc=1. Marcador: 0 coincidencias en los cuatro casos, sin traza.
- `mvn -B verify`: 193 pruebas, 0 fallos, BUILD SUCCESS. `ci-summary.py --min-total 90 --min-module 80`: OK (total 95,7 %, infrastructure 95,5 %, domain 91,1 %, application 100 %).
- Pasada real (pty): `status` sin cuenta; `set-password` crea; segundo `set-password` cambia e invalida sesiones; bloqueo forzado visible en `status`; `unlock` lo limpia; `status` Locked: no, Session version 2; argumento desconocido rc=2. Sin regresión.
- Limpieza: contenedores, red e imagen de prueba eliminados.
