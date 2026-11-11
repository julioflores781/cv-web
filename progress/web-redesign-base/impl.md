# Impl — web-redesign-base (BA)

Verificado con Node 22.23.1: `npm run lint` (0 avisos), `npm run typecheck`, `npm test` (32 archivos, 127 tests, incluidas 4 construcciones reales en `tests/build`) y `npm run build`, todo verde. Sin git de escritura.

## Mapa Tn → test
| Test | Archivo (`it`) |
|---|---|
| BA-T1, T2, T3 | `lib/i18n/routes.test.ts` |
| BA-T4, T5 | `lib/seo/metadata.test.ts` |
| BA-T6 | `app/sitemap.test.ts` |
| BA-T7 | `lib/seo/json-ld.test.ts` («BA-T7 (T33/T34/T35)», sin cambios de código en `json-ld.ts` salvo la URL por ruta) |
| BA-T8, T9, T10, T11, T14, T15, T19 | `app/globals.test.ts` |
| BA-T16, T17, T18 | `app/globals.test.ts` («css behaviour») |
| BA-T12, T13 | `app/fonts.test.ts` |
| BA-T20, T21, T23 | `components/site-header.test.tsx` |
| BA-T22, T37 | `components/home-view.test.tsx` |
| BA-T24, T25, T26 | `components/hero.test.tsx` |
| BA-T27, T28, T29 | `components/cajetin.test.tsx` |
| BA-T30, T31, T32 | `components/trajectory.test.tsx` |
| BA-T33 | `components/impact-band.test.tsx` |
| BA-T34 | `components/stack-list.test.tsx` |
| BA-T35 | `components/architecture-layers.test.tsx` (DOM + CSS de la capa central) |
| BA-T36, T38 | `components/ui/ui.test.tsx` |
| BA-T39 | `components/contact.test.tsx` |
| BA-T40 | `lib/contact-links.test.ts` |
| BA-T41 | `components/site-footer.test.tsx` |
| BA-T42, T43 | `lib/i18n/i18n.test.ts` |
| BA-T44 … T51 | `tests/build/build.test.ts` (T44, T45, T46, T47, T48, T49, T51 y dos `it` «BA-T50»: con respaldo / sin respaldo) |
| BA-T52 | protocolo (abajo) |

Tests anteriores que siguen vigentes: T23–T28 (i18n/format), T33–T35, T60, T61, T64, T67 (build), T68–T70, T74. Test extra fuera del plan: routes `routeSlug` inversa; `initials`/`earliestYear`; `home-view` landmarks en las 4 páginas y BA-A9; `contact` (id, número, título); nav con ancla única; i18n ES≠EN.

## Criterio → tests
A1 T1–T2, T44 · A2 T3–T7, T45–T46 · A3 T8–T11, T19, T45 · A4 T12–T14, T49 · A5 T15, T51 · A6 T18, T20–T23, T49 · A7 T24–T26, T43 · A8 T26–T29 · A9 T22, T30–T35, T47 + test BA-A9 · A10 T36–T38 · A11 T39–T40 · A12 T41 · A13 T16 · A14 T17, T52 · A15 T7, T42, T48–T49 · A16 T50 · A17 T52.

## Archivos
- Nuevos: `app/fonts.ts`, `lib/i18n/routes.ts`, `lib/contact-links.ts`, `components/ui/{section-shell,section-head,eyebrow,cta,hex-mark}.tsx` + `ui.module.css`, `components/{mode-toggle,language-switch,impact-band,trajectory,architecture-layers,stack-list,cajetin}.tsx` + CSS, `app/not-found.module.css`, `tests/helpers/{fake-api,css}.ts`.
- Reescritos: `app/globals.css` (único lugar de tokens), `app/icon.svg`, `app/[[...slug]]/{layout,page}.tsx` (sustituye a `[[...lang]]`), `app/sitemap.ts`, `app/not-found.tsx`, `components/{site-header,hero,home-view,site-footer,contact}`, `lib/seo/metadata.ts`, `lib/i18n/{config,dictionaries,format}.ts`, `tests/fixtures/resume.ts` (6 grupos de skills, formación ES/EN), `tests/build/build.test.ts`.
- Eliminados: `impact`, `experience`, `skills` (+CSS y tests), `deriveHandle`, `langToPath`.
- `package.json`: devDeps exactas `@fontsource/{barlow-condensed,ibm-plex-sans,ibm-plex-mono}@5.3.0` (las pedía RF; necesarias para BA-T13 y el PDF).
- `eslint.config.mjs`: ignora `design/artifact-v2/.shots/**` (capturas/JSON locales).
- Cada elemento medido lleva `data-probe="<clave>"` del `spec.mjs`.

## Desviaciones / interpretaciones (a revisar)
1. **Variables de `next/font`**: `--face-head|text|mono` (no `--font-*`), porque `globals.css` define `--font-head|text|mono` componiéndolas con el respaldo (BA-T12 y BA-T14 no pueden cumplirse con el mismo nombre). 
2. **Nombre de familia computado**: `next/font/local` emite `@font-face` con familia `head`/`text`/`mono`, no «Barlow Condensed»… Son las mismas fuentes (los 7 woff2). Desde la revisión, `scripts/parity/probe.mjs` normaliza el lado `web` (head→Barlow Condensed, text→IBM Plex Sans, mono→IBM Plex Mono), así que BA-T52 compara `fontFamily` sin interpretación manual.
3. **CTA del hero (BA-A7 vs BA-T24)**: tomé BA-T24: el primario (acento) va a `#contact` («Escríbeme» / «Get in touch»; en Servicios «Pedir presupuesto»); «Ver trayectoria» es el secundario (`#experience`, solo con experiencia). «Ver proyectos» llega con CO.
4. **Copy de capas A–A′**: se quitaron «Prisma, TypeORM, Auth0, WebSocket, Docker» y «Java 17+ y TypeScript» (datos no verificables del §0); texto genérico en ES/EN.
5. **Contacto sin formulario**: tarjeta con email y redes (`--surface`, borde) en la columna derecha, como el hueco del formulario.
6. **Formación** en el timeline: un `li` por titulación/certificado/curso; la columna mono muestra «Formación/Certificado/Curso» en lugar del periodo.
7. **`cajetin` sin media query ≤640 (`architecture-layers` sí tiene la suya, solo de padding/rejilla a 390)**: sustituir el padding/la rejilla rompía la paridad a 390 (spec: layers 24 px; celdas del cajetín 16 px); su rejilla `auto-fit minmax(min(200px,100%),1fr)` ya es de 1 columna a 390. BA-T17 solo exige media query a hero, impacto, `ui`.
8. Logo: en Perfil va a `#inicio`; en Servicios a la ruta de Perfil del idioma (BA-T21).
9. Idioma: dos controles ES/EN (actual marcado con `aria-current` y subrayado; el otro es enlace con `hreflang`).
10. Franja de impacto: valor en `--ink` (el acento sobre `--bg` de obra no pasa contraste).

## BA-T52 (protocolo, Chrome DevTools) — ejecutado por el implementer
Preparación: `node scripts/parity/design-api.mjs --port 4020`; `CV_API_URL=http://localhost:4020 CV_CACHE_DIR=/tmp/cvcache npm run build`; `python3 -m http.server 4030 --directory out`; `node scripts/parity/serve.mjs --port 4010` (referencia `perfil.html`/`servicios.html`). Para cada combinación: `emulate` 1440x900 / 390x844 mobile, `evaluate_script` con la función de `node scripts/parity/probe.mjs <ref|web> <modo>` y comparación con `spec.mjs` (`expectedAt`, `toleranceFor`) de las claves de BA-A17.
- Perfil 1440 y 390: 0 diferencias fuera de tolerancia (solo el alias de familia, desviación 2).
- Servicios 1440 y 390: 0 diferencias en las claves construidas. Faltan por diseño de este slice: `cta-secondary` (sin proyectos), `section`/`section-alt`/`h2` (sin secciones numeradas hasta CO); `toggle-button` mide el primer botón (inactivo) igual en ambos lados.
- Sin desbordamiento horizontal a 390 (`scrollWidth 390 = innerWidth`, Perfil).
- Capturas y JSON en `design/artifact-v2/.shots/` (gitignored): `web-perfil-1440.png`, `web-perfil-390.png`, `web-servicios-1440.png`, `ref-perfil-1440.png`, `*-{perfil,servicios}-{1440,390}.json`. **No ejecutado**: diff de píxeles por bandas (`parity:diff`) ni capturas de la referencia a 390/servicios, ni foco por teclado/reduced-motion emulado, ni la confirmación humana del fondo hexagonal (PA-A7): quedan para el reviewer.

## Revisión 1 (cambios del reviewer)
1. **Anclas tapadas (alto)**: nuevo `components/header-offset.tsx` (cliente, `ResizeObserver`) publica la altura real de `<header id="site-header">` en `--header-h` de `<html>`; `scroll-margin-top` de hero/`ui` ya lo usaba, así que sigue coherente en cualquier ancho/idioma (73 px desktop, ~187 px a 390). `--header-h: 73px` queda como respaldo del primer pintado. Test `BA-T53` (`components/header-offset.test.tsx`): sigue cambios de altura y limpia al desmontar. Sin duplicar CSS ni cambiar el diseño de la cabecera (paridad intacta).
2. **`isLang`** eliminado de `lib/i18n/config.ts`; T24 ajustado (comprueba `LANGS`).
3. **Desviación 7** corregida (arriba): solo el cajetín carece de media query.
4. **Alias de fuente** en `scripts/parity/probe.mjs` (desviación 2).
Verificado en Chrome DevTools sobre `out/`: 390 px → cabecera 187 px, `--header-h` 187px, `#contact` queda en top 187 (justo bajo la cabecera); 1440 px → cabecera 75 px y `--header-h` 75px (medido); `#contact` queda a 295 px porque el final de página no permite más scroll. Lint, typecheck, test (33 archivos / 128 tests) y build en verde con Node 22.
