# Impl — web-redesign-hexagon (HX)

Verificado con Node 22.23.1: `npm run lint` (0 avisos), `npm run typecheck`, `npm test` (42 archivos, 173 tests, incluidas las 6 construcciones reales de `tests/build`) y `npm run build` (con `design-api`; con la API pública el build falla por diseño, 404 de `/architecture`). Sin git de escritura.

## Mapa Tn → test
| Test | Archivo (`it`) |
|---|---|
| HX-T1, T5 | `lib/api/schema.test.ts` |
| HX-T2, T3, T4 | `scripts/generate-api.test.ts` |
| HX-T6 | `lib/problem.test.ts` |
| HX-T7, T8 | `lib/api/request.test.ts` (T8: contrato de `fetchResume`; además siguen verdes `client.test.ts`, `get-resume.test.ts`, `cache.test.ts` = T1–T22 sin cambios) |
| HX-T9 … T12 | `lib/api/validate-content.test.ts` |
| HX-T13 … T20 | `lib/api/content.test.ts` |
| HX-T21, T22, T23 | `lib/architecture/model.test.ts` |
| HX-T24 … T35, T37, T39, T40 | `components/hex-plane.test.tsx` |
| HX-T36 | `components/hex-plane-section.test.tsx` (2 `it`) |
| HX-T38 | `components/hex-plane.module.test.ts` |
| HX-T41 | `tests/build/build.test.ts` (healthy) |
| HX-T42, T43 | `tests/build/build.test.ts` (`build with the architecture endpoint`; la parte «con respaldo» de T43 va añadida al `it` BA-T50 con la API caída) |
| HX-T44 | protocolo (abajo) |

## Criterio → tests
A1 T1–T5 · A2 T6–T8 · A3 T9–T20, T43 · A4 T21–T23, T37 · A5 T24–T25, T37–T38 · A6 T24, T26–T29, T32 · A7 T30–T31, T40 · A8 T24, T32–T35, T38 · A9 T36, T42 · A10 T38–T39 · A11 T41–T43 · A12 T44.

## Archivos
- Nuevos: `scripts/generate-api.mjs`, `lib/problem.ts`, `lib/api/{request,content,architecture,validate-content}.ts`, `lib/architecture/{model,slots}.ts`, `components/hex-plane.tsx` (+ `.module.css`), `components/hex-plane-section.tsx`, `components/ui/status-shape.tsx`, `tests/fixtures/{content.ts,openapi-mini.json,openapi-mini-incomplete.json}`, y los tests del mapa.
- Tocados: `scripts/strip-examples.mjs` (ahora exporta `stripExamples` y borra el `@example` con sus líneas de continuación), `package.json` (`generate:api`), `lib/api/{client,cache,errors,get-resume,index,types}.ts`, `lib/api/schema.d.ts` (regenerado), `lib/i18n/dictionaries.ts` (`plane`), `components/{hero,home-view}.tsx`, `app/[[...slug]]/page.tsx`, `components/ui/ui.module.css` (`.statusShape`), `tests/helpers/fake-api.ts` (`/architecture`), `tests/build/build.test.ts`, `progress/current.md`.
- `getResume` / `fetchResume` / `getArchitecture` comparten ahora `requestJson` (transporte) y `getContent` (API → respaldo → fallo, memo por recurso e idioma). `resume-<lang>.json` conserva nombre y formato.

## Verificación real de R12 (API local)
- Docker y la API local `cd ../cv && mvn -pl infrastructure -am quarkus:dev` estaban disponibles y se ejecutaron (puerto 8080).
- `npm run generate:api -- http://localhost:8080/openapi.json` generó `lib/api/schema.d.ts` desde la API real: contiene `/api/v1/{resume,contact/messages,services,projects,architecture}` y 0 `@example`.
- `GET /api/v1/architecture` local devolvió `{core:{name:""},ports:[]}`; un build contra ella imprimió «Architecture (es): the API returned no content; section omitted.» (HX-A3/A9 contra la API real). La BD local no tiene CV (`/resume` 404), así que el build completo contra ella falla con «Resume (en) unavailable … Refusing to publish a site without data» (comportamiento correcto) y las páginas se construyeron con `design-api`.
- NO ejecutado en este slice: el `POST /contact/messages` ni el preflight CORS (son de CO).
- Los paths del schema llevan el prefijo `/api/v1/` (el plan los abrevia sin él); `REQUIRED_PATHS` usa los reales.

## Desviaciones / interpretaciones (a revisar)
1. **Reduced-motion (HX-T38 vs BA-T16):** BA-T16 (aprobado) prohíbe `prefers-reduced-motion` en los módulos y exige un único bloque global (`*{animation:none;transition:none}`). El módulo del plano no tiene bloque propio: `flow` y la transición del nodo los anula el bloque global (verificado en Chrome con la emulación: `animation-name: none`, `transition-duration: 0s`). La escala de hover 1.07 sigue existiendo pero sin transición (cambio instantáneo, no movimiento). HX-T38 comprueba esa combinación.
2. **`@keyframes flow`** vive en `hex-plane.module.css` (CSS Modules lo localiza) y no en `globals.css`.
3. **`buildHexPlane(architecture, dict)`** (función que devuelve `ReactElement | null`) en `components/hex-plane-section.tsx`, en lugar de un componente `HexPlaneSection`, para que `Hero` conozca si hay plano (`data-columns="2|1"` en `hero-inner`) y aplique D4.
4. **`lib/api/architecture.ts`** añadido (recurso + `getArchitecture`); el plan solo nombraba `request/content/validate-content`.
5. **Nodo `padding: 0 2px`** (diseño: 4 px): con el mínimo de 12 px de D1, «WebSocket» se partía en dos líneas («WebSocke/t») en el nodo de 68,4 px a 390. Medido: con 2 px cabe en una línea. No está en el `spec`.
6. **Panel:** añade la fila de adaptadores/estado (D6): su altura es mayor que la del diseño; las claves `panel*` del `spec` no miden altura.
7. **Radios** con `input` transparente sobre el chip (`:has(input:checked)`, borde 2 px + fondo acento); `legend` solo para lectores de pantalla. Sin scripting, el selector se oculta y el adaptador elegido se muestra como texto (`@media (scripting: none)`).
8. **Líneas y cuadrados del plano**: con N<6 puertos solo se dibujan los radios y marcas de los huecos usados (con 6, idéntico al diseño). Con layout `list` no hay radios ni línea `flow`.
9. **Observación para PA (no es de este slice):** el render de referencia usa `box-sizing: content-box` (contenedor de 1328 px a 1440; el contenido arranca en x=73) y la web `border-box` (1280; x=97). Anchos computados y métricas del `spec` coinciden; el desfase horizontal de 24 px por lado es visible en las capturas.
10. `HomeView` recibe `architecture` opcional (sin él, sin plano) para no romper los tests previos.
11. Tests extra fuera del plan: `stripExamples` con vecinos (`generate-api.test.ts`), fuente ilegible (T3), `requestJson` 404 con código en el mensaje.

## HX-T44 (protocolo, Chrome DevTools) — ejecutado por el implementer
Preparación: `design-api` :4020 → `CV_API_URL=http://localhost:4020 CV_CACHE_DIR=/tmp/cvcache npm run build` → `out/` en :4030; referencia (`npm run parity:reference`, `serve.mjs`) en :4010. Sonda `probe.mjs web <modo>` con `evaluate_script` (`sourcePath`) y comparación con `spec.mjs` (`expectedAt`, `toleranceFor`, `resolveExpected`) de las claves `plano, core, core-tag, core-label, node, legend, panel, panel-index, panel-name, panel-text, hero, hero-inner, h1, lead, cta, eyebrow`.
- Perfil 1440: 63 comprobaciones, 0 diferencias · Perfil 390: 63, 0 · Servicios 1440: 63, 0 · Servicios 390: 63, 0 (la referencia ya pasaba en la ronda 0). `scrollWidth 390 = innerWidth`; plano 342×342 a 390.
- Interacción (Servicios 1440, 6 puertos): clic en el nodo 3 → `03 / 06`, nodo en acento, `flow` (82.9,69)→(50,50), núcleo en (969,323) sin cambio; teclado (foco en el nodo 6 + Enter) → `06 / 06`, `flow` (17.1,31); con foco el nodo se invierte (`--ink`/`--bg`, `outline: none`). Nodo 1 seleccionado por defecto (`01 / 06`).
- `prefers-reduced-motion: reduce` emulado: `animationName none`, `transitionDuration 0s`.
- Comparación visual lado a lado de Servicios 1440 (capturas `design/artifact-v2/.shots/hx-{web,ref}-servicios-1440-top.png`) y plano a 390 (`hx-web-perfil-390-plane.png`, `hx-web-perfil-390.png`): coherentes con el diseño (salvo las desviaciones 5, 6 y 9). JSON de la sonda: `hx-web-*.json`.
- NO ejecutado: `parity:diff` por bandas (la web aún no tiene proyectos/servicios de CO), ni nodos 1/6 con el cursor real en Perfil (misma isla; verificado en Servicios), ni la confirmación humana del fondo hexagonal (PA).

## Ronda 2 (correcciones de review.md)
1. **[Alta] Overflow a 390 px con >6 puertos:** `components/hex-plane.module.css`, bloque `@media (max-width:640px)`: `.plane` añade `width:100%; max-width:100%` (con `flex:0 0 auto` el ancho salía del max-content de `.groupList`). Test extra (fuera del plan) en `components/hex-plane.module.test.ts` (dentro de HX-T38): `.plane` con `width/max-width:100%` y `min-width:0`, `.groupList` con columnas.
2. **[Media] `<noscript>`:** `.noscript` añade `overflow-wrap:anywhere`; cubierto en el mismo test (HX-T38).
3. **[Media] Duplicación:** `describeError` única en `lib/api/errors.ts`, usada por `content.ts` y `request.ts`; `ArchitectureResult.source` usa `ContentSource` (`types.ts`).
- Verificación Chrome DevTools (emulación 390x844 móvil, build con API falsa de 7 puertos y un adaptador de 50 caracteres sin espacios): `data-layout="list"`, `scrollWidth 390 = innerWidth`, plano 342 px; con los `<noscript>` desenvueltos: `overflow-wrap:anywhere`, `scrollWidth 390`, bloque largo termina en x=366.
- Gates (Node 22): lint 0 avisos, typecheck OK, `npm test` 173/173, `npm run build` con design-api OK.
