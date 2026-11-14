# Review — web-admin-images (slug 6/10 de web-admin)

**Veredicto final (ronda 2): APPROVED** — ver «Ronda 2» al final. Ronda 1: CHANGES_REQUESTED.

---

## Ronda 1

**Veredicto ronda 1: CHANGES_REQUESTED**

Auditoría independiente sobre el árbol sin commitear de `feature/web-admin-api-client` (solo lo nuevo de este slug y sus cambios a piezas de los
slugs 1–5). Node 22.23.1.

## Ejecución
| Comando | Resultado |
|---|---|
| `npm run lint` | verde |
| `npm run typecheck` | verde |
| `npm run build` | verde; `/admin/images`, `/admin/api/images`, `/admin/api/images/[id]`, `/admin/api/images/cleanup` salen `ƒ`; `ƒ Proxy (Middleware)` |
| `npm test` | 141 archivos / 635 tests verdes (42,8 s) |

Pruebas manuales contra el standalone construido (`.next/standalone/server.js`, proxy activo) + `scripts/parity/design-api.mjs` con
`DESIGN_ADMIN_PASSWORD` (API falsa admin), con `curl` y un cliente `node:http` lento (scripts en el scratchpad, fuera del repo):

| Caso | Resultado |
|---|---|
| PNG 50 KB con `filename="../../../etc/SECRETOTRAV.png"` | 201; la fake recibió `filename="upload"`; el nombre no aparece en ningún log |
| exactamente 5 MiB con `Content-Length` / chunked | 201 / 201 |
| 5 MiB + 1 | 413 `IMAGE_TOO_LARGE` (del handler, `bytes` en el log) |
| 6 MiB, 12 MiB, 30 MiB, con y sin `Content-Length` | 413 `IMAGE_TOO_LARGE` |
| dos partes `file`; `file` + otro campo; parte `file` sin nombre de archivo; multipart truncado; boundary distinto/vacío/con comillas; nombre con CRLF | 400 `IMAGE_INVALID`, sin llamada |
| SVG con prólogo XML / HTML renombrado `.jpg` | 415 `IMAGE_UNSUPPORTED_TYPE` / 400 `IMAGE_INVALID` |
| `Content-Length: abc` | 400 |
| `Origin` ajeno, `Sec-Fetch-Site: cross-site`, sin `Origin` (POST, DELETE, limpieza) | 403 `ADMIN_CSRF` |
| DELETE `..%2f..%2fcontent%2fprojects`, UUID en mayúsculas, `<uuid>%3Fx`, `abc` | 400 sin llamada |
| DELETE UUID válido → de nuevo | 200 `{ok:true}` → 404 `IMAGE_NOT_FOUND` |
| limpieza `{}` | 200 `dryRun:true` (simulación por defecto) |
| limpieza `{"dryRun":"false"}`, `olderThanHours:0`, `1.5`, `[]` / cuerpo de 5 KB / `text/plain` | 400 / 413 / 415 |
| **Cliente lento (≈5 MiB/s), 12 MiB y 30 MiB, con `Content-Length` y chunked, con sesión y sin cookie** | **el 413 (o el 401 del proxy) llega solo cuando se terminó de enviar todo el cuerpo (12,25 MiB a 2,5 s; 30,25 MiB a 6,3 s)** |
| Log del servidor tras los cuerpos > 10 MB | **5 líneas no JSON:** `Request body exceeded 10MB for /admin/api/images/. Only the first 10MB will be available unless configured…` |

## Trazabilidad Tn ↔ it()
Todas las `Tn` del §13.7 tienen su `it()` con el prefijo `Tn:` y lo que afirman coincide con la descripción del plan (leídos los críticos:
T368–T372, T374, T375, T378, T385, T388–T391).

| Tn | it() | Comprueba lo que dice |
|---|---|---|
| T366 (×2) | `lib/admin/images.test.ts:26, :54` | sí (bytes mágicos sin nombre/MIME, vacío, 5 MiB / +1, solo 12 bytes) |
| T367 | `lib/admin/browser-client.test.ts:58` | sí |
| T368 | `app/admin/api/images/route.test.ts:87` | sí (sha256 en la fake, `fileName: 'upload'`, sin `cf-*`/cookie/origin, log sin nombre) |
| T369 | `route.test.ts:115` | sí **a nivel de handler** (0 `pull` con `Content-Length` grande; corte en el tope chunked). No cubre el proxy: ver C-1 |
| T370 | `route.test.ts:140` | sí (8 casos de 400 + 413 propio + 415/400) |
| T371 (×2) | `route.test.ts:170, :207` | sí; el silencio espera 30 s reales (ver C-3) |
| T372 | `route.test.ts:219` | sí |
| T373 | `route.test.ts:235` | sí |
| T374 | `app/admin/api/images/[id]/route.test.ts:21` | sí |
| T375 | `app/admin/api/images/cleanup/route.test.ts:16` | sí |
| T376 (×2), T377 | `components/admin/image-uploader.test.tsx:35, :80, :93` | sí |
| T378–T382 | `components/admin/project-images-block.test.tsx:54, :81, :133, :154, :172` | sí |
| T383, T384, T387 | `components/admin/image-gallery.test.tsx:32, :59, :108` | sí |
| T385 (×2) | `components/admin/cleanup-panel.test.tsx:21, :69` | sí |
| T386 | `app/admin/(panel)/images/page.test.tsx:40` | sí |
| T388–T391 | `tests/runtime/admin-images.test.ts:78, :98, :111, :126` | T388/T389 solo miden el código final (con cliente rápido); no detectan el drenado completo ni la línea no JSON (ver C-1, C-2) |

## Trazabilidad criterios ↔ tests
AC7 → T372 (+ extras de `[id]`); AC18 → T366–T372, T376–T378, T388–T390; AC19 → T373–T375, T380, T383–T385; AC20 → T378, T379, T381, T382;
AC23 → T386; AC25 → T368, T374, T375, T391; AC26 → T376, T377, T387 (+ foco/anuncios en T378, T379, T384); AC28 → T388. Todos cubiertos.
**AC18** («el handler comprueba `Content-Length`, el tope en streaming…; funciona en el standalone con proxy») se cumple en el código del handler
pero **no extremo a extremo**: con `proxy.ts` delante, Next lee el cuerpo entero antes de entregar la petición al handler (C-1).

## Seguridad de subida (detalle)
- **Tope de cuerpo:** el handler hace lo correcto (`Content-Length` > 5 MiB + 64 KiB → 413 sin `pull`; `readBody` cuenta y cancela; luego
  `formData()` sobre bytes ya acotados; nunca `request.formData()` sobre el cuerpo crudo). Pero en el standalone `proxy.ts` (matcher
  `/admin/:path*`) hace que Next clone el cuerpo para el middleware (`next/dist/server/body-streams.js`, `DEFAULT_BODY_CLONE_SIZE_LIMIT` 10 MB) y
  `next-server.js:1233` espera a `finalize()`, que **aguarda el fin del stream original**: el cuerpo se lee completo (lo que pasa de 10 MB se lee y
  se descarta) antes de que corra el handler. Memoria acotada (~10 MB del clon + ≤ 5 MiB + 64 KiB del handler por petición), pero ni el ancho de
  banda ni el tiempo: un cuerpo de cualquier tamaño (hasta el límite de Cloudflare) se drena entero, también **sin cookie** (el 401 del proxy
  llega igualmente al final). Además Next escribe por `console.warn` una línea **no JSON** con la ruta (incluye la query si la hay).
- **Multipart:** se parsea con `Response.formData()` (undici) sobre bytes acotados; exactamente una entrada y que sea `file` + `File`; boundary
  malicioso/ausente → 400; nombres con `..` o CRLF no llegan a la API (parte nueva con `filename="upload"`, boundary propio) ni a los logs.
- **Bytes mágicos:** `sniffImage`/`isKnownUnsupported` son un port fiel de `ImageFormat.detect`/`isKnownUnsupported` del repo `cv`
  (≥12 bytes, GIF87a/89a, `RIFF….WEBP`, BMP/TIFF/ICO, marcas HEIC/AVIF, `<svg` en los primeros 1024 bytes decodificados UTF-8).
  415 vs 400 igual que `UploadProjectImageService`. Cabeceras truncadas que la API rechaza al leer dimensiones vuelven como 400 de la API.
- **CSRF:** POST, DELETE (`media: 'none'`, sigue exigiendo Origin) y limpieza → 403 con 0 llamadas. **Sin reintentos** (T371 cuenta 1 petición).
- **DELETE:** UUID en minúsculas validado dos veces (handler y `lib/api/admin/images.ts`); `..%2f` decodificado no pasa; sin inyección de ruta.
- **Limpieza:** `dryRun` por defecto `true`; solo booleanos; horas enteras 1–8760; campos desconocidos descartados; el cliente API vuelve a validar.
- **Reglas:** el uploader solo se monta con `canHaveImages` (propio + público); quitar del proyecto no borra del almacenamiento; borrar una imagen
  usada → 409 explicado (historial); nada se borra solo (la limpieza exige simulación vigente + confirmación).

## API falsa y T233
- `DELETE` con id no UUID → 404 `IMAGE_NOT_FOUND` antes de tocar el almacenamiento: coincide con `DeleteImageService` (`ImageKey.isUuid`).
- `olderThanHours` < 1 se sube a 1: coincide con `CleanupOrphanImagesService` (`Math.max(MIN_GRACE_HOURS, …)`); el criterio de huérfana
  (`lastModified` no posterior al límite) coincide con `>=` de la fake.
- `sniff` = `detect` + `isKnownUnsupported`: coincide.
- El cambio de las dos aserciones de T233 es **legítimo** (alinea la fake con Java). Ver observación O-2 sobre `olderThanHours=abc` y `dryRun`.

## Privacidad
Sin teléfono, documento ni fecha de nacimiento. Fixtures ficticios. Logs `admin_image_upload/delete/cleanup` solo con `request_id`, `outcome`,
`status`, `bytes`, `content_type`, `dry_run`, `count` (comprobado en vivo: ni nombre de archivo, ni contenido, ni IP, ni token).
Única fuga de formato: la línea no JSON de Next (C-1).

## Skills consultadas
- **simplify** — sin hallazgos bloqueantes en el diff: `readBody` reutilizado por `readJson`, `shortKey` movido a `lib/admin/images.ts`,
  `imageFailure`/`imageOutcome` compartidos por los tres handlers.
- **next-best-practices** — `proxy.ts:44` (matcher `/admin/:path*`): al cubrir `POST /admin/api/images/` obliga a Next a clonar/drenar el
  cuerpo antes del route handler; anula el corte temprano del handler (C-1). Route handlers `force-dynamic`, `no-store`: correctos.
- **strict-typing** — `app/admin/(panel)/images/page.tsx:27` `let body;` sin anotar (tipo implícito evolutivo; C-5).
  `image-uploader.tsx:85` `shift() as {…}` aceptable dentro del `while (length > 0)`.
- **ui-ux-pro-max** — teclado (botón «Elegir imágenes», input fuera del orden de tabulación), estado de arrastre en texto + borde, `role=status`
  en uploader/bloque/galería/limpieza, foco al `alt` ES / fila movida / siguiente botón de borrar, `alt` ES/EN obligatorios ≤200, textos en
  español: sin hallazgos. Verificación visual en Chrome (§16 V8/V9) sigue pendiente.
- **testing-strategy** — `app/admin/api/images/route.test.ts:207` espera 30 s reales (C-3); `tests/runtime/admin-images.test.ts:78/:98`
  no miden cuándo llega el 413 respecto del envío ni el log no JSON (C-2).
- **security-best-practices** (aplicada a mano) — parseo multipart acotado, sin path traversal, CSRF y UUID correctos; hallazgo C-1.

## Checkpoints
- **C1** lint/typecheck/test verdes ✅; build verde y rutas `ƒ` ✅; sin `console.*` ni TODOs en el diff ✅.
- **C2** cada criterio con `Tn` ✅; tests de comportamiento real ✅ (salvo el hueco de C-2); fixtures ficticios ✅.
- **C3** privacidad ✅.
- **C4** datos solo por `lib/api` (`fetch` solo en `lib/admin/browser-client.ts`) ✅; 503 de almacenamiento con estado propio, el resto del
  editor sigue ✅.
- **C5** tokens (`images.module.css`) ✅; a11y por código ✅; verificación visual pendiente (V8/V9).
- **C6** informes en `progress/web-admin/web-admin-images/` ✅ — pero `impl.md` contiene conclusiones del spike que no se sostienen (C-1).
- **C7** no aplica (cierre por el `closer` tras autorización).

## Cambios requeridos
1. **[Alta] C-1 — El tope de cuerpo no es real extremo a extremo; el spike lo da por bueno con datos incorrectos.**
   Con `proxy.ts` (`proxy.ts:44`, matcher `/admin/:path*`) Next drena el cuerpo completo antes del handler (`body-streams.js` + `finalize()` en
   `next-server.js:1233`): medido con cliente lento, 12 MiB y 30 MiB reciben el 413 (o el 401 sin cookie) **después** de enviarse entero, y por
   encima de 10 MB Next emite una línea **no JSON** `Request body exceeded 10MB for /admin/api/images/…` (incumple «una línea JSON por evento»
   y «nunca query»). `impl.md` afirma lo contrario («413 at once», «Next printed no warning»): lo midió en loopback sin limitar el ritmo.
   Acción (elige con el humano, es la duda abierta del riesgo 2 del plan):
   (a) **recomendado:** excluir exactamente `/admin/api/images/` del matcher del proxy (el handler ya exige cookie, CSRF, `no-store`, y
   `X-Robots-Tag`/iframe vienen de `next.config.ts` `headers()`), comprobar que entonces el 413 llega antes de terminar de enviar y que no aparece
   la línea de Next, y ajustar los tests del proxy afectados; o
   (b) si se acepta el comportamiento de Next, documentarlo con lo medido (memoria acotada a ~10 MB + 5 MiB por petición, drenado completo,
   línea no JSON) en `impl.md`, en el cierre del riesgo 2 y en `docs/web-standards.md` («Logs»), y que los tests reflejen esa realidad.
   En ambos casos corregir el apartado «Spike» de `impl.md`.
2. **[Media] C-2 — Los tests de runtime no detectan C-1.** `tests/runtime/admin-images.test.ts:78` (T388) y `:98` (T389) usan un cliente que
   escribe todo de golpe en loopback. Añadir: con `Content-Length` > tope y envío pausado, la respuesta llega antes de terminar el envío (si se
   adopta 1a) y el log del servidor no tiene líneas no JSON tras los cuerpos de 12 MiB (o, con 1b, que la línea es la documentada).
3. **[Baja] C-3 — T371 espera 30 s reales.** `app/admin/api/images/route.test.ts:207`: usar `vi.useFakeTimers({ toFake: ['setTimeout'] })` +
   `advanceTimersByTimeAsync(30_000)` como el precedente `app/api/contact/route.test.ts:176` (mismo patrón con sockets reales), manteniendo la
   aserción `UPLOAD_TIMEOUT_MS === 30_000`. No es aceptable pagar 30 s de reloj por un test unitario cuando ya hay un patrón en el repo.
4. **[Baja] C-4 — Actualizador de estado impuro.** `components/admin/projects-editor.tsx:355-363`: `onPreviewFailed` llama a
   `URL.revokeObjectURL` y muta `previews.current` dentro del updater de `setUploads` (React puede ejecutarlo dos veces). Sacar la revocación
   fuera del updater (leer la entrada de un ref espejo o del estado actual en el callback y luego `setUploads`).
5. **[Baja] C-5 — Tipo implícito.** `app/admin/(panel)/images/page.tsx:27` `let body;` → `let body: ReactNode;` (o expresión condicional).

## Observaciones fuera de alcance
- **O-1 (desvíos de `impl.md`)** — 1 (415/400 como la API), 2 (fake), 3 (`media: 'none'`, `readBody`), 4 (`expire` por estado por el lint del
  React Compiler), 5 (vista previa fallida → texto), 6 (miniaturas 160×90), 7 (≤ 8760 h), 8 (nav en el test de arquitectura) y 9 (movimientos
  de `shortKey`/bloque): todos razonables y coherentes con el plan; aceptados.
- **O-2 (pendiente `dryRun` no booleano y `olderThanHours=abc`)** — En Java `@QueryParam boolean dryRun` convierte cualquier valor distinto de
  `true` en `false` (**borrado real**). La web no puede provocarlo (handler y `lib/api/admin/images.ts` solo admiten booleanos y envían
  `String(boolean)`), así que mantener la fake más estricta (400) es aceptable para la web; el endurecimiento corresponde al repo `cv`
  (rechazar `dryRun` distinto de `true`/`false`). Del mismo modo, `olderThanHours=abc` en JAX-RS (`@QueryParam int`) probablemente responde
  404 y no 400; la aserción nueva de T233 en `scripts/parity/admin-fake.test.ts:360` no está verificada contra la API real: confirmarlo con el
  runbook antes de cerrar la serie (riesgo 6). Ninguno bloquea este slug.
- **O-3** — Un cookie con forma de token pero inválido hace que el handler lea y parsee hasta 5 MiB + 64 KiB antes de que la API diga 401; acotado
  y propio del diseño «la API es la autoridad».
- **O-4** — La limpieza real puede borrar un N distinto del simulado si cambian las huérfanas entre la simulación y la confirmación; el resultado
  informa el recuento real. Aceptable.
- **O-5** — Verificaciones visuales §16 V8/V9 (selector y arrastre reales, 5 MiB real, 360 px, foco en zona de arrastre y tarjetas) pendientes
  en Chrome.

---

## Ronda 2

**Veredicto: APPROVED.** Julio eligió la opción (a) de C-1. Verificado contra el código, los tests y en vivo (standalone reconstruido +
`design-api.mjs` con admin, cliente `node:http` lento a ~5 MiB/s y `curl`). Procesos detenidos al terminar.

Nota de la ronda 1: el standalone que levanté entonces quedó vivo (el proceso se renombra `next-server` y mi `pkill -f "node server.js"` no lo
encontró); se detectó al empezar esta ronda (EADDRINUSE), se mató y las mediciones de abajo son del build nuevo. Las conclusiones de la ronda 1
no cambian (se midieron sobre el build de entonces).

### Ejecución (Node 22.23.1)
lint ✅ · typecheck ✅ · build ✅ (rutas de imágenes `ƒ`, `ƒ Proxy`; el manifiesto lleva `/admin((?!api/images(?:/|$)).*)`) · test ✅
141 archivos / **636** tests (41,7 s). Sin regresiones.

### Correcciones
1. **C-1 matcher** — `proxy.ts`: `['/admin', '/admin/((?!api/images(?:/|$)).*)']`, con el motivo en un comentario.
   En vivo, sin cookie:
   | Ruta | Responde | ¿Corre el proxy? |
   |---|---|---|
   | `/admin/`, `/admin/images/`, `/admin/projects/`, `/admin/zzz/`, `/admin/API/images/` | 307 → login con `next` | sí |
   | `/admin/api/imagesX/`, `/admin/api/imagesx/`, `/admin/api/content/projects/` | 401 del proxy | sí |
   | `/admin/api/images/../content/projects/`, `/admin/api/images/%2e%2e/content/projects/` | 401 del proxy (ruta normalizada antes del matcher; sin bypass) | sí |
   | `/admin/api/images/` (GET/POST), `/cleanup/`, `/<uuid>/` | 401 `ADMIN_UNAUTHORIZED` **del handler** (con `requestId`) / 405 por método | no |
   | `/admin`, `/admin/api/images`, `/admin//api/images/` | 308 de barra final (igual que antes) | — |
   Todas las respuestas `/admin/**` (incluidas las excluidas) llevan `X-Robots-Tag: noindex, nofollow`, `X-Frame-Options: DENY`,
   `frame-ancestors 'none'` y `no-store`. CSRF en las excluidas: `Origin` ajeno, `Sec-Fetch-Site: cross-site` y sin `Origin` → 403 en subida,
   DELETE y limpieza. Cliente lento:
   | Caso | Ronda 1 (con proxy) | Ronda 2 |
   |---|---|---|
   | 12 MiB / 30 MiB con `Content-Length`, con sesión | 413 tras enviar 12,25 / 30,25 MiB | **413 a ~60 ms, 0,25 MiB enviados** |
   | 12 MiB / 30 MiB chunked, con sesión | 413 tras enviar todo | **413 a ~1,1 s, 5,25 MiB** (tope + lo que había en vuelo) |
   | 30 MiB sin cookie, ambos modos | 401 tras 30,25 MiB | **401 a ~57 ms, 0,25 MiB** |
   | 5 MiB exactos, ambos modos | 201 | 201 |
   Log: **ninguna línea no JSON** salvo el arranque de Next; sin `Request body exceeded`. Decisión registrada en `progress/web-admin/brief.md`
   (línea 18, «Cambio de decisión…») y en `analysis.md` §6 (línea 210) y riesgo 2 (resuelto). `impl.md` corrige el spike.
   `proxy.test.ts` comprueba el `config` y, con `unstable_doesMiddlewareMatch`, rutas cubiertas (`/admin`, login, galería, otros handlers,
   `/admin/api/imagesx/`) y excluidas (lista, limpieza, DELETE).
2. **C-2 tests** — `tests/runtime/admin-images.test.ts`: el cliente de prueba puede ir pausado y registra lo enviado al llegar la respuesta.
   T388: 12 y 24 MiB con `Content-Length` → 413 con < 1 MiB enviado; 12 MiB sin cookie → 401 con < 1 MiB y cabeceras del panel; ninguna línea
   no JSON ni `Request body exceeded`. T389: chunked 8 y 12 MiB → 413 con < 6 MiB y < total. Nuevo «extra (matcher)»: 401 + cabeceras en las
   tres rutas, 403 por Origin, galería sigue con 307, 0 peticiones a la API. **Fallarían con el matcher anterior:** con él medí (ronda 1) que la
   respuesta llega solo tras enviar el cuerpo entero, así que `sent < 1 MiB` / `sent < 6 MiB` no se cumplen (también para 8 MiB, por debajo de
   los 10 MB donde Next avisa), y los cuerpos > 10 MB producen la línea `Request body exceeded`.
3. **C-3 T371** — `route.test.ts:207`: `vi.useFakeTimers({ toFake: ['setTimeout'] })`, espera a que la petición llegue a la fake, avanza
   29 999 ms (sigue pendiente) y 1 ms → 504 `ADMIN_TIMEOUT`; mantiene `UPLOAD_TIMEOUT_MS === 30_000` y restaura relojes en `finally`. ✅
4. **C-4** — `projects-editor.tsx:356-362`: `onPreviewFailed(key, preview)` revoca y olvida la URL **fuera** del updater; el updater solo
   construye el mapa (e ignora una entrada cuya vista previa ya no es esa). `project-images-block.tsx:138` pasa la URL fallida. ✅
5. **C-5** — `app/admin/(panel)/images/page.tsx:28` `let body: ReactNode;`. ✅
6. **Fake `olderThanHours`** — `admin-fake.mjs`: no entero o fuera de rango `int` → 404 `NOT_FOUND`; `dryRun` no booleano sigue 400 (a
   propósito). T233 actualizado (`admin-fake.test.ts:362`, `abc`, `1.5`, fuera de rango). **Deducción JAX-RS:** correcta. La especificación
   (§3.2) exige `NotFoundException` (404) cuando falla la conversión de un `@QueryParam`/`@PathParam`/`@MatrixParam` (400 solo para
   form/header/cookie); el `ProblemExceptionMapper.transport` del repo `cv` mapea `WebApplicationException` con `ApiError.fromStatus(404)` =
   `NOT_FOUND` (comprobado en `ApiError.java:63-73`). Que el orden sea 404 antes que el `dryRun` también es coherente (Java convierte los
   parámetros antes de invocar el método y `boolean` nunca falla). Queda **inferido, no ejecutado** contra Quarkus: confirmarlo con el runbook
   antes de cerrar la serie (riesgo 6), como ya anota `impl.md`. No bloquea: la web nunca envía esos valores.

### Skills (ronda 2, sobre las correcciones)
- simplify — sin hallazgos. · next-best-practices — `proxy.ts:44` matcher con lookahead correcto (verificado con
  `unstable_doesMiddlewareMatch` y en vivo); sin hallazgos. · strict-typing — sin hallazgos (`page.tsx:28` tipado).
- testing-strategy — T371 con reloj falso; T388/T389 discriminan el comportamiento anterior; sin hallazgos. · ui-ux-pro-max — sin cambios de UI.

### Checkpoints
C1 ✅ · C2 ✅ · C3 ✅ · C4 ✅ · C5 ✅ por código (verificación visual V8/V9 en Chrome sigue pendiente, O-5) · C6 ✅ · C7 n/a.

### Cambios requeridos
Ninguno.

### Observaciones fuera de alcance (siguen vigentes)
O-2 (endurecer `dryRun` en el repo `cv`; confirmar `olderThanHours` inválido contra la API desplegada), O-3, O-4, O-5.
