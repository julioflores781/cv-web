# Impl — web-featured-facts (ronda 1, 2026-11-24)

Tarea trivial; plan en `progress/web-featured-facts/analysis.md`, validado por Julio («dale, quita los h-01»). Prefijo `FF`.
Sin operaciones git de escritura. Ningún archivo de `web-trajectory-split` tocado; `deploy/docker-compose.yml` intacto (cambio de Julio).

## Resultado
`done`. FF-T1 y FF-T2, un `it()` cada uno, pasan. Lint, typecheck, test y build en verde con Node 22 (v22.23.1). No hay tests extra fuera del plan.

## Archivos tocados
- `components/project-featured.tsx`: se borra el `<p className={`${styles.factKey} mono`}>` con `h-NN` (antigua línea 42). Cada `li.fact` conserva solo
  `<p className={styles.factText}>{fact}</p>`. La key del `li` (`${i}|${fact}`), el `ul` con `data-probe="featured-facts"` y la condición `highlights.length > 0` no cambian.
- `components/project-featured.module.css`: se borra la regla `.factKey` (5 líneas + separación). `.facts`, `.fact` y `.factText` no cambian.
- `components/projects.test.tsx`: CO-T23 pasa a ser FF-T1 (CO-T23) (ver abajo). El resto del archivo, sin cambios.
- `components/project-featured.module.test.ts` (nuevo): FF-T2. Va en un archivo propio y no en `tests/source.test.ts`, que es de `web-trajectory-split`.

Diff de los tres archivos existentes: 10 inserciones, 10 borrados (`git diff --stat`), más el test nuevo (14 líneas).

`AGENTS.md` aparece modificado en el working tree, pero no por este slug: es el bloque `nextjs-agent-rules` que reescribe `next dev` (el servidor del puerto 3100).

## Mapa Tn → `it()`

| Tn | `it()` en archivo |
|---|---|
| FF-T1 (CO-T23) | `components/projects.test.tsx` · «FF-T1 (CO-T23): the public featured shows badge, role, each fact as only its highlight text in API order (no h-NN label), buttons from links (first primary) and the client» |
| FF-T2 | `components/project-featured.module.test.ts` · «FF-T2: neither project-featured.module.css nor project-featured.tsx names factKey (the h-NN label is gone with its rule)» |

Detalle:
- **FF-T1** comprueba que el fixture tiene dos o más logros; que el `textContent` de los `li` de `[data-probe="featured-facts"]` es exactamente `own.highlights`, en orden;
  y que ningún nodo de texto del destacado cumple `/\bh-\d{2}\b/`. Se recorre nodo de texto a nodo de texto (`TreeWalker`) porque el `textContent` concatenado pegaba la
  etiqueta al logro («h-01Primer…») y el `\b` final no la detectaba. Conserva las aserciones de CO-T23: badge «EN PRODUCCIÓN», rol «web + app», botones
  `['Abrir ejemplo', 'Ver demo']` con clases distintas y «cliente · Cliente Ejemplo S.A.».
- **FF-T2** lee los dos archivos con `readText` (`tests/helpers/css.ts`, como `components/trajectory.module.test.ts`) y exige que ninguno contenga `factKey`.
  Para que no pase en vacío, primero comprueba que el CSS leído tiene las reglas `.facts`, `.fact` y `.factText` y que el TSX usa `styles.factText`.

**Rojo comprobado:** con el `project-featured.tsx` y el `.module.css` de `HEAD` (copia temporal, restaurada enseguida), FF-T1 falla
(`expected [ 'h-01Primer logro de ejemplo', … ] to deeply equal [ 'Primer logro de ejemplo', … ]`) y FF-T2 falla (`not to contain 'factKey'`).
Con el cambio, los dos pasan.

## Mapa criterio → tests

| Criterio | Tests |
|---|---|
| FF-A1: cada logro del destacado se muestra solo con su texto, en el orden de la API, sin etiqueta `h-NN` | FF-T1 |
| FF-A2: no queda código ni CSS muerto de la etiqueta, y lo demás del destacado no cambia | FF-T1 (badge, rol, botones y cliente siguen igual), FF-T2 (sin `factKey`; `.facts`/`.fact`/`.factText` siguen) |

## Verificación (Node v22.23.1, `source ~/.nvm/nvm.sh && nvm use 22`)
- `npm run lint`: verde (exit 0, sin avisos).
- `npm run typecheck`: verde (exit 0).
- `npm test`: **156 archivos / 732 tests**, todos en verde. Antes había 155/731, con `web-trajectory-split` ya en el working tree: +1 archivo (FF-T2) y +1 test
  (CO-T23 se reescribe como FF-T1 y FF-T2 se añade).
- `npm run build`: verde (exit 0, Next.js 16.4.5 Turbopack). `/[[...slug]]`, `/sitemap.xml`, `/robots.txt`, `/api/*`, los PDF y todo `/admin*` salen `ƒ`.
  Lo único estático es `/_not-found` y `/icon.svg`, igual que antes.
- Convivencia con el dev server del puerto 3100: el build no chocó con él. Después del build, `GET http://localhost:3100/` sigue dando 200, el HTML trae
  `featured-facts` y no contiene ningún `h-0N`.
- `grep` de `factKey` en `app/`, `components/`, `lib/`, `tests/`, `scripts/`, `docs/` y `AGENTS.md`: solo aparece en el propio FF-T2.
