APPROVED

# Review — web-redesign-hexagon (HX), ronda 1

Ejecutado con Node 22.23.1. Sin git de escritura. No se tocó código de la web (solo `progress/…/review.md` y capturas en `design/artifact-v2/.shots/hxrv-*`).

## Veredicto
**CHANGES_REQUESTED.** La base es sólida (gates en verde, 43/43 tests del plan trazados, paridad de métricas 63/63 en las 4 vistas, interacción/foco/reduced-motion correctos), pero hay dos desbordamientos reales (HX-A10 «sin overflow») y duplicación de código.

## Cambios requeridos (priorizados)
1. **[Alta] `layout:'list'` (>6 puertos) desborda horizontalmente a 390 px.** Medido con 10 puertos: `.plane` mide 512 px en un viewport de 390 (`scrollWidth` 536; en emulación móvil el viewport de layout salta a 536 px). Causa: a ≤640 px `.plane{flex:0 0 auto}` (`components/hex-plane.module.css`, bloque `@media (max-width:640px)`, ~l.330) hace que el ancho salga del contenido, y `.groupList` (`grid-template-columns:repeat(auto-fill,minmax(96px,1fr))`, `width:100%`, ~l.64) se resuelve a max-content = 5 columnas de 96 px. Ninguna prueba lo cubre (HX-T37 solo mira `data-layout` y orden; HX-T38 solo CSS de nodos). Corregir (p. ej. `min-width:0`/`width:100%` en `.plane` a ≤640 o `max-width:100%`) y añadir un test que lo fije (CSS o inspección del build con 7+ puertos). Captura: `hxrv-web-9ports-list-390.png`.
2. **[Media] El `<noscript>` no ajusta nombres largos.** `.noscript` (`hex-plane.module.css` ~l.300) no lleva `overflow-wrap:anywhere`: con un adaptador de nombre largo sin espacios (50 caracteres) la página pasa de 390 a 421 px de `scrollWidth` (simulado quitando scripts y desenvolviendo el `<noscript>`; `overflow-wrap` computado = `normal`). Es justo el público para el que existe el noscript. Añadir la regla y cubrirla en HX-T38/T39. Captura: `hxrv-web-noscript-390.png`.
3. **[Media] Código duplicado en `lib/api`.** `describe(error)` está copiada idéntica en `lib/api/content.ts:19` y `lib/api/request.ts:39`. Extraer a un único helper (p. ej. `errors.ts`) y reutilizarlo. Además `ArchitectureResult` (`lib/api/architecture.ts:12`) redeclara `{data,source:'api'|'cache'}` a mano en vez de apoyarse en `ContentResult<Architecture>`/`ContentSource` de `types.ts`.

## Trazabilidad Tn ↔ it()
Todos los `HX-T1…T43` tienen `it()` con el id en el título y hacen lo que dice la descripción (leídos T24–T27, T38, T41–T43 en detalle; el resto por título y mapa del impl). T44 es protocolo (ver abajo).
| Tn | it() |
|---|---|
| T1, T5 | `lib/api/schema.test.ts` (T5 comparte `it` con T72) |
| T2–T4 | `scripts/generate-api.test.ts` |
| T6 | `lib/problem.test.ts` |
| T7, T8 | `lib/api/request.test.ts` |
| T9–T12 | `lib/api/validate-content.test.ts` |
| T13–T20 | `lib/api/content.test.ts` |
| T21–T23 | `lib/architecture/model.test.ts` |
| T24–T35, T37, T39, T40 | `components/hex-plane.test.tsx` |
| T36 | `components/hex-plane-section.test.tsx` (2 `it`) |
| T38 | `components/hex-plane.module.test.ts` |
| T41 | `tests/build/build.test.ts` (healthy) |
| T42 | `tests/build/build.test.ts` (`build with the architecture endpoint`) |
| T43 | `tests/build/build.test.ts`: parte «sin respaldo → falla» con su `it`; parte «con respaldo» dentro del `it` BA-T50 (comentario `HX-T43`). Aceptable. |
Observación: el hueco de cobertura real son los desbordamientos de los puntos 1 y 2 (criterio HX-A10 sin test que los atrape).

## Trazabilidad criterios ↔ tests
A1 T1–T5 · A2 T6–T8 · A3 T9–T20/T43 · A4 T21–T23/T37 · A5 T24–T25/T37–T38 · A6 T24/T26–T29/T32 · A7 T30–T31/T40 · A8 T24/T32–T35/T38 · A9 T36/T42 · A10 T38–T39 (**insuficiente**, ver 1 y 2) · A11 T41–T43 · A12 T44. Todos los criterios mapean a al menos un Tn.

## Ejecución (Node 22)
- `npm run lint` 0 avisos · `npm run typecheck` OK · `npm test` 42 archivos / 173 tests OK (incluye 6 builds reales) · `npm run build` con `design-api` (:4020) OK (4 páginas).
- Build con la API pública (`CV_CACHE_DIR` vacío): **falla por diseño** («Architecture (en) unavailable», 404 de `/architecture`), como declaró el implementer.
- Build con API caída + respaldo: cubierto por BA-T50/HX-T43 (verdes).
- Builds adicionales con API falsa propia: `ports:[]` → pasa, aviso «section omitted», `data-columns="1"`, 0 rastro del plano; 10 puertos → `data-layout="list"`; 3 puertos con nombres largos → radial.
- T68: `process.env`/`fetch(` fuera de `lib/api` en `app/ components/ lib/` (sin tests): **0 coincidencias**.

## Privacidad (C3)
- `schema.d.ts`: 0 `@example`, sin e-mails/URLs/teléfonos/nombres; fixtures «Ada Ejemplo». `generate-api.mjs` + `strip-examples.mjs` cumplen §2 (CLI > env > URL; comprueba los 5 paths y 0 `@example` antes de sustituir; no toca el archivo si falla). Sin hallazgos.
- Datos del diseño (`design-data.json`) solo en `scripts/parity`, no se publican.

## Paridad visual HX-T44 (Chrome DevTools, sonda + `parity:diff`)
- Sonda `plano, core, core-tag, core-label, node, legend, panel, panel-index/name/text, hero, hero-inner, h1, lead, cta, eyebrow`, comparada con `spec.mjs` (`expectedAt`/`toleranceFor`): **Perfil 1440: 63 checks, 0 diferencias · Perfil 390: 63/0 · Servicios 1440: 63/0 · Servicios 390: 63/0** (la referencia también 63/0). JSON: `hxrv-{web,ref}-*.json`.
- `parity:diff` por bandas (umbral 3 %), Perfil 1440: en bruto **falla** (12,0 / 15,3 / 5,6 %) por dos desfases conocidos, no por el plano: (a) `content-box` de la referencia (+24 px por lado) y (b) panel más alto en la web (D6), que al centrar la columna sube el plano 31 px. Normalizando ambos en la referencia (`box-sizing:border-box` + `translateY(-31px)` inyectados en Chrome, sin tocar archivos) el diff es **0,21 / 0,43 / 1,56 %** (pasa). Perfil 390 (zona del plano): 4,1 / 2,5 / 5,8 % (diferencias de cabecera y panel; el plano coincide visualmente). Servicios: la referencia pinta los servicios en el plano y la web la arquitectura real (decisión §14.10), por lo que el diff de píxeles no es comparable; la sonda sí lo es y pasa.
- Interacción (Servicios 1440, clic real): nodo 3 → `aria-pressed` solo en Auth0, `03 / 06`, panel «Auth0», `flow` (82.9,69)→(50,50), núcleo sin cambio en (1049,417), foco por ratón no invierte. Teclado: Tab ×3 recorre Auth0→React·Vue→WebSocket→Docker (orden API = orden horario); en foco el nodo se invierte (`rgb(18,56,42)`/`rgb(244,243,236)`, `outline:none`); Enter en el nodo 6 → `06 / 06`, `flow` (17.1,31)→(50,50). Nodo 1 seleccionado por defecto (`01 / 06`). `role="group"` con `aria-label`, panel `aria-live="polite"`.
- `prefers-reduced-motion: reduce` emulado: `flow` `animation-name:none`, `transition-duration:0s`, 0 elementos de la página aún animados.
- Caso 0 puertos: una columna, sin plano/leyenda/panel/noscript, sin overflow (`hxrv-web-0ports-1440.png`). Caso >6 puertos a 1440: lista de 5 columnas, nombres envueltos (`hxrv-web-9ports-list-1440.png`); a 390 desborda (punto 1).
- Nombres largos a 390 (radial): sin overflow de página (390/390), nodos 68×79 con texto en el hexágono (la palabra de 46 caracteres se parte en 5 líneas y las esquinas del `clip-path` la recortan ligeramente; ver observaciones). Chips y panel envuelven bien.
- Overflow a 390 con datos del diseño: `scrollWidth 390 = innerWidth`; plano 342×342.
- Consola: un único aviso de Next («preloaded CSS not used within a few seconds»), sin errores propios.
- noscript: no hay forma de desactivar JS con la herramienta; se verificó con una copia del HTML sin `<script>` y con el `<noscript>` desenvuelto: contiene todos los puertos con adaptadores, estado en texto y nota (3 bloques para 3 puertos). No se pudo probar `@media (scripting: none)` (lo cubre HX-T38 a nivel de CSS).
- Capturas: `design/artifact-v2/.shots/hxrv-*.png` (+ diffs `hxrv-diff-*`).

## Evaluación de las desviaciones del implementer
1. **Reduced-motion global (BA-T16):** aceptable. Verificado en navegador que `flow` y la transición quedan anuladas; la escala de hover 1.07 pasa a cambio instantáneo (no es movimiento). Mantiene un único bloque global, coherente con BA-T16 aprobado. Recomendable que el humano lo vea en la revisión final, porque el plan (HX-A10/T38) hablaba de bloque del módulo.
2. **`buildHexPlane` como función:** aceptable; permite a `Hero` conocer si hay plano (`data-columns`), comprobado con 0 puertos. Más simple que un componente que devuelve `null`.
3. **`padding: 0 2px` en nodos:** aceptable. Medido a 390: «WebSocket» cabe en una sola línea con 12 px en 68,4 px de nodo. Documentada en el CSS.
4. **Panel más alto (D6):** aceptable (fila de adaptador/estado exigida por D6); su efecto es el desfase vertical de 31 px del plano en el hero. Vigilar en PA.
5. **`content-box` de la referencia vs `border-box` de la web:** aceptable; la web es la correcta (anchos computados idénticos). Debe resolverse en PA con la referencia normalizada, no tocando la web.
6. Otras: `lib/api/architecture.ts` extra (ok); `HomeView` con `architecture` opcional (ver observaciones).

## Skills consultadas (criterio aplicado a mano sobre el diff; no se invocó la herramienta Skill)
- `simplify`: `lib/api/content.ts:19` ↔ `lib/api/request.ts:39` (`describe` duplicada) y `lib/api/architecture.ts:12` (`ArchitectureResult` redundante) → cambio requerido 3. Resto del plano sin duplicación (`POSITIONS`/`CONTRACT_SQUARES` son tablas distintas del diseño).
- `next-best-practices`: sin hallazgos (isla `'use client'` mínima; el servidor entrega el HTML con el primer puerto seleccionado; datos solo por `lib/api` en build).
- `strict-typing`: sin hallazgos (0 `any`/`@ts-*`/`eslint-disable` en código de producción; `@ts-check` solo en `scripts/parity` preexistente; validadores con tipos estrictos y enums cerrados).
- `ui-ux-pro-max`: `components/hex-plane.module.css` (`@media (max-width:640px)` y `.groupList`) desborda a 390 → cambio 1; `.noscript` sin `overflow-wrap` → cambio 2. Objetivos táctiles ≥44/48 px, foco por inversión y `aria-live` correctos.
- `seo-audit` / `testing-strategy`: no aplican (no se tocó metadata; los tests nuevos no cambian la estrategia). Nota de testing: HX-A10 no tiene un test que atrape el overflow (cambios 1 y 2).

## Checkpoints
- C1: lint/typecheck/test/build verdes (API pública falla por diseño; API caída + respaldo cubierta por test). Sin `console.log`, sin TODOs. Duplicación de `describe`: **pendiente (cambio 3)**.
- C2: Tn ↔ it() completo; falta cobertura efectiva de HX-A10 (overflow) → **pendiente (1, 2)**.
- C3: sin teléfono/documento/fecha de nacimiento ni datos reales en schema/fixtures. OK.
- C4: datos solo por `lib/api` (T68 limpio); API caída + respaldo avisa; sin respaldo falla nombrando recurso, idioma y archivo. OK.
- C5: tokens, foco visible, reduced-motion, landmarks OK en el hero; overflow a 390 con >6 puertos y noscript **pendiente (1, 2)**.
- C6: `impl.md` presente; este `review.md` completa la carpeta.
- C7: no aplica (lo hace el `closer` tras autorización).

## Observaciones fuera de alcance
- Con layout `list` la leyenda sigue mostrando «adaptadores / puertos / contrato» aunque no se dibujan radios ni cuadrados (incoherencia menor; decisión de diseño, no de plan).
- Una palabra única de ~45 caracteres en un nodo de 68 px queda parcialmente recortada por las esquinas del hexágono; el plan acepta «completo, sin truncar en JS».
- `.chip:focus-within` muestra el contorno también con el ratón (podría ser `:has(:focus-visible)`); preferencia sin regla.
- `HomeView` con `architecture` opcional (`= null`) existe para no romper tests previos; considerar hacerla obligatoria cuando CO/PA toquen `HomeView`.
- El aviso de preload de Next sobre el CSS es preexistente y ajeno al diff.
- En Perfil/Servicios con datos del diseño, el nav de la web aún no tiene «proyectos» y el hero no tiene «Ver proyectos» (alcance de CO).

---

# Segunda pasada (ronda 2)

Node 22.23.1. Verificado en el código, no solo en `impl.md`. Sin cambios de código por parte del reviewer.

## Veredicto
**APPROVED.** Los 3 cambios de la ronda 1 están corregidos y sin regresiones.

## Verificación de los 3 cambios
1. **Overflow >6 puertos a 390: corregido.** `components/hex-plane.module.css`, bloque `@media (max-width:640px)`: `.plane{flex:0 0 auto; width:100%; max-width:100%}` (más `min-width:0` en la regla base). Test: `components/hex-plane.module.test.ts` (it de HX-T38, comentario HX-A10) exige `width:100%`, `max-width:100%` y `min-width:0` en `.plane`, y `grid-template-columns` en `.groupList`. En Chrome a 390 (emulación móvil) con build de 7 puertos y un nombre de puerto de 60 caracteres y un adaptador de 66 sin espacios: `data-layout="list"`, `innerWidth 390 = scrollWidth 390`, `.plane` 342 px, 0 elementos con `right > 390`. Captura: `design/artifact-v2/.shots/hxrv2-web-7ports-list-390.png`, `hxrv2-web-7ports-long-390.png`.
2. **`overflow-wrap` en noscript: corregido.** `.noscript` lleva `overflow-wrap:anywhere`; el test lo exige. En Chrome, `<noscript>` desenvuelto con el adaptador largo: `overflow-wrap` computado `anywhere`, `scrollWidth` 390 (antes 421).
3. **Duplicación: corregida.** `describeError` vive solo en `lib/api/errors.ts` (0 copias de `describe` en `content.ts`/`request.ts`). `ArchitectureResult` se apoya en `ContentSource` de `types.ts`; mantiene la forma `{architecture, source}` (distinta de `ContentResult`), por lo que no es duplicación.

## Ejecución (Node 22)
`npm run lint` 0 avisos · `npm run typecheck` OK · `npm test` 173/173 · `npm run build` con `design-api` (:4020) OK; builds adicionales con API falsa de 7 puertos OK.

## Regresión
Layout radial con datos del diseño a 390: `scrollWidth 390`, `.plane` 342 px, hero renderiza igual (`hxrv2-web-radial-390.png`). Sin cambios en el resto del diff.

## Checkpoints
C1, C2 (HX-A10 ahora con test), C5: cerrados. C3, C4, C6 siguen OK. C7 no aplica.
