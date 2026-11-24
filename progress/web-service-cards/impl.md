# Impl — web-service-cards (ronda 1, 2026-11-24)

Tarea trivial; plan en `progress/web-service-cards/analysis.md` (decisión de Julio: «quita de aquí las s-01…»). Prefijo `SC`.
Sin operaciones git de escritura. Ningún archivo de `web-home-services` tocado; `deploy/docker-compose.yml`, `AGENTS.md` (bloque de `next dev`),
`progress/current.md` y `progress/history.md` intactos (el leader prohibió tocar `current.md`, así que no se anotó «Tarea en curso» ahí).

## Resultado
**`blocked`.** Los cuatro cambios del plan están hechos, y SC-T1 y SC-T2 pasan (y fallan con el código anterior). Pero quitar la etiqueta rompe
**4 tests de `components/contact-form.test.tsx`**, un archivo que el plan no menciona y que este slug no puede tocar (restricción del leader).
Arreglarlo es desviarse del plan, así que paro.

### El hallazgo
`components/contact-form.test.tsx:279` elige las tarjetas de servicio por el nombre accesible que empieza por la etiqueta:

```ts
const pick = (title: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(title) }));
// …
pick('^S-02');
```

Hay 9 llamadas (`^S-01`, `^S-02`, `^S-03`; líneas 284, 286, 287, 296, 304, 316, 363, 364 y 365) repartidas en CO-T35, CO-T36, CO-T37 y CO-T40.
Sin la etiqueta, el nombre del botón ya no empieza por `S-0N` y los cuatro fallan con
`TestingLibraryElementError: Unable to find an accessible element with the role "button" and name /^S-02/` (o `/^S-01/`).
El análisis dice que «solo un test mira la etiqueta» (CO-T13); este otro se le pasó porque no la nombra como texto, sino como patrón de nombre accesible.

### Propuesta para la ronda siguiente (no aplicada ni ejecutada)
Añadir `components/contact-form.test.tsx` al plan y elegir cada tarjeta por su título, que en `withServices()` es `A`, `B` o `C` (índices 0, 1, 2):

```ts
const pick = (title: string) =>
  fireEvent.click(screen.getByText(title, { selector: '[data-probe="service-card-title"]' }).closest('button') as HTMLElement);
```

Después, `pick('^S-01')` pasa a ser `pick('A')`, `'^S-02'` pasa a `'B'` y `'^S-03'` pasa a `'C'`. El `selector` deja fuera las copias del título en el aside.
Un regex de rol y nombre sobre un título de una letra sería frágil, porque el nombre accesible encadena la marca, el título, el resumen y el precio.
Esto no añade tests (siguen 730). Es solo un ajuste de selectores, y CO-T35/36/37/40 conservan lo que comprueban.

### Estado del working tree
Dejo los cambios del plan aplicados, para que la siguiente ronda solo tenga que tocar `contact-form.test.tsx`. Mientras tanto, **`npm test` está en rojo**
(solo esos 4 tests). Si hace falta el árbol verde antes, por ejemplo para cerrar `web-home-services`, basta con devolver los cuatro archivos de este slug
a `HEAD`. Esa operación queda para el leader o el humano.

## Archivos tocados
- `components/service-cards.tsx`: se borra `<span>{`S-${String(i + 1).padStart(2, '0')}`}</span>` (antigua línea 37). `.top` conserva solo la marca.
  `key`, `aria-pressed`, clases, `data-probe` y el resto de la tarjeta no cambian. `i` sigue en uso (`picked[i]`, `toggle(i)`).
- `components/service-cards.module.css`: en `.top`, `justify-content: space-between` pasa a `flex-end` y se borra `gap: 12px`. El resto de reglas no cambia.
- `components/service-cards.test.tsx`: CO-T13 pasa a ser SC-T1 (CO-T13). El resto del archivo, sin cambios.
- `components/service-cards.module.test.ts`: se añade SC-T2 junto a CO-T21.

`git diff --stat` de los cuatro: 16 inserciones, 6 borrados.

## Mapa Tn → `it()`

| Tn | `it()` en archivo |
|---|---|
| SC-T1 (CO-T13) | `components/service-cards.test.tsx` · «SC-T1 (CO-T13): 2 services are 2 button aria-pressed with title (a span: a heading is not valid inside a button), summary, price and the mark (the first «incluido», the second «+ añadir»), and no S-NN label» |
| SC-T2 | `components/service-cards.module.test.ts` · «SC-T2: the top row keeps the mark at the right of the card with the S-NN label gone (flex-end, no space-between)» |

Detalle:
- **SC-T1** conserva todas las aserciones de CO-T13 salvo `S-01`/`S-02`: 2 botones, `aria-pressed` true/false, título en `span`, título, «incluido», resumen,
  «desde 1500 € + impuestos», «+ añadir» y «a consultar». Para cada tarjeta, exige que el `textContent` no cumpla `/\bS-\d{2}\b/` (lo que dice el plan) y que
  **ningún nodo de texto** lo cumpla (`TreeWalker`, como FF-T1 en `web-featured-facts`). Lo segundo hace falta: con el código anterior, el `textContent` de la
  primera tarjeta es «S-01incluido…», el `\b` no corta entre `1` e `i` y la comprobación literal no lo detectaba. El rojo de abajo lo confirma.
- **SC-T2** lee el CSS con `readText`/`rules` (como CO-T21) y exige que `.top` tenga `justify-content: flex-end` y no tenga `space-between`.

**Rojo comprobado:** con `service-cards.tsx` y `.module.css` anteriores (copia temporal, restaurada enseguida), SC-T1 falla
(`expected [ 'S-01' ] to deeply equal []`, en el recorrido por nodos) y SC-T2 falla (`to match /justify-content:\s*flex-end/`). Con el cambio, los dos pasan.

No hay tests extra fuera del plan. El recorrido por nodos de texto es parte de SC-T1, no un `it()` aparte.

## Mapa criterio → tests

| Criterio | Tests |
|---|---|
| SC-A1: cada tarjeta muestra la marca, el título, el resumen y el precio, sin etiqueta `S-NN` | SC-T1 |
| SC-A2: la marca sigue arriba a la derecha y el resto de la tarjeta no cambia | SC-T2 (`flex-end`, sin `space-between`), CO-T21 (borde, sombra, `min-height`, `padding` sin cambios) |

## Verificación (Node v22.23.1, `source ~/.nvm/nvm.sh && nvm use 22`)
- `npm run lint`: verde (exit 0, sin avisos).
- `npm run typecheck`: verde (exit 0).
- `npm test`: **rojo por el hallazgo**. Antes: **156 archivos / 729 tests**, todos en verde (con `web-home-services` aplicado, medido en esta sesión).
  Después: **156 archivos / 730 tests**, con 726 en verde y **4 en rojo**, todos en `components/contact-form.test.tsx` (CO-T35, CO-T36, CO-T37, CO-T40).
  El +1 es SC-T2; CO-T13 se reescribe como SC-T1. SC-T1, SC-T2 y CO-T21 pasan.
- `npm run build`: verde (exit 0). `/[[...slug]]`, `/sitemap.xml`, `/robots.txt`, `/api/*`, los PDF y todo `/admin*` salen `ƒ`. Solo son estáticos
  `/_not-found` y `/icon.svg`, igual que antes.
- Convivencia con el dev server del puerto 3100: el build no chocó. `GET http://localhost:3100/` daba 200 antes y después. El HTML trae 6
  `data-probe="service-card"` y ningún `>S-NN<`.
- `grep` de `S-0N` en `app/`, `components/`, `lib/`, `tests/`, `scripts/`, `docs/` y `AGENTS.md`: solo quedan las 9 llamadas `pick('^S-0N')` de
  `components/contact-form.test.tsx`. Las sondas de paridad no la nombran.

## Ronda 2 (2026-11-24)

El leader añadió `components/contact-form.test.tsx` al plan (cambio 4 y «Lo verificado» de `analysis.md`) y aceptó el recorrido por nodos de texto de SC-T1.
**Resultado: `done`.** Lint, typecheck, test y build en verde.

### Cambio
- `components/contact-form.test.tsx`: `pick` elige la tarjeta por su título, no por `S-NN`:
  `fireEvent.click(screen.getByText(title, { selector: '[data-probe="service-card-title"]' }).closest('button') as HTMLElement)`.
  Las 9 llamadas pasan de `'^S-01'` / `'^S-02'` / `'^S-03'` a `'A'` / `'B'` / `'C'`.
  En `withServices()`, los títulos son `['A', 'B', 'C']` tanto en `es` como en `en`, porque `lang` solo cambia el diccionario. La tarjeta `i` lleva `titles[i]`,
  así que la correspondencia es 1:1 (`S-01`→`A`, `S-02`→`B`, `S-03`→`C`). El `selector` deja fuera las copias del título en el aside.
- El diff de este archivo solo toca `pick` y sus llamadas (11 inserciones, 10 borrados). CO-T35, CO-T36, CO-T37 y CO-T40 comprueban exactamente lo mismo
  que antes, en el mismo orden de clics.
- Los otros cuatro archivos quedan como en la ronda 1. En total, los cinco archivos del slug suman 27 inserciones y 16 borrados (`git diff --stat`).

### Mapa Tn → `it()`
Sin cambios respecto a la ronda 1 (SC-T1 en `components/service-cards.test.tsx` y SC-T2 en `components/service-cards.module.test.ts`). CO-T35/36/37/40 no son
tests del plan: se ajustan sus selectores, no lo que comprueban. No hay tests extra fuera del plan.

### Verificación (Node v22.23.1)
- `npm run lint`: verde (exit 0, sin avisos).
- `npm run typecheck`: verde (exit 0).
- `npm test`: **156 archivos / 730 tests**, todos en verde. Antes del slug había 156/729, con `web-home-services` aplicado. El +1 es SC-T2.
  La ejecución detallada de los tres archivos tocados confirma que pasan SC-T1, SC-T2, CO-T21, CO-T35, CO-T36, CO-T37 y CO-T40 (29/29 en esos archivos).
- `npm run build`: verde (exit 0). `/[[...slug]]` sale `ƒ`; solo `/_not-found` y `/icon.svg` son estáticos, igual que antes.
- Convivencia con el dev server del puerto 3100: el build no chocó. `GET http://localhost:3100/` daba 200 antes y después.
- `grep` de `S-0N` y `^S-` en `app/`, `components/`, `lib/`, `tests/`, `scripts/`, `docs/` y `AGENTS.md`: solo aparece en el comentario de SC-T1 que explica
  el recorrido por nodos. `AGENTS.md`, `deploy/docker-compose.yml`, `progress/current.md`, `progress/history.md` y los archivos de `web-home-services`, intactos.

## Corrección (review r1, 2026-11-24)

El reviewer devolvió `CHANGES_REQUESTED` (`progress/web-service-cards/review.md`) con un cambio requerido, que el leader añadió al cambio 2 de
`analysis.md`: `color: var(--muted)` en `.top` solo coloreaba la etiqueta `S-NN` y quedó muerto, porque la marca fija su color en `.tagOn` / `.tagOff`.
**Resultado: `done`.** Lint, typecheck y test en verde.

### Cambios
- `components/service-cards.module.css`: se borra `color: var(--muted);` de `.top`, y solo esa línea. `.top` queda con `display: flex`,
  `justify-content: flex-end` y `font-size: 12px`, que siguen vivos según la medición del reviewer.
- `components/service-cards.module.test.ts`: se añade a SC-T2 la observación 3 del reviewer (opcional, la decidió el leader).
  Es una línea en el mismo `it()`, `expect(rule('.top')).not.toMatch(/(^|[\s;])color:/)`, con la misma regex que propuso el reviewer: no confunde
  `background-color:` ni `border-color:`. El nombre del `it()` añade «no color of its own». Así se blinda como FF-T2 blindó `.factKey`.

**Rojo comprobado:** con la aserción nueva y el CSS todavía con `color: var(--muted)`, SC-T2 falla
(`expected '\n  display: flex;\n  justify-content…' not to match /(^|[\s;])color:/`). Después de borrar la línea, pasa.

### Mapa Tn → `it()`
| Tn | `it()` en archivo |
|---|---|
| SC-T1 (CO-T13) | `components/service-cards.test.tsx`, sin cambios en esta corrección |
| SC-T2 | `components/service-cards.module.test.ts` · «SC-T2: the top row keeps the mark at the right of the card with the S-NN label gone (flex-end, no space-between, no color of its own)» |

Criterios: SC-A2 queda cubierto también contra el CSS muerto de la etiqueta (SC-T2). No hay tests extra fuera del plan: la aserción nueva va dentro de SC-T2.

### Verificación (Node v22.23.1)
- `npm run lint`: verde (exit 0, sin avisos).
- `npm run typecheck`: verde (exit 0).
- `npm test`: **156 archivos / 730 tests**, todos en verde. No cambia el número de tests respecto a la ronda 2: la aserción va dentro de SC-T2.
  La ejecución detallada de los tres archivos tocados da 29/29: SC-T1, SC-T2, CO-T21 y CO-T35/36/37/40 en verde.
  El `globalSetup` de `npm test` lanza `next build`, y sus tests de build (T25, T26, T427) siguen en verde. No se lanzó un `npm run build` aparte porque
  el leader no lo pidió en esta corrección.
- `git diff --stat` de los cinco archivos del slug: 28 inserciones, 17 borrados. `AGENTS.md`, `deploy/docker-compose.yml`, `progress/current.md`,
  `progress/history.md` y los archivos de `web-home-services`, intactos.
