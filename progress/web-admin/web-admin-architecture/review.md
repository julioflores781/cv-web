# Review — web-admin-architecture (slug 5/10 de web-admin)

**Veredicto final (ronda 2): APPROVED** — ronda 1 fue CHANGES_REQUESTED (CR-1, CR-2); ambos corregidos y verificados (ver «Ronda 2»).

Alcance revisado: lo nuevo del slug (`lib/admin/content/architecture.ts`, `components/admin/architecture-editor.tsx`, `hex-preview.tsx`,
`architecture.module.css`, `app/admin/(panel)/architecture/*`, fixtures `admin-samples/architecture.*`, T363 en `tests/runtime/admin-content.test.ts`)
y sus cambios a piezas compartidas (`model.ts`, `paths.ts`, `editor-frame.tsx`, `parity-panel.tsx`, `kinds.ts`, `dashboard.module.css`, T334).

## Ejecución (Node 22.23.1, ejecución propia)
- `npm run lint` verde · `npm run typecheck` verde · `npm test` **131 archivos / 596 tests verdes** · `npm run build` verde, `/admin/architecture` = `ƒ`,
  todas las rutas públicas y del panel dinámicas, `ƒ Proxy`.

## Trazabilidad Tn ↔ it()
| Tn | it() | Comprobado |
|---|---|---|
| T354 | `lib/admin/content/architecture.test.ts:24` | común = ids de puerto/adaptador + `status`; `core/name/description/note` por idioma; `description:null` ≡ ausente; ida y vuelta idéntica |
| T355 | `components/admin/architecture-editor.test.tsx:34` | leyenda 3 estados (forma+texto), opciones del select con texto, forma junto al select, nota 201 → TOO_LONG sin enviar, añadir/subir/quitar adaptador con foco y `role=status`, mover/quitar (con confirmación)/añadir puerto |
| T356 | `architecture-editor.test.tsx:104` | 20 puertos y 20 adaptadores → `aria-disabled` + descripción; 19 → habilitado |
| T357 | `architecture-editor.test.tsx:127` | ids desde el nombre ES, únicos por ámbito (`colas-2`, `kafka-2` solo dentro del puerto), escrito a mano deja de seguir al nombre, publicados `readonly` |
| T358 | `architecture-editor.test.tsx:164` | `data-mode="profile"`, núcleo/puertos/panel del `HexPlane` público, edición en vivo, ES/EN con `aria-pressed` y diccionario EN |
| T359 | `architecture-editor.test.tsx:197` | «no se dibuja» (puerto sin adaptadores, adaptador sin nombre, columna sin adaptador con nombre), 7 puertos → nota + `data-layout="list"`, modelo vacío → mensaje |
| T360 | `architecture-editor.test.tsx:234` | versión 0 vacía; núcleo EN sin nombre bloquea el envío, resumen enfocado con enlace al campo; núcleo ES vacío también |
| T361 | `architecture-editor.test.tsx:264` | 422 `es.ports[2].adapters[0].status` → select (`aria-invalid` + descripción); `en.core` → fieldset EN (`data-invalid`, descripción); orden del resumen |
| T362 | `architecture-editor.test.tsx:298` | panel señala el estado distinto, la fila lo dice, «Igualar EN a ES» lo corrige y el PUT envía `production` en ambos |
| T363 | `tests/runtime/admin-content.test.ts:111` | standalone + fake: `/` y `/en/` muestran el adaptador nuevo al instante; el id no llega al HTML público |
| T364 | `architecture-editor.test.tsx:325` | `outerHTML` de la vista previa, cada puerto seleccionado y en ES/EN, sin ninguno de los 5 ids |
| T365 | `app/admin/(panel)/architecture/page.test.tsx:31` | esqueleto `role=status aria-busy`, editor, error con referencia y reintentar sin URL interna, vacío en versión 0 |

## Trazabilidad criterios ↔ tests
AC10 → T360, T365 · AC11 → T354, T357, T362 · AC12 → T355 (nota), T356 · AC13 → T363 · AC15 → T361 (+ extra de mapeo de rutas) ·
AC17 → T355–T360, T363, T364 · AC23 → T365 · AC26 → T355 (foco/anuncios) + extra de nombres únicos. Todos cubiertos.

## Reglas contra el repo hermano `cv`
- `ContentValidator.architecture/adapters`: `core` obligatorio (REQUIRED / INVALID_VALUE), `name` 80, `description` 300, `note` 200, `MAX_PORTS=20`,
  `MAX_ADAPTERS=20`, `ADAPTER_STATUS` = 3 valores, ids únicos por lista de puertos y por lista de adaptadores de cada puerto, campos desconocidos.
  El espejo `validate.ts:197-235` coincide en rutas, códigos y límites; el editor usa `LIMITS.ports/adapters` y `max` 80/300/200.
- `ContentParity`: puertos y adaptadores por posición e id, `status` comparado; `compareParity` (`validate.ts:298-299`) igual. Las rutas de paridad
  sin idioma caen en el adaptador por posición ES (`architecture.ts:166-171`), coherente con la comparación por posición.
- Fixtures `tests/fixtures/admin-samples/architecture.{es,en}.json` idénticos byte a byte a `cv/db/sample` (ficticios).

## Vista previa
- Reutiliza `buildHexPlane` de `components/hex-plane-section.tsx` (→ `buildHexModel` + `HexPlane` o el plano vacío público) con `getDictionary(lang)`;
  no hay código del hexágono duplicado. `toArchitecture` solo adapta el borrador a la forma `Architecture` y descarta estados fuera del enum, como la web.
- Sin ids en el DOM: `buildHexModel` los elimina; T364 lo prueba sobre todos los paneles en ambos idiomas; T363 lo comprueba en el HTML público.
- Sin importación en runtime de `lib/api` desde código cliente (solo `import type`).

## Piezas compartidas (sin regresiones)
- `EditorModel`: `target(rest, item?, lang?)`, `rootTarget?`, `markSaved?`, `fixes?` son opcionales; services/projects no cambian.
- `paths.ts:75-80`: la rama `rootTarget` solo actúa si el modelo la define; sin ella, el resultado es `null` como antes. `fieldId` con `itemKey:null`
  distinto de `comment` es nuevo y solo lo produce arquitectura.
- `EditorFrame`: `model.markSaved ?? markSaved` y la rama de resumen `itemKey === null` (solo alcanzable con `rootTarget`); `fixes` con `[]` por defecto.
- `ParityPanel`: `fixes = []` por defecto; sin cambios para los otros editores.
- T334 conserva sus aserciones y cambia «Su editor llegará pronto» por el enlace «Editar arquitectura»; el texto y la regla `.note` eliminados no tienen
  otros usos. Suite completa verde.

## Ids publicados, accesibilidad y textos
- Ids de puertos y adaptadores publicados `readOnly` (`architecture-editor.tsx:289,396`); `markSaved` marca también los adaptadores anidados, y el
  borrador restaurado/409 «descartar» los vuelve a emparejar como guardados.
- Nombres accesibles únicos con contexto oculto (probado, >40 nombres sin duplicados); `role=status` para mover adaptadores y en el panel de paridad;
  foco al añadir (nombre ES del nuevo), quitar (vecino o «Añadir adaptador») y mover (botón en la nueva posición).
- Select de estado: opciones con texto; la forma junto al select es `aria-hidden` y repite el texto; leyenda con forma + texto. Nunca solo color.
  CSS solo con tokens (`--ink`, `--bg`), estados por borde grueso.
- Textos visibles en español (excepto la vista previa EN, que usa el diccionario público EN, como debe), salvo CR-1.

## Desvíos
1. **Estado ES/EN distinto conservado (en el lado EN)**: aceptado. Es lo que exige T362 (señalarlo y que «Igualar» sea un cambio guardable). No rompe
   la paridad por construcción para lo nuevo: elegir un estado iguala ambos (`withStatus`), y si se intenta guardar sin igualar, `compareParity` del
   cliente lo bloquea con `PARITY_MISMATCH` sobre el select común sin enviar nada.
2. **`en.core` en el fieldset del núcleo EN**: aceptado. `REQUIRED` de `core` es del objeto, no del nombre; el fieldset es enfocable (`tabIndex=-1`),
   con `data-invalid` y `aria-describedby`, y el enlace del resumen lo alcanza (T361).
3. **Forma junto al select**: aceptado (un `<option>` no admite SVG).
4. **Quitar adaptador sin confirmación**: aceptado. Coherente con las filas de `RowList` aprobadas en el slug 4; nada se publica hasta guardar, el
   contador «N cambios sin guardar» lo refleja y el foco se gestiona. Los puertos publicados sí piden confirmación.
5. **Adaptador nuevo con `in-this-api` y solo los idiomas del puerto**: aceptado.
6. **Marcas de 422 que siguen a la posición tras reordenar** (riesgo declarado): los ids de campo de adaptadores son posicionales
   (`adapters.${index}.…`), así que tras mover o quitar un adaptador una marca del servidor puede quedar sobre otro adaptador hasta el siguiente guardado
   (que vuelve a validar en cliente y reemplaza las marcas). Mismo comportamiento que las filas de proyectos aprobado en el slug 4; impacto bajo
   (marca engañosa, nunca pérdida de datos ni envío erróneo). Ver observación O-2.

## Privacidad
Sin teléfono, documento ni fecha de nacimiento. Fixtures ficticios. Los ids no llegan a la vista previa ni al HTML público.

## Skills consultadas
- `simplify`: `components/admin/architecture-editor.tsx:457` — `adapterCount` con texto en español dentro del componente, cuando el patrón del panel
  (p. ej. `UI.projects.images` en `lib/admin/messages.ts:168`) pone esa copia en `messages.ts` → CR-1. Sin más hallazgos (sin duplicación del hexágono,
  reutiliza `ItemList`, `PairedFields`, `projects.module.css`).
- `next-best-practices`: sin hallazgos (`page.tsx` `force-dynamic`, `loading.tsx`, servidor lee la API y el cliente solo recibe `ContentView`;
  `metadata.title`; ruta `ƒ`).
- `strict-typing`: sin hallazgos (sin `any`/`@ts-*`; los casts `ADAPTER_STATUSES[0] as string` y `text(item.status) as string | null` en
  `architecture.ts:62,86` son ensanchamientos seguros; guardas de tipo completas en `isDraft`).
- `ui-ux-pro-max`: `components/admin/parity-panel.tsx:74-77` — el botón nuevo «Igualar EN a ES» desaparece al pulsarlo y el foco cae en `body` → CR-2.
  Resto sin hallazgos (objetivos de botón heredados, tokens, sin color nuevo).

## Checkpoints
- C1 ✅ lint/typecheck/test/build verdes; build sin API con rutas `ƒ`; sin `console.*`, TODOs ni código muerto (la rama «pronto» se eliminó).
- C2 ✅ T354–T365 mapeados a `it()` reales que verifican comportamiento; fixtures ficticios.
- C3 ✅ sin datos privados ni reales.
- C4 ✅ datos solo por `lib/api` (servidor) y `adminFetch`; error/vacío cubiertos (T365).
- C5 ⚠️ tokens y accesibilidad correctos salvo CR-2; verificación visual V6 (vista previa vs plano público) y V3/V4 a 360 px pendientes en Chrome
  (declarado en impl; se arrastra a la verificación visual del plan §16).
- C6 ✅ informes en `progress/web-admin/web-admin-architecture/`; `progress/current.md` no tocado por este slug.
- C7 n/a (cierre por el `closer` tras autorización humana).

## Cambios requeridos
1. **CR-1** `components/admin/architecture-editor.tsx:457` — mover `adapterCount` («1 adaptador» / «N adaptadores») a `UI.architecture` en
   `lib/admin/messages.ts`, como `UI.projects.images`. Toda la copia del panel vive en `messages.ts`.
2. **CR-2** `components/admin/parity-panel.tsx:74-77` (+ `editor-frame.tsx:313`) — tras «Igualar EN a ES» el botón se desmonta y el foco se pierde
   (WCAG 2.4.3, AC26 «gestión de foco»). Llevar el foco a un destino estable (p. ej. el `role=status` del panel o su título con `tabIndex=-1`, o el
   siguiente «Igualar» si queda alguno) y añadir la aserción `toHaveFocus` en T362.

## Observaciones fuera de alcance
- **O-1** (transversal, preexistente en slugs 3–4): «Crear gemelo» en las filas (servicios, proyectos y ahora puertos/adaptadores,
  `architecture-editor.tsx:216-219,413-416`) también reemplaza el botón por los campos sin mover el foco. Mismo patrón aprobado; recomendable resolverlo
  de una vez en `web-admin-regresion` (foco al primer campo del lado creado).
- **O-2** Marcas de 422 posicionales en adaptadores (desvío 6): recomendable, en `web-admin-regresion`, limpiar las marcas de servidor de los
  adaptadores de un puerto al mover/quitar uno de ellos (o keyear sus ids de campo por `adapter.key`), y lo mismo para `RowList`.
- **O-3** Verificaciones visuales V6 y V3/V4 pendientes en Chrome DevTools (plan §16).

## Ronda 2

**Veredicto: APPROVED.**

Ejecución propia (Node 22.23.1): `npm run lint` verde · `npm run typecheck` verde · `npm test` **131 archivos / 597 tests verdes** (596 + 1 test extra
de CR-2) · `npm run build` verde, `/admin/architecture` `ƒ`, `ƒ Proxy`.

- **CR-1 resuelto:** `lib/admin/messages.ts:253` `UI.architecture.adapterCount` («1 adaptador» / «N adaptadores»), mismo patrón que
  `UI.projects.images`; `architecture-editor.tsx:503` lo usa en la cabecera del acordeón. No queda copia del panel escrita en el componente.
- **CR-2 resuelto:** `components/admin/parity-panel.tsx` guarda la posición de la reparación aplicada (`fixed`) y, tras el render, enfoca el
  `[data-fix]` que ocupa esa posición (el siguiente) o, si no queda ninguno, el título `h2#paridad-titulo` (`tabIndex=-1`, fuera del orden de tabulación;
  anillo `.panelTitle:focus-visible` en `editor.module.css:293`, 3 px `--ink`). El efecto solo actúa tras pulsar «Igualar», así que el resto del panel
  no cambia. Tests: T362 comprueba el foco en el título (`architecture-editor.test.tsx:314`); el test extra (`:327`) cubre dos reparaciones (foco en
  la siguiente y después en el título, sin botones restantes).
- **Sin regresiones en servicios y proyectos:** `fixes` solo lo aporta el modelo de arquitectura (con `[]` por defecto, el efecto no actúa nunca);
  el único cambio visible para ellos es el `tabIndex=-1` del título del panel, que no entra en la tabulación. Sus suites siguen verdes.
- La corrección no introduce hallazgos nuevos. Skills: `ui-ux-pro-max` y `simplify` sobre el diff de la ronda, sin hallazgos.

Cambios requeridos (ronda 2): ninguno. Las observaciones O-1 (foco tras «Crear gemelo», transversal), O-2 (marcas de 422 posicionales) y O-3
(verificación visual en Chrome) siguen abiertas, fuera de alcance, para `web-admin-regresion` / §16.
