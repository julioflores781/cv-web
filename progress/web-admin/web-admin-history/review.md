# Review — web-admin-history (slug 7/10 de web-admin)

**Veredicto final (ronda 2): APPROVED** — ver «Ronda 2» al final. Ronda 1: CHANGES_REQUESTED.

Ronda 1: un solo cambio requerido de severidad baja (CR-1, `simplify`). El comportamiento, la seguridad y
la semántica del rollback son correctos; no hay hallazgos altos ni medios.

Alcance: solo lo nuevo del slug y sus cambios a piezas previas (fake `admin-fake.mjs`, aserción de T231, enlaces de historial en dashboard y
editores, `ContentDiffList` partido, `VersionSnapshot` ampliado). Árbol sin commitear en `feature/web-admin-api-client`.

## Verificación ejecutable (Node 22.23.1)
- `npm run lint` ✅ · `npm run typecheck` ✅ · `npm run build` ✅ (`ƒ /admin/history/{services,projects,architecture}`,
  `ƒ /admin/api/content/[kind]/[lang]/rollback`, `ƒ Proxy`) · `npm test` ✅ 145 ficheros / 655 tests, sin `skip`.
- Tras la ejecución: `pgrep -fl next-server` vacío y ningún `node` escuchando (`lsof -iTCP -sTCP:LISTEN`). No levanté servidores a mano.

## Trazabilidad Tn ↔ it()
| Tn | it() | Comprobado |
|---|---|---|
| T392 | `components/admin/history-view.test.tsx` «T392»; `app/admin/(panel)/history/history.test.tsx` «T392 (page)»; 404 HTTP en `tests/runtime/admin-history.test.ts` (T400) | selector con `aria-current`, filas `v3,v2,v1`, «Activa» texto+círculo+borde, «Ver/Restaurar la versión N (ES)», `aria-disabled` + descripción en la activa; `limit` 50; `?lang=fr` → ES; `/admin/history/resume/` → 404 real |
| T393 | ambos «T393» | «Solo hay una versión…», «Nunca publicado en español.» + «Publicar el primero» |
| T394 | ambos «T394» | región «Versión 1 · Español» con diff («Modificados: servicio-ejemplo (Título)»); `v=9` → alerta amable con la lista; `abc,0,-1,1.5,99999999999,../1` ignorados y **nunca** enviados a la API |
| T395 | «T395» | descripción accesible exacta del diálogo, Cancelar = 0 llamadas, confirmar = 1 POST con `{baseVersion:3,targetVersion:1}` |
| T396 | `rollback/route.test.ts` «T396» | kind/lang (`resume`, `fr`, `..`) → 404; 0, −1, 1.5, `'2'`, ausente, 2³¹, array, no-JSON → 400; 5000 B → 413; Origin ajeno/`null` → 403; `text/plain` → 415; sin cookie → 401; 0 llamadas; campos extra (`comment`, `__proto__`, `force`) descartados (la fake estricta daría 400) |
| T397 | «T397» (vista) y «T397 (handler)» | 409 → GET inmediato con `latest`, «ahora es la v4» + «Recargar»; 404 y 422 (con `errors` mapeados y en español) explican y la v3 sigue activa; inyección 500 → 502 con una sola llamada |
| T398 | «T398» | insignia y «Activa ahora» se mueven, texto en `role=status`, botón de la nueva activa pasa a inerte, aviso de paridad con enlace al editor |
| T399 | «T399» | claves exactas del evento (`event, from, kind, lang, level, outcome, request_id, service, timestamp, to`); sin comentario, título, token ni IP |
| T400 | `tests/runtime/admin-history.test.ts` «T400» | standalone + fake: PUT → rollback ES y EN → `/servicios/` y `/en/services/` vuelven al contenido viejo al instante; 409 con base vieja; reactivar v2; log sin centinelas |
| T401 | «T401» | corte a ≤81 code points con `title` completo; `<script>`/`<img onerror>` como texto, sin elementos en el DOM |

Extras leídos: «extra (drafts)» (el diálogo avisa del borrador y el valor en storage queda idéntico byte a byte), 401 → login con `next`, fallo
de red sin reintento, AC23 (esqueleto, error con referencia y «Reintentar», 401 con `next`), enlaces del dashboard y del editor, T231 ampliado.

## Trazabilidad criterios ↔ tests
AC21 → T392–T398, T400, T401 · AC7 → T396 · AC9 (sin reintento en escrituras) → T397 (handler) y «extra» de red · AC23 → T393, T394, extra
(AC23) · AC25 → T399, T400 · AC26 (nivel DOM) → T392, T398, T401 · AC14 (borrador nunca perdido) → extra (drafts). Sin criterios huérfanos.

## Contraste con las fuentes Java (`../cv`)
- `RollbackContentService.rollback`: `active(kind,lang) ?: 0 != baseVersion` → 409; luego `find(target)` → 404 `CONTENT_VERSION_NOT_FOUND`;
  luego `ContentValidator` → 422 `CONTENT_INVALID`; `activate` re-comprueba base y destino bajo `lock` en la transacción. **No crea versión**,
  solo mueve el puntero de **un** idioma; responde `ContentRequests.load` (= `GET /content/{kind}` con la paridad actual). La fake
  (`scripts/parity/admin-fake.mjs:815-833`) sigue exactamente ese orden y semántica (`target.active = entry.version`, sin nueva entrada). ✅
- `RollbackRequest` estricto (`FAIL_ON_UNKNOWN_PROPERTIES`, sin coerciones), `baseVersion ≥ 0`, `targetVersion ≥ 1` → la fake: campo
  desconocido 400, no entero 400, > int 400. ✅
- `ListContentVersionsService`: `max(1, min(limit, 200))`, `@DefaultValue("50")` → la fake recorta igual; la web siempre pide 50 y
  `listVersions` rechaza fuera de 1–200 antes de llamar. ✅
- 404 deducidos: `@QueryParam int` / `@PathParam int` no convertibles → JAX-RS lanza `NotFoundException` (spec §3.2), y
  `ProblemExceptionMapper.transport` lo convierte en `ApiError.fromStatus(404)` = `NOT_FOUND`. La deducción es coherente con el código; sigue
  sin ejecutarse contra la API real (anotado en Riesgos). El cambio de T231 (`limit=x` 400 → 404 `NOT_FOUND`) es correcto y no afecta a la web,
  que nunca envía un `limit` no numérico.
- El 409 de la API solo trae `detail`: el handler lee `GET /content/{kind}` a continuación (mismo patrón que el PUT). Es una lectura, sin
  escritura ni reintento; si alguien vuelve a publicar en medio, `latest` sigue siendo información más reciente, no peligrosa. ✅

## Seguridad
- CSRF + `Content-Type: application/json` por `adminRoute({mutating:true})` antes de cualquier lectura de cuerpo o llamada (403/415, 0
  llamadas, probado). Sesión obligatoria (401). `no-store` y `X-Request-Id` en toda respuesta.
- Ruta: `kind`/`lang` en lista blanca en el handler y otra vez en `rollbackContent` (`lib/api/admin/content.ts:67`); `..` probado → sin
  inyección de ruta hacia la API. Solo se reenvían `baseVersion`/`targetVersion` como enteros 1…2³¹−1; cuerpo ≤ 4 KiB.
- Sin reintentos (POST de `adminRequest` no reintenta; probado con 500). Doble envío: `sending` (ref) bloquea en `ask` y en `restore`, y
  `setPending(null)` antes del `await` hace que un segundo clic en «Restaurar» del diálogo sea un no-op.
- Confirmación siempre con `<ConfirmDialog>` (`<dialog>` nativo modal, foco inicial en «Cancelar», Esc cancela, foco vuelve al botón que lo
  abrió).
- Log `admin_rollback`: solo `request_id, kind, lang, outcome, from, to`. Sin contenido, comentario ni token (centinelas en T399/T400).
- Instantánea: todo se renderiza como texto React (lista «id — título», `<pre>` con `JSON.stringify`, comentario); no hay
  `dangerouslySetInnerHTML`. El JSON muestra el documento tal cual lo guarda la API (el panel es solo admin y la API ya impide `client` en
  proyectos anónimos); nada llega a la web pública por esta vía.

## Borradores y 409
- El rollback no toca `sessionStorage` (probado: valor idéntico). El borrador conserva sus `baseVersions` viejas; `EditorFrame`
  (`components/admin/editor-frame.tsx:295,335`) lo ofrece como «desactualizado» y guarda con la base del borrador → 409 de la API →
  sobrescritura solo confirmada. No se pierde ni se sobrescribe sin confirmación. ✅
- 409 en el historial: no se actualiza `current` con `latest` (los botones siguen con la base vieja hasta «Recargar»); un nuevo intento daría
  otro 409, nunca un rollback doble. Aceptable.

## Desvíos evaluados
1. **Tres rutas fijas en vez de `[kind]`** — diagnóstico correcto: `(panel)/loading.tsx` e `history/loading.tsx` envuelven la página en un
   Suspense, Next 16.4.5 empieza a transmitir el 200 y un `notFound()` posterior ya no puede cambiar el estado (solo inyecta `noindex`). Con
   rutas fijas cualquier otro `kind` cae en `app/admin/[...rest]` → 404 real, verificado en T400. Las URLs del plan se mantienen. Aceptado.
   (Consecuencia: el guard `isKind` + `notFound()` de `history-page.tsx` queda inalcanzable → CR-1.)
2. **`?v=N` inexistente → 200 con alerta** — por la misma razón un 404 HTTP no es alcanzable sin quitar el esqueleto; el panel es `noindex`, y
   el aviso amable con la lista cumple la intención de T394. Aceptado como desvío documentado.
3. **`baseVersion ≥ 1` vs API `≥ 0`** — en la API un idioma con versiones siempre tiene una activa (`save`/`activate` desactivan e
   insertan/activan en la misma transacción), así que base 0 solo podría acabar en 409/404; la UI nunca ofrece «Restaurar» sin versiones.
   Aceptado.
4. **Fake y T231** — alineados con Java (ver arriba). Aceptado.
5. **Sin «Historial» en la navegación** — el plan (§ pantallas, l. 286 y 317) solo pide el enlace desde las tarjetas del dashboard; además se
   añadió desde los editores. Aceptado.
6. `request_id` en `admin_rollback` — exigido por §11. Aceptado.

## Accesibilidad y textos
- Un `h1` por pantalla; `nav` con nombre «Idioma del historial» y `aria-current`; `ol` y `li` con nombre; nombres únicos («Ver/Restaurar la
  versión N (ES)», «Restaurar esta versión» en la instantánea); botones inertes con `aria-disabled` (siguen enfocables) y descripción en la
  activa; objetivos ≥44 px en el selector; foco visible con token `--ink`; estado «Activa» con texto + forma + borde grueso.
- Foco: al cerrar el diálogo (cancelar o confirmar) vuelve al botón que lo abrió; tras el éxito ese botón queda inerte y el resultado se anuncia
  en `role=status`; los fallos en `role=alert`.
- Textos visibles en español (`UI.history`), sin URL internas; errores con referencia.
- Pendiente visual (Chrome, §16 V2/V7/V11): 360 px de lista e instantánea, `<dialog>` real, anillo de foco — no bloqueante para esta ronda.

## Privacidad
Sin teléfono, documento ni fecha de nacimiento; fixtures ficticios («Servicio de ejemplo», «Ada Ejemplo»). Nada del CV real.

## Skills consultadas
- `simplify`: **hallazgo** → CR-1 (`lib/admin/history.ts:12`, `app/admin/(panel)/history/history-page.tsx:32`,
  `app/admin/api/content/[kind]/[lang]/rollback/route.ts:16-17`). El resto sin hallazgos: `DocumentDiffList` extraído y reutilizado
  (`components/admin/content-diff.tsx:9,32`), `HistoryLink` compartido por los tres editores, `KIND_ROUTES.history` en un solo sitio.
- `next-best-practices`: sin hallazgos. `searchParams` como `Promise` esperada; `force-dynamic`; lecturas en paralelo con `Promise.all` y
  request id propio; `key={path}` reinicia el estado cliente al cambiar de URL; frontera servidor/cliente correcta (`history-view.tsx` 'use
  client', `lib/admin/history.ts` sin imports de runtime de `lib/api`); 401 → `redirect` con `next`.
- `strict-typing`: sin hallazgos nuevos. Los `as string` sobre `SHORT[...]`/`UI.editor.langs[...]` (`history-view.tsx:142,261,278,312`) vienen
  del tipo `Record<string, string>` preexistente de `messages.ts:303-304`; `SnapshotState` es una unión discriminada; `isVersion` estrecha
  `unknown` sin casts.
- `ui-ux-pro-max`: sin hallazgos bloqueantes. Tokens solo (`history.module.css`), estados con texto+forma, `opacity:.6` solo en controles
  inertes (exentos de contraste), `overflow-wrap:anywhere` en comentarios, ítems y JSON. Verificación a 360 px pendiente en Chrome.
- `testing-strategy`: sin hallazgos. Cada Tn tiene aserciones de comportamiento (cuerpos enviados, número de llamadas a la fake, claves exactas
  del log, contenido público tras el rollback en el standalone).
- `security-best-practices`: sin hallazgos (CSRF, tipo de cuerpo, lista blanca de segmentos, tope de cuerpo, sin reintentos, sin HTML no
  escapado, logs sin datos).

## Checkpoints
- **C1** ✅ lint/typecheck/test/build verdes; páginas `ƒ`; sin `console.*` ni TODO. ⚠️ código inalcanzable → CR-1.
- **C2** ✅ cada Tn y criterio con su `it()`; tests de comportamiento real con fixtures ficticios.
- **C3** ✅
- **C4** ✅ datos solo por `lib/api/admin`; los componentes usan `adminFetch` hacia el propio origen; fallo de lectura → `LoadFailure` con
  referencia (patrón del panel aprobado en slugs previos); vacío → estado vacío.
- **C5** ✅ a nivel DOM (tokens, foco, `h1`, landmarks); SEO no aplica (panel `noindex`, `X-Robots-Tag` comprobado en T400). Visual en Chrome
  pendiente.
- **C6** ✅ informes en `progress/web-admin/web-admin-history/`.
- **C7** ⏳ cierre pendiente de autorización humana (no aplica a esta revisión).

## Cambios requeridos
1. **CR-1 [Baja · simplify / código inalcanzable] Guards de `kind`/`lang` duplicados y una rama muerta.**
   - `app/admin/(panel)/history/history-page.tsx:32`: `HistoryPage` solo la llaman `history/{services,projects,architecture}/page.tsx` con un
     literal, así que `if (!isKind(kind)) notFound();` nunca se ejecuta (el propio desvío 1 explica que ahí no daría un 404 real). Tipar
     `kind: ContentKind`, quitar el guard y el `notFound` import, y borrar `isKind` de `lib/admin/history.ts:12` (tercera copia del mismo
     predicado). Ajustar `history.test.tsx` «T392 (page)» para no probar la rama eliminada (el 404 real ya lo cubre T400).
   - `app/admin/api/content/[kind]/[lang]/rollback/route.ts:16-17`: `isKind`/`isLang` repiten `isContentKind`/`isContentLang` de
     `lib/api/admin/parse.ts:99-100` (y el `isKind` de `app/admin/api/content/[kind]/route.ts:14`). Exportarlos desde `lib/api/admin` y
     reutilizarlos en el handler nuevo (opcionalmente también en `[kind]/route.ts`).

## Observaciones fuera de alcance
- `messages.ts:303-304` tipa `langs`/`langShort` como `Record<string, string>`, lo que obliga a `as string` en los consumidores; tiparlos con
  `ContentLang` los eliminaría (preexistente, slug content-core).
- Tras un 409 el historial no se actualiza con `latest` hasta «Recargar»; podría actualizar `current` para que la siguiente restauración use la
  base nueva. Decisión de UX razonable tal cual (pide recargar explícitamente).
- 404 de `limit`/`{version}` no enteros en la fake: deducidos de JAX-RS + `ProblemExceptionMapper`, no ejecutados contra la API real
  (confirmar con el runbook al desplegar).
- Verificaciones visuales §16 V2/V7/V11 en Chrome antes de cerrar el epic.

---

## Ronda 2

**Veredicto: APPROVED.** CR-1 corregido; sin hallazgos nuevos ni regresiones.

### Verificación ejecutable (Node 22.23.1)
`npm run lint` ✅ · `npm run typecheck` ✅ · `npm run build` ✅ (mismas rutas `ƒ`: `/admin/history/{services,projects,architecture}`,
`/admin/api/content/[kind]/[lang]/rollback`) · `npm test` ✅ 145 ficheros / 655 tests. Sin `next-server` ni `node` escuchando al terminar.

### CR-1 — verificado contra el código
- `app/admin/(panel)/history/history-page.tsx:29`: `HistoryPage({ kind: ContentKind, … })`; el guard `isKind`/`notFound()` y el import de
  `next/navigation` ya no están. El comentario explica por qué no hay `notFound()` ahí.
- `lib/admin/history.ts`: `isKind` y el import de `KINDS` borrados; sin referencias restantes en `app/`, `lib/`, `components/`, `tests/`.
- `app/admin/api/content/[kind]/[lang]/rollback/route.ts:2,38`: usa `isContentKind`/`isContentLang`, exportados en
  `lib/api/admin/index.ts:6` (definidos en `parse.ts:99-100`); los predicados locales desaparecieron. T396 sin cambios y en verde
  (`resume`, `fr`, `..` → 404 `ADMIN_NOT_FOUND`, 0 llamadas).
- `app/admin/(panel)/history/history.test.tsx` «T392 (page)»: pasa solo por las tres rutas reales (`page(kind: keyof typeof ROUTES)`), sin el
  mock de `notFound`; el resto de aserciones (selector, filas, `limit` 50, `?lang=fr` → ES) intactas. El 404 de un tipo desconocido sigue
  cubierto por HTTP en `tests/runtime/admin-history.test.ts:30` (T400: `/admin/history/resume/` → 404).
- Archivos tocados en la corrección: solo esos cinco (`history-page.tsx`, `history.test.tsx`, `lib/admin/history.ts`,
  `lib/api/admin/index.ts`, `rollback/route.ts`). Trazabilidad Tn ↔ it() y criterios ↔ tests sin cambios respecto a la ronda 1.

### Skills consultadas (ronda 2)
- `simplify`: sin hallazgos en la corrección (rama muerta y duplicados eliminados).
- `next-best-practices`: sin hallazgos (rutas y frontera servidor/cliente sin cambios).
- `strict-typing`: sin hallazgos (`kind` pasa de `string` a `ContentKind`; sin casts nuevos).
- `ui-ux-pro-max`: sin hallazgos (UI no tocada).
- `testing-strategy`: sin hallazgos (el test ya no prueba una rama inexistente; el 404 real se prueba donde ocurre, en el runtime).

### Checkpoints
C1 ✅ · C2 ✅ · C3 ✅ · C4 ✅ · C5 ✅ a nivel DOM (visual en Chrome pendiente, no bloqueante) · C6 ✅ · C7 ⏳ pendiente de autorización humana.

### Cambios requeridos
Ninguno.

### Observaciones fuera de alcance
- `app/admin/api/content/[kind]/route.ts:14` conserva su `isKind` local (slug content-core, preexistente; la ronda 1 lo dejó como opcional):
  podría pasar a `isContentKind` en `web-admin-regresion`.
- Siguen vigentes las de la ronda 1 (tipos de `langs`/`langShort`, refresco tras 409, 404 deducidos sin ejecutar contra la API real,
  verificaciones visuales §16 V2/V7/V11).
