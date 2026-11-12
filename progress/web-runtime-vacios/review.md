# Review — web-runtime-vacios

## Veredicto
APPROVED (ronda 1)

Verificado con Node 22.23.1 de forma independiente (el `node` por defecto del shell es 20; se forzó 22 vía nvm).
- `npm run lint`: limpio. `npm run typecheck`: limpio. `npm run build`: OK.
- `npm test` ejecutado 2 veces: 63 archivos, 296 tests, verde las dos veces.
- Standalone real (`.next/standalone`) contra dos APIs falsas (basadas en `scripts/parity/design-api.mjs`, instrumentadas en el scratchpad): listas vacías (`services=[]`, `projects=[]`, arquitectura con `core` y `ports: []`) y datos completos. Las 4 páginas (`/`, `/servicios/`, `/en/`, `/en/services/`) dan 200 en ambas.

## Trazabilidad Tn <-> it()
| Tn | it() real | Resultado |
|----|-----------|-----------|
| T42 | `lib/i18n/i18n.test.ts:29` | OK: existen, no vacías, <=160, sin marcadores/dígitos, distintas ES/EN, paridad de claves. |
| T43 | `components/home-view.test.tsx:107` | OK: `#services` + h2 + texto, sin tarjetas/aside/selección, `#contact form` presente (ES y EN). |
| T44 | `components/projects.test.tsx:98`, `home-view.test.tsx:124` | OK: `#projects` + h2 + texto; sin featured/enlaces/img, perfil y servicios. |
| T45 | `components/hex-plane-section.test.tsx:14` y `:35` | OK: región con `aria-label`, sin nodos/legend/panel/noscript/botones; con core solo 3 polígonos + núcleo; sin core solo texto; hero 2 columnas. |
| T46 | `components/site-header.test.tsx:16`, `home-view.test.tsx:135` | OK: matriz 8 combinaciones x 4 páginas, nav con `#projects`/`#contact`, cada `href="#x"` tiene id. |
| T47 | `home-view.test.tsx:150` | OK: servicios 01–04, perfil 01–04, y caso sin trayectoria (01–03). |
| T48 | `home-view.test.tsx:170`, `components/ui/ui.module.test.ts:7` | OK (ver observación 1): sin role/aria-live, un h1, CSS solo con `var(--line)`/`var(--muted)` y sin hex nuevos. |
| T49 | `components/contact-form.test.tsx:324` | OK: mensaje sin prefijo, un fetch, sin error, estado «enviado». |
| T50 | `tests/runtime/pages.test.ts:247` | OK: standalone real con API vacía, 200 x4, textos en su idioma sin mezcla, sin contenido de Ada, 1 h1, 1 JSON-LD, 0 anclas rotas. |
| T51 | `home-view.test.tsx:97,187`, `projects.test.tsx`, `hex-plane-section.test.tsx:14` | OK: tests de «sin datos no hay sección» invertidos a estado vacío; suite verde. |

Extras anotados en impl.md (hero.test.tsx, BA-T37, CO-T81): razonables y justificados por la retirada de `hasProjects` y la nueva numeración.

## Trazabilidad criterios <-> tests
- A3 (§2.5 / §4): T42–T51 cubren texto, estructura, nav/numeración, accesibilidad, formulario y end-to-end. Verificado además a mano (abajo).
- A14 (suite sigue verde): T51 + dos ejecuciones completas verdes.
- R6 (D4 revertida, hero siempre 2 columnas): `home-view.test.tsx:187`, `hex-plane-section.test.tsx:14` (`data-columns="2"`), y `hero.tsx` sin `hasProjects`.

## Verificación manual (standalone, peticiones reales)
Con listas vacías (`/`, `/servicios/`, `/en/`, `/en/services/`):
- Un solo `h1`; secciones `services/process/projects/contact` (y `experience/architecture/projects/contact` en perfil) todas con `aria-labelledby` -> `h2`; 0 anclas rotas.
- Numeración servicios `01,02,03,04`; perfil con trayectoria/arquitectura/proyectos/contacto consecutivas.
- `data-probe="empty"`: 3 en servicios, 2 en perfil, longitudes 46–109 caracteres, en el idioma de cada página.
- Único `role="alert"` de la página: el del formulario de contacto (preexistente, vacío); los estados vacíos no usan alert ni aria-live. Con datos completos no hay estados vacíos y las 4 páginas siguen igual (sin regresión).
- Formulario de contacto presente en las 4 páginas sin servicios.
- Hero con core: hexágono central visible, párrafo punteado debajo; sin servicios no hay aside «Tu encargo» ni controles.

Chrome DevTools:
- 1440 (Servicios vacío, claro): sin desbordes (`scrollWidth == clientWidth`, ningún elemento fuera del viewport), estados vacíos de 560 px alineados al contenedor; perfil EN en oscuro también correcto (el navegador quedó en ~1851 px de ancho en esa captura, aviso: la captura de perfil no es de 1440 exacto).
- 390 (medido en iframes de 390 px, las 4 páginas): 0 elementos desbordados, estados vacíos entre x=24 y x=347, y el texto del plano queda 16 px debajo del hexágono sin solape (svg y párrafo no se pisan).
- Contraste: color del estado vacío `rgb(72,98,85)` en claro = `--muted`, ya cubierto por `globals.test.ts`.

## Privacidad
Sin hallazgos: sin teléfono/documento/fecha de nacimiento; los textos nuevos no contienen datos; tests con «Ada Ejemplo» y centinelas.

## Skills consultadas
- `simplify`: sin hallazgos. `EmptyState` y `HexOutline` están compartidos (no duplicados: `hex-plane.tsx:100` y `hex-plane-section.tsx:17`); no queda código muerto (`hasProjects` eliminado, sin referencias).
- `next-best-practices`: sin hallazgos. Componentes de servidor puros, sin `fetch` en componentes; `EngagementProvider` condicionado en `components/home-view.tsx:120`.
- `strict-typing`: sin hallazgos. `buildHexPlane(architecture: Architecture | null, dict): ReactElement` sin `any`/`unknown`; `Dictionary.empty` tipado (`lib/i18n/dictionaries.ts:91`).
- `ui-ux-pro-max` (se tocó UI): sin hallazgos bloqueantes; ver observación 2. Tokens existentes, foco/contraste inalterados, sin iconos nuevos.
- `seo-audit`: no aplica (metadata/JSON-LD sin cambios; JSON-LD y h1 verificados en T50).
- `testing-strategy`: sin hallazgos. Cada Tn tiene su `it()`; T46 cubre la matriz completa.

## Checkpoints C1–C7
Recorridos contra el estado actual: lint, typecheck, tests (x2) y build verdes; trazabilidad completa; privacidad intacta; sin tokens ni hex nuevos; accesibilidad verificada. Sin incumplimientos.

## Cambios requeridos
Ninguno.

## Observaciones fuera de alcance
1. `components/home-view.test.tsx:178`: la aserción de T48 sobre h2/`aria-labelledby` está bajo `if (section)`, por lo que el estado vacío del plano (en el hero, región con `aria-label`, decisión de §2.5) se omite en silencio. Es coherente con el plan, pero una aserción explícita para el plano endurecería el test.
2. Página de servicios vacía: el subtítulo de la sección sigue diciendo «Marca los bloques que necesitas…» (copy de `sections.services.intro`) justo encima del aviso de que no hay servicios. Decisión de copy para el humano en la validación visual.
3. Con listas vacías la banda de impacto del perfil sigue mostrando «4 servicios / 2 proyectos» (viene del `resume.impact` de la API, no del slug). Preexistente; queda fuera de R2.
4. El estado vacío del plano es un recuadro de 560 px alineado a la izquierda bajo un hexágono centrado: leve desalineación visual (no solapa). Aspecto pendiente de validación humana, según el brief.
5. Trabajo de slugs anteriores (`web-runtime-ci`, `web-runtime-datos`) en el working tree: no mezclado en esta revisión.
