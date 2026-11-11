APPROVED

# Review — web-redesign-referencia (RF), ronda 1

Ejecutado por el reviewer con Node 22.23.1: `npm run lint` OK · `npm run typecheck` OK · `npm test` OK (24 archivos, 102 tests) · `npm run build` OK (7 páginas estáticas; no se probó API caída: este slug no toca `app/`/`lib/`). No se escribió código ni se usó git de escritura (solo `git status`).

## Trazabilidad Tn ↔ it()
| Tn | it() | Qué comprueba | Resultado |
|---|---|---|---|
| RF-T1 | render-reference.test.ts «RF-T1» | h1 «Construyo el núcleo…», 6 `button.node`, solo el 1.º `aria-pressed=true`, sin `{{`/`sc-if`/`sc-for` | OK |
| RF-T2 | «RF-T2» | clase `obra`, 4 tarjetas (1.ª pressed), aside «Tu encargo» con 1 `li` | OK |
| RF-T3 | «RF-T3» | sel=3 → nodo 4 pressed (único), «04 / 06», 2 `li` | OK |
| RF-T4 | «RF-T4» | sin `/_blob/`, googleapis ni gstatic; `@font-face` a `/app/fonts/`; referencia a hex-grid | OK |
| RF-T5 | serve.test.ts «RF-T5» | 200 + Content-Type de html/svg/woff2; `..`, `/app/fonts/../..` y `%2e%2e` → 403/404 | OK |
| RF-T6 | design-api.test.ts «RF-T6» | 6 puertos × 1 adaptador, 4 servicios (4.º `price:null`), proyectos con links/highlights, `?lang=en` distinto | OK |
| RF-T7 | «RF-T7» | regex de datos privados sobre 4 recursos × ES/EN; `parseResume` en `/resume` | OK (ver R4) |
| RF-T8 | spec.test.ts «RF-T8» | claves únicas con `ref`/`web`; clamps 1440/390 con los números del plan | OK |
| RF-T9 | «RF-T9» | la sonda devuelve valor no nulo para toda clave de `ref` en ambos modos | OK |
| RF-T10 | diff.test.ts «RF-T10» | 0 % / exit 0 y >3 % en la banda cambiada / exit 1 (también vía CLI) | OK |
| RF-T11 | hex-grid.test.ts «RF-T11» (x2) | 84×48.5, sin `<image>`/href/url(), un solo color de paleta | OK en lo que dice, pero no detecta R1 |

Extra fuera de plan (`probe self-contained`): legítimo, documentado en impl.md.

## Trazabilidad criterios ↔ tests
RF-A1 T1–T4 · RF-A2 T4 (las fuentes son archivos reales de `app/fonts`, servidas en T5) · RF-A3 T5 (servidor solo lectura: verificado en código, `serve.mjs` no escribe) · RF-A4 T6–T7 · RF-A5 T8–T9 · RF-A6 T10 · RF-A7 T11. Todos los criterios tienen al menos un Tn. Cobertura completa.

Limitación honesta: T9 solo prueba que los selectores `ref` existen en el render (jsdom no calcula layout/cascada/`var()`); los valores numéricos de `spec.mjs` no se contrastan con el render en ningún test. Eso queda para Chrome DevTools (PA), como declara impl.md §7. No es incumplimiento de RF-A5.

## Fidelidad del render a `Main.dc.html`
Verificado ejecutando `npm run parity:reference` (5 variantes) y comparando con el original:
- El render no reimplementa el diseño: evalúa el `Component` del propio artifact (`renderVals`) y expande `sc-if`/`sc-for`/`{{}}` sobre el DOM original. Textos, estructura, estilos inline y CSS del `<helmet>` salen idénticos por construcción. Sin `undefined`/`null`/`NaN`/`[object` en ninguna variante. Acento correcto: `#C6F24E` en perfil, `#2FC98A` en servicios.
- Diferencias deliberadas y correctas: sin `<link>` a Google Fonts (sustituido por `@font-face` a los woff2 locales), blobs sustituidos por `/hex-grid-*.svg` (primero plano, segundo obra; coincide con `.gridbg` / `.obra .gridbg`), sin `onClick` (estático), sin wrapper `<x-dc>`, `<meta viewport>` añadido.
- Valores de `spec.mjs` contrastados a mano con el diseño: h1 `clamp(56px,8.4vw,124px)`/0.9 → 120.96/108.864 y 56/50.4; h2 `clamp(40,5vw,64)`; contacto `clamp(48,6.4vw,96)` → 92.16/48; nodo `clamp(11,1.25vw,15)` (ref 11 en 390, web 12 por D1); núcleo 30 % de 540 = 162 y 20 % = 108. Coherentes.
- Hueco: los SVG de fondo son una reconstrucción (los blobs originales no existen); la opacidad 0.07/0.09 es estimada (decisión 2 de impl.md; confirmación humana en PA). Ver R1 por un defecto de construcción del patrón.

## Privacidad
- Sin teléfono, documento ni fecha de nacimiento en `design-data.json` ni en el render (revisado por regex y a ojo; email `hola@example.test`, perfiles LinkedIn/GitHub genéricos). OK.
- Observación (no bloqueante, ver abajo): `design-data.json` contiene el copy real del diseño (nombre, empleador, trayectoria, proyectos con URL de PadelHub). El plan (RF-A4) lo decide así y `docs/web-standards.md` lo declara solo-herramienta. C3 literal («ningún dato real del CV commiteado») queda a criterio del humano.

## Skills consultadas
Criterios de cada skill aplicados manualmente sobre el diff (no se cargó el contenido de las skills con la herramienta `Skill`).
- `simplify`: duplicación en `scripts/parity` (R2): `render-reference.mjs:11` y `serve.mjs:11` recalculan `ROOT`; `serve.mjs:70-71` y `design-api.mjs:38-39` duplican el parseo de `--port`; `diff.mjs` tiene su propio helper `option()` y los 5 `.mjs` repiten el guard `process.argv[1] === fileURLToPath(import.meta.url)`. Código muerto: ninguno hallado (`VIEWPORTS`, `TOLERANCES`, `toleranceFor`, `expectedAt`, `resolveExpected` están exportados para slugs posteriores; `TOLERANCES`/`toleranceFor`/`expectedAt` no se usan aún en el repo, solo por diseño: aceptado, ver observaciones).
- `next-best-practices`: sin hallazgos (no se tocó `app/` ni componentes; `public/` y `app/fonts` solo contienen assets; build verde).
- `strict-typing`: R3. `scripts/parity/*.mjs` no se tipan en `tsc` (solo `allowJs`, sin `checkJs`): `lookup`, `expandElement`, `expandAttributes`, `padTo`, `option`… tienen parámetros implícitamente `any` sin comprobar. En tests: `spec.test.ts:13` (`found?.at as Record<number, number>`), `diff.test.ts` (`a!`, `b!`, `c!`).
- `seo-audit`: no aplica (sin metadata/SEO).
- `ui-ux-pro-max`: no se toca UI de producto; solo los SVG de fondo (R1).
- `testing-strategy`: sin hallazgos adicionales sobre T1–T11; ver R4 (aserciones débiles).

## Checkpoints
- C1: lint/typecheck/test/build en verde. Sin `console.log`, TODO ni FIXME en `scripts/parity`. Código muerto: no. Duplicación: R2 (pendiente). **No marcado hasta R1–R3.**
- C2: todos los criterios mapeados a Tn con `it()` real y aserciones de comportamiento (matiz R4). Fixtures: el único dato no ficticio es `design-data.json` (ver Privacidad).
- C3: sin teléfono/documento/nacimiento. Dato real: ver observación.
- C4: N/A para este slug (no se toca `lib/api` ni componentes; `design-api` es herramienta externa).
- C5: N/A (sin UI/SEO de producto en este slug).
- C6: `progress/web-redesign-referencia/{brief,impl,review}.md`. `progress/current.md` no revisado en profundidad (fuera de alcance de este slug).
- C7: pendiente de autorización humana; no se hizo git de escritura.

## Cambios requeridos (priorizados)
R1. **Patrón hexagonal con aristas dobles** — `public/hex-grid-plano.svg` y `public/hex-grid-obra.svg`: el tile dibuja 5 `<polygon>` (hexágonos en (0,0), (84,0), (0,48.5), (84,48.5), (42,24.25)) con `stroke-opacity`; las aristas compartidas entre ellos se pintan dos veces y su alfa se compone (0.07 → ~0.135; 0.09 → ~0.17), mientras que las de borde de tile se pintan una vez. El resultado es una malla con intensidad desigual, no el panal uniforme del diseño. Corrección: emitir cada arista una sola vez (un único `<path>` con las 3 direcciones de arista únicas por tile) o usar `stroke-opacity` en el grupo (`<g opacity>`), no por polígono; mantener 84×48.5, trazo 1 px, colores de paleta. Además impl.md dice «2 hexágonos por tile» y hay 5 polígonos: alinear el texto con el archivo final. Añadir a RF-T11 una aserción que impida aristas duplicadas (p. ej., número de `<polygon>` o que el trazo esté en un único elemento).
R2. **Duplicación en `scripts/parity`**: exportar `ROOT` desde `render-reference.mjs` (ya lo importa `serve.mjs`) y reutilizarlo; extraer un helper único para leer `--port`/opciones CLI y reutilizarlo en `serve.mjs`, `design-api.mjs` y `diff.mjs` (`option()`).
R3. **Tipado estricto**: (a) quitar los casts/aserciones de no-nulo en tests (`spec.test.ts:13`; `a!`/`b!`/`c!` en `diff.test.ts`) estrechando el tipo en lugar de forzarlo; (b) activar comprobación de tipos sobre los `.mjs` (`// @ts-check` en cada uno o `checkJs` acotado a `scripts/parity`) y tipar los parámetros hoy implícitos (`lookup`, `expandElement`, `expandAttributes`, `expandChildren`, `padTo`, `option`). Si `checkJs` fuera inviable, justificarlo por escrito en impl.md.
R4. **Aserciones débiles**: `RF-T8` solo comprueba `toBeTruthy()` de `ref`/`web`; añadir que `web` coincide con `[data-probe="<key>"]` (es el contrato que los otros slugs deben implementar) y que `ref` es un selector CSS válido (`document.querySelector` no lanza). `RF-T7` (regex `\d[\d\s-]{8,}\d`) es frágil frente a fechas ISO/`period` y teléfonos con punto o paréntesis: ampliar el patrón o validar por campos (`contact` solo `email`+`profiles`) sin hacerlo pasar por casualidad.
R5. **impl.md**: actualizar tras R1 («2 hexágonos por tile») y anotar que `serve.mjs` no tiene script npm (ya lo declara) sin más cambios.

## Observaciones fuera de alcance
- `TOLERANCES`, `toleranceFor`, `expectedAt`, `resolveExpected`, `TOKENS` y `VIEWPORTS` en `spec.mjs` están pensados para los slugs `base`/`hexagon`/`contenido`/`paridad` (decisión del plan); si ese consumo no llega, serán código muerto: revisar en el slug `paridad`.
- `design-data.json` contiene copy real del diseño (incl. un enlace de PadelHub con id de torneo). El plan lo aprueba para herramienta local; conviene que el humano confirme que es aceptable en el repo (C3) o sustituir el enlace por uno genérico.
- Los selectores `[data-probe="..."]` y las fuentes `@fontsource/*` (devDeps) deben cubrirse en `base` (según impl.md); no hay dependencia `@fontsource` aún en `package.json`: los woff2 de `app/fonts` se copiaron a mano.
- La sonda no se ha validado en Chrome real (solo jsdom); es trabajo de `paridad`.
- El repo de trabajo muestra la rama `develop` con todo sin trackear: la regla «nunca trabajar sobre develop» es del cierre (`closer`); no se evalúa aquí.


## Segunda pasada
Node 22.23.1: `npm run lint` OK · `npm run typecheck` OK · `npm test` OK (24 archivos, 104 tests) · `npm run build` OK. Verificado en el código, no solo en impl.md.
- R1 corregido. Ambos SVG tienen un unico `<path>` y un unico `stroke-opacity` (0.07 / 0.09), sin `<polygon>`; 8 segmentos unicos. Verificacion de costura: renderice el tile (sharp, 8x) en 3x3 y lo compare pixel a pixel con una malla continua sin recortes (mismo path trasladado): diferencia media 0.005/255, 0 pixeles con diferencia >40 de 2.3M. Alfa maximo = un solo trazo (sin composicion); filas y=0 / y=48.5 y columnas x=0 / x=84 se complementan en medio trazo (4+4 px a 8x). Repite sin costuras. RF-T11 gano el test «cada arista una vez».
- R2 corregido. `common.mjs` centraliza `ROOT`, `option()`, `isMain()`; los 5 scripts los usan (sin `ROOT`/`--port`/guard duplicados).
- R3 corregido. `// @ts-check` + JSDoc en los 7 `.mjs`, typecheck estricto verde; sin `!`/`as` en `spec.test.ts` ni `diff.test.ts`. Nit no bloqueante: `server.address() as AddressInfo` en `serve.test.ts:32` y `design-api.test.ts:34`.
- R4 corregido. RF-T8 exige `web === [data-probe="<clave>"]` y selectores validos; RF-T7 valida por claves/valores (contact solo `email`+`profiles`, telefono, fechas, palabras sensibles).
- R5 corregido: impl.md describe el path unico y la «Ronda 2».
- Sin regresiones ni duplicacion nueva. Pendiente humano (sin cambio): C3 sobre el copy real en `design-data.json`, validacion de opacidad en PA, C7.
