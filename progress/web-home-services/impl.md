# Impl — web-home-services (ronda 1, 2026-11-24)

Hijo 2/2 de `web-presence`. Plan: `progress/web-presence/analysis.md` §3 (prefijo `HS`), validado por Julio y ajustado por el leader
según HS-D1 (sin `header.profileLink`; el segmento del Perfil del interruptor pasa a «Perfil / CV» / «Profile / CV»; HS-T11 retirado).
Parte de `develop` (`7b16090`) con `web-trajectory-split` ya mergeado: no hay rebase (§4.3). Sin operaciones git de escritura.

## Resultado
`done`. Los 27 tests de vitest del plan (HS-T1…HS-T29 menos HS-T11, retirado, y HS-T27, solo CI) están escritos, uno por `it()`, y pasan.
Lint, typecheck, test y build en verde con Node 22.

## Archivos tocados (lista completa para el closer)

**Código y configuración**
- `lib/i18n/routes.ts`: `PAGES = ['services', 'profile']`; `PROFILE_SLUG = { es: 'perfil', en: 'profile' }` sustituye a `SERVICES_SLUG`. `resolveRoute`: sin segmentos → `services`, `[PROFILE_SLUG[lang]]` → `profile`, el resto → `null`. `routeSlug`, `routePath` y `alternatesFor` invertidos en consecuencia.
- `next.config.ts`: `async redirects()` con exactamente `{ source: '/servicios/', destination: '/', permanent: true }` y `{ source: '/en/services/', destination: '/en/', permanent: true }`, y un comentario sobre la barra final obligatoria (`trailingSlash` + comparación estricta).
- `components/site-header.tsx`: logo → `#inicio` en Servicios y `routePath({ lang, page: 'services' })` desde el Perfil. Ningún enlace nuevo (HS-D1).
- `components/mode-toggle.tsx`: **solo el comentario JSDoc** («Services / Profile switch (in the order of `PAGES`)»); el código no cambia (ver Desviaciones, 2).
- `lib/i18n/dictionaries.ts`: `mode.profile` = «Perfil / CV» / «Profile / CV»; `cajetin.sheets` = `{ profile: '02 / 02 · Perfil', services: '01 / 02 · Servicios' }` y `{ profile: '02 / 02 · Profile', services: '01 / 02 · Services' }`.
- `.github/workflows/ci.yml` (paso «Smoke test the container»): `curl` a `/perfil/` con `grep -q '<h1'` y las dos comprobaciones `'%{http_code} %{redirect_url}'` de `/servicios/` (→ `308 http://localhost:3000/`) y `/en/services/` (→ `308 http://localhost:3000/en/`).

**Docs**
- `AGENTS.md`: solo la fila `app/` del mapa (rutas nuevas y las dos 308). **El bloque `<!-- BEGIN:nextjs-agent-rules -->` … `<!-- END:nextjs-agent-rules -->` del final no es de este slug** (lo añade `next dev`); no lo toqué. El closer decide cómo stagear el archivo (p. ej. `git add -p`).
- `CLAUDE.md`: «Qué es» (Servicios en `/` y `/en/`, Perfil en `/perfil/` y `/en/profile/`, 308 de las URLs viejas).
- `docs/web-standards.md`: sección «i18n» (tabla de rutas y las dos 308) y «SEO» (sitemap con las 4 URLs nuevas, x-default, `Person.url` → Perfil; «No hay redirección entre hosts» se mantiene).

**Tests**
- `lib/i18n/routes.test.ts`, `next.config.test.ts`, `components/site-header.test.tsx`, `components/cajetin.test.tsx`.
- `lib/seo/metadata.test.ts`, `lib/seo/json-ld.test.ts`, `app/sitemap.test.ts`.
- `components/home-view.test.tsx` (dos aserciones; ver Desviaciones, 1).
- `tests/helpers/runtime-pages.ts`: `PAGES` nuevo (`/` es/services, `/perfil/` es/profile, `/en/` en/services, `/en/profile/` en/profile, cada una con su canonical) y la constante nueva `OLD_SERVICES` (las dos URLs viejas y su `Location`).
- `tests/runtime/pages.test.ts`, `tests/runtime/pdf.test.ts`, `tests/runtime/domain.test.ts`, `tests/runtime/resilience.test.ts`.
- `tests/runtime/admin-content.test.ts`, `tests/runtime/admin-e2e.test.ts`, `tests/runtime/admin-history.test.ts`, `tests/runtime/admin-images.test.ts` (solo rutas).
- `tests/deploy/deploy-files.test.ts`, `tests/source.test.ts`.

**Informe:** `progress/web-home-services/impl.md` (este archivo).

**En la copia de trabajo pero NO son de este slug** (no tocados, no stagear con él): `deploy/docker-compose.yml` (Watchtower, de Julio), `progress/current.md` y `progress/history.md` (del leader), el bloque `nextjs-agent-rules` de `AGENTS.md`.

**No tocados** (como dice §3.4): `proxy.ts`, `scripts/parity/*`, `app/not-found.tsx`, `lib/pdf/*`, `lib/seo/*.ts`, `app/sitemap.ts`, `app/robots.ts`, `app/[[...slug]]/*`, `components/language-switch.tsx`, `components/mode-toggle.module.css`, `instrumentation.test.ts`, `components/home-view.tsx`.

## Mapa Tn → `it()`

| Tn | `it()` en archivo |
|---|---|
| HS-T1 (BA-T1) | `lib/i18n/routes.test.ts:6` · «HS-T1 (BA-T1): [], undefined, [perfil], [en] and [en, profile] resolve to the four pages …» |
| HS-T2 (BA-T2) | `lib/i18n/routes.test.ts:14` · «HS-T2 (BA-T2): the old services slugs, the profile slug in the wrong language or case, …» |
| HS-T3 (BA-T3) | `lib/i18n/routes.test.ts:22` · «HS-T3 (BA-T3): every route has its path and alternates …» |
| HS-T4 (extra de BA-T3) | `lib/i18n/routes.test.ts:31` · «HS-T4 (extra of BA-T3): there are exactly 4 routes, routeSlug is the inverse …, PAGES puts services first» |
| HS-T5 (T23, T240) | `next.config.test.ts:6` · «HS-T5 (T23, T240): standalone server, … exactly the two permanent redirects … and headers only on /admin» |
| HS-T6 | `next.config.test.ts:22` · «HS-T6: each redirect has the trailing slash on both sides, hides no live page …» |
| HS-T7 (BA-T20) | `components/site-header.test.tsx:34` · «HS-T7 (BA-T20): the toggle lists Servicios before Perfil / CV …» |
| HS-T8 (BA-T21, logo) | `components/site-header.test.tsx:55` · «HS-T8 (BA-T21, logo): the logo goes to #inicio on the services pages …» |
| HS-T9 | `components/site-header.test.tsx:69` · «HS-T9: on the 4 pages the profile segment is «Perfil / CV» / «Profile / CV» … the header’s only link to it» |
| HS-T10 (BA-T21, idioma) | `components/site-header.test.tsx:91` · «HS-T10 (BA-T21, language): the language switch links the same page in the other language …» |
| HS-T11 | **Retirado (HS-D1), cubierto por BA-T18** (`app/globals.test.ts`, en verde): sin enlace nuevo no hay clase nueva; el segmento del interruptor ya declara ≥44 px. |
| HS-T12 (BA-T27, BA-T28, BA-T29) | `components/cajetin.test.tsx:20` · «HS-T12 (BA-T27, BA-T28, BA-T29): services is sheet «01 / 02 · Servicios» and the profile «02 / 02 · Perfil» …» |
| HS-T13 (BA-T4, BA-T5, T29, T31, T87) | `lib/seo/metadata.test.ts:16` · «HS-T13 (…): the home / gets the services title and description; each page has its own canonical …» |
| HS-T14 (T87, BA-T7 T33) | `lib/seo/json-ld.test.ts:10` · «HS-T14 (T87, BA-T7 T33): Person.url is the profile of the language …» |
| HS-T15 (BA-T6, T87) | `app/sitemap.test.ts:7` · «HS-T15 (BA-T6, T87): lists exactly /, /perfil/, /en/ and /en/profile/ …» |
| HS-T16 (T27) | `tests/runtime/pages.test.ts:34` · «HS-T16 (T27): the 4 new routes answer 200 text/html …» |
| HS-T17 | `tests/runtime/pages.test.ts:48` · «HS-T17: /servicios/, /en/services/ and /servicios/?utm_source=ejemplo answer a 308 with a relative Location …» |
| HS-T18 | `tests/runtime/pages.test.ts:61` · «HS-T18: /servicios and /en/services without the slash reach / and /en/ in two 308 hops …» |
| HS-T19 (T28) | `tests/runtime/pages.test.ts:75` · «HS-T19 (T28): unknown languages, the profile slug in the wrong language, … are 404 …» |
| HS-T20 (T29) | `tests/runtime/pages.test.ts:86` · «HS-T20 (T29): one h1 and the landmarks, own title (the services one on /) …» |
| HS-T21 | `tests/runtime/pages.test.ts:124` · «HS-T21: the logo goes to #inicio on / and /en/ … and the cajetín sheets follow the pages» |
| HS-T22 (T59) | `tests/runtime/pdf.test.ts:75` · «HS-T22 (T59): only /perfil/ and /en/profile/ link the PDF of their language …» |
| HS-T23 (T88) | `tests/runtime/domain.test.ts:42` · «HS-T23 (T88): with SITE_URL=https://example.test, … JSON-LD (url = SITE/perfil/), the sitemap with the 4 new URLs …» |
| HS-T24 (T35, T40) | `tests/runtime/resilience.test.ts:41` · «HS-T24 (T35, T40): / shows a service changed … /perfil/ is a 500 and /servicios/ still answers its 308 to /» |
| HS-T25 (T31, T36 y nuevo) | `tests/runtime/pages.test.ts:172` · «HS-T25 (T31, T36): the private sentinels and labels …, and the API URL …, nor in the 308 answers of the old URLs» |
| HS-T26 (T50, T34) | `tests/runtime/pages.test.ts:371` · «HS-T26 (T50, T34): empty services, projects and architecture give 200 on the 4 new routes …» |
| HS-T27 | **Solo CI (no vitest).** Lo verifica el job `docker` (solo en push a `main`): el smoke con `design-api.mjs` ejecuta las tres líneas nuevas (`/perfil/` con `<h1`, `/servicios/` → `308 http://localhost:3000/`, `/en/services/` → `308 http://localhost:3000/en/`). En local no hay daemon Docker; el texto del smoke lo vigila HS-T28. Pendiente de la primera ejecución en `main`. |
| HS-T28 | `tests/deploy/deploy-files.test.ts:244` · «HS-T28: the smoke asks /perfil/ for an h1 and checks that /servicios/ and /en/services/ are 308s …» |
| HS-T29 | `tests/source.test.ts:108` · «HS-T29: AGENTS.md, CLAUDE.md and docs/web-standards.md describe the new routes …» |

Ids viejos sustituidos (ya no queda ningún `it()` con ellos): BA-T1…BA-T3 y el «extra» de `routes.test.ts` → HS-T1…HS-T4; T23 → HS-T5;
BA-T20 → HS-T7; BA-T21 → HS-T8 + HS-T10; BA-T27…BA-T29 → HS-T12; BA-T4, BA-T5, T29, T31 y T87 de `metadata.test.ts` → HS-T13;
T87 y BA-T7 (T33) de `json-ld.test.ts` → HS-T14; BA-T6 y T87 de `sitemap.test.ts` → HS-T15; T27, T28, T29, T31 + T36, T50 + T34 de
`pages.test.ts` → HS-T16, HS-T19, HS-T20, HS-T25, HS-T26; T59 → HS-T22; T88 → HS-T23; T35 + T40 → HS-T24.

**Ajuste sin id nuevo** (§3.6): T339 (título y lecturas), T340 de `admin-content`, T420 de `admin-e2e`, T400 de `admin-history` y el test de
`admin-images` (l. 205) leen `/` y `/en/` en lugar de `/servicios/` y `/en/services/`. Las lecturas que ya iban a `/` o `/en/` por proyectos y
arquitectura (en las dos páginas) no cambian.

## Criterio → tests

| Criterio | Tests |
|---|---|
| HS-A1 Rutas | HS-T1, HS-T2, HS-T3, HS-T4, HS-T16, HS-T19 |
| HS-A2 Redirecciones | HS-T2, HS-T5, HS-T6, HS-T17, HS-T18, HS-T24 |
| HS-A3 Logo | HS-T8, HS-T21 |
| HS-A4 Segmento «Perfil / CV» | HS-T7, HS-T9, HS-T21 (HS-T11 retirado: el objetivo ≥44 px lo cubre BA-T18, en verde) |
| HS-A5 Interruptor e idioma | HS-T4, HS-T7, HS-T10, HS-T21 |
| HS-A6 Cajetín | HS-T12, HS-T21 |
| HS-A7 SEO | HS-T3, HS-T13, HS-T14, HS-T15, HS-T20, HS-T23 (más T91 de `domain.test.ts` y `app/robots.test.ts`, en verde y sin cambios: `robots.txt` no cambia) |
| HS-A8 PDF | HS-T22 (más T57, T58, T62 y T66 de `tests/runtime/pdf.test.ts`, sin cambios) |
| HS-A9 Docs, tests y CI | HS-T27 (CI), HS-T28, HS-T29, el ajuste de los tests de admin y la comprobación con grep de abajo |
| HS-A10 Resiliencia y privacidad | HS-T14, HS-T24, HS-T25, HS-T26 (más T37–T39 de `resilience.test.ts`, que ahora piden `/` = Servicios, en verde) |

**Comprobación con grep (§4.3, HS-A9).** `grep -rn "servicios\|/en/services" tests app components lib *.test.ts`: las únicas lecturas de
`/servicios/` o `/en/services/` que quedan son las de las redirecciones (`pages.test.ts` HS-T17, HS-T18, HS-T25 y el 404 de `/en/servicios/` en
HS-T19; `resilience.test.ts` HS-T24; la constante `OLD_SERVICES` de `tests/helpers/runtime-pages.ts`). Además siguen, sin leer ninguna página:
`instrumentation.test.ts` (ruta de ejemplo para sanear logs, §0.6) y `proxy.test.ts` l. 35 (comprueba que el matcher del proxy **no** cubre
`/servicios/`). El resto de coincidencias son textos («Historial de servicios», «01 / servicios») o el modo `servicios` de `scripts/parity`.
TR-T26 (T32) da las cejas de A en `/perfil/` y `/en/profile/` (tabla indexada por `(mode, lang)`), y `tests/runtime/trajectory.test.ts` pasa sin tocarlo.

## Desviaciones y notas
No hay desviaciones de diseño. Notas de implementación:
1. **`components/home-view.test.tsx`, fuera de la lista de §3.4.** El plan (§4.2) dice que B no toca ese test, pero dos aserciones (en
   «CO-T18 / T51» y en «TR-T14 (BA-T37, T47, CO-T81)») tomaban **todo** `a[href^="#"]` del nav de la página de Servicios y esperaban
   `['#projects', '#contact']`. Con HS-A3 el logo de Servicios es `#inicio`, dentro del mismo nav, y fallaban. Su intención es «el nav
   conserva los enlaces a proyectos y contacto», así que el selector pasa a `[data-probe="navlinks"]` (los enlaces de sección). Mismos
   ids, mismo comportamiento comprobado; ninguna otra línea del archivo cambia. BA-T22 (todo ancla del nav existe) sigue igual y en verde:
   `#inicio` existe en Servicios.
2. **`components/mode-toggle.tsx`:** solo cambia el comentario (decía «Profile / Services switch»), para que no quede viejo con el orden
   nuevo. El código no cambia, como pide §3.3.
3. **Tests fusionados («uno por Tn»).** Donde el plan da un solo Tn para varios tests viejos, van en un único `it()` que conserva todas sus
   aserciones (adaptadas a las rutas nuevas), para no perder cobertura:
   - HS-T12 incluye las celdas completas de BA-T27/BA-T28 y añade Perfil EN.
   - HS-T13 conserva lo que no era de rutas en T29 (title con nombre y label, description ≤160).
   - HS-T25 une T31 y T36 y añade los cuerpos de las 308 (con barra y sin ella), más sus cabeceras `Location` y `Refresh`.
   - HS-T26 une T50 y T34 (este último ahora con `/` y `/en/profile/`).
   - HS-T24 une T35 y T40 y añade el caso nuevo (API caída desde el inicio: `/perfil/` 500 sin internals, `/servicios/` 308 a `/`).
4. **T240 conserva su id.** §3.4 dice que se reescribe solo «la línea `redirects` de T240». Esa línea (`not.toHaveProperty('redirects')`)
   desaparece de T240, y HS-T5 cita T240 porque asume la parte de «sin redirecciones» (ahora, exactamente dos). HS-T5 también comprueba que
   `headers()` sigue con solo `/admin/:path*` y que ninguna regla lleva `statusCode`, `has`, `missing`, `basePath` ni `locale`.
5. **HS-T14 sustituye T87 y BA-T7 (T33)**, el BA-T7 que fijaba el `url`. BA-T7 (T34) (escape de `</script>`) y BA-T7 (T35) (sin
   `telephone`/`birthDate`/`taxID`/email en ES) siguen igual, porque no dependen de rutas; HS-T14 repite la comprobación de privacidad en
   ES y EN, como pide el plan.
6. **HS-T9 y HS-T21, «ningún otro enlace al Perfil».** En el propio Perfil, el selector de idioma enlaza el Perfil del **otro** idioma (es
   el mismo `routePath` de BA-T21, ahora HS-T10). Por eso la comprobación se hace por idioma: el único `a[href]` al Perfil del idioma de la
   página es el segmento. HS-T9 además exige que la única otra URL de Perfil en la cabecera sea ese enlace de idioma (con `hreflang` del
   otro idioma, solo en el Perfil).
7. **Idioma de los docs.** `AGENTS.md`, `CLAUDE.md` y `docs/web-standards.md` están escritos en español. Las líneas nuevas siguen el idioma
   del archivo (HS-T29 busca esos textos).
8. **Entorno.** Como en el slug anterior, toda la verificación se hizo con Node 22.23.1 (`source ~/.nvm/nvm.sh && nvm use 22`), porque el
   v20 por defecto rompe los workers de vitest. El `next dev` del leader en el puerto 3100 siguió corriendo durante el build. Recargó la
   config sola: `/`, `/perfil/`, `/en/` y `/en/profile/` → 200; `/servicios/` → `308 http://localhost:3100/`; `/en/services/` →
   `308 http://localhost:3100/en/`; `/servicios` → `308 …/servicios/`. El interruptor de `/` dice «Servicios», «Perfil / CV».

Tests extra fuera del plan: ninguno.

## Verificación (Node 22.23.1)
- `npm run lint`: exit 0, sin problemas.
- `npm run typecheck`: exit 0.
- `npm test`: **156 archivos, 729 tests, todos en verde** (exit 0; 24 s). Incluye el `next build` único del global setup y todos los tests de
  runtime. Antes del slug eran 732 tests: los `it()` de los archivos tocados pasan de 123 a 120 por las fusiones de la nota 3.
- `npm run build` (sin `CV_API_URL` ni `SITE_URL`): exit 0. Siguen dinámicas `ƒ /[[...slug]]`, `ƒ /sitemap.xml`, `ƒ /robots.txt`, `ƒ /api/*` y
  `ƒ /cv-julio-flores-{es,en}.pdf`. `.next/routes-manifest.json` trae las dos reglas nuevas con `statusCode: 308`, detrás de las dos internas
  de `trailingSlash`, como prevé §0.3.
- No verificado en local: HS-T27 (smoke del job `docker`, solo CI) y la revisión visual a 360 px de que «Perfil / CV» cabe en la cabecera
  (HS-D7, la valida Julio).
