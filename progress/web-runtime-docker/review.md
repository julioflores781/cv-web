# web-runtime-docker — review (ronda 3)

**Veredicto final: APPROVED**

Ronda 3 (con Docker disponible, arm64 nativo del Mac): corrección de T99 verificada; la imagen se construyó y el smoke del workflow pasó. No hay cambios requeridos.

## Ronda 3 — verificación
- `.github/workflows/ci.yml` (bloque SIGTERM del smoke): `docker stop -t 10`, acepta código 0 o 143, rechaza 137, exige < 10 s; comentario correcto. Cubierto por `tests/deploy/deploy-files.test.ts:143-147` (`T99 (file check)`, extra anotado en `impl.md`; no sustituye al paso de CI). `progress/web-runtime/analysis.md:359` ajustado coherentemente (0 o 143, 137 = fallo). Sin código muerto en lo tocado; la aserción de T99 no choca con T96.
- lint, typecheck y build OK; `npm test` x2: 76 archivos / 346 tests verdes las dos veces.
- Imagen construida por mí: `docker build -t cv-web:review .` OK (linux/arm64, `Config.User=app`, HEALTHCHECK `node -e fetch(.../api/health/)`).
- Smoke del `ci.yml` extraído con Psych y ejecutado tal cual con `bash -e`, cambiando solo lo inevitable: API falsa en el host (`design-api.mjs --port 4020`, `CV_API_URL=http://host.docker.internal:4020` con `--add-host host-gateway`), `cv-web:review` y puerto 3056 (el 3000 estaba ocupado), sin red `cvnet` ni contenedor `cv-api`. Resultado: **exit 0** (healthy, `/api/health/` ok, `/` con `<h1`, `/en/`, sitemap con floreslab.dev, PDF `%PDF-`, SIGTERM aceptado).
- Comprobaciones dentro del contenedor: UID 100 (no root); `.next/cache` de `app:app`; fuente `ibm-plex-sans-latin-600-normal.woff` presente y PDF EN `%PDF-`; healthy en ~6 s; `docker stop -t 10` -> exit **143** en 0 s (justo el caso que el workflow acepta; con la versión anterior, que exigía 0, habría fallado).
- Limpieza: contenedor `cv-web`, imagen `cv-web:review` y la API falsa (puerto 4020) eliminados/parados. No toqué `cv-web:ci` ni `cv-web:local` (ya existían, del implementer/líder).

## SIN verificar hasta la primera ejecución de la CI (corregida)
- La imagen **amd64 nativa** (aquí solo arm64 nativo) y `npm ci`/`next build` en amd64 (musl x64).
- La red real `cvnet` con el contenedor `cv-api` (`node:22-alpine` + volumen de solo lectura `scripts/parity`, `-w /app`, resolución por nombre): aquí la API falsa corrió en el host.
- Puerto 3000 del runner (aquí 3056) y el tiempo real de `healthy` en el runner (< 60 s; local ~6 s).
- arm64 bajo QEMU (éxito y duración, R9, `timeout-minutes: 45`) y que el binario `@next/swc-linux-arm64-musl` cargue bajo emulación.
- Login a Docker Hub y existencia de los secretos `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN`; metadata (tags `latest`/sha/semver), publicación multi-arch, caché `type=gha` y `imagetools inspect` (T100).
- Que el compose arranque en el NAS (red externa `padelhub_default`, imagen `julioflores781/cv-web:latest` ya publicada; `docker compose config` solo validó sintaxis).

---
# Histórico: ronda 2 y 1
## Ronda 2 — verificación
- `scripts/parity/design-api.mjs:16-17` responde 200 `{"status":"UP","checks":[]}` a `/q/health/ready` sin tocar los datos del diseño; test nuevo en `scripts/parity/design-api.test.ts:38-42` (extra anotado en `impl.md`). Comprobado a mano: `curl :18080/q/health/ready` -> 200 `{"status":"UP","checks":[]}`.
- Standalone desde un temporal con la estructura de la imagen (standalone + `.next/static` + `public`, `env -i`, `HOSTNAME=0.0.0.0`) con la API falsa: `/api/health/` -> **200 `{"status":"ok","api":"up"}`**; `/` con `<h1`, `/en/` con `lang="en"`, sitemap con `floreslab.dev`, PDF `%PDF-`; SIGTERM -> parada en 0 s.
- Consistencia del smoke de `ci.yml` con la API falsa: puerto 8080 (`--port 8080`, `CV_API_URL=http://cv-api:8080`, mismo nombre de contenedor en la red `cvnet`); `isMain` resuelve `/app/design-api.mjs` con `-w /app`; escucha en todas las interfaces; el healthcheck (`/api/health/` -> `/q/health/ready`) ahora lo sirve la API falsa; las rutas `/`, `/en/`, `sitemap.xml` y PDF dependen de `/api/v1/*`, que sirve; el chequeo `"status":"ok"` coincide con el cuerpo real; el bloque SIGTERM (`docker stop -t 10`, exit code, < 10 s) es coherente con lo medido.
- Node 22.23.1: lint, typecheck y build OK; `npm test` x2: 75 archivos / 344 tests verdes las dos veces.

Veredicto de la ronda 1 (histórico): CHANGES_REQUESTED por el defecto siguiente, ya resuelto.

## Cambios requeridos

Ronda 2: ninguno. Histórico de la ronda 1:

1. (RESUELTO) **BLOQUEANTE — la API falsa no sirve `/q/health/ready`, así que `cv-web` nunca llega a `healthy` y `/api/health/` da 503 en el smoke.**
   - `lib/api/health.ts:8-12` consulta `GET {CV_API_URL}/q/health/ready`; `app/api/health/route.ts:10-13` responde 503 `{"status":"degraded","api":"down"}` si falla.
   - `scripts/parity/design-api.mjs:12,27-31` solo enruta `/api/v1/(resume|architecture|services|projects)`; todo lo demás es 404 (`designResponse`). No hay ruta de readiness.
   - Reproducido: standalone con la estructura de la imagen + `design-api.mjs`: `/`, `/en/`, sitemap, PDF, CSS y SVG dan 200, pero `/api/health/` -> **503 `{"status":"degraded","api":"down"}`**.
   - Consecuencia en `.github/workflows/ci.yml` («Smoke test the container»): el bucle de 60 s espera `healthy` (el HEALTHCHECK del Dockerfile usa `/api/health/`) -> falla con «did not become healthy in 60 s», y la línea `grep -q '"status":"ok"'` también fallaría. T98 y T99 no pasarían y nada se publicaría.
   - Arreglo (a criterio del implementer): hacer que `design-api.mjs` responda 200 a `/q/health/ready` (como hace `tests/helpers/fake-api.ts:68`) y cubrirlo en `scripts/parity/design-api.test.ts`; es una herramienta compartida con el slug de regresión, así que el cambio debe ser mínimo y no alterar los datos del diseño. Después, volver a reproducir con el mismo procedimiento (`/api/health/` debe dar 200 `{"status":"ok"}`).

## Trazabilidad Tn <-> it()
| Test | it() real | Resultado |
|------|-----------|-----------|
| T92 | `tests/deploy/deploy-files.test.ts` `Dockerfile › T92` (líneas ~84-103): FROM node:22 x3, COPY standalone/static/public, USER no root, HOSTNAME/PORT/EXPOSE, HEALTHCHECK con `/api/health/`, CMD exec, sin `.env`/secretos | OK, hace lo que dice |
| T93 | `Dockerfile › T93`: 7 entradas de `.dockerignore` | OK |
| T94 | `deploy/docker-compose.yml › T94`: servicios, imagen, depends_on service_healthy, healthcheck, redes, restart, sin ports/env_file/`${`/REVALIDATE_/CV_CACHE_, CV_API_URL, SITE_URL | OK (regex sobre texto, no parser; equivalente validado abajo con parser Ruby) |
| T95 | `› T95`: cv-db sin padelhub, readiness de cv-api, secretos == [POSTGRES_PASSWORD, QUARKUS_DATASOURCE_PASSWORD, CV_CONTACT_IP_SALT] todos `CAMBIA-`, Telegram vacío, sin CORS | OK |
| T96 | `ci workflow: docker job › T96`: needs, if push, qemu/buildx/login/metadata, images `/cv-web`, amd64+load, amd64,arm64+push, credenciales solo `secrets.*` | OK |
| T97 | `tests/runtime/docker-layout.test.ts › T97` | OK (ver observación 1) |
| T98 | paso CI «Smoke test the container» | existe; consistente tras la corrección de la ronda 2 |
| T99 | mismo paso (`docker stop -t 10`, exit 0, < 10 s) | existe; en el standalone local SIGTERM paró en 0 s |
| T100 | paso CI «Check the published manifest» (`imagetools inspect`, amd64 y arm64) | existe |

Extras fuera del plan: ninguno (coincide con `impl.md`).

## Trazabilidad criterios <-> tests
A10: T92, T93, T97 (+T98, T99 CI). A11: T96 (+T98, T100 CI). A12: T94, T95. Cubiertos.

## Verificación hecha
- Node 22.23.1: `npm run lint` OK, `npm run typecheck` OK, `npm run build` OK, `npm test` x2: 75 archivos / 343 tests verdes las dos veces.
- Dockerfile línea a línea contra Next standalone: `HOSTNAME=0.0.0.0` (con él Next anuncia `Network: http://0.0.0.0:3100`), copia de `.next/standalone` + `.next/static` + `public` (hay que copiarlos aparte: correcto), `CMD ["node","server.js"]` exec, `EXPOSE 3000`, HEALTHCHECK `/api/health/` con barra (trailingSlash), usuario `app` no root con `chown` de `.next/cache` y de todo lo copiado (`--chown`), sin `ENV/ARG` secretos, sin `.env` (y `.dockerignore` excluye `.env*`).
- Fuentes: `lib/pdf/fonts.ts:11-15` lee `process.cwd()/node_modules/@fontsource/<pkg>/files/<file>.woff`; `next.config.ts:8-11` traza `./node_modules/@fontsource/**/*.woff` para el PDF y `/[[...slug]]`. Comprobado en el standalone: existen `barlow-condensed-latin-700-normal.woff`, `ibm-plex-sans-latin-400-normal.woff` y `-600-normal.woff`, y el PDF sale `%PDF-` desde la copia con estructura de imagen (cwd = raíz del standalone, igual que `WORKDIR /app`).
- Contexto de build: copia de un contexto filtrado por `.dockerignore` (sin `progress`, `design`, `deploy`, `.github`, `.claude`, `next-env.d.ts`) a un temporal, con `node_modules` copiado y sin `CV_API_URL`: `npm run build` (incluye typecheck con `tests/`) OK; el standalone resultante contiene las fuentes.
- Binarios por plataforma: `package-lock.json` incluye `@next/swc-linux-{x64,arm64}-{gnu,musl}`, `@napi-rs/canvas-linux-*-musl`, rolldown y unrs-resolver para ambas arquitecturas; cada plataforma ejecuta su propio `npm ci` (node:22-alpine multi-arch), sin copiar `node_modules` entre arquitecturas.
- Simulación de la imagen en `scratchpad/img` (standalone + `.next/static` + `public`, `env -i`, `HOSTNAME=0.0.0.0`, API falsa `design-api.mjs`): `/` 200 con `<h1`, `/en/` con `lang="en"`, sitemap con `floreslab.dev`, robots 200, PDF `%PDF-`, CSS de `/_next/static` 200, SVG 200, SIGTERM -> parada en 0 s. Ronda 1: única discrepancia `/api/health/` 503 (corregida en ronda 2).
- `ci.yml` parseado con Ruby/Psych: `on` = push (main, tags v*) + pull_request; job `docker`: `needs: test`, `if: github.event_name == 'push'`, 11 pasos en el orden de `cv` (comprobación de secretos, checkout, qemu, buildx, login, metadata, build amd64 `load:true`, smoke, publicación multi-arch, manifiesto, resumen). Sin `pull_request_target`; credenciales solo por `secrets.*` (y vía `env:` desde `secrets.*`). Mismas versiones de actions que `cv` (checkout v7, qemu/buildx/login v4, metadata v6, build-push v7). Desviaciones razonables respecto a `cv`: sin artefacto Quarkus, `timeout-minutes: 45` (R9), smoke propio con API falsa, comprobación de manifiesto.
- `deploy/docker-compose.yml` parseado con Ruby/Psych: servicios `cv-db`, `cv-api`, `cv-web`; `cv-web` con `depends_on.cv-api.condition=service_healthy`, healthcheck (`node -e fetch(.../api/health/)`), redes `[default, padelhub]`, sin `ports` activos (comentados), `CV_API_URL`/`SITE_URL` correctos; `cv-db` sin red `padelhub`; red externa `padelhub_default`. Frente a `cv/deploy/docker-compose.yml`: `cv-db` idéntico, `cv-api` idéntico salvo `QUARKUS_HTTP_CORS_ORIGINS` retirado (pedido) y el comentario de `ports`; `CV_CONTACT_*` presentes; valores `CAMBIA-…`; nada real. `docker compose config -q` no emitió error (CLI sin daemon).
- Privacidad: sin teléfono, documento ni fecha de nacimiento en los archivos nuevos/modificados (Dockerfile, compose, ci.yml, docs).

## Privacidad
Sin hallazgos. El compose es un repo público: solo placeholders `CAMBIA-…`, Telegram vacío, sin tokens ni IPs.

## Skills consultadas
No invoqué las skills como herramienta; apliqué sus criterios de forma manual sobre el diff.
- `simplify`: sin hallazgos (el test de CI reutiliza el helper `block`; el Dockerfile no duplica pasos).
- `next-best-practices`: sin hallazgos de código; el Dockerfile sigue el patrón standalone oficial (static y public copiados aparte, `HOSTNAME`, `.next/cache` escribible). Ver observación 2 sobre el healthcheck.
- `strict-typing`: sin hallazgos (los tests nuevos no usan `any`; `tests/runtime/docker-layout.test.ts` y `deploy-files.test.ts` tipados). Sin hallazgos tras la ronda 2.
- `seo-audit`, `ui-ux-pro-max`, `testing-strategy`: no aplican (no se tocó metadata/UI; no es un cambio centrado en tests).

## Checkpoints
- C1 calidad ejecutable: lint, typecheck, test x2, build verdes.
- C2 cobertura/trazabilidad: T92–T97 con `it()`; T98–T100 como pasos de CI; T98 desbloqueado en ronda 2.
- C3 privacidad: OK.
- C4 datos/resiliencia: OK (el build no lee la API; el health expone solo `status/api`).
- C5 diseño/a11y/SEO: no aplica.
- C6 arnés: `impl.md` presente y honesto sobre que la imagen no se construyó.
- C7: del `closer`.

## Observaciones fuera de alcance
1. T97 usa la copia del harness (`tests/global-build.ts`), que replica la estructura de la imagen, no ejecuta el `Dockerfile`; es lo que pedía el plan.
2. El primer chequeo de salud de Docker ocurre tras `interval` (30 s), así que `healthy` llega hacia el segundo 30-35 del arranque; el bucle de 60 s del smoke tiene margen pero no holgado en un runner lento. Se puede acortar con `--interval=10s` o ampliar el bucle si el smoke resulta intermitente.
3. En la CI el `design-api` corre como `node:22-alpine` con `scripts/parity` en solo lectura: correcto (escucha en todas las interfaces, `isMain` resuelve `/app/design-api.mjs`).

## SIN verificar hasta la primera ejecución de la CI
- El código de salida 0 de `docker stop` con node como PID 1 (localmente solo medí el tiempo de parada del proceso).
- Que `docker build` termine (npm ci, `next build`, `chown`) en `node:22-alpine`; nunca se construyó la imagen aquí (sin daemon).
- Arm64 bajo QEMU: éxito y duración (R9, `timeout-minutes: 45`) y que el binario `@next/swc-linux-arm64-musl` cargue.
- El HEALTHCHECK real dentro del contenedor (`fetch` de Node 22 alpine) y que `docker inspect` llegue a `healthy` en < 60 s.
- Permisos reales del usuario `app` sobre `.next/cache` y lectura de `node_modules/@fontsource` dentro de la imagen (el PDF dentro del contenedor).
- Resolución de red entre `cv-web` y `cv-api` en la red `cvnet` y el montaje de solo lectura de `scripts/parity`.
- `docker stop -t 10`: exit 0 y < 10 s con node como PID 1 (localmente solo probado sin Docker).
- Existencia de los secretos `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` y el login; tags de metadata, push multi-arch, caché `type=gha` y `imagetools inspect` (T100).
- Que el compose arranque realmente en el NAS (red externa `padelhub_default`, imagen `julioflores781/cv-web:latest` publicada, `docker compose config` con daemon).
