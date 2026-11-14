# Review — web-admin-messages (slug 8/10 de web-admin)

**Veredicto: APPROVED**

Auditoría independiente sobre el árbol sin commitear de `feature/web-admin-api-client` (solo lo nuevo de este slug y sus cambios a piezas
previas: `scripts/parity/admin-fake.mjs` + test extra, lista de navegación en `app/admin/(panel)/architecture/page.test.tsx`, `lib/admin/nav.ts`).
Node 22.23.1. No se modificó código, no se hizo commit, no se tocó `progress/current.md`.

## Ejecución
| Comando | Resultado |
|---|---|
| `npm run lint` | verde |
| `npm run typecheck` | verde |
| `npm run build` | verde; `ƒ /admin/messages`, `ƒ Proxy (Middleware)` |
| `npm test` | 149 archivos / 672 tests verdes (43 s) |

Pruebas manuales propias contra una copia del standalone (en el scratchpad, puerto 3131) + `scripts/parity/design-api.mjs` (puerto 4031), con `curl`:

| Caso | Resultado |
|---|---|
| `/admin/messages/` con sesión | 200, `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, `<meta name="robots" content="noindex, nofollow">`, 3 filas, `aria-current="page"` en «Mensajes» |
| `?before=2` | 200, 1 fila |
| `?before=2&before=3`, `-2`, `%2B2`, `2.0`, `99999999999999999999`, `9007199254740993`, `2%0A`, `before[]=2`, `Before=2`, `limit=1&before=abc` | 200, página más reciente (cursor ignorado, `limit` del visitante ignorado) |
| `?before=9007199254740991` | 200, «No hay mensajes más antiguos.» + enlace de vuelta |
| sin cookie, `?before=2` | 307 a `/admin/login/?next=%2Fadmin%2Fmessages%2F%3Fbefore%3D2`, `no-store` |
| sesión revocada (`logout-all`) o cookie falsa, `?before=2` | 307 a `/admin/login/?expired=1` (sin `next`; ver O-1) |
| `POST` / `DELETE` a la página (mismo origen y origen ajeno) | 200, se renderiza la lista; ninguna llamada distinta de GET a la API (ver Desvíos) |
| log del standalone | 17 líneas `admin_messages_view`, claves solo `timestamp, level, service, event, request_id, outcome, count`; 0 líneas con nombre, correo o texto; `outcome: expired` registrado en la sesión revocada |

Procesos detenidos al terminar: `pgrep next-server|design-api` vacío; puertos 3131, 4031 (y 3111, 4021 del implementer) libres. Copia del standalone borrada.

## Trazabilidad Tn ↔ it()
| Tn | it() leído | ¿Hace lo que dice? |
|---|---|---|
| T402 | `page.test.tsx` «T402: with the fake…» · `messages-list.test.tsx` «T402 (component)…» | Sí: orden de nombres y de `dateTime` descendente, id, `<time dateTime>`, email, cuerpo; la API recibe `?limit=50` |
| T403 | `messages-list.test.tsx` «T403…» + standalone (T409) | Sí: 0 `script/img/iframe/[onerror]`, `textContent` del cuerpo idéntico (saltos incluidos), sin hijos, sin enlace para el email con marcado; CSS `pre-wrap` y `overflow-wrap: anywhere`; HTML real con `&lt;script&gt;` |
| T404 | `messages-list.test.tsx` «T404…» · `contact-messages.test.ts` «T404 (rule)…» | Sí: `mailto:` exacto sin `target`; `?bcc=` queda en texto; 15 vectores negativos |
| T405 | `page.test.tsx` «T405…» · `messages-list.test.tsx` «T405 (links)…» · `contact-messages.test.ts` «T405 (cursor)…» | Sí: 120 mensajes, 71 → 21 → última sin enlace; `abc, 0, -5, 20 dígitos, 1.5, +7, 71&limit=100, [71,21]` con `limit=100` → la API solo ve `?limit=50` |
| T406 | `page.test.tsx` «T406…», «T406 (session)…» · `messages-list.test.tsx` «T406 (empty)…» | Sí: esqueleto `role=status aria-busy`, vacío, 500 y JSON roto con `Referencia: <32 hex>`, reintento a la misma página, sin host de la API; 401 → `redirect` con `next` |
| T407 | `page.test.tsx` «T407…» | Sí: servidor hostil con `ip_hash/ipHash/senderKey/phone` dentro y fuera de la lista; nada llega al DOM |
| T408 | `page.test.tsx` «T408…» + barrido del log real en `tests/runtime/admin-messages.test.ts` | Sí: tres resultados (`ok/unavailable/expired`), conjunto exacto de claves, centinelas ausentes |
| T409 | `tests/runtime/admin-messages.test.ts` «T409…» · `messages-list.test.tsx` «T409 (accessible, stacked)…» | Sí: cabeceras, meta, 307 sin sesión, `h1/h2/h3`, escape, solo GET, sin handler. El apilado a 360 px se comprueba por reglas CSS (1 columna base, columnas desde 900 px), no en navegador |

## Trazabilidad criterios ↔ tests
AC22 → T402–T407 (+T221/T234) · AC23 → T406 · AC25 → T408 · AC8 → T409 · AC26 → T409. Sin criterio ni `Tn` sin cobertura.

## Contrato contra las fuentes Java (`/Volumes/Externo/Repos/thinking/cv`)
- `AdminMessagesResource`: solo `@GET`; `limit` `Integer.parseInt` 1–100, por defecto 50; `before` `Long.parseLong` ≥ 1; cualquier otra cosa `BadRequestException` (400 `BAD_REQUEST`); `next` = id de la última fila como string. Coincide con lo que dice `impl.md`.
- `ListContactMessagesService`: pide `limit + 1`; auditoría solo `limit/returned/paged`.
- `PostgresContactMessageRepository`: `ORDER BY created_at DESC, id DESC`; cursor por fila `(created_at, id) < (SELECT … WHERE id = ?)`; cursor inexistente → subconsulta NULL → lista vacía; `ip_hash` nunca se selecciona.
- Fake (`scripts/parity/admin-fake.mjs:594-599, 901-916`): `javaInteger` (signo opcional, solo dígitos, rango `int`/`long` con BigInt), 400 `BAD_REQUEST`, orden fecha y luego id, cursor por fila, cursor inexistente vacío, `next` cuando sobra al menos una fila. Coincide.
- T234 sigue siendo válido y verde: sus fixtures tienen id y fecha en el mismo orden, y sus 400 (`limit=0/101/x`, `before=0/-1/x`) y `before=999` → vacío son los de Java.
- Diferencias residuales de la fake, sin efecto en el panel (O-3).

## Privacidad y seguridad
- **Logs:** `app/admin/(panel)/messages/page.tsx:28-32` registra solo `request_id`, `outcome`, `count`. Verificado en test y en el log real. `lib/api/admin/client.ts` no registra la query.
- **Almacenamiento:** sin `localStorage`/`sessionStorage` en los archivos del slug; el componente es de servidor (único cliente: `LocalTime`, que solo formatea la fecha).
- **URLs:** solo viaja el cursor (`?before=<id>`), también dentro de `next` del login; ningún nombre, correo ni texto.
- **Caché e índices:** `no-store` y `noindex, nofollow` (cabecera de `next.config.ts` + meta), `force-dynamic`.
- **Contenido como texto:** `components/admin/messages-list.tsx` solo usa nodos de texto; sin `dangerouslySetInnerHTML` ni autolink.
- **`mailto:`** (`lib/admin/contact-messages.ts:22-26`): patrón anclado `^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$`, ≤ 254. Probado aparte con 34 vectores: `?`, `&`, `%` (incluido `%0A`), `\n`, `\r\n`, salto inicial, `\t`, `\0`, U+2028, U+200B, U+202E, espacio duro, comillas simples y dobles, `,`, `;`, `#`, `/`, `\`, cirílico, IDN, ancho completo, `javascript:…`, `data:…`, `//…`, `a@[1.2.3.4]` → todos `null`. `$` en JS sin flag `m` no admite salto final. El href siempre empieza por el literal `mailto:` y el resto no puede contener `:` ni `/`, así que no puede cambiar de esquema ni llevar cabeceras o parámetros. Admite formas inocuas como `-a@b.co`, `.@b.co`, `a@-b.co` (un único destinatario, sin riesgo).
- **`before`:** `parseCursor` (`contact-messages.ts:10-14`) rechaza repetido (array), signo, decimal, exponente, hex, espacios, dígitos no ASCII, > 16 dígitos y > `MAX_SAFE_INTEGER`; nada de eso llega a la API (verificado en vivo).
- **Solo lectura:** no existe `app/admin/api/messages`; `lib/api/admin/messages.ts` solo tiene `method: 'GET'`; la página no tiene formulario ni acción.
- **Sesión:** sin cookie → login con `next`. Token muerto → ver O-1.
- **C3:** sin teléfono, documento ni fecha de nacimiento; fixtures ficticios (`Ada/Grace/Alan Ejemplo`, `example.test`).

## Accesibilidad y textos
- Un `h1` visible («Mensajes»; el segundo `<h1>` del HTML es el esqueleto de `loading.tsx` que el streaming sustituye, igual que en los slugs previos), `h2` «Mensajes recibidos», `h3` por mensaje (nombre accesible del `article`), `h4` «Mensaje», `dl` Id / Recibido / Email.
- `<ul>` etiquetada; paginación en `<nav aria-label="Páginas de mensajes">` con enlaces «Más antiguos» y «Volver a los más recientes» (nombres claros y distintos).
- Objetivos de 44 px (`.email`, `.page`), foco `3px solid var(--ink)`, solo tokens, una columna por defecto y dos desde 900 px, `min-width: 0` + `overflow-wrap: anywhere`.
- Todos los textos en español (`lib/admin/messages.ts:505-518`).

## Evaluación de los desvíos
1. **Cursor acotado a `MAX_SAFE_INTEGER` frente a `long`:** aceptado. No se pierde ninguna página alcanzable: el id es `bigserial` (empieza en 1) y además `parseMessage` exige un entero JSON, que por encima de 2^53 ya no sería exacto. Si la API diera un `next` mayor, simplemente no habría enlace «Más antiguos» (degradación segura, nunca un cursor equivocado).
2. **Extras «Volver a los más recientes» y «No hay mensajes más antiguos.»:** aceptados. Cubren un estado real del contrato (cursor inexistente → página vacía) y evitan un callejón sin salida; tienen test (`T405 (links)`, `T406 (empty)`).
3. **Un POST a la página se renderiza:** aceptado. Comprobado en vivo (POST y DELETE, mismo origen y ajeno → 200 con la lista). No hay mutación posible (la API solo recibe GET), la cookie es `SameSite=Strict` y la respuesta no es legible desde otro origen; equivale a un GET. Next no ofrece rechazarlo en una página sin añadir lógica al proxy, fuera del plan.
4. Cambios a piezas previas (`architecture/page.test.tsx:66`, fake + test extra): aditivos y correctos.

## Skills consultadas
Criterios aplicados leyendo el diff (no se invocó `simplify` como herramienta porque aplica cambios y el revisor no edita).
- **simplify** — sin hallazgos: `parseCursor` se reutiliza para `?before` y para `next`; `LoadFailure`, `EditorSkeleton`, `pageContext`, `expireOn401`, `failureCode` reutilizados.
- **next-best-practices** — sin hallazgos: `app/admin/(panel)/messages/page.tsx:11` `force-dynamic`, `searchParams` como promesa, componente de servidor sin `fetch` propio (datos por `lib/api/admin`), `loading.tsx` presente, `next/link` en la paginación.
- **strict-typing** — sin hallazgos: sin `any`/`unknown` sin estrechar ni aserciones en el código de producción del slug.
- **ui-ux-pro-max** — sin hallazgos bloqueantes en `components/admin/messages-list.tsx` y `messages.module.css` (jerarquía, objetivos táctiles, foco, tokens). Nota menor en O-2.
- **seo-audit** — sin hallazgos: `title` «Mensajes · Panel», noindex por cabecera y meta.

## Checkpoints
- **C1** ✅ lint, typecheck, test, build verdes; ruta `ƒ`; sin `console.log`, código muerto ni TODOs.
- **C2** ✅ cada AC y cada T402–T409 con `it()` real; fixtures ficticios.
- **C3** ✅ sin datos privados ni reales.
- **C4** ✅ datos solo por `lib/api/admin`; fallo de la API → error con referencia; vacío → estado vacío.
- **C5** ✅ tokens, foco, un `h1`, landmarks; panel fuera de índices. (Vista a 360 px no repetida en navegador por el revisor; consta la V10 del implementer.)
- **C6** ✅ informes en `progress/web-admin/web-admin-messages/`; `current.md` sin tocar por el revisor.
- **C7** — pendiente del `closer` y de la autorización humana.

## Cambios requeridos
Ninguno.

## Observaciones fuera de alcance
- **O-1 (diseño aprobado en slug 2, afecta a todo el panel):** en el runtime real, una sesión muerta acaba en `/admin/login/?expired=1` **sin `next`**: `app/admin/(panel)/layout.tsx:27` redirige antes que la página. El `next` de `expireOn401` (lo que prueba `T406 (session)`) solo actúa si la sesión muere entre la llamada del layout y la de la página. Es lo que fija el plan (§ línea 154, AC4) y es igual en los slugs anteriores; si se quiere volver a la página tras caducar, es un cambio del layout, candidato para `web-admin-regresion`.
- **O-2:** `messages-list.tsx:27,34` — la `section` y la `ul` comparten el mismo `aria-labelledby` (nombre anunciado dos veces); y `list-style: none` hace que Safari/VoiceOver no anuncie la lista salvo con `role="list"`. Preferencia, sin regla en `web-standards`.
- **O-3:** la fake difiere de Java solo en bordes inalcanzables desde el panel: `Integer.parseInt`/`Long.parseLong` aceptan dígitos Unicode no ASCII y cualquier cantidad de ceros a la izquierda; `javaInteger` solo ASCII y hasta 40 dígitos.
- **O-4 (slug 1):** `lib/api/admin/messages.ts:12` valida `before` con `Number.isInteger` (no `isSafeInteger`); hoy la página ya lo acota antes.
- **O-5:** el test de runtime no fija el comportamiento del POST a la página (desvío 5); podría añadirse en `web-admin-regresion`.
