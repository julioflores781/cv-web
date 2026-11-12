# impl — api-admin-password-cli

Estado: **hecho**. Código en el working tree de `cv` (sin commits ni ramas).
Verificación: `mvn -B verify` verde (193 pruebas en infrastructure, 13 nuevas) y `python3 scripts/ci-summary.py --min-total 90 --min-module 80` verde: total 95,7 %, application 100 %, domain 91,1 %, infrastructure ~95,5 % (baja desde 96,6 % por el `main` y el cableado del terminal, que solo se ejercitan en el contenedor).
Prueba real con la imagen Docker del repo (ver abajo).

## Archivos
- `infrastructure/.../tools/AdminPasswordTool.java` (nuevo): `main` plano, comandos `set-password`, `unlock`, `status`.
- `infrastructure/.../adapter/out/postgres/PostgresAdminAccountRepository.java`: `upsertPassword(hash)` (INSERT ... ON CONFLICT: crea o cambia; al cambiar sube `session_version`, limpia intentos y bloqueo, fija `password_changed_at`; devuelve la versión, 1 = recién creada) y `unlock()`. Solo en la clase concreta, no en el puerto `AdminAccountRepository` (no los usa la aplicación).
- `Argon2PasswordHasher`: el constructor pasa a `public` (mismo hasher, sin duplicar).
- `scripts/admin-password.sh` (nuevo, ejecutable).
- Tests: `infrastructure/src/test/.../tools/AdminPasswordToolTest.java`.

## Mapa Tn → test (`AdminPasswordToolTest`)
| Tn | Test |
|---|---|
| T91 | `setPasswordWithoutAnAccountCreatesItAndTheLoginWorks` (crea fila con argon2id, verifica el hash, login HTTP 200, no imprime hash ni contraseña) |
| T92 | `setPasswordOnAnExistingAccountChangesTheHashBumpsTheVersionAndClearsTheLock` (también: token viejo da 401, el login nuevo 200) |
| T93 | `aWeakPasswordOrADifferentConfirmationFailsWithoutTouchingTheDatabase` (corta, confirmación distinta, solo espacios; con y sin cuenta previa) |
| T94 | `unlockClearsTheLockAndStatusReportsWithoutShowingTheHash` |
| T95 | `unknownOrMissingArgumentsPrintTheUsageAndExitNonZero` (código 2) |

## Criterio → tests
- CA4 (el comando del NAS invalida los tokens): T91, T92, T93
- CA3 (desbloqueo): T94
- CA25 (sin secretos; contraseña solo por terminal): T91, T95 + prueba real (no hay argumento de contraseña; con argumento extra da uso y código 2)

## Extras fuera del plan
- `statusWithoutAnAccountSaysSoAndUnlockFails`
- `withoutATerminalSetPasswordRefusesAndTheInputEndingEarlyIsHandled` (sin terminal: error; entrada cerrada tras 0 o 1 contraseñas)
- `aDatabaseFailureIsReportedWithoutAStackTrace`
- `theEnvironmentWiringBuildsAToolThatWorksAndAReadsTheSameArgon2Defaults` (parámetros por defecto 65536/3/1 y override por env)
- `theEnvironmentWiringRejectsAMissingDatabaseOrAnInvalidSetting`

## Decisiones
1. **Lectura inyectable:** `PasswordReader` (interfaz funcional). En producción `main` usa `System.console().readPassword` (sin eco); si no hay consola (Java 21: sin TTY), `set-password` se niega con un mensaje en vez de leer de stdin con eco. No hay forma de pasar la contraseña como argumento.
2. **Sin duplicar:** mismo `Argon2PasswordHasher`, mismo `AdminPasswordPolicy.isAcceptable(candidate, null)` (no se conoce la contraseña vigente en claro) y el mismo `PostgresAdminAccountRepository` (con un `PGSimpleDataSource` del driver, sin arrancar Quarkus).
3. **Parámetros de Argon2 sin segunda fuente de verdad:** se leen de todos los `application.properties` del classpath (el primero que define la clave gana) con override por la variable de entorno equivalente (`CV_ADMIN_ARGON2_*`), igual que la API. En `@QuarkusTest` el recurso `application.properties` es un fichero temporal vacío, de ahí la lectura de todos los recursos. Comprobado en el contenedor: `m=65536,t=3,p=1`.
4. **BD:** `QUARKUS_DATASOURCE_JDBC_URL/USERNAME/PASSWORD` del entorno; sin URL, error claro. Los errores de BD salen como `Error: <mensaje>` sin traza.
5. Códigos de salida: 0 ok, 1 fallo operativo (débil, no coinciden, sin cuenta, BD, sin terminal), 2 uso. El uso se valida antes de tocar la BD.
6. Mensajes en inglés (como logs y excepciones del repo).
7. `unlock` no sube `session_version` ni toca el hash; sin cuenta falla con código 1.
8. Script: `-Djava.util.logging.manager=org.jboss.logmanager.LogManager` (sin él, al salir la JVM imprime un `ERROR: The LogManager accessed before...` por el logmanager de Quarkus en el classpath), `-XX:MaxRAMPercentage=50` (segunda JVM junto a la API, con heap suficiente para Argon2 64 MiB) y `-XX:TieredStopAtLevel=1` (arranque rápido).
9. README/ARCHITECTURE no tocados: la documentación va en `api-admin-docs-deploy`.

## Comando exacto para el NAS (con terminal)
```bash
./scripts/admin-password.sh set-password      # status | unlock
# equivalente sin el wrapper:
docker exec -it cv-api java -XX:MaxRAMPercentage=50 -XX:TieredStopAtLevel=1 \
  -Djava.util.logging.manager=org.jboss.logmanager.LogManager -cp "app/*:lib/main/*:lib/boot/*" \
  dev.julioflores.cv.infrastructure.tools.AdminPasswordTool set-password
```
Otro nombre de contenedor: `CV_API_CONTAINER=nombre ./scripts/admin-password.sh status`. El classpath `app/*:lib/main/*:lib/boot/*` con `WORKDIR /app` está comprobado en la imagen real (el jar de la aplicación está en `app/`, el resto en `lib/main` y `lib/boot`). En el NAS desde Portainer/SSH hace falta TTY (`-it`).

## Prueba real con Docker
1. `mvn -B package -DskipTests && docker build -t cv-api-test:cli .`; red y Postgres 18 desechables; API con `QUARKUS_DATASOURCE_*` y `CV_ADMIN_JWT_SECRET` de prueba (readiness UP, Flyway aplicó V4).
2. Sin TTY propio en esta herramienta, ejecuté `scripts/admin-password.sh` (con `CV_API_CONTAINER=cvtest-api`) bajo un pseudo-terminal real (`pty` de Python, script en el scratchpad que escribe las respuestas al ver cada prompt). Es un TTY de verdad: `docker exec -it` y `System.console()` funcionan.
3. Resultados: `status` sin cuenta; `set-password` con contraseña corta (error, nada creado) y con confirmación distinta (error); `set-password` correcto crea la cuenta (`session_version=1`); login API 200; 5 fallos + 1 con la buena = 401x5 y 429; `status` muestra bloqueo hasta +15 min; `unlock` lo limpia; token T1 válido (200); segundo `set-password` → login con la contraseña vieja 401, con la nueva 200, **T1 da 401** (`session_version=2`); `status` no muestra el hash; en BD el hash es `$argon2id$v=19$m=65536,t=3,p=1$...`; comando desconocido: uso y código 2; sin TTY (`docker exec -i ... < /dev/null`): error claro, código 1.
4. Limpieza: contenedores, red e imagen de prueba eliminados (queda la imagen `postgres:18` que ya usaba Testcontainers). `infrastructure/target` queda con el build.

## No verificado
- Ejecución en el NAS real (otra arquitectura posible, arm64, y su `docker exec`/Portainer); tiempo de Argon2 con 64 MiB en el NAS (R-12).
- La ausencia de eco la garantiza `Console.readPassword`; la comprobé solo porque la contraseña no aparece en la salida del pty, no con un humano mirando el terminal.
- La imagen se probó en la arquitectura local (no arm64).

## Correcciones de la ronda 1 de revisión
**CR-1 (fuga de la URL JDBC en una traza).** Causa: `PGSimpleDataSource.setUrl` lanza `IllegalArgumentException` con la URL completa y `main` solo capturaba `IllegalStateException`. Arreglo de raíz en `AdminPasswordTool`:
- `fromEnvironment` envuelve `setUrl` y lanza `IllegalStateException("QUARKUS_DATASOURCE_JDBC_URL is not a valid PostgreSQL JDBC URL")` sin causa ni valor.
- `main` y `run` capturan además `RuntimeException` y escriben un mensaje fijo (`UNEXPECTED`), nunca la excepción ni su texto ni traza. Salida 1.
- Revisados los demás caminos: los fallos de conexión/SQL pasan por `PostgresAdminAccountRepository`, que los envuelve en `IllegalStateException` con mensaje fijo ("Could not read/update the admin account") y la herramienta solo imprime `getMessage()`, nunca la causa (el `SQLException`/`PSQLException` puede llevar host y usuario). Los mensajes de ajustes inválidos nombran la clave, no el valor.
Tests nuevos (extras): `anInvalidJdbcUrlIsReportedWithoutEchoingItsCredentials` (3 URLs con `SECRETXYZ`, sin causa), `anUnreachableDatabaseAndWrongCredentialsNeverPrintTheSecrets` (BD inaccesible y contraseña errónea contra el Postgres de prueba, los tres comandos; la salida no contiene el secreto, `jdbc:`, `Exception` ni trazas) y `anUnexpectedExceptionPrintsAFixedMessageWithoutItsText`.
Docker real (imagen reconstruida, pty): URL con `password=SECRETXYZ&bad=%zz` -> `Error: QUARKUS_DATASOURCE_JDBC_URL is not a valid PostgreSQL JDBC URL`, salida 1, 0 apariciones del secreto; `mysql://x` igual; contraseña errónea -> `Error: Could not read the admin account`, 0 apariciones; host inexistente con el secreto en el nombre -> mismo mensaje, 0 apariciones; ejecución normal sigue bien. Contenedores, red e imagen eliminados.
