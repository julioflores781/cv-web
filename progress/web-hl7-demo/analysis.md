# Analysis — web-hl7-demo

> Escrito por el `analyst` con Bash (la herramienta Write fue rechazada para un subagente).

## 0. Lo verificado (2026-11-04, contra `https://cv-api.floreslab.dev`, solo mensajes sintéticos)

**CORS hoy (ya está configurado para el origen de la web):**
- `POST /api/v1/hl7/translate?format=json|fhir` con `Origin: https://cv.floreslab.dev` y `Content-Type: text/plain` devuelve `200`, con `access-control-allow-origin: https://cv.floreslab.dev`, `access-control-allow-credentials: true` y `vary: origin`. La misma cabecera aparece en los `400`, `413` y `422` con cuerpo, y también en el `413` sin cuerpo de más de 128 KB.
- `OPTIONS` (preflight) con `Access-Control-Request-Method: POST` y `Access-Control-Request-Headers: content-type` devuelve `200` con `allow-origin` = el origen, `allow-methods: POST`, `allow-headers: content-type`. No hay `access-control-max-age` ni `access-control-expose-headers`.
- **Origen distinto** (`http://localhost:3000`): `403` en POST y en OPTIONS, sin `allow-origin`. Consecuencia: `npm run dev` contra la API de producción **no funciona** hasta que el NAS añada ese origen (ver R1).
- **El POST `text/plain` es una petición simple del navegador** (método POST, solo cabeceras de la lista segura, `Content-Type` en la lista segura). No dispara preflight. El preflight existe y responde bien igualmente, pero la web no depende de él. Condición: el cliente **no puede añadir cabeceras propias** (ni `Authorization`, ni `X-*`), ni usar `application/json`. Se usa `?lang=` y no hace falta ninguna cabecera de idioma.
- No hace falta leer cabeceras expuestas: solo `Content-Type` (seguro) y el cuerpo.

**Contrato (`/openapi.json`, operación `translateHl7`)**
- Query: `format` = `json` (por defecto) | `fhir`; `lang` = `es` | `en` (desconocido: `es`). Cuerpo `text/plain`, `maxLength` 65536.
- `200`: `application/json` (resumen) o `application/fhir+json` (Bundle `collection`).
- Errores, todos `application/problem+json` con `{type:'about:blank', title, status, detail, code}`, con `title`/`detail` en el idioma de `?lang` (comprobado con `?lang=en`):

| HTTP | `code` | Cuándo (comprobado) |
|---|---|---|
| 400 | `HL7_EMPTY_BODY` | cuerpo vacío |
| 400 | `HL7_UNSUPPORTED_FORMAT` | `?format=xml` |
| 413 | `HL7_PAYLOAD_TOO_LARGE` | 65537 bytes y 70 000 bytes |
| 413 | (sin cuerpo) | 200 000 bytes: el servidor corta antes de leer; sin `content-type` |
| 422 | `HL7_INVALID_MESSAGE` | texto que no es HL7 (`hola`) |
| 422 | `HL7_UNSUPPORTED_MESSAGE` | tipo o versión no soportados |
| 500 | `UNEXPECTED` | documentado en el OpenAPI, no provocado |

- **Límite exacto:** 65536 bytes pasa el control de tamaño (llegó al `422` de contenido) y 65537 da `413`. El cliente debe bloquear **más de 65536 bytes UTF-8**.
- **Versión:** un `MSH-12` = `2.5` da `422 HL7_UNSUPPORTED_MESSAGE` («Se recibió ADT^A01 (v2.5)…»). **Los ejemplos de la web deben llevar `2.5.1`**.
- No se observó ninguna cabecera de rate limit (ver R2).

**Código de la web (leído):** `app/[[...lang]]/page.tsx` es un Server Component estático; `HomeView` compone las secciones y la nav solo enlaza a secciones renderizadas; `lib/i18n/dictionaries.ts` tiene `Dictionary` tipado ES/EN; `tests/source.test.ts` T68 prohíbe `fetch(` y `process.env` fuera de `lib/api`; `components/home-view.test.tsx` T51 afirma que **no** hay demo y que los `h2` son `['Impact','Experience','Stack','Contact']`, y su test `extra` espera `['Contacto']` y nav `['#contact']`; `tests/build/build.test.ts` hace builds reales con una API falsa; `app/globals.css` define tokens y clases (`.section`, `.section-title`, `.btn`, `.wrap`); `next.config.ts` tiene `output:'export'` y `trailingSlash:true`. No hay `public/` ni `_headers` (no hay CSP que obligue a declarar `connect-src`).

**Diseño (`design/preview.html`, líneas 74–84 y 144–163):** sección `#demo` con título «Demo · traductor HL7 → FHIR», pestañas JSON/FHIR R4 y rótulo «ADT^A01 · ORU^R01 · v2.5.1», rejilla de 2 paneles (`entrada · text/plain` / `salida · application/fhir+json` con «200 OK · 38 ms»), `pre` con `overflow:auto` y `min-height:230px`, una columna con 760 px o menos, y la nota «Solo mensajes sintéticos: no se guardan ni se registran en logs. El código está en GitHub.».

## 1. Objetivo
Añadir a la home (ES `/` y EN `/en/`) la sección `#demo`: un traductor HL7 v2.5.1 a JSON o Bundle FHIR R4 que se ejecuta **en el navegador** contra la API real. Cubre los estados cargando, éxito, error de la API, red/CORS, vacío y demasiado grande; es accesible y legible a 360 px. La web sigue siendo estática: la demo no hace ninguna petición hasta que el visitante pulsa «Traducir». No se guarda ni se registra nada.

## 2. Archivos a crear / tocar

**Nuevos**
- `lib/hl7/types.ts`: `Hl7Format = 'json' | 'fhir'`, `Hl7Problem {title, detail, status, code}` y la unión discriminada `TranslateResult`: `ok {status, format, body, elapsedMs}` · `problem {status, problem, elapsedMs}` · `http-error {status, elapsedMs}` (sin problema válido: 413 sin cuerpo, 429/5xx de Cloudflare, HTML) · `invalid-response {status}` (200 que no es JSON) · `network` (`fetch` lanzó `TypeError`: red caída **o** CORS, indistinguibles en el navegador) · `timeout` · `aborted`.
- `lib/hl7/client.ts`: **único módulo con `fetch` del navegador**. `translateHl7({apiUrl, message, format, lang, signal?, timeoutMs?})`. `POST ${apiUrl}/api/v1/hl7/translate?format=…&lang=…`; solo la cabecera `Content-Type: text/plain` (sin cabeceras propias, sin preflight); `mode:'cors'`, `credentials:'omit'`, `cache:'no-store'`; timeout de 15 s con `AbortController` enlazado a `signal`; mide con `performance.now()`; en `200` reformatea con `JSON.stringify(JSON.parse(text), null, 2)` (si no es JSON: `invalid-response`); en no-OK intenta leer `problem+json` y valida su forma; si no es válida: `http-error`. Sin `console`, sin guardar el cuerpo.
- `lib/hl7/size.ts`: `utf8Size(text)` con `TextEncoder` y `MAX_MESSAGE_BYTES = 65536`.
- `lib/hl7/samples.ts`: ejemplos sintéticos `adt-a01` y `oru-r01` (MSH-12 `2.5.1`, «Ada Ejemplo», fechas y MRN ficticios, segmentos separados por `\n`), tipados `{id, label, message}`. El ORU incluye un valor numérico y uno textual con tilde (ejercita UTF-8).
- `lib/hl7/index.ts`: reexporta lo público.
- `components/hl7-demo.tsx`: `'use client'`. Props: `apiUrl`, `lang`, `dict: Dictionary['demo']`. **No llama a `fetch`** (usa `translateHl7`) ni lee `process.env`. Un `AbortController` por petición: se cancela la anterior, se ignoran respuestas tardías y se aborta al desmontar.
- `components/hl7-demo.module.css`: solo tokens existentes, sin hex nuevos.
- Tests: `lib/hl7/client.test.ts`, `lib/hl7/size.test.ts`, `lib/hl7/samples.test.ts`, `components/hl7-demo.test.tsx`.

**Tocar**
- `lib/i18n/dictionaries.ts`: `nav.demo`, `sections.demo` y un bloque `demo` (ES y EN, mismas claves): título, rótulo de formato, «JSON», «FHIR R4», selector de ejemplos, etiqueta del textarea, «Traducir»/«Traduciendo…», «Copiar»/«Copiado», cabeceras de panel, nota de privacidad, contador de bytes, un mensaje por fallo (vacío, demasiado grande, red/CORS, sin conexión, timeout, http-error, respuesta inválida, copia fallida) y plantilla de estado. Los `title`/`detail` del problema vienen de la API y se muestran tal cual.
- `components/home-view.tsx`: prop nueva `apiUrl: string`; enlace `#demo` en la nav (siempre, es contenido estático) entre `stack` y `contact`; `<Hl7Demo />` entre `Skills` y `Contact`.
- `app/[[...lang]]/page.tsx`: pasar `apiUrl={getConfig().apiUrl}` (el único lector de entorno sigue siendo `lib/api/config.ts`).
- `tests/source.test.ts`: T68 reformulado (ver §5).
- `components/home-view.test.tsx`: actualizar T51 y el test `extra`.
- `tests/build/build.test.ts`: casos de la demo.
- `docs/web-standards.md` (sección «Datos»), `AGENTS.md` (mapa y regla dura 2), `CHECKPOINTS.md` (C4) y `CLAUDE.md`: documentar la excepción. Texto propuesto: «Los datos del CV entran solo por `lib/api`, en el build. Única excepción: la demo HL7 (`lib/hl7`) hace `fetch` en el navegador, solo tras una acción del visitante; los componentes siguen sin llamar a `fetch`».

## 3. Criterios de aceptación
- **A1** `npm run lint`, `typecheck`, `test` y `build` en verde; el build no contacta con `/api/v1/hl7/*`.
- **A2** `/` y `/en/` contienen `<section id="demo">` con `h2` propio y `aria-labelledby`, entre Stack y Contacto; la nav enlaza a `#demo` en ES y EN; sigue habiendo un solo `h1` y los landmarks.
- **A3** El HTML estático ya trae textarea con el ejemplo ADT por defecto, selector de ejemplos, JSON/FHIR, botón y nota de privacidad; no hay resultado hasta pulsar.
- **A4** «Traducir» envía `POST ${apiUrl}/api/v1/hl7/translate?format=<json|fhir>&lang=<es|en>` con cuerpo `text/plain` igual al textarea y **sin más cabeceras que `Content-Type`**, con `credentials:'omit'`.
- **A5** Éxito: cuerpo formateado, estado «200 · N ms», formato visible y «Copiar» habilitado. La región `aria-live` anuncia el resumen, no el JSON entero.
- **A6** Error de la API (400/413/422/500 con `problem+json`): se muestran `title`, `detail` y `code` en `role="alert"`; no queda el resultado anterior como si fuera actual.
- **A7** Error sin problema válido (413 sin cuerpo, 429, 5xx con HTML, 200 no JSON): mensaje genérico localizado con el estado HTTP si lo hay.
- **A8** `fetch` rechazado: mensaje que menciona red **y** bloqueo CORS; con `navigator.onLine === false`, mensaje de sin conexión. Timeout (15 s): mensaje propio. Ningún error rompe la página ni deja el botón bloqueado.
- **A9** Entrada vacía o solo espacios: no se envía; mensaje junto al textarea con `aria-invalid` y foco en el textarea.
- **A10** Más de 65 536 bytes UTF-8 (en bytes, no caracteres): no se envía; mensaje con tamaño actual y máximo. Exactamente 65 536 bytes sí se envía. El contador de bytes se actualiza al escribir.
- **A11** Carga: botón deshabilitado con `aria-busy` y «Traduciendo…»; un segundo envío cancela el anterior y la respuesta tardía del primero no pisa al segundo; al desmontar se aborta.
- **A12** Cambiar de ejemplo reemplaza el textarea y limpia resultado y errores; cambiar JSON/FHIR no relanza la petición y la cabecera del panel indica con qué formato se generó el resultado visible.
- **A13** «Copiar» copia exactamente el texto mostrado; si `navigator.clipboard` falta o rechaza, se avisa sin lanzar; «Copiado» se anuncia por la región viva.
- **A14** Accesibilidad: `label` en textarea y selectores; JSON/FHIR en `fieldset/legend` con radios; resultado en región con nombre y `tabindex="0"`; objetivos ≥ 44 px; contraste AA con tokens; foco visible; `prefers-reduced-motion`; todo usable con teclado.
- **A15** A 360 px no hay scroll horizontal de la página: una columna con ≤ 760 px, paneles con `min-width:0`, y el `pre` hace scroll dentro de su caja con `max-height` acotado.
- **A16** Los textos visibles están en los diccionarios ES/EN con las mismas claves y sin cadenas vacías; el idioma de la página va en `?lang=`.
- **A17** Solo `lib/api` y `lib/hl7` contienen `fetch(`; `process.env` solo en `lib/api`; ni componentes ni `app/` tocan lo uno ni lo otro. No hay `console.*` ni persistencia (`localStorage`, `sessionStorage`, cookies, IndexedDB) en `lib/hl7` ni en el componente.
- **A18** Los ejemplos son sintéticos (sin datos reales; «Ada Ejemplo»), llevan `MSH-12 = 2.5.1`, y el aviso «solo mensajes sintéticos» es visible junto a la demo.
- **A19** La nota de privacidad no promete más de lo verificable: la web no guarda ni registra nada; la API lo procesa en memoria y no lo guarda (lo que declara su OpenAPI).
- **A20** `docs/web-standards.md`, `AGENTS.md` y `CHECKPOINTS.md` documentan la excepción acotada.

## 4. Plan de tests
Vitest. Para `lib/hl7` y el componente se simula `fetch` con `vi.stubGlobal('fetch', …)`: nunca se llama a la API real. Fixtures ficticios.

**Cliente** (`lib/hl7/client.test.ts`, unit)
- **T1** — **Dado** un `fetch` simulado que devuelve 200 JSON **cuando** se llama `translateHl7` con `format:'json'` **entonces** la URL es `${apiUrl}/api/v1/hl7/translate?format=json&lang=es`, el método es `POST` y el resultado es `ok` con el cuerpo reformateado. *(A4, A5)*
- **T2** — **Dado** `format:'fhir'` y `lang:'en'` **cuando** se llama **entonces** la query lleva `format=fhir&lang=en` y el resultado conserva `format:'fhir'`. *(A4, A16)*
- **T3** — **Dado** cualquier llamada **cuando** se inspeccionan los argumentos de `fetch` **entonces** las únicas cabeceras son `Content-Type: text/plain` (sin `Authorization`, `X-*` ni `application/json`), `credentials` es `omit` y el cuerpo es el mensaje tal cual. *(A4: garantiza que no hay preflight)*
- **T4** — **Dado** un `apiUrl` con barra final **cuando** se llama **entonces** la URL no contiene `//api`. *(A4)*
- **T5** — **Dado** un 422 `problem+json` con `HL7_UNSUPPORTED_MESSAGE` **cuando** se llama **entonces** devuelve `problem` con `title`, `detail`, `code` y `status` de la API. *(A6)*
- **T6** — **Dado** respuestas 400 (`HL7_EMPTY_BODY`), 400 (`HL7_UNSUPPORTED_FORMAT`), 413 (`HL7_PAYLOAD_TOO_LARGE`) y 500 (`UNEXPECTED`) **cuando** se llama **entonces** cada una devuelve `problem` con su `code` (parametrizado). *(A6)*
- **T7** — **Dado** un 413 sin cuerpo ni `content-type` **cuando** se llama **entonces** devuelve `http-error` con estado 413. *(A7)*
- **T8** — **Dado** un 429 o un 502 con cuerpo HTML **cuando** se llama **entonces** devuelve `http-error` con ese estado y no lanza. *(A7)*
- **T9** — **Dado** un 422 cuyo cuerpo es JSON sin `code` **cuando** se llama **entonces** devuelve `http-error`, no `problem`. *(A7)*
- **T10** — **Dado** un 200 con cuerpo que no es JSON **cuando** se llama **entonces** devuelve `invalid-response`. *(A7)*
- **T11** — **Dado** un `fetch` que rechaza con `TypeError('Failed to fetch')` **cuando** se llama **entonces** devuelve `network` y no lanza. *(A8)*
- **T12** — **Dado** un `fetch` que no responde y un `timeoutMs` pequeño (reloj falso) **cuando** pasa el plazo **entonces** devuelve `timeout` y la señal se abortó. *(A8)*
- **T13** — **Dado** un `AbortSignal` externo que se aborta con una petición en curso **cuando** ocurre **entonces** devuelve `aborted` (ni `network` ni `timeout`). *(A11)*
- **T14** — **Dado** una respuesta con reloj simulado de 38 ms **cuando** se llama **entonces** `elapsedMs` es 38. *(A5)*
- **T15** — **Dado** un 200 con JSON compacto con tildes **cuando** se llama **entonces** el cuerpo sale indentado a 2 espacios y conserva los acentos. *(A5)*

**Tamaño y ejemplos** (`lib/hl7/size.test.ts`, `lib/hl7/samples.test.ts`, unit)
- **T16** — **Dado** `'abc'`, `'é'`, `'€'` y `'😀'` **cuando** se calcula `utf8Size` **entonces** da 3, 2, 3 y 4 bytes. *(A10)*
- **T17** — **Dado** `MAX_MESSAGE_BYTES` **cuando** se lee **entonces** vale 65536. *(A10)*
- **T18** — **Dado** los ejemplos exportados **cuando** se recorren **entonces** hay `adt-a01` y `oru-r01`; cada uno empieza por `MSH|^~\&|`, tiene `2.5.1` en MSH-12, su MSH-9 coincide con el id, separa segmentos con `\n` y pesa mucho menos de 64 KB. *(A18)*
- **T19** — **Dado** los ejemplos **cuando** se buscan datos reales (teléfono, documento, email, nombres del CV) **entonces** no hay ninguno y el paciente es «Ejemplo^Ada». *(A18)*

**Componente** (`components/hl7-demo.test.tsx`, componente con Testing Library)
- **T20** — **Dado** el componente en ES **cuando** se renderiza **entonces** hay un `h2`, un textarea con etiqueta y el ejemplo ADT, el grupo JSON/FHIR, el selector de ejemplos, el botón «Traducir», la nota de privacidad, y **ninguna** llamada a `fetch`. *(A2, A3, A18)*
- **T21** — **Dado** el componente en EN **cuando** se renderiza **entonces** todos los textos están en inglés y la petición posterior lleva `lang=en`. *(A16)*
- **T22** — **Dado** una respuesta 200 simulada **cuando** el usuario pulsa «Traducir» **entonces** se ve el JSON en el panel de salida, el estado «200 · N ms» y «Copiar» habilitado. *(A5)*
- **T23** — **Dado** que se elige FHIR **cuando** se pulsa «Traducir» **entonces** la petición lleva `format=fhir` y la cabecera del panel indica FHIR. *(A4, A12)*
- **T24** — **Dado** una petición pendiente **cuando** se observa la interfaz **entonces** el botón está deshabilitado con `aria-busy="true"` y dice «Traduciendo…». *(A11)*
- **T25** — **Dado** una respuesta 422 `problem+json` **cuando** se pulsa «Traducir» **entonces** aparece un `role="alert"` con `title`, `detail` y `code`, y no hay resultado. *(A6)*
- **T26** — **Dado** un éxito previo y luego un error **cuando** ocurre el segundo envío **entonces** el resultado anterior desaparece. *(A6)*
- **T27** — **Dado** un 429 con HTML **cuando** se pulsa «Traducir» **entonces** aparece el mensaje genérico con «429». *(A7)*
- **T28** — **Dado** que `fetch` rechaza con `TypeError` y `navigator.onLine` es `true` **cuando** se pulsa **entonces** el mensaje habla de red o de bloqueo CORS y el botón vuelve a estar habilitado. *(A8)*
- **T29** — **Dado** que `fetch` rechaza y `navigator.onLine` es `false` **cuando** se pulsa **entonces** el mensaje habla de falta de conexión. *(A8)*
- **T30** — **Dado** un timeout simulado **cuando** se pulsa **entonces** aparece el mensaje de tiempo agotado. *(A8)*
- **T31** — **Dado** un textarea vacío o con solo espacios **cuando** se pulsa «Traducir» **entonces** no se llama a `fetch`, hay un mensaje asociado por `aria-describedby`, `aria-invalid="true"` y el foco está en el textarea. *(A9)*
- **T32** — **Dado** un texto de 65 537 bytes (p. ej. 32 768 `é` más un carácter ASCII) **cuando** se pulsa **entonces** no se llama a `fetch` y el mensaje indica tamaño y máximo. *(A10)*
- **T33** — **Dado** un texto de exactamente 65 536 bytes **cuando** se pulsa **entonces** sí se llama a `fetch`. *(A10)*
- **T34** — **Dado** que el usuario escribe texto multibyte **cuando** cambia el texto **entonces** el contador muestra bytes, no caracteres, y se actualiza. *(A10)*
- **T35** — **Dado** que se elige el ejemplo ORU **cuando** se selecciona **entonces** el textarea contiene el ORU, el resultado y los errores previos se limpian y no se llama a `fetch`. *(A12)*
- **T36** — **Dado** un resultado visible **cuando** se cambia JSON/FHIR **entonces** no se llama a `fetch` y la cabecera sigue mostrando el formato con el que se generó. *(A12)*
- **T37** — **Dado** dos envíos seguidos en que el primero responde tarde **cuando** llega primero la respuesta del segundo y después la del primero **entonces** el panel muestra la del segundo y la señal del primero se abortó. *(A11)*
- **T38** — **Dado** una petición en curso **cuando** el componente se desmonta **entonces** la señal se aborta y no hay avisos de React por actualizar estado. *(A11)*
- **T39** — **Dado** un resultado y `navigator.clipboard.writeText` simulado **cuando** se pulsa «Copiar» **entonces** se llama con exactamente el texto mostrado y la región viva anuncia «Copiado». *(A13)*
- **T40** — **Dado** que `navigator.clipboard` no existe o rechaza **cuando** se pulsa «Copiar» **entonces** no lanza y se muestra el aviso de que no se pudo copiar. *(A13)*
- **T41** — **Dado** un éxito **cuando** se inspecciona la región `aria-live` **entonces** contiene el resumen («200 · N ms · FHIR») y no el JSON completo; el panel de resultado es una región con nombre y `tabindex="0"`. *(A5, A14)*
- **T42** — **Dado** el componente **cuando** se recorren los controles con teclado (Tab, Espacio/Enter, flechas en los radios) **entonces** todos son alcanzables y operables, y Enter/Espacio sobre el botón dispara la traducción. *(A14)*
- **T43** — **Dado** una respuesta con una línea de 2 000 caracteres sin saltos **cuando** se renderiza **entonces** el `pre` es el elemento con scroll y conserva la sangría (sin `pre-wrap`), y el contenedor no impone ancho. *(A15; estructural, la medida real queda en R9)*
- **T44** — **Dado** un `title` de la API con `<script>` **cuando** se muestra el error **entonces** se escapa como texto y no hay elemento `script` en el DOM. *(A6, seguridad)*

**Diccionarios y CSS** (`lib/i18n/i18n.test.ts`, `app/globals.test.ts`, unit)
- **T45** — **Dado** los diccionarios ES y EN **cuando** se comparan (test de claves existente) **entonces** `demo`, `nav.demo` y `sections.demo` tienen las mismas claves y ninguna cadena vacía. *(A16)*
- **T46** — **Dado** `components/hl7-demo.module.css` **cuando** se buscan hex y colores literales **entonces** no hay ninguno fuera de los tokens (el T53 de web-home debe cubrir también este archivo). *(A14)*
- **T47** — **Dado** `hl7-demo.module.css` **cuando** se inspeccionan sus reglas **entonces** hay un breakpoint ≤ 760 px con una columna, `min-width:0` en los paneles, `overflow:auto` y `max-height` en el `pre`, `min-height:44px` en botones y radios, y un bloque `prefers-reduced-motion`. *(A14, A15)*

**Página completa** (`components/home-view.test.tsx`, componente)
- **T48** (sustituye al T51 actual) — **Dado** `HomeView` en EN **cuando** se renderiza **entonces** los `h2` son Impact, Experience, Stack, HL7 demo y Contact, existe `#demo`, y sigue sin haber arquitectura ni PDF. *(A2)*
- **T49** — **Dado** `HomeView` en ES y en EN **cuando** se inspecciona la nav **entonces** `#demo` está entre Stack y Contacto y su destino existe. *(A2)*
- **T50** (actualiza el `extra`) — **Dado** un CV con listas vacías **cuando** se renderiza **entonces** los `h2` son Demo y Contacto, la nav es `['#demo','#contact']` y ambos destinos existen. *(A2)*
- **T51** — **Dado** `HomeView` **cuando** se cuentan `h1` y landmarks **entonces** hay un `h1` y banner/navigation/main/contentinfo. *(A2)*
- **T52** — **Dado** `HomeView` renderizado **cuando** termina el render **entonces** no se ha llamado a `fetch`. *(A1, A3)*

**Reglas de código** (`tests/source.test.ts`, unit sobre el fuente)
- **T53** (reformula T68) — **Dado** el código de producción **cuando** se busca `fetch(` **entonces** solo aparece en `lib/api` y `lib/hl7`, y `process.env` solo en `lib/api`. *(A17)*
- **T54** — **Dado** `components/` y `app/` **cuando** se buscan `fetch(` y `process.env` **entonces** no hay coincidencias, aunque `hl7-demo.tsx` sea de cliente. *(A17)*
- **T55** — **Dado** `lib/hl7/` y `components/hl7-demo.tsx` **cuando** se buscan `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie` y `console.` **entonces** no hay ninguno. *(A17, A19)*
- **T56** — **Dado** `components/hl7-demo.tsx` **cuando** se lee su primera línea de código **entonces** es `'use client'`. *(A2)*

**Build** (`tests/build/build.test.ts`, build real contra el API falso, que registra las peticiones)
- **T57** — **Dado** un build correcto **cuando** se parsean `out/index.html` y `out/en/index.html` **entonces** cada uno contiene `section#demo` con su `h2`, un `textarea` con el ejemplo ADT y el aviso de privacidad en su idioma. *(A2, A3, A16)*
- **T58** — **Dado** el mismo build **cuando** se revisan las peticiones recibidas por el API falso **entonces** no hay ninguna a `/api/v1/hl7/`. *(A1, A3)*
- **T59** — **Dado** el build **cuando** se busca la URL del API de prueba en el payload de la página **entonces** aparece como `apiUrl` de la demo. *(A4)*
- **T60** — **Dado** el build **cuando** se revisa el HTML de ambos idiomas **entonces** el enlace `#demo` existe en la nav y no aparecen los centinelas de datos privados (T62 de web-home sigue vigente). *(A2)*

**Trazabilidad criterio → tests**
A1: T52, T58 + scripts · A2: T20, T48–T51, T56, T57, T60 · A3: T20, T52, T57, T58 · A4: T1–T4, T23, T59 · A5: T1, T14, T15, T22, T41 · A6: T5, T6, T25, T26, T44 · A7: T7–T10, T27 · A8: T11, T12, T28–T30 · A9: T31 · A10: T16, T17, T32–T34 · A11: T13, T24, T37, T38 · A12: T23, T35, T36 · A13: T39, T40 · A14: T41, T42, T46, T47 · A15: T43, T47 + R9 · A16: T2, T21, T45, T57 · A17: T53–T55 · A18: T18, T19, T20 · A19: T55 + revisión de texto (duda R10) · A20: sin test de código (duda R10).

## 5. Cómo no romper T68 ni la regla «datos solo por `lib/api`»
- El `fetch` vive en `lib/hl7/client.ts`, no en el componente. T68 se **reformula** (T53) en lugar de ignorarse: `fetch(` permitido solo en `lib/api` y `lib/hl7`; `process.env` solo en `lib/api`; T54 garantiza que `components/` y `app/` siguen limpios. La excepción queda acotada a un módulo y verificada.
- `apiUrl` llega a la demo como prop desde `getConfig().apiUrl` en `page.tsx` (en el build). El componente de cliente no lee entorno.
- «Solo en el build» pasa a aplicarse al **CV**; la demo es la única lectura en runtime y solo tras una acción del visitante.

## 6. Consideraciones de privacidad / SEO / accesibilidad
- **Privacidad:** aviso «solo mensajes sintéticos» visible; sin persistencia en el navegador ni logs; ejemplos con nombre ficticio. La web no puede garantizar más que lo que declara el OpenAPI de la API (en memoria, sin log), y el texto lo dice así (A19). `credentials:'omit'` evita enviar cookies a otro origen. Sin analítica.
- **SEO:** el `h2` y el texto introductorio son contenido estático indexable (el ejemplo HL7 por defecto también va en el HTML; es sintético). `#demo` no cambia canonical ni sitemap. La nav suma una entrada.
- **Accesibilidad:** etiquetas explícitas; `fieldset/legend` con radios nativos para el formato; `aria-live="polite"` para el resumen y `role="alert"` solo para errores; `aria-busy` en carga; la validación usa `aria-describedby`/`aria-invalid` y mueve el foco al textarea; al terminar una petición el foco **no se mueve** (se queda en el botón); el `pre` de salida lleva `tabindex="0"` y nombre para desplazarlo con teclado; objetivos ≥ 44 px; foco visible con el token existente.
- **Móvil (360 px):** dos columnas desde 761 px; una columna por debajo; paneles con `min-width:0`; `pre` con `overflow:auto`, `max-height` (~420 px) y fuente de 12.5 px como el diseño; controles con `flex-wrap`. Sin `pre-wrap`, para no romper la sangría del JSON. Un JSON largo no ensancha la página.

## 7. Consideraciones de datos y resiliencia
- La API caída, lenta, bloqueada por CORS o limitada **no afecta al build ni al resto de la web**: la demo falla de forma local y con mensaje. Sin respaldo ni reintentos automáticos (repetir es acción del usuario).
- `fetch` lanza `TypeError` igual para red caída y CORS: el navegador no deja distinguirlos. El mensaje combinado lo reconoce y, con `navigator.onLine === false`, afina a «sin conexión». Una respuesta `429` de Cloudflare no lleva cabeceras CORS salvo que la regla las añada, así que el navegador la verá también como `TypeError` (ver R2).
- Respuestas fuera de contrato (200 no JSON, problema sin `code`, 413 sin cuerpo) dan mensajes genéricos, nunca excepciones sin controlar.
- Una sola petición activa; las respuestas tardías se descartan. Timeout de 15 s (R7).

## 8. Alternativas descartadas
1. **Proxy o Pages Function para evitar CORS:** rompe el sitio 100 % estático (`output:'export'`), añade código y superficie de ataque, y no hace falta porque la API ya acepta el origen (verificado).
2. **Llamar a la API desde el componente sin `lib/hl7`:** incumple «los componentes no hacen `fetch`» y T68. Se prefiere un módulo único, acotado y verificable.
3. **Pestañas ARIA (`role=tablist`) para JSON/FHIR:** el diseño las dibuja como pestañas, pero no cambian de panel (solo el formato de la próxima petición). Radios nativos con aspecto de pestaña son más simples y accesibles.
4. **Relanzar la traducción al cambiar JSON/FHIR:** gasta peticiones (y rate limit) y sorprende a quien edita; se prefiere acción explícita.
5. **Contar caracteres en vez de bytes UTF-8:** incorrecto con tildes y símbolos; 40 000 `é` pesan 80 000 bytes y la API los rechaza.
6. **Enviar `application/json` o cabeceras propias:** dispararía preflight; se usa `text/plain` y `?lang=`.
7. **Página aparte `/demo/`:** descartada por el brief.

## 9. Riesgos / dudas

**Acciones externas del humano (no son código de este repo)**
- **R1 CORS en el NAS (`QUARKUS_HTTP_CORS_ORIGINS`).** Verificado: hoy `https://cv.floreslab.dev` ya recibe `access-control-allow-origin` y el preflight responde bien, así que para producción la acción **ya está hecha**. Falta decidir si añadir (la variable admite lista separada por comas): (a) los previews de Cloudflare Pages (`https://<hash>.<proyecto>.pages.dev`, que hoy reciben `403` y mostrarían el mensaje de red/CORS; los comodines dependen de lo que admita Quarkus, sin verificar); (b) `http://localhost:3000` para `npm run dev` (hoy `403`). Si no, la demo solo funcionará en producción; en desarrollo se puede apuntar `CV_API_URL` a una API local. El servidor devuelve `allow-credentials: true`, que la web no usa.
- **R2 Rate limit de Cloudflare sobre `/api/v1/hl7/*`.** Aún no existe. Una respuesta `429` generada por Cloudflare no lleva cabeceras CORS por defecto, así que el visitante limitado vería el mensaje de «red/CORS» y no uno de «demasiadas peticiones». Recomendación al humano: configurar en la regla una respuesta personalizada con `Access-Control-Allow-Origin: https://cv.floreslab.dev` y `Content-Type: application/problem+json` con un `code` estable (p. ej. `RATE_LIMITED`; no existe en el OpenAPI hoy), y validarla con curl repetido. El cliente ya trataría ese caso como `problem` o `http-error` con mensaje claro. No lo he podido comprobar: no hay regla todavía.
- **R3 CORS solo para el origen exacto.** Un acceso desde `www.`, el sitio hermano `floreslab.dev` o un dominio futuro no funcionaría. Confirmar si se prevé.

**Dudas de diseño y alcance (el brief no las cierra; el analyst se detiene aquí)**
- **R4 Botón «Probar la demo HL7» en el hero.** `design/preview.html` lo tiene (`<a class="btn" href="#demo">`); el brief solo pide ancla en la nav. No se incluye salvo confirmación (tocaría `hero.tsx`, sus tests y el diccionario).
- **R5 Enlace «El código está en GitHub» de la nota.** El repo de la API es público (`github.com/julioflores781/cv-as-a-service`, según el brief de `web-architecture`); `cv-web` no tiene remoto. Propuesta: enlazar solo el de la API con `rel="noopener noreferrer"`, o quitar esa frase.
- **R6 Formato por defecto y cambio de formato.** Recomiendo FHIR por defecto (el diseño lo marca activo y es lo que vende el nicho) y que cambiar el formato no relance la petición (A12). A confirmar; si se prefiere lo contrario, cambian A12 y T36.
- **R7 Timeout de 15 s** (elegido por el analyst, no por el brief). La API responde en milisegundos.
- **R8 Ejemplos.** Se usan «Ada Ejemplo» y valores ficticios; el OpenAPI usa «Pérez^Juan». Confirmar que el tono es válido.
- **R9 Verificación visual a 360 px.** No hay test visual en el brief. T43 y T47 cubren estructura y CSS; la medida real (sin scroll horizontal, altura del `pre`) queda para revisión manual (Chrome DevTools) o un Playwright en otra tarea.
- **R10 A19 y A20 no tienen test de código razonable.** El reviewer los comprobará leyendo los textos y los tres documentos del arnés. Si el humano prefiere un test, se añade una aserción de texto sobre esos archivos.
- **R11 Red y CORS indistinguibles.** Limitación del navegador. Un sondeo `no-cors` los diferenciaría pero añade una segunda petición; se descarta.
- **R12 `MSH-12` distinto de `2.5.1`.** La API responde `422 HL7_UNSUPPORTED_MESSAGE` (verificado con `2.5`); la demo lo muestra tal cual y la nota dice «HL7 v2.5.1».
- **R13 JS de cliente.** Hasta ahora la web no enviaba JS propio; `hl7-demo.tsx` requiere hidratación. El reviewer puede revisar el peso de `out/_next/static` con Lighthouse.
- **R14 Tests de build lentos.** T57–T60 deben extender los builds existentes en vez de lanzar otro `next build`.
- **R15 Numeración.** Los `Tn` de este plan son de `web-hl7-demo`; los `it()` deben llevar un nombre claro para no colisionar con los de `web-home` (aquí se modifican explícitamente T51 y T68).
