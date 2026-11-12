# web-runtime-vacios — implementación

Estado: implementado. `npm run lint`, `typecheck`, `npm test` (2 veces: 63 archivos, 296 tests) y `npm run build` verdes (Node 22.23). Sin git de escritura.

## Código
- `lib/i18n/dictionaries.ts`: clave `empty: { services, projects, architecture }` (ES/EN, <=160 caracteres, sin datos).
- `components/ui/empty-state.tsx` (nuevo) + `.empty` en `ui/ui.module.css`: párrafo `data-probe="empty"`, sin rol ni aria-live.
- `components/services-section.tsx`, `projects.tsx`: la sección siempre se pinta; sin datos, cabecera + estado vacío.
- `components/hex-outline.tsx` (nuevo): los tres hexágonos, extraídos de `hex-plane.tsx` para no duplicarlos.
- `components/hex-plane-section.tsx`: `buildHexPlane(architecture|null, dict)` devuelve siempre un elemento; sin puertos, `EmptyPlane` (región con `aria-label` = `plane.groupLabel`; con `core.name` solo el hexágono central, sin él solo el texto).
- `components/home-view.tsx`: servicios (página de servicios) y proyectos siempre numerados; nav siempre con `#projects` y `#contact`; `EngagementProvider` solo con servicios; el hero siempre recibe plano (2 columnas).
- `components/hero.tsx`: se elimina la prop `hasProjects` (la sección existe siempre; «Ver proyectos» en servicios siempre enlaza).

## Tn -> it()
- T42 -> `lib/i18n/i18n.test.ts` «T42: empty.services…»
- T43 -> `components/home-view.test.tsx` «T43: the services page with services=[]…»
- T44 -> `components/projects.test.tsx` «T44: an empty list keeps #projects…» y `home-view.test.tsx` «T44: with projects=[]…»
- T45 -> `components/hex-plane-section.test.tsx` «HX-T36 / T51 / T45: without ports…» y «T45: with a core name only…»
- T46 -> `components/site-header.test.tsx` «T46: the header of the 4 pages…» y `home-view.test.tsx` «T46: with every combination…» (8 combinaciones x 4 páginas)
- T47 -> `home-view.test.tsx` «T47: … numbering is consecutive…»
- T48 -> `home-view.test.tsx` «T48: each empty state sits in a section…» y `components/ui/ui.module.test.ts` «T48: .empty paints only with token variables…»
- T49 -> `components/contact-form.test.tsx` «T49: on the services page with services=[]…»
- T50 -> `tests/runtime/pages.test.ts` «T50: an API with empty services, projects and architecture…»
- T51 -> actualizados: `home-view.test.tsx` (CO-T18 / T51, BA-T37, CO-T81), `projects.test.tsx` (CO-T31 ya no afirma «nada»), `hex-plane-section.test.tsx` (HX-T36 / T51 / T45), más «T51: the hero keeps its two-column layout…» en `home-view.test.tsx`.

## Criterio -> tests
- A3: T42–T51 (T50 es el end-to-end; T46 cubre anclas; T47 numeración; T48 accesibilidad/tokens).
- A14 (suite sigue verde): T51 + ejecución completa x2.

## Extras (fuera del plan)
- `components/hero.test.tsx`: el test «PA … Ver proyectos» se reescribe porque la prop `hasProjects` ya no existe (el enlace siempre aparece en servicios, nunca en perfil).
- BA-T37 y CO-T81 actualizados a la nueva numeración (proyectos y servicios siempre presentes).

## Decisiones
- Región accesible del plano vacío: `role="region"` + `aria-label` reutilizando `plane.groupLabel` (sin clave i18n nueva).
- Se retira `hasProjects` de `Hero` en vez de dejarlo siempre `true` (evita prop muerta).
- La página de perfil no se envuelve en `EngagementProvider` aunque reciba servicios (como antes).

## Estilo de los estados vacíos (para validar por el humano)
Párrafo con marco discontinuo `1px dashed var(--line)`, padding 32px 24px, texto `var(--muted)` 15px/1.6, ancho máx. 560px, sin iconos. En el plano: mismo párrafo bajo el hexágono central (si la API da `core`) o solo el párrafo. Solo tokens existentes; contraste `--muted` sobre bg/bg2 ya cubierto por `globals.test.ts`.

## Comprobación manual
Standalone (`.next/standalone`) contra una API falsa basada en `scripts/parity/design-api.mjs` con servicios/proyectos `[]` y arquitectura `{core, ports: []}`: las 4 páginas 200, estados vacíos en su idioma, 0 anclas rotas, numeración 01–04 (servicios: servicios/proceso/proyectos/contacto; perfil: trayectoria/arquitectura/proyectos/contacto), hexágono central visible con core.
