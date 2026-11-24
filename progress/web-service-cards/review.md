# Review — web-service-cards (ronda 1, 2026-11-24)

Tarea trivial. Fuentes: `progress/web-service-cards/brief.md`, `analysis.md` (plan de Julio, «quita de aquí las s-01…», corregido por el leader tras
la ronda 1 del implementer para incluir `components/contact-form.test.tsx`; SC-A1, SC-A2, SC-T1, SC-T2) e `impl.md` (rondas 1 y 2).
Precedente: `progress/web-featured-facts/` (cerrado).

Diff revisado (solo estos archivos; `git diff --stat`: 27 inserciones, 16 borrados):
- `components/service-cards.tsx` (−1)
- `components/service-cards.module.css` (+1 −2)
- `components/service-cards.test.tsx` (+10 −3)
- `components/service-cards.module.test.ts` (+5)
- `components/contact-form.test.tsx` (+11 −10; solo `pick` y sus 9 llamadas)

Quedan fuera, porque no son de este slug: los archivos de `web-home-services` (aprobado, a la espera del «cerrá»), `deploy/docker-compose.yml`
(de Julio) y el bloque de `next dev` en `AGENTS.md`. Ninguno de los cinco archivos del slug aparece en el plan ni en el informe de
`web-home-services` (`progress/web-presence/*.md`, `progress/web-home-services/*.md`), y sus diffs solo contienen cambios de este slug.

## Veredicto
**CHANGES_REQUESTED**

El cambio hace lo que pide el plan y todo está en verde, pero deja **CSS muerto**: `color: var(--muted)` en `.top`
(`components/service-cards.module.css:37`). Ese color existía solo para la etiqueta `S-NN` (en la referencia,
`design/artifact-v2/project/Main.dc.html:234`, la fila es `<span class="m" style="…; color: var(--muted)"><span>{{s.code}}</span><span style="{{s.markStyle}}">…`,
y la marca trae su propio color). Con la etiqueta fuera, `.top` no tiene texto propio y su único hijo fija siempre su color (`.tagOn` →
`--accent-ink`, `.tagOff` → `--ink`), así que la declaración no pinta nada. Es el mismo razonamiento por el que el plan borra `gap: 12px`
(«con un solo hijo no hace nada») y el mismo caso que `.factKey` en `web-featured-facts`. Detalle en «Cambios requeridos».

## Verificación ejecutada (Node 22.23.1 vía nvm)
| Comando | Resultado |
|---|---|
| `npm run lint` | exit 0, sin avisos |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0: **156 archivos, 730 tests, todos en verde** (23,0 s). +1 test sobre los 156/729 de `web-home-services` (SC-T2) |
| `npx vitest run components/service-cards.test.tsx components/service-cards.module.test.ts components/contact-form.test.tsx --reporter=verbose` | 3 archivos, 29 tests en verde. SC-T1, SC-T2, CO-T21, CO-T35, CO-T36, CO-T37 y CO-T40 aparecen por su nombre |
| `npm run build` | No se lanzó aparte: el `globalSetup` de `npm test` (`tests/global-build.ts`) ejecuta el mismo `next build` (el script `build` es `next build`), y en esta ejecución pasaron T25 (exit 0, 0 peticiones a la API, `server.js`), T26 (`ƒ /[[...slug]]`, ningún `.html` prerenderizado con «Ada») y T427 (`ƒ` en `/robots.txt`, `/sitemap.xml` y todo `/admin*`). `.next/standalone/server.js` con fecha de esta ejecución. Coincide con lo que documenta `impl.md` |

Comprobaciones extra:
- **Rojo en `HEAD`, deducido sin tocar el árbol:**
  - SC-T1: el `HEAD` renderiza `<span>{`S-${…}`}</span>` como un nodo de texto propio («S-01»), así que el recorrido por nodos
    (`components/service-cards.test.tsx:42-46`) da `['S-01']` y falla. Además, el `textContent` de la segunda tarjeta («S-02+ añadir…») cumple
    `/\bS-\d{2}\b/` (`+` no es carácter de palabra), así que la línea 40 también fallaría. Coincide con el rojo de `impl.md`
    (`expected [ 'S-01' ] to deeply equal []`).
  - SC-T2: el `.top` de `HEAD` (`git show HEAD:components/service-cards.module.css`) tiene `space-between` y no `flex-end`: fallan las dos aserciones.
- **`pick` de `contact-form.test.tsx` (`:279-280`):**
  - `screen.getByText(title, { selector: '[data-probe="service-card-title"]' })` solo puede casar con el `span` del título: ese `data-probe` solo
    existe en `components/service-cards.tsx:39`, y el `selector` deja fuera las copias del título en el aside y en la línea de selección.
  - `withServices()` (`:268-278`) usa los títulos `['A', 'B', 'C']` en `es` y en `en` (`lang` solo cambia el diccionario), y la tarjeta `i` lleva `titles[i]`:
    la correspondencia con lo anterior es exacta (`^S-01`→`A`, `^S-02`→`B`, `^S-03`→`C`). `getByText` lanza si hay más de una coincidencia, así que
    una ambigüedad no pasaría en silencio.
  - CO-T35 (`B`, `A`, `B`), CO-T36 (`B` en ES y `B` en EN), CO-T37 (`A`) y CO-T40 (`B`, `C`, `A`) conservan el mismo orden de clics y las mismas
    aserciones. El patrón `getByText(…, { selector }).closest(…) as HTMLElement` ya está en el repo (`components/admin/image-gallery.test.tsx:27`,
    `app/admin/(panel)/images/page.test.tsx:86`, `components/admin/image-uploader.test.tsx:32`).
- **Sondas de paridad** (`scripts/parity/spec.mjs:206-215`): `service-card` mide el `button` (min-height, padding, borde, fondo, `rowGap`, sombra),
  `service-card-title` el título y `service-card-price` el precio; la web los encuentra por `data-probe`, que no cambia. `scripts/` sin cambios en git.
  **No les afecta.**
- **Otras referencias a la etiqueta:** `grep` de `S-0N`, `` `S-${…}` ``, `^S-` y `S-\d` en `app/`, `components/`, `lib/`, `tests/`, `scripts/`, `docs/`,
  `AGENTS.md` y `CLAUDE.md`: solo quedan las regex de SC-T1 y su comentario (`components/service-cards.test.tsx:40-46`). Los otros `padStart(2, '0')`
  son de `process`, `hex-plane`, `section-head` y admin, sin relación. La referencia del diseño conserva `S-01…S-04` (`Main.dc.html:479-482`), como
  conservó `h-NN` en el precedente.
- **HTML servido** (dev server del 3100, API real): `/` y `/en/` dan 200, 6 `data-probe="service-card"` cada una, 0 `>S-NN<` y 0 textos `\bS-\d{2}\b`.
  `.top` lleva solo `tagOn` («incluido» / «included») o `tagOff` («+ añadir» / «+ add»).
- **Medición en navegador** (Chrome headless con perfil propio y CDP, porque el navegador del MCP estaba ocupado por otra sesión; solo mediciones
  estructurales), `/` y `/en/` a 1440 y a 390:
  - En las 24 tarjetas medidas, `.top` tiene 1 hijo y ningún nodo de texto propio.
  - La marca queda **arriba a la derecha**: borde derecho pegado a la caja de contenido de la tarjeta (0 px), arriba del todo (0 px) y por encima del título.
  - La marca **no se estira**: mide 74–76 px en ES y 54–74 px en EN frente a los 327 px (1440) / 290 px (390) de `.top`. Conservar `.top` cumple su función.
  - Fuente de la marca: 12 px y mono, heredados de `.top` (`font-size`) y de `.mono`: esas dos declaraciones siguen vivas.
  - Color: `.top` calcula `rgb(72, 98, 85)` (`--muted`, `#486255`), pero la marca pinta `rgb(18, 56, 42)` (`--ink`) sin marcar y `rgb(10, 32, 22)`
    (`--accent-ink`) marcada. Nadie usa el `--muted` de `.top`: es la declaración muerta del cambio requerido.
  - A 390, `scrollWidth` = `innerWidth` = 390 (sin scroll horizontal).

## Trazabilidad Tn ↔ it()
| Tn | `it()` | ¿Hace lo que dice el plan? |
|---|---|---|
| SC-T1 (CO-T13) | `components/service-cards.test.tsx:26` | Sí (detalle debajo) |
| SC-T2 | `components/service-cards.module.test.ts:16` | Sí: `rule('.top')` cumple `justify-content:\s*flex-end` y no contiene `space-between`, con `readText`/`rules` de `tests/helpers/css.ts`, como CO-T21 |

SC-T1:
- Conserva todo lo de CO-T13 salvo `S-01`/`S-02`: 2 botones, `aria-pressed` true/false, título en `span`, «Web de ejemplo», «incluido», el resumen,
  `desde 1500 € + impuestos`, «+ añadir» y «a consultar» (`:28-38`).
- Por tarjeta (`:39-47`): el `textContent` no cumple `/\bS-\d{2}\b/` (lo que pide el plan) y ningún nodo de texto lo cumple, con guarda contra el caso
  vacío (`texts.length > 0`). Las dos comprobaciones se complementan: la de nodos pilla una etiqueta pegada a la marca («S-01incluido», que esquiva el
  `\b`), y la de `textContent` pillaría una etiqueta partida en dos nodos (`S-{n}` en JSX). El leader aceptó el recorrido por nodos en la ronda 2.

No quedan `it()` con CO-T13 a secas ni tests extra fuera del plan. CO-T35/36/37/40 solo cambian el selector, no lo que comprueban.

## Trazabilidad criterios ↔ tests
| Criterio | Tests (verificados) |
|---|---|
| SC-A1: cada tarjeta muestra la marca, el título, el resumen y el precio, sin etiqueta `S-NN` | SC-T1 (ES). EN comprobado en el HTML servido y en la medición; ver «Observaciones», punto 2 |
| SC-A2: la marca sigue arriba a la derecha y lo demás de la tarjeta no cambia (incluida la paridad) | SC-T2 (`flex-end`, sin `space-between`), CO-T21 (borde, sombra, `min-height`, `padding`), sondas de paridad sin cambios y la medición (marca a la derecha, sin estirarse) |

Los dos criterios tienen al menos un test.

## Privacidad
- El diff no añade datos ni campos: quita una etiqueta generada por índice y cambia selectores de test.
- Fixtures ficticios de siempre (`servicesEs` de `tests/fixtures/content.ts`; títulos `A`/`B`/`C` en `withServices()`).
- Ni teléfono, ni documento, ni fecha de nacimiento. No hay datos reales del CV en el diff ni en este informe (la medición solo registró geometría,
  colores y la presencia de `S-NN`).

## Skills consultadas
Aplicadas en línea por el tamaño del diff (~45 líneas), como en el precedente; el reviewer no aplica arreglos.
- **simplify**:
  - Reutilización: sin hallazgos en el código. SC-T2 reutiliza `readText`/`rules`; `pick` sigue un patrón existente. El recorrido por nodos de texto
    ya aparece dos veces (ver «Observaciones», punto 1).
  - Simplificación / código muerto: **hallazgo** en `components/service-cards.module.css:37`: `color: var(--muted)` queda sin efecto (cambio requerido 1).
    El resto de `.top` está vivo: `display: flex` + `justify-content: flex-end` colocan la marca, `font-size: 12px` lo hereda la marca. El
    `<span className={`${styles.top} mono`}>` con un solo hijo (`components/service-cards.tsx:36-38`) es decisión del plan y la medición confirma que
    evita que la marca se estire. `i` sigue en uso (`picked[i]`, `toggle(i)`).
  - Eficiencia: sin hallazgos (un nodo menos por tarjeta).
  - Altitud: sin hallazgos. La etiqueta se quita en el componente, no se oculta con CSS.
- **next-best-practices**: sin hallazgos. `ServiceCards` sigue siendo el mismo Client Component (`'use client'`, `components/service-cards.tsx:1`);
  `span` dentro de `button` es contenido de frase válido, sin riesgo de hidratación. Rutas, metadata y build `ƒ` sin cambios.
- **strict-typing**: sin hallazgos. Ni `any`, ni `unknown`, ni `@ts-*`. `const texts: string[]` tipado y `node.textContent ?? ''` cubre el `null`.
  El `as HTMLElement` de `components/contact-form.test.tsx:280` estrecha `HTMLButtonElement | null` como en los tres precedentes citados; si
  `closest` diera `null`, `fireEvent.click` fallaría en voz alta.
- **ui-ux-pro-max** (se tocó UI): sin hallazgos aparte del CSS muerto. Desaparece un texto de 12 px en `--muted` sin significado para el visitante;
  la marca de estado (texto + borde/fondo, no solo color) sigue arriba a la derecha en ES y EN, a 1440 y a 390, sin scroll horizontal. El nombre
  accesible del botón deja de empezar por «S-01».
- **testing-strategy** (la mayor parte del diff son tests): sin hallazgos que obliguen a cambiar. SC-T1 prueba el DOM renderizado con guardas contra el
  caso vacío; SC-T2 es una aserción de fuente con precedente (CO-T21); el nuevo `pick` elige por un `data-probe` estable en vez de por un prefijo
  del nombre accesible que dependía de la etiqueta retirada.
- **seo-audit**: no aplica (no se tocan metadata, JSON-LD, sitemap ni robots).

## Checkpoints
- **C1 Calidad ejecutable**:
  - [x] Lint, typecheck y test en verde.
  - [x] Build sin API (vía `globalSetup` de `npm test`: T25, T26, T427), con las páginas, `sitemap.xml` y `robots.txt` en `ƒ`.
  - [ ] **Sin código muerto:** queda `color: var(--muted)` en `.top` (cambio requerido 1). Sin `console.*` ni TODO.
- **C2 Cobertura y trazabilidad**:
  - [x] SC-A1 y SC-A2 tienen su test, y SC-T1 y SC-T2 su `it()`.
  - [x] Los tests prueban comportamiento real y usan fixtures ficticios.
- **C3 Privacidad y contenido**:
  - [x] Sin teléfono, documento ni fecha de nacimiento; los tests de privacidad siguen en verde.
  - [x] Sin datos reales del CV en el diff.
- **C4 Datos y resiliencia**:
  - [x] El componente sigue recibiendo props; nada de `fetch`. La resiliencia no se toca y sigue en verde.
- **C5 Diseño, a11y y SEO**:
  - [x] Solo tokens. Sondas de paridad sin cambios; la marca, arriba a la derecha en escritorio y móvil.
  - [x] a11y sin cambios (botón con `aria-pressed`, estado no solo por color). SEO sin cambios.
- **C6 Estado del arnés**:
  - [x] `progress/current.md` describe la sesión: `web-home-services` aprobado y a la espera del «cerrá», y este slug en paralelo con archivos disjuntos
    (los dos en el mismo caso que el precedente).
  - [x] Informes en `progress/web-service-cards/` (`brief.md`, `analysis.md`, `impl.md`, `review.md`).
- **C7 Cierre**: [ ] pendiente. Lo hace el `closer` tras el «cerrá web-service-cards» de Julio; no le toca al reviewer.

## Cambios requeridos
1. **Borrar la declaración muerta `color: var(--muted);` de `.top`** (`components/service-cards.module.css:37`).
   - Por qué: solo coloreaba la etiqueta `S-NN` (referencia: `design/artifact-v2/project/Main.dc.html:234`). Ahora `.top` no tiene texto propio y su
     único hijo fija siempre su color (`.tagOn` → `--accent-ink`, `.tagOff` → `--ink`; medido en el navegador). Es el mismo argumento con el que el plan
     borra `gap: 12px`.
   - El resto de `.top` (`display`, `justify-content: flex-end`, `font-size: 12px`) se queda: está vivo.
   - Como el implementer no se desvía del plan, el leader debe añadirlo al cambio 2 de `analysis.md` antes de la ronda 3. Que SC-T2 también
     compruebe que `.top` no declara `color` queda a criterio del leader (ver «Observaciones», punto 3).
   - Tras el cambio: lint, typecheck y `npm test` (156/730) otra vez en verde. SC-T2, CO-T21 y las sondas de paridad no dependen de esa línea.

## Observaciones fuera de alcance
1. **Recorrido por nodos de texto duplicado.** El mismo bloque de 4 líneas (`createTreeWalker` + guarda + filtro por regex) está en
   `components/projects.test.tsx:33-37` (FF-T1, slug cerrado) y en `components/service-cards.test.tsx:42-46`. Si aparece una tercera vez, merece un
   helper `textNodes(el)` en `tests/helpers/`. Hoy extraerlo obligaría a tocar un archivo de otro slug. No bloquea.
2. **EN sin aserción de componente (preexistente).** SC-T1 es solo ES, como fija el plan. Que la marca salga en EN («included» / «+ add») depende del
   diccionario (`lib/i18n/dictionaries.ts:317`), que este slug no toca. El HTML servido de `/en/` y la medición lo confirman. No bloquea.
3. **Test del cambio requerido (opcional).** Si el leader quiere blindarlo como hizo FF-T2 con `.factKey`, basta una línea en SC-T2:
   `expect(rule('.top')).not.toMatch(/(^|[\s;])color:/)`. El valor es bajo, porque la regla no cambia lo que se ve; por eso no se exige.
4. **Divergencia con la referencia.** `Main.dc.html:234` y `:479-482` siguen mostrando `S-01…S-04`. Como con `h-NN`, la web se aparta a propósito y no
   hay un registro de divergencias. Las sondas no lo notan, pero una comparación de capturas (`parity:diff`) sí vería la fila superior distinta.
5. **Cierre con dos slugs en la misma copia.** El closer de este slug debe añadir solo, con rutas explícitas:
   - `components/service-cards.tsx`
   - `components/service-cards.module.css`
   - `components/service-cards.test.tsx`
   - `components/service-cards.module.test.ts`
   - `components/contact-form.test.tsx`
   - `progress/web-service-cards/`

   Fuera del commit: los archivos de `web-home-services`, `deploy/docker-compose.yml` (de Julio) y el bloque de `next dev` en `AGENTS.md`.
6. **Entorno.** `npm test` ya lanza un `next build` completo en su `globalSetup`, así que un `npm run build` aparte repite el mismo trabajo. El dev
   server del 3100 siguió respondiendo 200 después de la ejecución.

---

# Ronda 2 (2026-11-24)

Fuentes: el cambio 2 de `analysis.md` (el leader añadió el borrado de `color: var(--muted)`) e `impl.md`, sección «Corrección (review r1)».
Esta ronda verifica la corrección y que no rompió nada. Los hallazgos nuevos se limitan a lo que introdujo la corrección.

## Veredicto
**APPROVED**

## Corrección verificada
- **Cambio requerido 1, hecho.** `components/service-cards.module.css:33-37`: `.top` queda con `display: flex`, `justify-content: flex-end` y
  `font-size: 12px`. Solo se borró la línea de `color`; el resto del archivo es igual que en la ronda 1.
- **SC-T2 ampliado** (`components/service-cards.module.test.ts:16-20`, lo que proponía la observación 3, por decisión del leader):
  - Añade `expect(rule('.top')).not.toMatch(/(^|[\s;])color:/)` y «no color of its own» al nombre del `it()`.
  - La regex no confunde `background-color:` ni `border-color:` (el `-` no está en `[\s;]`).
  - **Rojo en la versión anterior:** el cuerpo de `.top` de `HEAD` y de la ronda 1 contiene `\n  color: var(--muted);`, así que la nueva aserción
    falla (deducido; coincide con el rojo que documenta `impl.md`). Con la corrección, pasa.
- **Los otros tres archivos del slug no cambian:** `components/service-cards.tsx`, `components/service-cards.test.tsx` y `components/contact-form.test.tsx`
  tienen el mismo diff que en la ronda 1, línea a línea. `git diff --stat` de los cinco: 28 inserciones, 17 borrados (+1 −1 sobre la ronda 1, en
  los dos archivos corregidos).
- Fuera del slug no se tocó nada: `AGENTS.md`, `deploy/docker-compose.yml`, `progress/current.md`, `progress/history.md` y los archivos de `web-home-services`.

## Verificación ejecutada (Node 22.23.1 vía nvm)
| Comando | Resultado |
|---|---|
| `npm run lint` | exit 0, sin avisos |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0: **156 archivos, 730 tests, todos en verde** (22,7 s). Igual que en la ronda 1: la aserción nueva va dentro de SC-T2. El `globalSetup` volvió a lanzar `next build`, y T25, T26 y T427 siguen en verde |
| `npx vitest run` de los tres archivos de test del slug, `--reporter=verbose` | 3 archivos, 29 tests en verde. SC-T2 con su nombre nuevo; SC-T1, CO-T21 y CO-T35/36/37/40 en verde |

**Nueva medición** (Chrome headless con perfil propio y CDP, dev server del 3100; `/` y `/en/` a 1440 y a 390):
- **Mismo aspecto que en la ronda 1:**
  - La marca, pegada a la derecha y arriba (0 px), por encima del título.
  - Mismo ancho (74–76 px ES, 54–74 px EN) y 12 px de fuente.
  - Sus colores no cambian: `rgb(18, 56, 42)` (`--ink`) sin marcar y `rgb(10, 32, 22)` (`--accent-ink`) marcada.
  - Sin scroll horizontal a 390 y sin `S-NN`.
- Ahora `.top` hereda `--ink` de la tarjeta, pero sigue sin texto propio, así que nada lo pinta. Borrar la línea no cambia lo que se ve, como
  pedía SC-A2.

## Trazabilidad (actualizada)
| Tn | `it()` | Criterio |
|---|---|---|
| SC-T1 (CO-T13) | `components/service-cards.test.tsx:26` (sin cambios) | SC-A1 |
| SC-T2 | `components/service-cards.module.test.ts:16` (`flex-end`, sin `space-between`, sin `color` propio) | SC-A2 |

## Skills consultadas (sobre la corrección)
- **simplify**: sin hallazgos. Ya no queda CSS muerto en `.top` (`components/service-cards.module.css:33-37`): las tres declaraciones tienen efecto.
- **next-best-practices**: sin hallazgos. No se tocan componente, rutas ni build.
- **strict-typing**: sin hallazgos. La línea nueva de `components/service-cards.module.test.ts:19` no introduce tipos.
- **ui-ux-pro-max**: sin hallazgos. La medición sale igual que en la ronda 1.
- **testing-strategy**: sin hallazgos. La aserción nueva es de fuente, con precedente (FF-T2), y se comprobó que estaría en rojo sin la corrección.
- **seo-audit**: no aplica.

## Checkpoints (cambios respecto a la ronda 1)
- **C1**: [x] Sin código muerto. Con esto, C1 queda completo.
- C2–C6 siguen como en la ronda 1, todos marcados. **C7**: [ ] pendiente del closer, tras el «cerrá web-service-cards» de Julio.

## Cambios requeridos
Ninguno.

## Observaciones fuera de alcance
1. **El texto del plan para SC-T2 no recoge la aserción nueva.** `analysis.md:39-40` sigue describiendo SC-T2 solo con `flex-end` y sin
   `space-between`. El `it()` comprueba más que eso, por decisión del leader, registrada en su mensaje y en `impl.md`. Si se quiere que el plan sea
   la fuente exacta, el leader puede añadir «y no declara `color`» a esa línea. Es el mismo caso que el recorrido por nodos de SC-T1, aceptado en la
   ronda 2 del implementer. No bloquea.
2. Siguen valiendo las observaciones 1, 2, 4 y 5 de la ronda 1: el recorrido por nodos duplicado; EN sin aserción de componente; la divergencia
   con `Main.dc.html`; y que el closer añada solo los cinco archivos más `progress/web-service-cards/`, con rutas explícitas.
