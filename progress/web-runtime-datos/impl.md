# web-runtime-datos — implementación

Estado: HECHO (T6–T41 completos). `npm run lint`, `npm run typecheck`, `npm test` (62 archivos / 283 tests) y `npm run build` en verde con Node 22.23.1 (el `node` por defecto es 20: usar `nvm use 22`).

## Archivos
- `next.config.ts`: `output:'standalone'`, `images.unoptimized`, `trailingSlash`, `outputFileTracingIncludes` (fuentes `.woff` de `@fontsource` para el PDF). Sin `redirects`. `package.json`: script `start`.
- `lib/api/`: `config.ts` (solo `apiUrl`/`siteUrl`, defaults `http://cv-api:8080` / `https://floreslab.dev`), `content.ts` (`getContent = cache(read)` con `React.cache`; en fallo `console.error('[cv-web] <Recurso> (<lang>) unavailable: <causa>')` y relanza), `request.ts` (4 s + 1 reintento, exporta `DEFAULT_TIMEOUT_MS`/`DEFAULT_RETRIES`; sin `file`/`isEmpty`/`unavailable`), `get-resume|services|projects|architecture.ts` (devuelven `{resume}`/`{services}`/`{projects}`/`{architecture}`, sin `source`), `errors.ts`, `types.ts`, `index.ts` (sin `ContentUnavailableError`/`ResumeUnavailableError`/`ContentSource`).
- Borrados: `lib/api/cache.ts`, `cache.test.ts`, `client.ts`, `client.test.ts`, `get-resume.test.ts`, `tests/build/build.test.ts`.
- `app/[[...slug]]/page.tsx`: `force-dynamic`, sin `generateStaticParams`/`dynamicParams`, no lee `apiUrl`.
- Tests/harness: `tests/global-build.ts` (globalSetup, un `next build` por ejecución, API falsa que registra peticiones, copia del standalone + `.next/static` + `public/` en un temporal), `tests/helpers/standalone.ts` (arranque en puerto libre, espera a «Ready in», parada con SIGTERM/SIGKILL y limpieza en `process.on('exit')`), `tests/helpers/runtime-pages.ts`, `tests/helpers/fake-api.ts` (nueva opción `respond`), `vitest.config.ts` (`globalSetup`).
- `.env.example` (sin `CV_CACHE_DIR`, defaults nuevos).

## Mínimos fuera del alcance (para compilar / cumplir T36), a retomar en sus slugs
- **Contacto:** `HomeView.apiUrl` pasa a opcional (def. `''` = mismo origen) y la página ya no lo pasa. El formulario hace `POST /api/v1/contact/messages` en el propio origen, que **aún no existe** (404) hasta `web-runtime-contacto` (`/api/contact/`).
- **PDF:** `app/cv-julio-flores-{es,en}.pdf/route.ts` pasan de `force-static` a `force-dynamic` (con static el build llamaba a la API). `lib/pdf/build-cv-pdf.ts` sigue con memo por proceso sin clave por contenido (PDF puede quedar viejo): lo corrige `web-runtime-pdf`.
- **robots/sitemap:** no tocados (siguen `force-static`; hornean `SITE_URL` en build) → `web-runtime-dominio`.
- **Dominio:** solo el default de `siteUrl` en `config.ts` y `.env.example`. Siguen las menciones a `cv.floreslab.dev`/Cloudflare Pages en `CLAUDE.md`, `AGENTS.md`, `docs/web-standards.md`, `.claude/agents/analyst.md` y el comentario/test de `request`.
- `tests/source.test.ts` T5: ahora ignora archivos de `git ls-files` borrados en el working tree (borrados aún sin commitear).

## Tn → it()
| Test | it() |
|---|---|
| T6–T9 | `lib/api/config.test.ts` > «T6…», «T7…», «T8…», «T9…» |
| T10–T16, T18 | `lib/api/content.test.ts` > «T10…» … «T16…», «T18…» |
| T17 | `tests/source.test.ts` > «T17: no data cache, fallback copy, source flag nor next/cache…» |
| T19–T22 | `lib/api/request.test.ts` > «T19…», «T20…», «T21…», «T22…» |
| T23 | `next.config.test.ts` > «T23…» |
| T24 | `tests/source.test.ts` > «T24: the page is force-dynamic…» |
| T25, T26 | `tests/runtime/build.test.ts` |
| T27–T34, T36 | `tests/runtime/pages.test.ts` |
| T41 | `tests/runtime/pages.test.ts` > «project screenshots» |
| T35, T37–T40 | `tests/runtime/resilience.test.ts` |

## criterio → tests
A1: T23, T24, T25, T26 · A2: T8, T10–T12, T16, T17, T21, T22, T35, T37–T40 · A4: T6, T7, T9, T24, T34, T36 · A9 (parte config): T6, T7, T9, T23 · A10 (standalone): T23 · A14: T27, T29, T30, T32, T33, T41 · A15: T17, T18, T24 · A16: T12–T14, T19, T20, T39 · A17: T28 · A8: T31, T33.

## Decisiones / notas
- T25: el build usa como `CV_API_URL` la API falsa que registra (en vez de un puerto cerrado): comprueba 0 peticiones y además fallaría si el build la necesitara. `SITE_URL` no se define en build (se prueba que se lee en runtime: canonical = `https://cv.example.test`).
- T37 exige log `[cv-web]`: lo emite `getContent` (mensaje sin URL; la URL nunca va al visitante).
- T26: se comprueba la tabla de rutas (`ƒ /[[...slug]]`; es una sola ruta catch-all para las 4 páginas) y que ningún `.html` de `.next/server/app` contenga «Ada».
- `React.cache` fuera de un render no memoiza (T10 lo demuestra); dentro, `generateMetadata` y `Page` comparten lectura (T34).
- `lib/api/content.test.ts` silencia `console.error` y comprueba el prefijo `[cv-web]` en T12.
- Los tests runtime arrancan un servidor por archivo/escenario (puerto libre, sin esperas arbitrarias) y lo paran en `afterAll/afterEach`; verificado sin procesos huérfanos.

## Tests extra fuera del plan
- `lib/api/content.test.ts` > «extra: a refused connection throws ApiFetchError too».
- `lib/api/request.test.ts` > extra (PA) «requests do not go through the global fetch…» (preexistente).
- `tests/runtime/pages.test.ts` > «extra (BA-T51)» (fondos hex-grid servidos).
- `tests/source.test.ts` > «extra (PD-T27)» (pines de `@react-pdf/renderer`/`@fontsource`, migrado de `build.test.ts`).

## Migración de `tests/build/build.test.ts`
Migrados: BA-T44→T25/T26, BA-T45/46/T60→T29, BA-T47→T30, BA-T48→T31, BA-T49/CO-T80→T33, HX-T41/CO-T74/CO-T81→T32, CO-T75/77→T36/T34, BA-T51 y PD-T27→extras. Eliminados según la nota: T64 (respaldo), respaldos de services/projects, bloque «build with the API down», BA-T50, T61 y los casos de caché. **Pendientes para otros slugs:** PD-T22/23/24/26 (PDF en `out/`, sitemap/robots sin PDF) → `web-runtime-pdf`/`-dominio`; HX-T42/CO-T78 (secciones omitidas con listas vacías) y CO-T76 (cliente anónimo) → `web-runtime-vacios` / regresión (la lógica de omisión actual sigue vigente; R2 la cambia a estados vacíos). El filtrado de `client` anónimo sigue en `validate-content` con sus tests unitarios.

## Para los slugs siguientes
`web-runtime-vacios` (estados vacíos), `-salud` (`/api/health/`), `-pdf` (caché con clave por contenido, dinámico), `-contacto` (`/api/contact/`, quitar el `apiUrl` residual de `HomeView`/`ContactSection`/`ContactForm`/`lib/contact`), `-dominio` (robots/sitemap dinámicos, limpiar docs), `-docker`, `-regresion`.

## Correcciones de la ronda 1 (review)
1. `lib/api/content.test.ts`: la selección de cuerpo por URL se extrajo a `fixtureFor(url)` local, usada en T16 y T18.
2. Nuevo `tests/helpers/env.ts` (`cleanEnv(remove, extra)`): único sitio que filtra `process.env` y fija `NODE_ENV=production` y `NEXT_TELEMETRY_DISABLED`; lo usan `tests/global-build.ts` y `tests/helpers/standalone.ts`.
3. `tests/global-build.ts`: si `runBuild` o los `cp` lanzan, se borra `standaloneDir` antes de relanzar (`catch { rm; throw }`); en éxito lo borra el teardown.
Verificado (Node 22): lint, typecheck, `npm test` ×2 (62 archivos / 283 tests, ambas en verde) y `npm run build`; sin temporales `cv-web-standalone-*` residuales.
