# Impl — web-redesign-referencia (RF)

Verificado con Node 22.23.1: `npm run lint`, `npm run typecheck`, `npm test` (24 archivos, 104 tests) y `npm run build`, todo verde. Sin git de escritura.

## Mapa Tn → test
| Test | Archivo (`it`) |
|---|---|
| RF-T1 | `scripts/parity/render-reference.test.ts` — «RF-T1…» |
| RF-T2 | `scripts/parity/render-reference.test.ts` — «RF-T2…» |
| RF-T3 | `scripts/parity/render-reference.test.ts` — «RF-T3…» |
| RF-T4 | `scripts/parity/render-reference.test.ts` — «RF-T4…» |
| RF-T5 | `scripts/parity/serve.test.ts` — «RF-T5…» |
| RF-T6 | `scripts/parity/design-api.test.ts` — «RF-T6…» |
| RF-T7 | `scripts/parity/design-api.test.ts` — «RF-T7…» (por claves y valores, no por regex sobre el JSON) |
| RF-T8 | `scripts/parity/spec.test.ts` — «RF-T8…» (`web` = `[data-probe="<clave>"]`, selectores válidos) |
| RF-T9 | `scripts/parity/spec.test.ts` — «RF-T9…» |
| RF-T10 | `scripts/parity/diff.test.ts` — «RF-T10…» |
| RF-T11 | `scripts/parity/hex-grid.test.ts` — «RF-T11…» (2 `it` por SVG: medidas/paleta y «cada arista una vez») |

Test extra fuera del plan: `spec.test.ts` «serialised probe script is self-contained» (el script que imprime `probe.mjs` para `evaluate_script` corre solo, sin imports).

## Criterio → tests
RF-A1 T1–T4 · RF-A2 T4 · RF-A3 T5 · RF-A4 T6–T7 · RF-A5 T8–T9 · RF-A6 T10 · RF-A7 T11.

## Archivos
- `scripts/parity/`: `common.mjs` (ROOT, `option()`, `isMain()`), `render-reference.mjs`, `serve.mjs`, `design-api.mjs`, `design-data.json`, `spec.mjs`, `probe.mjs`, `diff.mjs` + tests.
- `public/hex-grid-plano.svg`, `public/hex-grid-obra.svg` (tile 84×48.5, trazo 1 px, un único `<path>` con las 8 aristas del tile dibujadas una sola vez: 4 diagonales, las horizontales y=0/y=48.5 —medio trazo cada una dentro del tile— y y=24.25 en 2 trozos; sin polígonos solapados, así el alfa no se compone y el patrón repite sin costuras).
- `package.json`: scripts `parity:reference|api|diff`; devDeps exactas `pixelmatch@8.0.0`, `pngjs@7.0.0`, `@types/pngjs@6.0.5`.
- `tsconfig.json`: `allowJs: true`; cada `.mjs` de `scripts/parity` lleva `// @ts-check` y JSDoc (typecheck estricto, sin `any` implícito). Único cast: `getComputedStyle` indexado por nombre en `probe.mjs` (la sonda debe seguir siendo autocontenida).
- `.gitignore`: `design/artifact-v2/.rendered/` y `.shots/`. `docs/web-standards.md`: sección «Paridad visual».
- `app/fonts/*.woff2` (7 archivos): copiados byte a byte de `@fontsource/{barlow-condensed,ibm-plex-sans,ibm-plex-mono}@5.3.0` (`npm pack`, nombres originales `*-latin-<peso>-normal.woff2`). Hacían falta ya: el render y RF-T4/RF-T5 los usan. El slug `base` solo debe añadir los devDeps `@fontsource/*` y su test de identidad; no hay segunda copia.

## Decisiones / desviaciones menores (a revisar)
1. **Selectores `web` = `[data-probe="<clave>"]`** (generados en `spec.mjs`). Los componentes de `base`/`hexagon`/`contenido` deben emitir ese atributo en el elemento medido. Documentado en `docs/web-standards.md`.
2. **Opacidad del trazo hex** (plano 0.07, obra 0.09): estimada, no medida; los blobs del artifact son inaccesibles. La confirmación del patrón es humana (PA, punto 9).
3. Fuentes servidas por `serve.mjs` en `/app/fonts/<archivo>`; el render las referencia ahí (`FONT_URL_PREFIX`). Se añadió el render de 5 variantes (`perfil`, `servicios`, `perfil-sel2`, `servicios-sel3-picks12`, `servicios-sin-seleccion`).
4. No se añadió script npm para `serve` (el plan solo lista tres): `node scripts/parity/serve.mjs --port 4010`.
5. `spec.mjs` incluye claves extra respecto a la tabla (p. ej. `logo-mark`, `core-tag`, `panel-index`) para poder medir las partes de cada fila; `node` declara la desviación D1 con `refAt` (11 px en el diseño a 390).
6. `design-data.json` usa el copy del diseño (ES/EN) y precios/impacto ficticios; solo para la herramienta, no se publica.
7. La sonda se ha ejecutado solo sobre jsdom (RF-T9, sin layout real). Su validación en Chrome DevTools y `diff.mjs` sobre capturas reales corresponden al reviewer y a `paridad`.

## Ronda 2 (cambios del reviewer)
- R1: SVG reescritos (ver «Archivos»); RF-T11 añade test que prohíbe `<polygon>`, exige un solo `stroke-opacity` y un solo `<path>` y comprueba que sus segmentos son únicos (8).
- R2: `common.mjs` centraliza `ROOT`, `option()` (`--port`, `--band`, `--threshold`, `--out`) e `isMain()`; los 5 scripts lo reutilizan.
- R3: `// @ts-check` + JSDoc en todos los `.mjs`; tests sin `!` ni `as` (se estrecha el tipo o se lanza error). `expectedAt` en `spec.mjs` simplificado de paso al tipar.
- R4: RF-T8 verifica el contrato `web` y que `ref`/`web` son selectores válidos; RF-T7 recorre claves y valores (teléfono con separadores, fechas completas, palabras sensibles; `contact` solo `email`+`profiles`). «móvil/mobile» solo se rechaza como clave (aparece legítimo en «app móvil»).
