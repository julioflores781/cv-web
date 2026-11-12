# web-runtime-docker — implementación

## Archivos
- `Dockerfile`, `.dockerignore`, `deploy/docker-compose.yml` (nuevos).
- `.github/workflows/ci.yml`: job `docker` (needs `test`, solo `push`, secretos solo vía `secrets.*`, qemu/buildx/login/metadata, build amd64 `load:true` + smoke con `scripts/parity/design-api.mjs`, SIGTERM, publicación amd64+arm64, comprobación de manifiesto con `buildx imagetools inspect`).
- Tests: `tests/deploy/deploy-files.test.ts` (T92–T96, sin dependencia YAML, mismo helper `block`), `tests/runtime/docker-layout.test.ts` (T97).
- Docs: `CLAUDE.md`, `docs/web-standards.md`, `AGENTS.md` (no existe README en el repo; no se creó).

## Mapa Tn -> it()
| Test | Archivo | it() |
|------|---------|------|
| T92 | tests/deploy/deploy-files.test.ts | `Dockerfile › T92` |
| T93 | idem | `Dockerfile › T93` |
| T94 | idem | `deploy/docker-compose.yml › T94` |
| T95 | idem | `deploy/docker-compose.yml › T95` |
| T96 | idem | `ci workflow: docker job › T96` |
| T97 | tests/runtime/docker-layout.test.ts | `T97` (`/`, CSS de `/_next/static`, `/hex-grid-plano.svg` = 200 sobre la copia del harness, que replica server.js + .next/static + public) |
| T99 (extra, archivo) | idem | `ci workflow: docker job › T99 (file check)`: test extra fuera del plan, verifica `docker stop -t 10`, código 0 o 143 y < 10 s |
| T98–T100 | CI (`ci.yml`, pasos «Smoke test the container», «Publish», «Check the published manifest») | no son Vitest |

## Criterios -> tests
- A10: T92, T93, T97 (T98, T99 en CI). A11: T96 (T98, T100 en CI). A12: T94, T95.

## Verificación local (Node 22.23.1 vía nvm)
`npm run lint`, `npm run typecheck`, `npm test` (x2: 75 archivos, 343 tests) y `npm run build`: verdes. `docker compose -f deploy/docker-compose.yml config -q`: OK.

## Solo lo comprobará la CI (daemon de Docker no disponible: la imagen NO se ha construido aquí)
- Que `docker build` funcione (npm ci, `next build` con tests/ incluidos en el typecheck, `chown` de `.next/cache`) y arm64 bajo QEMU (R9: medir el tiempo; `timeout-minutes: 45`).
- T98: healthy, `/api/health/`, `<h1>`, `/en/`, `sitemap.xml` con floreslab.dev, PDF `%PDF-`; la API falsa corre en `node:22-alpine` con `scripts/parity` montado como volumen.
- T99: `docker stop -t 10` con exit 0 y < 10 s. T100: manifiesto con amd64 y arm64.
- Los secretos `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` deben existir en el repo de GitHub.

## Decisiones / notas
- `.dockerignore` además excluye `.github`, `deploy`, `.claude`, `*.tsbuildinfo`, `.DS_Store`; `design` y `progress` fuera según el plan (el typecheck del build no los necesita).
- `cv-api` conserva la red `padelhub` del compose original (fiel); se quitó solo el CORS y se ajustó el comentario de `ports`.
- Test extra fuera del plan: ninguno.

## Correcciones de la ronda 1 (review.md)
- Bloqueante: `scripts/parity/design-api.mjs` (`designResponse`) ahora responde 200 `{"status":"UP","checks":[]}` a `/q/health/ready` (no toca los datos del diseño). Test: `scripts/parity/design-api.test.ts` (nuevo `it` de readiness; test extra fuera del plan).
- Comprobado a mano: standalone desde un temporal con la estructura de la imagen + `design-api.mjs`: `/api/health/` -> 200 `{"status":"ok","api":"up"}`.
- Re-verificado con Node 22: lint, typecheck, `npm test` x2 (75 archivos, 344 tests) y build verdes.
- Observación 2 del reviewer (healthy tarda ~30 s por el interval; bucle de 60 s con margen) no se cambia; si el smoke resulta intermitente, bajar `--interval`.

## Ronda 2: Docker disponible (arm64 nativo del Mac)
- T99 corregido: Node como PID 1 sin handler sale por señal, `docker stop` da ExitCode=143. El paso de CI acepta 0 o 143 (137 = SIGKILL por timeout sigue siendo fallo) y exige < 10 s; comentado en `ci.yml`. Texto de T99 ajustado en `progress/web-runtime/analysis.md` (Slug 7) y test de archivos extra en `deploy-files.test.ts`. Sin wrappers ni dependencias.
- Evidencia local: `docker build -t cv-web:ci .` OK (imagen linux/arm64, usuario `app`). El script del paso «Smoke test the container» se extrajo del `ci.yml` tal cual, cambiando solo (a) la API falsa: `design-api.mjs` en el host con `CV_API_URL=http://host.docker.internal:4020` en lugar del contenedor `cv-api`, y (b) el puerto del host 3055 (el 3000 estaba ocupado): salió con exit 0 (healthy <60 s, `/api/health/` ok, `/` con `<h1`, `/en/`, sitemap con floreslab.dev, PDF `%PDF-`, SIGTERM con 0/143 en <10 s).
- Re-verificado con Node 22: lint, typecheck, `npm test` x2 y build verdes.

## NO verificado (actualizado)
- La imagen **amd64 nativa** (la local es arm64) y la red real `cvnet` con el contenedor `cv-api` (`node:22-alpine` + volumen `scripts/parity`).
- arm64 bajo QEMU no aplica localmente; la publicación multi-arch, login, metadata, caché `type=gha` y el manifiesto (T100) solo los comprobará la CI; también los secretos `DOCKERHUB_*`.
- Que el compose arranque en el NAS (red externa `padelhub_default`, imagen publicada).
