# Analysis — web-service-cards (2026-11-24, leader; tarea trivial)

Plan decidido por Julio («quita de aquí las s-01…»). Prefijo `SC` (libre: en los tests solo hay BA, CO, FF, HS, HX, PD y TR).

## Lo verificado
- La etiqueta sale de `components/service-cards.tsx:37`: `<span>{`S-${String(i + 1).padStart(2, '0')}`}</span>`, primer hijo de
  `<span className={`${styles.top} mono`}>`, cuyo segundo hijo es la marca «incluido» / «+ añadir».
- `.top` (`components/service-cards.module.css:34`) es `display: flex; justify-content: space-between; gap: 12px`: con un solo hijo,
  `space-between` llevaría la marca a la **izquierda**. Hay que alinearla a la derecha para que no se mueva.
- El contenedor `.top` **se queda**: `.card` es una columna flex con `align-items` por defecto (`stretch`), así que si la marca fuese hija
  directa de la tarjeta, su fondo/borde ocuparía todo el ancho.
- Dos tests dependen de la etiqueta: `components/service-cards.test.tsx:26-40` (CO-T13), que espera `'S-01'` y `'S-02'`, y
  `components/contact-form.test.tsx:279`, cuyo helper `pick('^S-0N')` elige la tarjeta por su nombre accesible (CO-T35, CO-T36,
  CO-T37 y CO-T40). *(Corrección del leader tras la ronda 1 del implementer: el plan inicial solo vio CO-T13.)*
- Las sondas de paridad de la tarjeta (`scripts/parity/spec.mjs:206-215`: `service-card`, `service-card-title`, `service-card-price`)
  miden la tarjeta, el título (`.d`) y el precio (`.m:last-child`), no la fila de arriba: no les afecta. Ni `docs/`, ni `AGENTS.md`, ni
  `tests/runtime` nombran la etiqueta.

## Cambios
1. `components/service-cards.tsx`: se borra el `<span>` de la etiqueta. `.top` conserva solo la marca; `key`, `aria-pressed`, clases,
   `data-probe` y el resto de la tarjeta no cambian.
2. `components/service-cards.module.css`: en `.top`, `justify-content: space-between` pasa a `flex-end` y se borran `gap: 12px` (con un
   solo hijo no hace nada) y `color: var(--muted)` (solo coloreaba la etiqueta; la marca fija su color en `.tagOn` / `.tagOff`).
   El resto de reglas no cambia. *(`color` añadido por el leader tras la ronda 1 del reviewer.)*
3. `components/service-cards.test.tsx`: CO-T13 pasa a ser **SC-T1 (CO-T13)** y conserva el resto de sus aserciones.
4. `components/contact-form.test.tsx`: `pick` elige la tarjeta por su título, no por `S-NN`:
   `screen.getByText(title, { selector: '[data-probe="service-card-title"]' }).closest('button')`. Las llamadas pasan de
   `'^S-01'` / `'^S-02'` / `'^S-03'` a `'A'` / `'B'` / `'C'` (los títulos de `withServices()`). No cambia ni el número ni lo que
   comprueban CO-T35, CO-T36, CO-T37 y CO-T40.

## Criterios
- **SC-A1:** cada tarjeta de servicio muestra la marca «incluido» / «+ añadir» (EN «included» / «+ add», según el diccionario), el título,
  el resumen y el precio, sin ninguna etiqueta `S-NN`.
- **SC-A2:** la marca sigue arriba a la derecha de la tarjeta, y lo demás de la tarjeta no cambia (incluida la paridad con el diseño v2).

## Tests
- **SC-T1 (CO-T13)**: **dado** 2 servicios **entonces** siguen siendo 2 `button[aria-pressed]` con título (`span`), resumen, precio y
  marca («incluido» la primera, «+ añadir» la segunda), y el `textContent` de ninguna tarjeta cumple `/\bS-\d{2}\b/`. *(SC-A1)*
- **SC-T2**: **dado** `components/service-cards.module.css` **entonces** `.top` tiene `justify-content: flex-end`, no tiene
  `space-between` y no declara `color` (añadido en la corrección de la review r1). Va en `components/service-cards.module.test.ts` (ya existe, CO-T21). *(SC-A2)*

## Verificación
`npm run lint`, `npm run typecheck`, `npm test` y `npm run build`, con Node 22 (`source ~/.nvm/nvm.sh && nvm use 22`).

## Convivencia en la copia de trabajo
`web-home-services` está aprobado y **sin commitear** en la misma copia de trabajo, a la espera del «cerrá» de Julio. Los archivos de
este slug (`components/service-cards.tsx`, `components/service-cards.module.css`, `components/service-cards.test.tsx`,
`components/service-cards.module.test.ts`, `components/contact-form.test.tsx`) **no se cruzan** con los suyos. Cada closer añade solo los archivos de su slug, con rutas
explícitas. Tampoco se tocan `deploy/docker-compose.yml` (de Julio) ni `AGENTS.md`.
