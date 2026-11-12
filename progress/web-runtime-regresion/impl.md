# web-runtime-regresion — implementación

## Archivos
- `tests/runtime/proxy-ready.test.ts` (nuevo, T104, lento ~30 s).
- `tests/helpers/standalone.ts`: opción `standaloneDir` (para arrancar un standalone distinto del build del run); cambio mínimo, sin efecto en los demás tests.
- `docs/web-standards.md` (Testing): una frase sobre T104 (preparación de la fase 3).
- `progress/current.md` actualizado. Sin cambios en `app/`, `components/`, `lib/` (diseño y comportamiento intactos).

## Mapa Tn -> it()
| Test | Dónde |
|---|---|
| T101 | verificación global (abajo): lint, typecheck, `npm test` x2 verdes; archivos de test 75 -> 76 (solo sube: T104) |
| T102 | `scripts/parity/*.test.ts` pasan sin cambios (dentro de `npm test`); `parity:api` + standalone sirvió las 4 páginas con los datos del diseño (T106) |
| T103 | manual con Chrome DevTools (sección Paridad) |
| T104 | `tests/runtime/proxy-ready.test.ts` › `T104: …` |
| T105 | revisión de docs (sección Docs); T89 verde en `tests/source.test.ts` |
| T106 | recorrido manual (sección Recorrido) |

Criterios: A13 -> T104 · A14 -> T101–T103 · A2/A9 -> T105 · A1–A17 -> T106.

## T104
Copia temporal (`os.tmpdir()`, nunca el repo) de `app/ components/ lib/ public/ next.config.ts package.json tsconfig.json` sin `*.test.*`, con `node_modules` clonado (copy-on-write si el FS lo permite; Turbopack rechaza un symlink fuera de la raíz) más `proxy.ts` (`matcher ['/admin/:path*']`, cabecera `x-probe-proxy`) y `app/api/probe/route.ts` (`POST`, cookie `httpOnly`). Comprueba: build exit 0 con «Proxy» en la salida; `/admin/x` pasa por el proxy (404 de la catch-all pero con `x-probe-proxy: ran`); `POST /api/probe` da `Set-Cookie: probe=1; HttpOnly`; las 4 páginas públicas dan 200, sin cabecera del proxy ni cookie, y su HTML (sin `<script>` ni rutas hasheadas) es idéntico al del standalone sin proxy. Nota: no se añade página `/admin` porque el root layout vive en `app/[[...slug]]`; se usa la catch-all (404).

## Verificación (Node 22.23.1 vía nvm)
`npm run lint`, `npm run typecheck`: verdes. `npm test` x2: 76 archivos, 345 tests, verdes las dos veces. `npm run build`: verde, sin API, rutas `ƒ` (+ `○ /_not-found`, `○ /icon.svg`).

## Docs (T105)
Revisados `CLAUDE.md`, `AGENTS.md`, `docs/web-standards.md`, `CHECKPOINTS.md`, `.env.example`, `.github`, `deploy`, `Dockerfile`: describen standalone, `CV_API_URL`/`SITE_URL`, «sin caché ni respaldo -> 500», estados vacíos y la nota de la caché de la API para la fase 2 (web-standards). grep sin coincidencias de `output:'export'`, `CV_CACHE*`, Cloudflare Pages, `cv.floreslab.dev`. Sin contradicciones; solo la frase de T104.

## Paridad (T102/T103), Chrome DevTools, API `parity:api` (datos del diseño) + standalone en :3010, referencia servida con `serve.mjs` :4010
Capturas en `design/artifact-v2/.shots/` (ignorado por git), prefijo `rg-`: `rg-{ref,web}-{perfil,servicios}-{1440,390}.png`, `rg-diff-*`, `rg-regr-*`, `rg-web-*-1440.json` (sondas), `lh-*` (Lighthouse), `rg-empty-{perfil,servicios}-1440.png`.
Gotcha de entorno: este Chrome usa scrollbar clásica (15 px) y `vw` la incluye (cambia `clamp()` del h1); se inyectó `::-webkit-scrollbar{display:none}` en la pestaña para medir a 1440 reales, y se usó `emulate` (no `resize_page`, que tiene mínimo 500 px).
- **Regresión contra la ronda de paridad aprobada** (`pa-web-*`): 1440 Perfil y Servicios y 390 Perfil y Servicios: diff por bandas **max 0.02 % / 0.01 %**, 0 bandas sobre 3 %; mismas alturas (4961, 4723, 8118, 8469). Sonda `probe.mjs web` a 1440: 58 / 57 claves, **0 diferencias de estilo y 0 de caja (> 0.5 px)** frente a `pa-web-*-1440.json`. Sin desbordes a 390 (`scrollWidth = clientWidth = 390`) en ambas páginas.
- **Referencia vs web, página entera (`parity:diff`)**: supera el 3 % en casi todas las bandas (max 93.7 % en las últimas bandas, por la diferencia de alturas de página). Esto NO es una regresión: es el mismo resultado de la ronda `web-redesign-paridad` (su informe §4 explica que el diff de página entera no es comparable por D1–D9 y E1–E4, que desplazan todo; allí se alineó por sección y se documentaron las bandas > 3 %). Como la web es idéntica píxel a píxel a esa ronda, la conclusión de aquella ronda sigue vigente. NO he repetido el diff alineado por sección (`pa-sections.js`); el humano puede hacerlo si quiere.
- **Lighthouse (desktop, navegación)** en `/`, `/servicios/`, `/en/`, `/en/services/`: Accessibility 100, Best Practices 100, SEO 100, Agentic 100; 58 pasados, 0 fallos en las cuatro. Consola limpia en las cuatro (sin mensajes).
- Estados vacíos (API con `services`, `projects`, `ports` vacíos): 200; Servicios y Perfil muestran el texto vacío dentro de su sección con encabezado («Los servicios se publicarán aquí en breve…», «Aún no hay proyectos publicados…», «El diagrama de arquitectura aún no está disponible», EN «No projects are published yet…»). Capturas para validación humana: `rg-empty-perfil-1440.png`, `rg-empty-servicios-1440.png`.

## Recorrido manual (T106), Node 22, standalone copiado a un temporal fuera del repo
1. `parity:api`-equivalente en :4020 (una variante de `design-api.mjs` en el scratchpad con modos normal/changed/empty y un `POST /api/v1/contact/messages` -> 201; usa `designResponse` del script real; el `design-api.mjs` real no implementa POST y el contacto da 502 con él, como cabe esperar).
2. `npm run build` ejecutado sin ninguna API escuchando: OK (y T25 del suite comprueba 0 peticiones).
3. Standalone en :3010 con `CV_API_URL=http://localhost:4020`, `SITE_URL=https://floreslab.dev`: `/`, `/servicios/`, `/en/`, `/en/services/` 200 `text/html`; `/api/health/` 200 `{"status":"ok","api":"up"}`; `sitemap.xml` 200 con `floreslab.dev` y hreflang; `robots.txt` 200; PDF es/en 200 `application/pdf`; contacto `POST /api/contact/` 201.
4. Cambio de datos en la API (`profile.label`): la siguiente petición a `/` y `/en/` ya lo muestra; el ETag del PDF cambia al cambiar y al volver los datos.
5. API apagada: `/` 500, `/servicios/` 500, PDF 500, `/api/health/` 503; el HTML del 500 no contiene `4020` ni `localhost`; el log muestra `[cv-web] … request failed (ECONNREFUSED)`.
6. Listas vacías -> estados vacíos (arriba).
Procesos auxiliares (API, standalone, servidor de referencia) detenidos al terminar.

## NO verificado (solo lo comprobará la CI; sin daemon de Docker)
`docker build` y `docker run` con el `HOSTNAME` por defecto de Docker; healthcheck del contenedor; smoke del job `docker` (T98); parada con SIGTERM en < 10 s (T99); `buildx` multi-arch/arm64 y publicación en Docker Hub (T100); secretos `DOCKERHUB_*` en GitHub. Tampoco he ejecutado el job de CI de GitHub en sí.

## Tests extra fuera del plan
Ninguno. Cambio de helper: `standaloneDir` en `tests/helpers/standalone.ts`.

## Regresiones encontradas
Ninguna.
