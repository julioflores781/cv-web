# Review — web-trajectory-split (ronda 1, 2026-11-23)

Hijo 1/2 de `web-presence`. Fuentes: `progress/web-presence/analysis.md` («Validación de Julio», §0, §1, §2, §4), `brief.md` (parte A) e `impl.md`.
Diff revisado: copia de trabajo sin commitear en `feature/nas-autodeploy` (= `develop`, `d618e9f`), más los archivos sin seguimiento
`components/education-section.*`, `components/trajectory.module.test.ts` y `tests/runtime/trajectory.test.ts`.
Se excluyen `deploy/docker-compose.yml` (cambio de Julio, ajeno al slug) y `progress/` (solo como documentación). §3 (`HS`) queda fuera.

## Veredicto
**APPROVED** (ronda 2). Ver «Ronda 2» al final.

Ronda 1 fue `CHANGES_REQUESTED`. El comportamiento ya cumplía el plan entero: criterios, textos aprobados, numeración, `<details>` nativo,
paridad y PDF. Solo quedaba **un** smell accionable de diseño (el `clean` exportado desde un componente hermano). En la ronda 2 está corregido
y todo sigue en verde.

## Verificación ejecutada (Node 22.23.1 vía nvm; el `node` por defecto, v20, no arranca los workers de vitest)
| Comando | Resultado |
|---|---|
| `npm run lint` | exit 0, sin avisos |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0: **155 archivos, 731 tests, todos en verde** (24,5 s; incluye el `next build` del global setup y los de runtime) |
| `npm run build` (sin `CV_API_URL` ni `SITE_URL` en el entorno) | exit 0. `ƒ /[[...slug]]`, `ƒ /sitemap.xml`, `ƒ /robots.txt` y `ƒ /cv-julio-flores-{es,en}.pdf` siguen dinámicas |
| `git diff -- lib/pdf tests/runtime/pdf.test.ts lib/api/validate.ts app/ components/hero.tsx scripts lib/i18n/routes.ts components/site-header.tsx lib/seo` | vacío: los archivos que el plan marca como «no se tocan» siguen intactos |

## Trazabilidad Tn ↔ it()
Hay exactamente un `it()` por id, con el id en el nombre. Los tests reescritos citan el id viejo entre paréntesis. Ya no queda ningún `it()` con
BA-T30, BA-T31, BA-T32, BA-T37, T47 ni CO-T81. El `T32` de `lib/seo/metadata.test.ts:68` pertenece a otro plan.

| Tn | `it()` | ¿Hace lo que dice el plan? |
|---|---|---|
| TR-T1 (BA-T30) | `components/trajectory.test.tsx:35` | Sí: 3 `ol > li` en orden, «2017 — hoy», h3, resumen, solo el primero relleno, `section#experience` con su h2, sin formación |
| TR-T2 | `components/trajectory.test.tsx:55` | Sí: dos actuales rellenos (el segundo empieza después), el cerrado hueco, sin reordenar |
| TR-T3 | `components/trajectory.test.tsx:68` | Sí: «Fase A · Cliente X», «Fase B», «Fase C» (cliente ausente o `null`), fuera de `<details>` y sin « · » colgando |
| TR-T4 | `components/trajectory.test.tsx:81` | Sí, en ES y EN: un `<details>` sin `open`, `summary` como primer hijo con «Ver logros (3)» / «See achievements (3)» y `ul` de 3 en orden |
| TR-T5 | `components/trajectory.test.tsx:97` | Sí: los tres casos (nada / solo logros / solo fases) |
| TR-T6 | `components/trajectory.test.tsx:112` | Sí: el `summary` recibe el foco sin `tabindex`, el clic abre el `<details>` y no hay `tabindex`, `aria-expanded` ni `onclick` |
| TR-T7 | `components/trajectory.test.tsx:125` | Sí: «Ver logros (1)», 1 `li`, la fase en blanco no aparece, y con solo logros en blanco no hay `<details>` |
| TR-T8 (BA-T31) | `components/trajectory.test.tsx:137` | Sí: sin trabajos el `innerHTML` queda vacío, y sin resumen no hay `p` vacío y las fases se ven. La condición «con formación» ya no se puede expresar porque la prop desapareció; la cubre TR-T15 (nota 2 de `impl.md`, aceptada) |
| TR-T9 (BA-T32) | `components/education-section.test.tsx:31` | Sí: «02 / formación», h2 «Formación», columnas Titulación · Certificaciones · Cursos con sus entradas, sin `ol` ni marcadores |
| TR-T10 | `components/education-section.test.tsx:48` | Sí |
| TR-T11 | `components/education-section.test.tsx:56` | Sí: `[]` y nada pintado, tanto con listas vacías como con solo entradas en blanco |
| TR-T12 | `components/education-section.test.tsx:69` | Sí: solo centro, solo área y curso con emisor, como unit y renderizado |
| TR-T13 | `components/education-section.test.tsx:85` | Sí: EN con «Education», «02 / education», Degree · Certifications · Courses y datos ingleses |
| TR-T14 (BA-T37, T47, CO-T81) | `components/home-view.test.tsx:176` | Sí: 01–05 del Perfil en ES/EN sobre la matriz completa de vacíos (8 × 2 × 2). Conserva el `aside` y el nav de CO-T81 |
| TR-T15 | `components/home-view.test.tsx:197` | Sí: los cuatro casos. Sin trabajos no hay CTA; con trabajos el CTA va a `#experience` |
| TR-T16 | `components/home-view.test.tsx:223` | Sí: Servicios ES/EN sin `#experience`, `#education`, `details`, fases, logros ni formación, con 01–04 |
| TR-T17 | `components/home-view.test.tsx:247` | Sí: un h1, `aria-labelledby` = id del h2, h3 sin h4 ni saltos, y todos los `#ancla` resuelven |
| TR-T18 | `components/trajectory.module.test.ts:34` | Sí: solo tokens, `currentColor` o `transparent`; sin `font-family` propia, sin `transition`, `animation`, `@keyframes` ni `prefers-reduced-motion` |
| TR-T19 | `components/trajectory.module.test.ts:54` | Sí: `@media (max-width: 640px)` con `grid-template-columns: 1fr`, y `.toggle` con `min-height` 44 px y `cursor: pointer` |
| TR-T20 | `lib/i18n/i18n.test.ts:44` | Sí: claves y textos aprobados, `{count}`, `interpolate` y sin `education.education` |
| TR-T21 | `lib/api/validate.test.ts:64` | Sí: los casos (a) a (e) dan `null`; `client` `null` o ausente se acepta; `phone` y `dni` desaparecen |
| TR-T22 | `tests/runtime/trajectory.test.ts:61` | Sí: Perfiles ES/EN dan 200, con 3 trabajos, 2 marcadores, fases fuera de `<details>`, 1 `<details>` cerrado con los logros en el HTML del servidor y solo Certificaciones + Cursos |
| TR-T23 | `tests/runtime/trajectory.test.ts:100` | Sí |
| TR-T24 | `tests/runtime/trajectory.test.ts:111` | Sí: las 4 páginas dan 500 sin datos de Ada ni detalles internos, y la API sana vuelve a dar 200 |
| TR-T25 | `tests/runtime/trajectory.test.ts:126` | Sí: ningún centinela en HTML, RSC ni chunks. Control positivo: el título de una fase está en el RSC del Perfil |
| TR-T26 (T32) | `tests/runtime/pages.test.ts:130` | Sí: la tabla de cejas va por `(mode, lang)`, sin rutas literales (§4.2) |
| TR-T27 | `tests/source.test.ts:94` | Sí |
| TR-T28 | `tests/source.test.ts:102` | Sí |
| TR-T29 | `components/home-view-pdf.test.tsx:35` | Sí: el enlace sigue en `#architecture`, ahora «03 / arquitectura»; `lib/pdf/*` y `tests/runtime/pdf.test.ts` no cambian y siguen en verde |
| TR-T30 | Protocolo Chrome DevTools (no es vitest) | **Lo ejecutó el reviewer** (ver abajo): 4/4 claves dentro de tolerancia a 1440 y a 390 |

### TR-T30: paridad (ejecutada por el reviewer)
El build standalone de esta ronda se copió al scratchpad con `.next/static` y `public`. Se sirvió contra `createDesignApi()` de
`scripts/parity/design-api.mjs`, en el puerto 4020. Las lecturas son de `[data-probe=…]` en Chrome; a 390 se usó la emulación del viewport.
La comparación se hizo con `SPEC`, `expectedAt`, `resolveExpected('…', 'perfil')` y `toleranceFor` de `scripts/parity/spec.mjs`. Las
familias `mono` y `head` se mapean a IBM Plex Mono y Barlow Condensed, como hace `probe.mjs`.

- 1440 (`innerWidth` 1440; cejas `01 / trayectoria · 02 / arquitectura · 03 / proyectos · 04 / contacto`; con los datos del diseño no hay `#education` ni `<details>`):
  `{"timeline":{"style":{"borderLeftWidth":"1px","paddingLeft":"28px"}},"timeline-marker":{"style":{"backgroundColor":"rgb(198, 242, 78)"},"rect":{"width":13,"height":13}},"timeline-period":{"style":{"fontFamily":"IBM Plex Mono","fontSize":"14px","color":"rgb(181, 202, 187)"}},"timeline-title":{"style":{"fontFamily":"Barlow Condensed","fontWeight":"600","fontSize":"28px","lineHeight":"29.4px"}}}`
- 390 (`innerWidth` 390, `scrollWidth` 375, sin scroll horizontal): las mismas lecturas de estilo, y el marcador también mide 13×13.
- Resultado: las 24 comprobaciones prop × ancho dan **OK**.

Revisión visual extra con datos ficticios: la API del diseño, con fases, logros y formación ficticios añadidos en el scratchpad, fuera del repo.
- 1440:
  - `summary` `list-item` de 44 px con `disclosure-closed` nativo y `cursor: pointer`, cerrado por defecto.
  - Con el foco por teclado coincide con `:focus-visible` (`outline: solid 2px`, `offset 3px`), e Intro lo abre.
  - Los logros salen con viñeta cuadrada en `--muted`; el cliente de la fase, en `--muted`.
  - Formación en 3 columnas de 237 px.
  - Cejas `01 / trayectoria · 02 / formación · 03 / arquitectura · 04 / proyectos · 05 / contacto`.
- 360 (móvil): las tres columnas se apilan (312 px, una debajo de otra), `scrollWidth` = 360 y el `summary` mide 44 px de alto.
- `/en/`: «See achievements (3)», «02 / education», Degree · Certifications · Courses.
- Servicios: 0 `<details>`.
- `/cv-julio-flores-{es,en}.pdf`: 200 `application/pdf` con fases y logros en los datos.

## Trazabilidad criterios ↔ tests
| Criterio | Tests (verificados) |
|---|---|
| TR-A1 Experiencia | TR-T1, TR-T2, TR-T8, TR-T22, TR-T30 |
| TR-A2 Fases | TR-T3, TR-T5, TR-T7, TR-T22 |
| TR-A3 Logros (`<details>` nativo, sin JS) | TR-T4, TR-T5, TR-T6, TR-T7, TR-T22, TR-T27 |
| TR-A4 Formación (sección propia, 3 columnas, apilado ≤640, sin columna vacía ni sección vacía) | TR-T9…TR-T13, TR-T19, TR-T22 |
| TR-A5 Numeración (01 trayectoria · 02 formación · 03 arquitectura · 04 proyectos · 05 contacto; Servicios igual) | TR-T14, TR-T15, TR-T16, TR-T23, TR-T26 |
| TR-A6 CTA del hero | TR-T15, TR-T17 |
| TR-A7 Tokens, a11y y reduced motion | TR-T6, TR-T17, TR-T18, TR-T19, TR-T30, más BA-T10, BA-T16 y BA-T18 en verde |
| TR-A8 Diccionarios (textos aprobados en TR-D1/TR-D2) | TR-T13, TR-T20, más BA-T42 en verde |
| TR-A9 Datos y privacidad | TR-T21, TR-T24, TR-T25, TR-T27 |
| TR-A10 PDF y docs | TR-T28, TR-T29, más `lib/pdf/*` y `tests/runtime/pdf.test.ts` sin cambios y en verde |

Todos los criterios tienen al menos un test.

Decisiones de Julio comprobadas:
- La sección de trabajos sigue con «trayectoria» / «career» (TR-D1).
- Textos de Formación (TR-D2): «formación» / «Formación», «education» / «Education», Titulación · Certificaciones · Cursos y Degree · Certifications · Courses.
- Formación va tras Experiencia y sin `alt` (TR-D3, TR-D4).
- Las entradas en blanco se descartan y no cuentan en «(n)» (TR-D5).
- Se respeta el orden de la API (TR-D8).

## Privacidad
- No entra ningún campo nuevo: fases, clientes y logros ya los publica el PDF.
- `parseResume` descarta lo desconocido (TR-T21). Los centinelas `phone`, `birthDate` y `dni` no aparecen en HTML, RSC ni chunks (TR-T25).
- Ni teléfono, ni documento, ni fecha de nacimiento.
- Los fixtures nuevos (`careerResume` en `tests/fixtures/resume.ts:166`) son ficticios: «Acme/Globex/Initech Ejemplo», «Cliente Ejemplo Uno»,
  «Logro ficticio …». No se modifican `resumeEs`, `resumeEn`, `minimalResume`, `emptyListsResume` ni `manyJobsResume`. Ningún dato real del CV.

## Skills consultadas
- **simplify** (revisión de reutilización, simplificación, eficiencia y altitud; sin aplicar arreglos, porque el reviewer no edita):
  - `components/education-section.tsx:3`: importa el helper de texto `clean` desde el componente hermano `./trajectory`, que ahora lo exporta (`components/trajectory.tsx:17`).
    Es el único caso en `components/` de un componente hoja que importa un helper plano de otro componente hoja. Los demás imports entre hermanos son
    hooks del provider o la vista padre. Crea un acoplamiento Formación → Experiencia por una función que no es de ninguna de las dos.
    Su sitio es el módulo compartido de formato, `lib/i18n/format.ts`, que ya aloja `formatPeriod`, `interpolate` e `initials` y que `trajectory.tsx` ya importa.
    → **Cambio requerido 1** (resuelto en la ronda 2).
  - Eficiencia: sin hallazgos. `educationColumns` se calcula una vez en `HomeView`, no hay lecturas nuevas de la API, y el test de runtime usa un solo servidor para las tres variantes.
- **next-best-practices**: sin hallazgos.
  - Todo son Server Components, sin `'use client'` ni manejadores (TR-T27). `<details>`/`<summary>` funcionan sin hidratación.
  - Anidado HTML válido (`li > div > ul/details`, `summary` con texto): sin riesgo de errores de hidratación.
  - Rutas y metadata intactas; la build sigue `ƒ`.
- **strict-typing**: sin hallazgos en el código de producción: ni `any`, ni `unknown`, ni `@ts-*`.
  - Los `Record<string, unknown>` de `lib/api/validate.test.ts:66` y `tests/runtime/trajectory.test.ts:17` modelan payloads inválidos a propósito (la entrada de `parseResume` y de `startFakeApi` es `unknown`): justificado.
  - Los `as HTMLElement` de los tests siguen la convención del repo.
- **ui-ux-pro-max** (cambió la UI): sin hallazgos.
  - Comprobado en Chrome: foco visible del `summary` (2 px), objetivo de 44 px, `cursor: pointer`, marcador nativo, sin animaciones, viñetas cuadradas visibles en un `ul` flex.
  - Jerarquía h2 → h3. Las columnas se apilan a 360 sin scroll horizontal.
  - Solo tokens (`--ink`, `--muted`, `--line2`) y familias existentes (`mono`, `display`).
  - Que la cabecera de columna (mono 14 px) se vea más pequeña que sus entradas (display 22 px) es la escala aprobada en §2.2.
- **testing-strategy** (la mitad del diff son tests): sin hallazgos que obliguen a cambiar.
  - Los tests prueban el comportamiento real: DOM renderizado, HTML y RSC del servidor standalone, 500 y recuperación. Usan fixtures ficticios.
  - Hay detalles de acoplamiento menores que van a «Observaciones» (puntos 2 a 4).
- **seo-audit**: no aplica. No se tocan metadata, JSON-LD, sitemap ni robots. Los logros cerrados ya vienen en el HTML del servidor (TR-T22), así que son indexables.

## Checkpoints
- **C1 Calidad ejecutable**: [x] lint, typecheck y test en verde. [x] build sin API, con las páginas, `sitemap.xml` y `robots.txt` en `ƒ`. [x] Sin `console.*`, TODO ni código muerto: `education.education` se fue sin restos y typecheck está limpio.
- **C2 Cobertura y trazabilidad**: [x] cada TR-A tiene sus tests y cada TR-Tn su `it()` (TR-T30 por protocolo, ejecutado). [x] Comportamiento real y fixtures ficticios.
- **C3 Privacidad y contenido**: [x] sin teléfono, documento ni fecha de nacimiento (TR-T25 y los tests de privacidad existentes, en verde). [x] Sin datos reales del CV en el diff.
- **C4 Datos y resiliencia**: [x] los datos entran solo por `lib/api` (TR-T27: sin `fetch(`). [x] Un `resume` inválido da 500 sin datos viejos (TR-T24). Experiencia y Formación vacías se omiten (§2.7, aprobado), y los estados vacíos de servicios, proyectos y arquitectura siguen (T48 en verde).
- **C5 Diseño, a11y y SEO**: [x] solo tokens; paridad de la línea de tiempo OK a 1440 y a 390 (TR-T30). La validación visual final es de Julio (TR-D6). [x] Foco visible, 44 px, sin animaciones, un h1, landmarks. [x] SEO sin cambios y en verde.
- **C6 Estado del arnés**: [x] una sola tarea en curso, descrita en `progress/current.md`. [x] Informes en `progress/web-trajectory-split/` (`impl.md`, `review.md`); el plan está en el padre, `progress/web-presence/analysis.md`.
- **C7 Cierre**: [ ] pendiente. Lo hace el `closer` tras el «cerrá web-trajectory-split» de Julio; no le toca al reviewer.
  Recordatorio para el closer: `deploy/docker-compose.yml` no entra en el commit del slug.

## Cambios requeridos
**Ronda 2: ninguno.** El único cambio de la ronda 1, abajo, quedó resuelto (ver «Ronda 2»).

Ronda 1 (resuelto):
1. **Mover `clean` a `lib/i18n/format.ts`.**
   - **Dónde:** `components/trajectory.tsx:17` lo exporta y `components/education-section.tsx:3` lo importa de ahí.
   - **Qué hacer:** declararlo y exportarlo en `lib/i18n/format.ts`, que ya es el módulo de helpers de texto (`formatPeriod`, `interpolate`, `initials`). `trajectory.tsx` y `education-section.tsx` lo importan de ahí, y `trajectory.tsx` deja de exportarlo.
   - **Motivo:** ningún componente hoja de `components/` importa helpers planos de otro componente hoja. Formación no debe depender del módulo de Experiencia (ni, de paso, de su CSS Module) por una función de formato.
   - **Alcance:** sin cambio de comportamiento. TR-T3, TR-T9 y TR-T12 ya lo cubren, así que no hace falta un Tn nuevo.
   - **Verificar después:** `npm run lint`, `npm run typecheck`, `npm test` y `npm run build` siguen en verde.

## Observaciones fuera de alcance
1. **Duplicado del PDF (preexistente, el diff no lo toca).** `lib/pdf/cv-document.tsx:173` repite a mano la regla de la titulación: `[studyType, area].filter(Boolean).join(' · ') || institution`, sin `trim`.
   Cuando `clean` viva en `lib/i18n/format.ts`, el PDF podría reutilizarlo. Es una tarea aparte, porque el plan deja `lib/pdf/*` fuera de este slug.
2. **TR-T19, aserción de fuente.** `components/trajectory.module.test.ts:67` comprueba con una regex sobre el texto de `trajectory.tsx` que el `summary` lleva `styles.toggle`.
   Funciona y hay precedente (`components/hex-plane.test.tsx:166`), pero se rompería con un cambio de formato inocuo. En el test de componente se puede
   comprobar lo mismo sobre el DOM (`summary.className` contiene `toggle`, igual que `isFilled` mira `current`). Es una sugerencia, no hay regla.
3. **Re-aserciones de guardas existentes.** TR-T20 (`lib/i18n/i18n.test.ts:60`) repite la comparación de claves de BA-T42, y TR-T18 (`components/trajectory.module.test.ts:49`) repite BA-T10 sobre los dos módulos.
   Es redundante, pero el plan incluye «BA-T42 / BA-T10 siguen en verde» en el «entonces» de esos Tn, así que es una decisión del plan.
4. **TR-T6, `onclick`.** `components/trajectory.test.tsx:122` comprueba el atributo `onclick`, y React nunca lo emite aunque haya un `onClick`. Esa parte no prueba nada.
   La garantía real la da TR-T27, en la fuente. Es literal del plan.
5. **Nombre local `Phase`.** `components/trajectory.tsx:21` declara un `interface Phase` de vista (`client: string`) que se llama igual que el schema `Phase` de la API.
   No choca, porque `lib/api/types.ts` no lo exporta, pero un nombre como `PhaseLine` evitaría confusiones. Es una preferencia.
6. **Entorno.** El `node` por defecto del shell (v20.20.2) no arranca los workers de vitest. El repo exige Node ≥22.12 (`engines`, `.nvmrc` = 22) y toda la verificación se hizo con Node 22.23.1.

## Ronda 2 (2026-11-23)
Alcance según el protocolo de rondas siguientes: comprobar la corrección y que no rompió nada. Solo cuentan hallazgos nuevos si los introduce
la corrección. Se mantienen las mismas exclusiones (`deploy/docker-compose.yml` de Julio, intacto: +5 líneas).

**Corrección comprobada**
- `clean` está ahora en `lib/i18n/format.ts:32`, junto a `formatPeriod`, `interpolate` e `initials`. Se exporta desde ahí con el mismo cuerpo y la misma firma.
- `components/trajectory.tsx:4` lo importa de `@/lib/i18n/format` y ya no lo declara ni lo exporta.
- `components/education-section.tsx:3` también lo importa de `@/lib/i18n/format`.
- Ningún componente importa ya de `./trajectory`, salvo `components/home-view.tsx:20` (el componente `Trajectory`) y su test.
- En la ronda 2 solo cambiaron esos tres archivos (marca de tiempo 21:10). Los CSS Modules, los tests, los fixtures y el marcado no se tocaron
  (`trajectory.module.css` y `education-section.module.css` siguen con la marca de la ronda 1), así que **TR-T30 no se repite**: sigue valiendo la medición de la ronda 1.

**Verificación ronda 2** (Node 22.23.1 vía nvm)
| Comando | Resultado |
|---|---|
| `npm run lint` | exit 0, sin avisos |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0: **155 archivos, 731 tests, todos en verde** (22,5 s), los mismos números que en la ronda 1 |
| `npm run build` (sin `CV_API_URL` ni `SITE_URL`) | exit 0. `ƒ /[[...slug]]`, `ƒ /sitemap.xml`, `ƒ /robots.txt` y `ƒ /cv-julio-flores-{es,en}.pdf` siguen dinámicas |

**Hallazgos nuevos introducidos por la corrección:** ninguno.
- simplify: sin hallazgos. El helper está en el módulo compartido de formato y ya no hay acoplamiento entre hermanos.
- next-best-practices: sin hallazgos. `lib/i18n/format.ts` ya lo importaban Server Components, y no hay directivas nuevas.
- strict-typing: sin hallazgos. La firma sigue tipada y sin escapes.
- ui-ux-pro-max: sin hallazgos, porque la UI no cambió.
- testing-strategy: sin hallazgos. La cobertura sigue en TR-T3, TR-T9 y TR-T12.

La trazabilidad Tn ↔ `it()` y criterios ↔ tests no cambia (29 `it()` + TR-T30 por protocolo; TR-A1…TR-A10 cubiertos). Privacidad sin cambios.
Checkpoints C1 a C6 marcados; C7 queda para el closer.

**Veredicto ronda 2: APPROVED.** «Cambios requeridos» está vacío y la sección «Skills consultadas» está presente. Las observaciones
fuera de alcance de la ronda 1 siguen como sugerencias: no bloquean.
