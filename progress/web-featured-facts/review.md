# Review — web-featured-facts (ronda 1, 2026-11-24)

Tarea trivial. Fuentes: `progress/web-featured-facts/brief.md`, `analysis.md` (plan validado por Julio: «dale, quita los h-01»; FF-A1, FF-A2, FF-T1, FF-T2) e `impl.md`.
Diff revisado (solo estos archivos):
- `components/project-featured.tsx`
- `components/project-featured.module.css`
- `components/projects.test.tsx`
- `components/project-featured.module.test.ts` (nuevo)

`git diff --stat` de los tres que existían: 10 inserciones y 10 borrados. El test nuevo tiene 14 líneas.

Quedan fuera, porque no son de este slug:
- `web-trajectory-split`, ya aprobado y a la espera del «cerrá».
- `deploy/docker-compose.yml`, cambio de Julio (+5 líneas).
- El bloque `nextjs-agent-rules` que `next dev` añade a `AGENTS.md` (+10 líneas).

La verificación completa sí cubre toda la copia de trabajo.

## Veredicto
**APPROVED**

El cambio hace exactamente lo que pide el plan:
- Se borra el `<p>` con `h-NN` (antigua `components/project-featured.tsx:42`) y la regla `.factKey`, que quedaba muerta (antigua `components/project-featured.module.css:63-67`).
- El `ul[data-probe="featured-facts"]`, la key del `li`, la condición `highlights.length > 0` y las reglas `.facts`, `.fact` y `.factText` no cambian.
- No hay smells accionables.

## Verificación ejecutada (Node 22.23.1 vía nvm; el `node` por defecto, v20, rompe los workers de vitest)
| Comando | Resultado |
|---|---|
| `npm run lint` | exit 0, sin avisos |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0: **156 archivos, 732 tests, todos en verde** (23,4 s). Es +1 archivo y +1 test sobre los 155/731 de `web-trajectory-split` |
| `npx vitest run components/projects.test.tsx components/project-featured.module.test.ts --reporter=verbose` | 2 archivos, 18 tests en verde. FF-T1 y FF-T2 aparecen por su nombre |
| `npm run build` (sin `CV_API_URL` ni `SITE_URL`) | exit 0. `ƒ /[[...slug]]`, `ƒ /sitemap.xml`, `ƒ /robots.txt`, `ƒ /api/*`, `ƒ` PDF y todo `/admin*`. Solo `/_not-found` e `/icon.svg` son estáticos, igual que antes |

Comprobaciones extra:
- **Rojo en `HEAD`, deducido sin tocar el árbol:**
  - FF-T2: `git show HEAD:` de los dos archivos contiene `factKey` (1 vez en cada uno), así que FF-T2 fallaría.
  - FF-T1: el CO-T23 de `HEAD` afirmaba `toContain('h-01Primer logro de ejemplo')` y pasaba. Eso prueba que en `HEAD` el `textContent` del `li` lleva la etiqueta, y la nueva aserción `toEqual(own.highlights)` fallaría.
  - Coincide con el rojo que documenta `impl.md`.
- **Sonda de paridad `featured-facts`** (`scripts/parity/spec.mjs:229`): solo mide `borderTopWidth` del `ul`, y la web lo encuentra por `[data-probe="featured-facts"]`, que sigue en `components/project-featured.tsx:39`. Medido en el dev server del 3100: `1px` a 1440 y a 390, el valor que espera la tabla. **No le afecta.**
- **Otras referencias a la etiqueta:**
  - `grep` de `factKey`, `h-0N` y la plantilla `` `h-${…}` `` en `app/`, `components/`, `lib/`, `tests/`, `scripts/`, `docs/`, `AGENTS.md`, `CLAUDE.md` y la referencia del diseño.
  - Solo aparece en FF-T2 y en el comentario de FF-T1 (`components/projects.test.tsx:32`).
  - Los otros `padStart(2, '0')` son de otros componentes (`service-cards`, `process`, `section-head`, `hex-plane`, admin) y no tienen relación.
- **HTML servido** (dev server 3100, API real): `/`, `/en/`, `/servicios/` y `/en/services/` dan 200 con un `featured-facts` cada una, 0 `>h-NN<` y 0 `factKey`.
- **Visual (Chrome DevTools)**, con mediciones estructurales y sin copiar contenido:
  - 1440 (`innerWidth` 1440, sin scroll horizontal): la rejilla queda en 2 columnas de 294,5 px. Cada `li` tiene un solo hijo (`p.factText`, 15 px, margen 0) y separador inferior de 1 px. El `ul` tiene borde superior de 1 px y no queda ningún `.mono` dentro.
  - 390 (móvil, `scrollWidth` 390 = `innerWidth`): 1 columna de 260 px, ningún `li` desborda, se mantienen los separadores y el borde superior.
  - En ninguno de los dos anchos queda texto que cumpla `/\bh-\d{2}\b/`. A la vista, la rejilla queda limpia y alineada con el resumen y los botones.

## Trazabilidad Tn ↔ it()
| Tn | `it()` | ¿Hace lo que dice el plan? |
|---|---|---|
| FF-T1 (CO-T23) | `components/projects.test.tsx:24` | Sí, en tres partes (detalle debajo) |
| FF-T2 | `components/project-featured.module.test.ts:5` | Sí, en tres partes (detalle debajo) |

FF-T1:
- **Precondición:** el fixture tiene 2 o más logros (`:25`).
- **Orden y texto:** el `textContent` de `[data-probe="featured-facts"] > li` es exactamente `own.highlights`, en orden (`:31`).
- **Sin etiqueta en todo el destacado:** recorre nodo de texto a nodo de texto (`TreeWalker`) y no deja ninguno que cumpla `/\bh-\d{2}\b/`. Tiene una guarda contra el caso vacío (`texts.length > 0`). Va por nodos porque el `textContent` concatenado («h-01Primer…») esquivaba el `\b` final. El comentario de `:32` lo explica.
- **Conserva lo de CO-T23:** el badge «EN PRODUCCIÓN», el rol, los botones `['Abrir ejemplo', 'Ver demo']` con clases distintas y «cliente · Cliente Ejemplo S.A.».

FF-T2:
- Lee los dos archivos reales con `readText` (`tests/helpers/css.ts`), el mismo helper que usa el precedente `components/trajectory.module.test.ts`.
- **Guarda contra el caso vacío:** el CSS conserva `.facts`, `.fact` y `.factText` (con `rules`) y el TSX usa `styles.factText`.
- Ninguno de los dos contiene `factKey`.

Va en un archivo propio y no en `tests/source.test.ts`, que es de `web-trajectory-split`. El plan lo dejaba a criterio del implementer.

No quedan `it()` con CO-T23 a secas ni tests extra fuera del plan.

## Trazabilidad criterios ↔ tests
| Criterio | Tests (verificados) |
|---|---|
| FF-A1: cada logro se muestra solo con su texto, en el orden de la API, sin etiqueta `h-NN` | FF-T1, más la comprobación visual y del HTML servido |
| FF-A2: no queda código ni CSS muerto de la etiqueta, y lo demás del destacado no cambia | FF-T2 (sin `factKey`; `.facts`, `.fact` y `.factText` siguen) y FF-T1 (badge, rol, botones y cliente igual). Además: CO-T22 y CO-T24…CO-T34 en verde y la sonda `featured-facts` sin cambios |

Los dos criterios tienen al menos un test.

## Privacidad
- El diff no añade ningún dato ni campo: solo quita una etiqueta generada por índice.
- Los fixtures son los ficticios de siempre (`tests/fixtures/content.ts:110`: «Primer logro de ejemplo», «Segundo logro de ejemplo»; «Cliente Ejemplo S.A.»).
- Ni teléfono, ni documento, ni fecha de nacimiento. No hay datos reales del CV en el diff ni en este informe.

## Skills consultadas
- **simplify** (solo revisión; el reviewer no aplica arreglos). Por el tamaño del diff (~30 líneas), los cuatro ángulos se hicieron en línea, sin lanzar agentes:
  - Reutilización: sin hallazgos. FF-T2 usa `readText` y `rules` de `tests/helpers/css.ts` en lugar de leer y parsear a mano. No había helper de nodos de texto que reutilizar: `createTreeWalker` no aparece en ningún otro sitio del repo.
  - Simplificación: sin hallazgos accionables.
    - El `TreeWalker` de `components/projects.test.tsx:33-37` (4 líneas) es la forma robusta de aplicar la regex del plan con `\b`.
    - El `<p className={styles.factText}>` como único hijo del `li` (`components/project-featured.tsx:42`) es lo que el plan fija («cada `li.fact` conserva solo `<p className={styles.factText}>`»), así que va a «Observaciones», punto 1.
  - Eficiencia: sin hallazgos. Se renderiza un elemento menos por logro, y el test de fuente lee dos archivos pequeños.
  - Altitud: sin hallazgos. Se quita la etiqueta en su origen (el componente) junto con su regla, sin ocultarla con CSS ni filtrarla en otra capa.
- **next-best-practices**: sin hallazgos.
  - `ProjectFeatured` sigue siendo un Server Component, sin directivas ni manejadores.
  - `li > p` es HTML válido, así que no hay riesgo de hidratación.
  - Rutas, metadata y build `ƒ` sin cambios.
- **strict-typing**: sin hallazgos.
  - Ni `any`, ni `unknown`, ni `@ts-*`. `const texts: string[]` está tipado y `node.textContent ?? ''` cubre el `null`.
  - El `as HTMLElement` de `featured()` (`components/projects.test.tsx:14`) es preexistente y sigue la convención del repo.
- **ui-ux-pro-max** (se tocó UI): sin hallazgos.
  - Desaparece un texto de 12 px en `--muted` que no aportaba significado, y con él un posible problema de contraste en texto pequeño.
  - La jerarquía no cambia (h3 → resumen → logros → botones).
  - Solo quedan tokens (`--line2`). La rejilla de 2 columnas a 1440 y de 1 a 390 no tiene scroll horizontal.
- **testing-strategy** (la mayor parte del diff son tests): sin hallazgos que obliguen a cambiar.
  - FF-T1 prueba comportamiento sobre el DOM renderizado, con guardas contra el caso vacío.
  - FF-T2 es una aserción de fuente con precedente. Si alguien reintrodujera una etiqueta con otra clase, FF-T2 no lo vería, pero FF-T1 sí: la cobertura del criterio no depende de FF-T2.
- **seo-audit**: no aplica. No se tocan metadata, JSON-LD, sitemap ni robots.

## Checkpoints
- **C1 Calidad ejecutable**:
  - [x] Lint, typecheck y test en verde.
  - [x] Build sin API, con las páginas, `sitemap.xml` y `robots.txt` en `ƒ`.
  - [x] Sin `console.*` ni TODO. El código muerto (`.factKey`) se fue con la etiqueta.
- **C2 Cobertura y trazabilidad**:
  - [x] FF-A1 y FF-A2 tienen su test, y FF-T1 y FF-T2 su `it()`.
  - [x] Los tests prueban comportamiento real y usan fixtures ficticios.
- **C3 Privacidad y contenido**:
  - [x] Sin teléfono, documento ni fecha de nacimiento; los tests de privacidad existentes siguen en verde.
  - [x] Sin datos reales del CV en el diff.
- **C4 Datos y resiliencia**:
  - [x] Los datos entran solo por `lib/api` (el componente sigue recibiendo props).
  - [x] Sin `highlights` no hay `ul` (CO-T29 en verde). El resto de la resiliencia no se toca y sigue en verde.
- **C5 Diseño, a11y y SEO**:
  - [x] Solo tokens. La sonda `featured-facts` está OK a 1440 y a 390, y el aspecto es correcto en escritorio y móvil.
  - [x] a11y sin cambios: un h1, landmarks, HTML semántico.
  - [x] SEO sin cambios.
- **C6 Estado del arnés**:
  - [x] `progress/current.md` describe la sesión. `web-trajectory-split` ya no está en implementación: está aprobado y a la espera del «cerrá».
    La convivencia con archivos disjuntos la declara el plan, que Julio validó.
  - [x] Los informes están en `progress/web-featured-facts/` (`brief.md`, `analysis.md`, `impl.md`, `review.md`).
- **C7 Cierre**: [ ] pendiente. Lo hace el `closer` tras el «cerrá web-featured-facts» de Julio; no le toca al reviewer.

## Cambios requeridos
Ninguno.

## Observaciones fuera de alcance
1. **`p` envoltorio único (decisión del plan).** `components/project-featured.tsx:42`: con la etiqueta fuera, el `li` solo contiene un `p`. Se podría poner `.factText` en el `li` y quitar el `p`.
   Pero el plan fija conservar `<p className={styles.factText}>` y no tocar `.fact`/`.factText`, y `li > p` es válido. No bloquea.
2. **Etiqueta «stack» repetida (preexistente; el diff no la toca).** `components/project-featured.tsx:63`: cada caja de la columna derecha lleva encima la misma palabra (`dict.projects.stack`).
   Es un relleno parecido al de `h-NN`, aunque al menos dice qué es. Si a Julio le molesta igual, sería otra tarea trivial.
3. **Cierre con dos slugs en la misma copia.** El closer de este slug debe añadir solo, con rutas explícitas:
   - `components/project-featured.tsx`
   - `components/project-featured.module.css`
   - `components/projects.test.tsx`
   - `components/project-featured.module.test.ts`
   - `progress/web-featured-facts/`

   Fuera del commit: los archivos de `web-trajectory-split`, `deploy/docker-compose.yml` (de Julio) y el bloque de `next dev` en `AGENTS.md`.
4. **Entorno.** El `node` por defecto del shell (v20) no arranca los workers de vitest. Toda la verificación se hizo con Node 22.23.1 (`.nvmrc` = 22).
