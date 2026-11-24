# Analysis — web-featured-facts (2026-11-24, leader; tarea trivial)

Plan validado por Julio («dale, quita los h-01»). Prefijo `FF` (libre: en los tests solo hay BA, CO, HX, PD, RF y TR).

## Lo verificado
- La etiqueta sale de `components/project-featured.tsx:42`: `<p className={`${styles.factKey} mono`}>{`h-${String(i + 1).padStart(2, '0')}`}</p>`.
- `.factKey` solo se declara en `components/project-featured.module.css:63` y solo se usa ahí.
- Solo hay un test que lo mira: `components/projects.test.tsx:29-30` (CO-T23), que espera `'h-01Primer logro de ejemplo'` y `'h-02'`.
- La sonda de paridad `featured-facts` (`scripts/parity/spec.mjs:229`) solo mide `borderTopWidth` del `ul`, así que no le afecta.
  Ni `docs/` ni `AGENTS.md` nombran la etiqueta.

## Cambios
1. `components/project-featured.tsx`: se borra el `<p>` de la etiqueta. Cada `li.fact` conserva solo `<p className={styles.factText}>{fact}</p>`.
   La key del `li`, el `ul` con `data-probe="featured-facts"` y la condición `highlights.length > 0` no cambian.
2. `components/project-featured.module.css`: se borra la regla `.factKey`, que queda muerta. `.facts`, `.fact` y `.factText` no cambian.
3. `components/projects.test.tsx`: CO-T23 pasa a ser **FF-T1 (CO-T23)** y conserva el resto de sus aserciones (badge, rol, enlaces, cliente).

## Criterios
- **FF-A1:** el proyecto destacado muestra cada logro solo con su texto, en el orden de la API, sin ninguna etiqueta `h-NN`.
- **FF-A2:** no queda código ni CSS muerto de la etiqueta, y lo demás del destacado no cambia.

## Tests
- **FF-T1 (CO-T23)**: **dado** el destacado público con dos o más logros **entonces**:
  - los `li` del `ul` de logros tienen como `textContent` exactamente los textos de `highlights`, en orden;
  - el destacado no contiene ningún texto que cumpla `/\bh-\d{2}\b/`;
  - siguen el badge, el rol, los botones (el primero distinto) y el cliente, como en CO-T23.

  *(FF-A1, FF-A2)*
- **FF-T2**: **dado** `components/project-featured.module.css` y `components/project-featured.tsx` **entonces** ninguno nombra `factKey`
  (precedente de lectura de fuente: `components/trajectory.module.test.ts`). Va en un `project-featured.module.test.ts` nuevo o en un
  test de fuente existente, a criterio del implementer. *(FF-A2)*

## Verificación
`npm run lint`, `npm run typecheck`, `npm test` y `npm run build`, con Node 22 (`source ~/.nvm/nvm.sh && nvm use 22`).

## Convivencia en la copia de trabajo
`web-trajectory-split` está aprobado y **sin commitear** en la misma copia de trabajo, a la espera del «cerrá» de Julio. Los archivos de
este slug (`components/project-featured.tsx`, `components/project-featured.module.css`, `components/projects.test.tsx` y el test nuevo,
si lo hay) **no se cruzan** con los suyos. Cada closer añade solo los archivos de su slug, con rutas explícitas.
