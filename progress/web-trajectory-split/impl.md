# Impl — web-trajectory-split (rondas 1 y 2, 2026-11-23)

Hijo 1/2 de `web-presence`. Plan: `progress/web-presence/analysis.md` §2 (prefijo `TR`), validado por Julio («Validación de Julio», TR-D1…TR-D8).
Nada de §3 (`web-home-services`, prefijo `HS`). Sin operaciones git de escritura. `deploy/docker-compose.yml` intacto (sigue con el cambio de Julio, +5 líneas).

## Resultado
`done`. Los 29 tests de vitest (TR-T1…TR-T29), uno por `it()`, y el protocolo de paridad TR-T30 pasan. Lint, typecheck, test y build en verde.

## Archivos tocados

**Código**
- `components/trajectory.tsx`: solo trabajos, sin prop `education`. Fases visibles en `ul` (fuera del `details`); logros en un `<details>` nativo sin `open` con `<summary>` «Ver logros (n)». Marcador relleno en todo trabajo `current`; se mantienen los `data-probe` `timeline*`. Importa `clean()` de `lib/i18n/format.ts` (ronda 2).
- `components/trajectory.module.css`: `.phases`, `.client`, `.achievements`, `.toggle` (summary: 44 px, `cursor: pointer`, mono 14 px, marcador nativo) y `.highlights`.
- `components/education-section.tsx` (nuevo): `educationColumns()` (función pura) y `EducationSection` (`#education`, sin `alt`, sin `ol` ni marcadores). Importa `clean()` de `lib/i18n/format.ts` (ronda 2).
- `lib/i18n/format.ts` (ronda 2): declara y exporta `clean()`, el helper de texto que antes vivía en `trajectory.tsx`.
- `components/education-section.module.css` (nuevo): rejilla `repeat(auto-fit, minmax(min(200px, 100%), 1fr))` + `@media (max-width: 640px)` a `1fr`.
- `components/home-view.tsx`: calcula las columnas una vez; numeración `experience` → `education` → `architecture` …; `<EducationSection>` justo después de `<Trajectory>`.
- `lib/i18n/dictionaries.ts`: `sections.education`, `education.{degrees,certificates,courses}` (se conservan `certificate` y `course` para el PDF; se quita `education.education`) y `experience.achievements` con `{count}`.
- `docs/web-standards.md` («PDF del CV»): «El botón vive en la sección de arquitectura del Perfil (`#architecture`)», sin número.

**Tests y fixtures**
- `components/trajectory.test.tsx` (reescrito), `components/education-section.test.tsx` (nuevo), `components/trajectory.module.test.ts` (nuevo).
- `components/home-view.test.tsx`, `components/home-view-pdf.test.tsx`, `lib/i18n/i18n.test.ts`, `lib/api/validate.test.ts`, `tests/source.test.ts`, `tests/runtime/pages.test.ts`.
- `tests/runtime/trajectory.test.ts` (nuevo; rutas tomadas de `PAGES` por `mode`, nunca escritas a mano).
- `tests/fixtures/resume.ts`: se **añade** `careerResume(lang)` (ficticio). `resumeEs`, `resumeEn`, `minimalResume`, `emptyListsResume` y `manyJobsResume` sin cambios.

**No tocados** (como dice el plan): `lib/api/validate.ts` (TR-T21 no destapó ningún hueco), `lib/pdf/*`, `app/[[...slug]]/*`, `components/hero.tsx`, `scripts/parity/*`, `lib/i18n/routes.ts`, cabecera y SEO.

## Mapa Tn → `it()`

| Tn | `it()` en archivo |
|---|---|
| TR-T1 (BA-T30) | `components/trajectory.test.tsx` · «TR-T1 (BA-T30): 3 jobs in fixture order …» |
| TR-T2 | `components/trajectory.test.tsx` · «TR-T2: two current jobs …» |
| TR-T3 | `components/trajectory.test.tsx` · «TR-T3: phases read «title · client» …» |
| TR-T4 | `components/trajectory.test.tsx` · «TR-T4: a job with 3 achievements …» |
| TR-T5 | `components/trajectory.test.tsx` · «TR-T5: no phases nor achievements …» |
| TR-T6 | `components/trajectory.test.tsx` · «TR-T6: the summary is focusable …» |
| TR-T7 | `components/trajectory.test.tsx` · «TR-T7: blank achievements are not counted …» |
| TR-T8 (BA-T31) | `components/trajectory.test.tsx` · «TR-T8 (BA-T31): no jobs → nothing at all …» |
| TR-T9 (BA-T32) | `components/education-section.test.tsx` · «TR-T9 (BA-T32): resumeEs gives section#education …» |
| TR-T10 | `components/education-section.test.tsx` · «TR-T10: only certificates …» |
| TR-T11 | `components/education-section.test.tsx` · «TR-T11: three empty lists, or … only blank entries …» |
| TR-T12 | `components/education-section.test.tsx` · «TR-T12: a degree with neither type nor area …» |
| TR-T13 | `components/education-section.test.tsx` · «TR-T13: resumeEn in EN …» |
| TR-T14 (BA-T37, T47, CO-T81) | `components/home-view.test.tsx` · «TR-T14 (BA-T37, T47, CO-T81): the profile numbers 01 career · 02 education …» |
| TR-T15 | `components/home-view.test.tsx` · «TR-T15: a missing experience or education renumbers …» |
| TR-T16 | `components/home-view.test.tsx` · «TR-T16: the services page (ES and EN, resumeEs) …» |
| TR-T17 | `components/home-view.test.tsx` · «TR-T17: the full profile has one h1 …» |
| TR-T18 | `components/trajectory.module.test.ts` · «TR-T18: colours, backgrounds and borders only use tokens …» |
| TR-T19 | `components/trajectory.module.test.ts` · «TR-T19: education stacks its columns at 640px or less …» |
| TR-T20 | `lib/i18n/i18n.test.ts` · «TR-T20: ES and EN have sections.education …» |
| TR-T21 | `lib/api/validate.test.ts` · «TR-T21: a phase without title, a numeric client …» |
| TR-T22 | `tests/runtime/trajectory.test.ts` · «TR-T22: with careerResume the profiles answer 200 …» |
| TR-T23 | `tests/runtime/trajectory.test.ts` · «TR-T23: with the same API the services pages …» |
| TR-T24 | `tests/runtime/trajectory.test.ts` · «TR-T24: a resume with a phase without title makes the 4 pages a 500 …» |
| TR-T25 | `tests/runtime/trajectory.test.ts` · «TR-T25: sentinels inside a phase, a job and an education entry …» |
| TR-T26 (T32) | `tests/runtime/pages.test.ts` · «TR-T26 (T32): the plane with Ada's ports … and the section numbering by (mode, lang)» |
| TR-T27 | `tests/source.test.ts` · «TR-T27: the experience and education sections are plain server components …» |
| TR-T28 | `tests/source.test.ts` · «TR-T28: docs/web-standards.md no longer pins the PDF button to «02 / arquitectura»» |
| TR-T29 | `components/home-view-pdf.test.tsx` · «TR-T29: … the download link stays inside #architecture, now numbered «03 / arquitectura»» |
| TR-T30 | Protocolo Chrome DevTools (no vitest), ver «TR-T30» abajo. |

Ids viejos sustituidos: BA-T30 → TR-T1, BA-T31 → TR-T8, BA-T32 → TR-T9, BA-T37 + T47 + CO-T81 → TR-T14 y T32 (`pages.test.ts`) → TR-T26. Ya no queda ningún `it()` con esos ids. El `T32` de `lib/seo/metadata.test.ts` es otro test, de otro plan.

## Criterio → tests

| Criterio | Tests |
|---|---|
| TR-A1 Experiencia | TR-T1, TR-T2, TR-T8, TR-T22, TR-T30 |
| TR-A2 Fases | TR-T3, TR-T5, TR-T7, TR-T22 |
| TR-A3 Logros | TR-T4, TR-T5, TR-T6, TR-T7, TR-T22, TR-T27 |
| TR-A4 Formación | TR-T9, TR-T10, TR-T11, TR-T12, TR-T13, TR-T19, TR-T22 |
| TR-A5 Numeración | TR-T14, TR-T15, TR-T16, TR-T23, TR-T26 |
| TR-A6 CTA del hero | TR-T15, TR-T17 |
| TR-A7 Diseño y a11y | TR-T6, TR-T17, TR-T18, TR-T19, TR-T30 (más BA-T10, BA-T16 y BA-T18 de `app/globals.test.ts`, en verde) |
| TR-A8 Diccionarios | TR-T13, TR-T20 (más BA-T42, en verde) |
| TR-A9 Datos y privacidad | TR-T21, TR-T24, TR-T25, TR-T27 |
| TR-A10 PDF y docs | TR-T28, TR-T29 (más `lib/pdf/*.test.ts(x)` y `tests/runtime/pdf.test.ts` T57–T62, en verde y sin cambios: `git diff -- lib/pdf tests/runtime/pdf.test.ts` vacío) |

## Desviaciones y notas
No hay desviaciones de diseño. Notas menores de implementación:
1. **Cliente de la fase en `--muted`.** §2.2 pide «título · cliente» con `clean(…, ' · ')` y, en Estilos, «el cliente en `--muted`». Para cumplir las dos cosas, el `li` pinta el título y luego un `span.client` con « · cliente», solo si el cliente no está en blanco. El texto (`textContent`) es exactamente «título · cliente» o «título». `clean()` sigue armando el h3 y la línea «tipo · área» de la Formación (desde la ronda 2 vive en `lib/i18n/format.ts`).
2. **TR-T8, «con formación completa».** `Trajectory` ya no recibe `education`, así que esa condición la garantiza el tipo de las props. El test comprueba `experience: []` → `innerHTML` vacío. Que la Formación se pinte aparte sin trabajos lo cubre TR-T15 en `HomeView`.
3. **TR-T14 conserva lo que no era numeración del Perfil** en BA-T37, T47 y CO-T81, para no perder cobertura. Se queda la numeración de Servicios en toda la matriz de vacíos, el `aside` de Servicios, los enlaces `#projects`/`#contact` del nav y la ausencia de `aside` y línea de selección en el Perfil. El caso `emptyListsResume()` de BA-T37/T47 pasó a TR-T15.
4. **BA-A9 ampliado sin id nuevo**, como dice §2.3 («amplía BA-A9»). Ahora exige `#experience` y `#education` en el Perfil y que no estén en Servicios.
5. **Lista de logros** con `list-style: square` (el cuadrado de los marcadores de la línea de tiempo) y `padding-left: 18px`. Es un estilo de lista, no un color ni una tipografía nueva.
6. **Entorno.** El `node` por defecto del shell es v20.20.2. Con él, vitest no arranca workers (`undici/lib/interceptor/decompress.js: Cannot read properties of undefined (reading 'bind')`). El repo pide Node ≥22.12 (`engines`, `.nvmrc` = 22), así que toda la verificación se hizo con Node 22.23.1 (nvm). No es un fallo del slug.

Tests extra fuera del plan: ninguno.

## Verificación (Node 22.23.1)
- `npm run lint`: 0 problemas (exit 0).
- `npm run typecheck`: sin errores (exit 0).
- `npm test`: **155 archivos, 731 tests, todos en verde**, 0 fallos (exit 0). Incluye el `next build` único del global setup y los tests de runtime (`tests/runtime/trajectory.test.ts`: 4/4; `tests/runtime/pages.test.ts`: 13/13).
- `npm run build` (sin `CV_API_URL` ni `SITE_URL`): verde. `ƒ /[[...slug]]`, `ƒ /sitemap.xml`, `ƒ /robots.txt` y `ƒ /cv-julio-flores-{es,en}.pdf` siguen dinámicas.

### TR-T30 (paridad, protocolo)
La web construida se sirvió en standalone contra `node scripts/parity/design-api.mjs --port 4020`, con datos del diseño: 1 trabajo, sin fases, logros ni formación. Se ejecutó el `probe.mjs web perfil` en Chrome DevTools, reducido a las cuatro claves `timeline*`. A 1440 px la ventana real midió 1440; a 390 px se usó la emulación del viewport, porque la ventana no baja de 500. Las lecturas se compararon con `scripts/parity/spec.mjs` (`expectedAt`, `resolveExpected`, `toleranceFor`):

| Clave | 1440 | 390 |
|---|---|---|
| `timeline` (`borderLeftWidth` 1, `paddingLeft` 28) | ok | ok |
| `timeline-marker` (13×13, `{accent}` = `rgb(198, 242, 78)`) | ok | ok |
| `timeline-period` (IBM Plex Mono, 14 px, `{muted}` = `rgb(181, 202, 187)`) | ok | ok |
| `timeline-title` (Barlow Condensed 600, 28 px / 29.4) | ok | ok |

Las 4 claves están dentro de tolerancia en los dos anchos. Con los datos del diseño no hay `#education`, porque la formación viene vacía, y la numeración queda en 01 trayectoria · 02 arquitectura · 03 proyectos · 04 contacto, que es lo correcto.

El JSON lo adjunta el reviewer a `review.md`, según el plan. Las lecturas de esta ronda:
- 1440: `{"timeline":{"style":{"borderLeftWidth":"1px","paddingLeft":"28px"}},"timeline-marker":{"style":{"backgroundColor":"rgb(198, 242, 78)"},"rect":{"width":13,"height":13}},"timeline-period":{"style":{"fontFamily":"IBM Plex Mono","fontSize":"14px","color":"rgb(181, 202, 187)"}},"timeline-title":{"style":{"fontFamily":"Barlow Condensed","fontWeight":"600","fontSize":"28px","lineHeight":"29.4px"}}}`
- 390: lo mismo en estilos; el marcador también mide 13×13.

También se revisó a ojo, con datos ficticios «Ada Ejemplo» servidos por una API de scratch fuera del repo:
- A 390 px: el `summary` mide 44 px, es `list-item` con su marcador nativo y `cursor: pointer`, y tiene el foco visible global (2 px sólido). La Formación queda en una columna (`327px`) y no hay scroll horizontal.
- A 1440 px: la Formación se reparte en tres columnas de 237 px.
- La numeración queda en 01 trayectoria · 02 formación · 03 arquitectura · 04 proyectos · 05 contacto.

La validación visual final es de Julio (TR-D6).

## Ronda 2 (2026-11-23)
Se aplica el único cambio requerido de `review.md`:
- **`clean` sale de `components/trajectory.tsx` y pasa a `lib/i18n/format.ts`**, junto a `formatPeriod`, `interpolate` e `initials`, y se exporta desde ahí.
- `trajectory.tsx` deja de exportarlo y lo importa de `@/lib/i18n/format`, igual que `education-section.tsx`. Ya no queda ningún import de `./trajectory` fuera de `home-view.tsx` (el componente) y de su test.
- La función no cambia (mismo cuerpo y misma firma), así que el comportamiento es el mismo. No hay Tn nuevo: lo cubren TR-T3, TR-T9 y TR-T12.
- Nada más cambia en el código ni en los tests. `deploy/docker-compose.yml` sigue intacto (+5 líneas de Julio).

**Verificación ronda 2** (Node 22.23.1, con `source ~/.nvm/nvm.sh && nvm use 22`):
- `npm run lint`: exit 0, sin problemas.
- `npm run typecheck`: exit 0.
- `npm test`: **155 archivos, 731 tests, todos en verde** (exit 0), los mismos números que en la ronda 1.
- `npm run build` (sin `CV_API_URL` ni `SITE_URL`): exit 0. `ƒ /[[...slug]]`, `ƒ /sitemap.xml`, `ƒ /robots.txt` y `ƒ /cv-julio-flores-{es,en}.pdf` siguen dinámicas.
