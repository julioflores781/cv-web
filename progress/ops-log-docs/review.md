# Review — ops-log-docs

## Veredicto: APPROVED

Revisión independiente. Repos `cv` y `cv-web`, solo working tree. Se excluye el trabajo de los slugs 1–4 (APPROVED, sin cerrar).

## Verificado por mí
- `cv-web` con Node 22.23.1: `npm run lint` sin avisos, `typecheck` OK, `npm test` dos veces (81 archivos / 384 tests, verdes las dos), `build` OK.
- Compose: parseado con Ruby YAML. `cv-db`, `cv-api` y `cv-web` llevan `logging: {driver: json-file, options: {max-size: "10m", max-file: "5"}}`, con `max-file` como **string**. `docker compose config -q` rc 0, y la salida normalizada conserva `max-file: "5"` entre comillas.
- Healthchecks: comparados con `git show HEAD:deploy/docker-compose.yml`, los tres son idénticos (igualdad estructural de los tres, y `git diff` solo contiene adiciones).
- Mutaciones en copia (borrada después), sobre `tests/deploy`: `max-file` "3" -> falla; `max-size` "100m" -> falla; `max-file` sin comillas -> falla; quitar un bloque `logging` -> falla; `interval: 30s` -> `31s` -> falla (test de healthchecks). Cada mutación rompe exactamente el test D1 esperado.
- Smoke: construí jar e imagen desde una copia del repo (sin tocar `target`), con Postgres 16, las mismas variables que el CI y el sample `db/sample`. `scripts/smoke-test.sh` completo: rc 0.
  - `X-Request-Id` generado: 32 hex.
  - Válido (`smoke-test-0001`, `abc12345.x_-`): reflejado.
  - Inválido (`corto`, `bad id!`, 65 caracteres): sustituido por 32 hex, no reflejado.
  - El bloque nuevo del script es coherente con el job `docker` del CI. `ci.yml` no se tocó y no hacía falta: la misma invocación `scripts/smoke-test.sh http://localhost:8080`, mismas variables.
- Contraste de `observability.md` con la instancia real (access log):
  - Patrón del `message` y campos JSON (`timestamp, logger, level, message, threadName, request_id, service`, más `client_ip`/`error_code`) coinciden con lo documentado; no aparecen `sequence`, `ndc` ni los demás excluidos.
  - `ip=` solo en `/api/v1/admin`:
    - `CF-Connecting-IP` válido -> `ip=` con su valor (404 por edge-block, con IP).
    - `CF-Connecting-IP` inválido y `X-Client-IP` válido -> usa `X-Client-IP`.
    - Ambos inválidos -> `ip=-`.
    - En ruta pública con `CF-Connecting-IP` -> `ip=-`.
  - 404 de enrutado = `err=NOT_FOUND`. 413 con `0b` y `err=-` (coincide con el ejemplo del doc). 401 de login con `err=ADMIN_INVALID_CREDENTIALS` y audit `LOGIN_FAILED reason=no_account` con `client_ip` (coincide).
  - `/q/health` y `/openapi.json` no generan línea de access.
  - Límites: `application.properties:65-69` (5 fallos, 15 min, 10 por minuto) = lo que dice el doc.
  - Formato dev/test, exclusiones y patrón: `application.properties:107-124`.
  - Las 13 acciones de §3.2 corresponden a las de ARCHITECTURE y a los 9 servicios.
- Web: `lib/log.ts` (lista negra, 200 caracteres, INFO a stdout y WARN/ERROR a stderr) y `app/api/contact/route.ts:65-66` (cabecera `X-Request-Id` y evento `contact`) coinciden con `docs/web-standards.md` «Logs», `CLAUDE.md`, `AGENTS.md` y el doc.
- Comandos de la guía (`grep '"logger":"audit"'`, `"event":"contact"`, `grep "$ID"` en ambos contenedores, `2>&1`) son ejecutables y coinciden con el formato real.
- Ejemplos: usan IP de documentación (`203.0.113.x`, `198.51.100.x`, `2001:db8::`) e ids ficticios. Grep de `/Users/`, `/Volumes/`, `ghp_`, secretos y token: sin coincidencias en `observability.md` ni `web-standards.md` (el único acierto es texto de política). Sin referencias obsoletas a `console.*` en las guías.
- Limpieza: contenedores, red, imagen de prueba y copias temporales eliminados.

## Trazabilidad
D1 -> `tests/deploy/deploy-files.test.ts` (rotación en 3 servicios y exactamente 3 bloques; healthchecks literales con sus tiempos). D2 -> smoke ejecutado (4 comprobaciones nuevas). D3 -> contraste doc/código arriba. §5 A15 y §10 R13: rotación 10m x 5 como `"5"` string.

## Skills consultadas
- `simplify`: sin hallazgos (el helper `request_id_of` evita repetición; el test usa helpers existentes).
- `strict-typing`: sin hallazgos (el test no introduce `any`).
- `next-best-practices`: sin hallazgos (no se toca código Next; solo compose, test y docs).
- `testing-strategy`: sin hallazgos (el test falla ante las 5 mutaciones probadas).

## Cambios requeridos
Ninguno.

## Observaciones fuera de alcance
- `docs/observability.md:33`: el formato de dev/test abrevia el logger (`%c{1.}`); el doc dice solo «logger». Cosmético.
- `docs/observability.md:3-4` enlaza `#7-límites-conocidos`; las anclas con tilde dependen del renderizador.
- La decisión de rotar también `cv-db` es razonable y está anotada en el compose.

## NO verificado
- Rotación real de Docker en el NAS ni menús de Portainer (solo parseo y `config -q`).
- Ejecución del workflow en GitHub Actions (solo el script contra una instancia equivalente en local).
- `grep` de la guía contra logs reales del NAS; los eventos web (`api_call`, `health`, `render_error`, `pdf_render_failed`) y el texto de Next sobre el render los contrasté con el código y `lib/log.ts`, no ejecutando `cv-web`.
- Mensajes de Telegram, refresco de caché y errores de BD (§3.3) solo por lectura/impl.md, no provocados en vivo.
- Acciones de audit distintas de `LOGIN_FAILED` (requieren admin con contraseña); no ejecuté `mvn verify`.
