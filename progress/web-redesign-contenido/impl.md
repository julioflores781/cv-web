# Impl — web-redesign-contenido (CO)

Node 22: `npm run lint` (0 avisos), `npm run typecheck`, `npm test` (53 archivos, 263 tests, incluidas las builds reales de `tests/build`) y `npm run build` (con design-api) verdes. Sin git de escritura.

## Mapa Tn -> test
| Test | Archivo (it) |
|---|---|
| CO-T1, T2, T3, T4, T5, T6, T7, T8 | `lib/api/validate-content.test.ts` (T8 en dos `it`: servicios y proyectos) |
| CO-T9, T10, T11, T12 | `lib/api/content.test.ts` |
| CO-T13, T16, T17 | `components/service-cards.test.tsx` |
| CO-T14, T15 | `lib/i18n/format.test.ts` |
| CO-T18, T81 (componente) | `components/home-view.test.tsx` |
| CO-T19, T20 | `components/process.test.tsx` |
| CO-T21 | `components/service-cards.module.test.ts` |
| CO-T22 … T31 | `components/projects.test.tsx` |
| CO-T32, T33, T34 (resolución de archivos) | `lib/projects/images.test.ts`; la parte de render en `components/projects.test.tsx` |
| CO-T35 … T40 | `components/contact-form.test.tsx` (bloque «selection to form»; el provider tiene además `engagement-provider.test.tsx`, extra) |
| CO-T41 … T45 (+ reglas de T38/T39) | `lib/contact/validate.test.ts` |
| CO-T46 … T54 | `lib/contact/client.test.ts` |
| CO-T55 … T69 | `components/contact-form.test.tsx` |
| CO-T70, T71, T72 | `tests/source.test.ts` |
| CO-T73 | `components/contact-form.module.test.ts` |
| CO-T74, T75, T77, T80, T81 | `tests/build/build.test.ts` (build sana) |
| CO-T76 | `tests/build/build.test.ts` (`build with a hostile projects API`) |
| CO-T78 | `tests/build/build.test.ts` (ampliación del `it` HX-T42: puertos, servicios y proyectos `[]`) |
| CO-T79 | `tests/build/build.test.ts` (`CO-T79`, y la ampliación de BA-T50 con API caída) |
| CO-T82 | protocolo (abajo) |

## Criterio -> tests
A1 T1-T4, T7-T12, T77 · A2 T5, T6, T11, T25, T26, T33, T76 · A3 T13-T18 · A4 T19, T20 · A5 T22-T34 · A6 T35-T40 · A7 T46-T54, T70-T72 · A8 T41-T45, T55-T69 · A9 T21, T73 · A10 T74-T80 · A11 T81 · A12 T82.

## Archivos
- Nuevos: `lib/api/{services,projects}.ts`, `lib/contact/{types,validate,client,index}.ts`, `lib/projects/{images,display}.ts`, `lib/i18n/{price,interpolate}.ts`, `components/{service-cards,engagement-aside,engagement-provider,services-section,process,projects,project-featured,project-card,contact-form,contact-section,selection-line}.tsx` (+ `.module.css`) y los tests del mapa.
- Tocados: `lib/api/{types,validate,validate-content,index}.ts` (`parsePeriod` exportado), `lib/i18n/{dictionaries,format}.ts`, `components/{home-view,contact}.tsx`, `components/ui/{cta,section-head,section-shell}.tsx` + `ui.module.css`, `app/[[...slug]]/page.tsx`, `tests/{source.test.ts,fixtures/content.ts,helpers/fake-api.ts,build/build.test.ts}`, `components/{home-view,hex-plane-section}.test.tsx` (prop `apiUrl`), `progress/current.md`.
- Docs del leader (`CLAUDE.md`, `AGENTS.md`, `CHECKPOINTS.md`, `docs/web-standards.md`): NO tocados.

## Verificación real de R12 (API local, `quarkus:dev` con Docker)
- `POST /api/v1/contact/messages?lang=es` con `Content-Type: application/json` y **sin** `Accept` (`-H 'Accept:'`) -> `201`, sin cuerpo, `access-control-allow-origin` del `Origin` enviado.
- Email inválido -> `400` `CONTACT_INVALID` con `detail` `The "email" field is not valid.` (EN) — formato de `field` compatible con la regex.
- Tras 5 envíos desde la misma IP -> `429` `CONTACT_RATE_LIMITED` (`Demasiados mensajes`).
- Preflight `OPTIONS` con `Access-Control-Request-Method: POST` y `Access-Control-Request-Headers: content-type` -> `200`, `allow-methods: POST`, `allow-headers: content-type`.
- Desde Chrome (formulario real, página en :4030, API local detrás de un proxy desechable que reenvía el POST a Quarkus): `OPTIONS 200` + `POST 201` con cuerpo `{"name":..,"email":..,"message":"Servicios de interés: APIs y backend + IA y modernización\n\n…","website":""}`; segunda tanda -> `429` con alerta, foco y valores conservados.
- Limitación: en dev el CORS acepta cualquier origen (`%dev…origins=/.*/`); el de producción (`https://cv.floreslab.dev`) no se probó. No se regeneró `schema.d.ts` (ya traía `/contact/messages`, `/services`, `/projects`).

## CO-T82 (protocolo, Chrome DevTools) — ejecutado por el implementer
Web construida con design-api (`CV_API_URL=http://localhost:4020`, proxy a :4021), servida en :4030; referencia en :4010. Sonda `probe.mjs web <modo>` + `spec.mjs`:
- Claves `service-card(+title,+price) aside aside-row process process-number process-title featured featured-left featured-title featured-facts featured-side card card-body card-title contact contact-title contact-form contact-field contact-button section section-inner section-alt h2 footer footer-inner`: Servicios 1440 -> 87 comprobaciones, 0 diferencias; Servicios 390 -> 87, 0; Perfil 1440 -> 58, 0; Perfil 390 -> 58, 0. `scrollWidth = innerWidth` a 390 en ambos modos.
- Alturas de sección Servicios 1440 (web vs referencia): servicios 815/815, proceso 522/522; hero 1015/951 (fila extra del panel + cajetín, D6); proyectos 1866/1528 y contacto 686/676 (distinto contenido: 1 tarjeta ancha vs 2 en el copy del diseño; contador del formulario).
- Interacción (Servicios 1440): marcar S-02 y S-04 y desmarcar S-01 -> `aria-pressed`, sombra `8px 8px 0` solo en las marcadas, aside con 2 filas, línea `selección → APIs y backend + IA y modernización`, contador `0/1941` (máximo efectivo). Envío vacío -> 3 `aria-invalid`, mensajes, foco en Nombre, borde `rgba(18,56,42,.55)`. Envío con selección: `list_network_requests` muestra `OPTIONS 200` + `POST 201`; cuerpo con el prefijo (arriba); `status` con foco y campos vacíos. Segundo envío -> `429`, `alert` con foco y mailto, valores conservados, botón sin bloquear.
- Foco por teclado (Tab): `outline solid 2px` en las tarjetas. `prefers-reduced-motion: reduce`: `transition-duration 0s`.
- NO ejecutado: `parity:diff` por bandas es inservible hoy (desfase horizontal de 24 px ya anotado en HX #9 para PA y copy distinto: 12-99 % por banda); el diseño con 2 tarjetas; el estado «sin JS» real (solo `renderToString` + HTML del build); imagen de proyecto real (no hay `public/projects/*.webp`; cubierto por tests de componente). El `console` de la página solo mostró un aviso de preload de CSS y el 429 esperado.

## Desviaciones / interpretaciones (a revisar)
1. **Reduced-motion (CO-T73 vs BA-T16):** como en HX, los módulos no llevan bloque propio; el bloque global único lo cubre. CO-T73 lo comprueba así.
2. **CO-T73 `[data-mode="services"] input,textarea`:** en vez de una regla por modo, el campo usa `border:1px solid var(--line-input)` y el token ya vale `--line` en plano y `.55` en obra (misma consecuencia, menos CSS).
3. **BA-T37 y HX-T41 modificados** (aprobados antes): sin servicios, la página Servicios conserva «Proceso» (copy del diccionario) -> `['01 / process','02 / contact']`; HX-T41 cuenta ahora `puertos + 1` `<noscript>` (el del formulario).
4. **CO-T13 `h3` dentro de `button`:** literal del plan (CORREGIDO en ronda 2, ver abajo); HTML estrictamente inválido (contenido flujo en botón) y el rol heading se pierde para lectores de pantalla (el botón ya trae todo el texto como nombre).
5. **Sin selección en Perfil / sin servicios:** `SelectionLine` devuelve `null` sin proveedor; el provider solo envuelve en Servicios con servicios.
6. **Imagen de proyecto:** `lib/projects/images.ts` resuelve archivos en el build y pasa un mapa `id -> URL` por prop; el componente además exige `own`+`public` (defensa doble). Dimensiones fijas 360x640 (destacado) y 640x360 (tarjeta) con `object-fit: cover`, sin leer la cabecera del webp.
7. **`CV_API_URL` en el HTML (CO-T75):** viaja solo como prop serializada del formulario (payload de scripts); no hay atributo `action`/`data-endpoint`. El test comprueba que no aparece en el marcado visible.
8. **Anónimos:** el parser devuelve `client: null` (no elimina la clave).
9. **Copy:** ES del artifact como provisional (título de Proyectos neutro; «Plano del sistema» descartado por D8, el panel se titula por el mono `stack`); EN redactado por el implementer y pendiente de revisión humana. Textos del formulario, errores y estados son nuevos (ES/EN) y también provisionales.
10. **Proyectos:** con una sola tarjeta de proyecto secundario ocupa todo el ancho (comportamiento del `grid` del diseño) y el bloque 16/9 queda muy alto.
11. Extras fuera del plan: `engagement-provider.test.tsx`, `formatPrice` con moneda desconocida, helpers `clientName`/`safeLinks`, `services-section.tsx` (compone cards + aside), `selection-line.tsx`, `lib/i18n/{price,interpolate}.ts` (para no arrastrar los diccionarios al bundle cliente), `.stack40 > .head{flex:0 0 auto}` (corregido al ver en pantalla un hueco de 320 px en «Proceso»).
12. Se regeneraron `design/artifact-v2/.shots/probes/*.js` (los borré por error al limpiar; contenido idéntico, los produce `probe.mjs`).


## Ronda 2 (correcciones de review.md)
1. `service-cards.tsx`: `h3` -> `<span className={`${styles.title} display`} data-probe="service-card-title">` (misma clase y sonda; la tarjeta es flex column, el span es bloque). Igual que el diseño de referencia (que ya usaba `span`). CO-T13 (enmendado por el leader) comprueba ahora `tagName === 'SPAN'` en `service-cards.test.tsx`. Sonda/spec: ninguna referencia a `h3`.
2. `selection-line.tsx`: quitado `aria-live`; queda solo el `div aria-live` del aside. Test nuevo CO-T83 en `service-cards.test.tsx` (SelectionLine montada junto al aside): exactamente 1 región viva dentro del aside y la línea sigue presente. No existía test previo sobre el aria-live de la línea.
3. Aside 429 vs 483: el CSS (`flex:1 1 300px`, grid `flex:2 1 520px`, gap 24) es idéntico al del diseño. En Chrome a 1440: contenedor 1232 -> aside = 300 + (1232-24-820)/3 = 429, coherente con la fórmula. El 483 de la referencia no sale de este CSS con un contenedor de 1280 (daría 445); no es defecto del código, queda para PA (medir la referencia en su propio estado). Sin cambios.
4. Verificación: lint, typecheck OK; 53 archivos de test OK (+1 test); build con design-api (puerto 4020) OK. Chrome (build servido): Servicios 1440 -> título SPAN block 30px/30px, tarjeta 381x230, 0 `button h3`, scrollWidth 1440; 390 -> tarjeta 342x230, scrollWidth 390; sin cambio visual respecto a la ronda 1 (mismos tamaños y estilos computados).
