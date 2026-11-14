# review — web-admin-regresion (slug 10/10)

**Veredicto: APPROVED**

Rama `feature/web-admin-api-client` (sin commit), Node 22.23.1. Auditoría independiente; no se tocó código ni `progress/current.md`.

## C1 ejecutado por el revisor
- `npm run lint` ✅ · `npm run typecheck` ✅ · `env -u CV_API_URL -u SITE_URL npm run build` ✅ · `npm test` ✅ **152 archivos / 709 tests**.
- Tabla de rutas: todo `ƒ` salvo `○ /_not-found` y `○ /icon.svg` (como antes). Panel: `/admin`, `/admin/[...rest]`, `/admin/{services,projects,architecture,images,messages,settings,login}`,
  `/admin/history/{services,projects,architecture}`, los 11 handlers de `/admin/api/*`; públicas `/[[...slug]]`, `/robots.txt`, `/sitemap.xml`, `/api/{health,contact}`, PDFs. `ƒ Proxy (Middleware)`.
- Sondas en vivo: standalone en `127.0.0.1:3100` + `design-api.mjs` con admin en `4020`. Ambos detenidos al terminar; puertos 3100/4020 libres y sin `next-server`/fake
  (los únicos `server.js` que quedan son `tsserver.js` del IDE de Julio). El 3000 lo ocupa un contenedor Docker ajeno (no tocado).

## Trazabilidad Tn ↔ it()
| Tn | it() | ¿Comprueba lo que dice? |
|---|---|---|
| T420 | `tests/runtime/admin-e2e.test.ts` «T420: login → edit services → …» | Sí. Login real, `GET`/`PUT` de servicios y lectura pública inmediata ES/EN; subida multipart real (`FormData`) a `/admin/api/images/` (fuera del matcher), `PUT` de proyectos con la imagen → portada `https://media.example.test/<key>` y `alt` en `/` y `/en/`; galería la lista; rollback ES y EN → sin portada, imagen sigue en el almacenamiento, servicios intactos; `logout-all` → 401 JSON con cookie borrada (`Path=/admin`), página → 307 `?expired=1&next=%2Fadmin%2Fprojects%2F`, subida → 401; la home sin `set-cookie`; el log sin token, comentario, títulos, nombre de archivo ni IP, y todo línea JSON. Edita vía handlers (la UI la cubren los tests de componente): aceptable. |
| T421 | `admin-regression.test.ts` «T421…» | Sí: el archivo no existe, `proxy.ts` sí y `web-standards.md` («Testing») explica la retirada. Ver «T421: cobertura». |
| T422 | `deploy-files.test.ts` (2) + `docker-layout.test.ts` «T422…» | Sí: `cv-web` con exactamente `CV_API_URL`/`SITE_URL` y comentario del panel; `.env.example` con la nota de `Secure` y solo esas dos claves; el standalone trae páginas, handlers y `middleware.js`; `.env*` fuera de git y en `.dockerignore`. Desvío aceptado: tolera un `.env` local no versionado copiado por Next (no llega a la imagen). |
| T423 | `admin-regression.test.ts` «T423…» | Sí y es fuerte: recorre `PAGES` públicas, exige 200, que el HTML **y cada chunk JS público descargado** no contengan `/admin`, `cv_admin_token`, `admin/api`, «Cerrar sesión», «Crear gemelo» ni `ADMIN_UNAUTHORIZED`, y que el panel tenga chunks propios que ninguna página pública carga. |
| T424 | `tests/source.test.ts` «T424…» | Sí. Contrastado con grep propio: el código emite 18 eventos (`admin_api_call`, `admin_content_save`, `admin_image_cleanup`, `admin_image_delete`, `admin_image_upload`, `admin_internal`, `admin_login`, `admin_logout`, `admin_logout_all`, `admin_messages_view`, `admin_password_change`, `admin_rollback`, `admin_session_expired`, `api_call`, `contact`, `health`, `pdf_render_failed`, `render_error`); todos figuran entre backticks en `docs/web-standards.md`; también `## Admin` y `X-Client-IP`. Todas las llamadas usan literal, así que el regex del test no pierde ninguna. |
| T425 | `tests/source.test.ts` «T425…» | Sí: >50 archivos del panel/fake/fixtures sin secretos, JWT, `Bearer` largos ni claves privadas; correos solo en dominios RFC 2606; sin teléfonos; «Ada Ejemplo» en los fixtures. Grep propio sobre todo lo no versionado: sin correo real, prefijos telefónicos, JWT ni `console.log`/TODO. |
| T426 | `deploy-files.test.ts` «T426…» | Sí. Ejecuté el fragmento real del `ci.yml` (con `localhost:3000` → `127.0.0.1:3100`) contra el standalone: **SMOKE_OK** (login 200 con `X-Robots-Tag: noindex, nofollow`; `/admin/` sin cookie → 307). No exige `DESIGN_ADMIN_PASSWORD` ni variables nuevas. |
| T427 | `admin-regression.test.ts` «T427…» + C1 real | Sí: build en 0, `ƒ Proxy`, rutas del panel presentes y ninguna sin `ƒ`, públicas `ƒ`. |

Criterios: AC13/AC21/AC24 ← T420; AC28 ← T420, T421, T423, T426, T427; AC30 ← T422, T424, T425; AC25 ← T425. Todos cubiertos.

### T421: cobertura de lo que hacía `proxy-ready` (T104)
T104 probaba que un `proxy.ts` cabía en el standalone, corría en `/admin/*`, ponía una cookie `httpOnly` y no alteraba las páginas públicas. Hoy:
`proxy.test.ts` (unidad), T280 (`ƒ Proxy`, rutas `ƒ`), T281/T283 (públicas sin `set-cookie` ni cabeceras del panel), T282 (el proxy actúa en `/admin/`),
cookie `httpOnly` en los tests de login (`admin-auth.test.ts`), y T423/T427. No queda hueco.

## Observaciones resueltas (de reviews previas)
1. **`next` tras sesión caducada (messages O-1) + seguridad de `x-admin-path`.** `proxy.ts:22-26` copia las cabeceras y hace `Headers.set` (insensible a mayúsculas) en toda página que deja pasar; `panelPath` quita `_rsc`. El layout (`app/admin/(panel)/layout.tsx:30`) aplica `safeNext` antes de `expiredLoginUrl`. En vivo, con token revocado: `X-Admin-Path`, `X-ADMIN-PATH`, `x-admin-path` con `https://evil.example/`, y dos cabeceras duplicadas (`//evil.example` + `/admin/evil`) → siempre `?next=` con la ruta real. Fuera del matcher: `/admin/api/images/*` son route handlers (no usan el layout) y `/admin/api/images/a/b` cae en `app/admin/[...rest]`, que está **fuera** del grupo `(panel)` → 404, el layout no corre. Aunque corriera, `safeNext` solo deja `/admin…` y el valor solo lo puede fijar el propio cliente (una navegación ajena no pone cabeceras): sin open redirect. T286 actualizado (espera `next=%2Fadmin%2F` y prueba una `x-admin-path` falsa del navegador). ✅
2. **Nombres únicos con posición** (`lib/admin/messages.ts:324-326`), probado con títulos iguales en servicios y proyectos (T353 ampliado). ✅
3. **Marcas 422 posicionales**: `dropFields`/`isBelow` (`lib/admin/content/paths.ts:119-131`), `EditorFrame.update(…, reordered)`; usado en logros, enlaces, imágenes y adaptadores (únicos `RowList`/listas posicionales; la pila de tecnologías se marca a nivel de campo y se limpia por `fieldId`). El test de enlaces comprueba valores, orden, columna EN intacta y resumen recontado. ✅
4. **Foco de «Crear gemelo»** (`use-focus-later.ts`) en servicios/proyectos/puertos/adaptadores y en el panel de paridad (siguiente sin pareja o título). Tests con `toHaveFocus`. ✅
5. **`isKind` local** sustituido por `isContentKind` compartido en los dos handlers de contenido; test de fuente que impide la copia. ✅
6. **405 en páginas** (`proxy.ts:37-40`). En vivo con sesión: GET/HEAD 200; POST, PUT, DELETE, PATCH, OPTIONS → 405 `Allow: GET, HEAD`, `no-store`, `X-Robots-Tag`, cuerpo vacío (también con cabecera `Next-Action`). Handlers conservan sus métodos (`DELETE /admin/api/login/` → 405 propio, `GET /admin/api/logout/` → 405 `Allow: POST`, `GET content` 200, `POST images/cleanup` 200). Login por handler OK; `GET /admin/` sin cookie sigue 307; con cookie, el login sigue redirigiendo a `/admin/`; `POST /admin/messages` sin barra → 308 y luego 405; POST/GET públicos sin cambios. No hay `'use server'` en el repo, así que no rompe Server Actions. El test de runtime confirma 0 llamadas a la API. Messages O-2 (`role="list"`, nombre no duplicado) y O-5 (fijar el POST) también resueltos. ✅
   **Opinión sobre aplicarlo a todo el panel:** correcto. Las páginas son de solo lectura por diseño (§17: sin Server Actions), así que un método distinto de GET/HEAD nunca es legítimo; aplicarlo solo a `/admin/messages` sería arbitrario. Efecto secundario aceptable: el 405 precede a la redirección sin cookie (POST `/admin/` sin sesión → 405, no 307). Ver O-1 para el login sin JS.

## Defectos visuales corregidos
- V3 (barra a 360 px) y V9 (`.button:disabled`): `components/admin/editor.module.test.ts` comprueba la regla móvil sin `flex-direction`, `.comment { flex-basis: 100% }`, `sticky`/`bottom: 0`, `scroll-padding-bottom` en escritorio y móvil, y `opacity: 0.7` igual en `:disabled` y `aria-disabled`. ✅

## Docs
`docs/web-standards.md`: sección `## Admin` (rutas, flujo, sesión/proxy con `x-admin-path` y 405, `X-Client-IP` sin `CF-*`, CSRF/cabeceras, edición, eventos con campos, pruebas sin API) y «Pendiente de confirmar con la API real» con los 404 deducidos de JAX-RS y `dryRun`. `CLAUDE.md` y `AGENTS.md` recogen las dos decisiones de Julio (matcher sin `/admin/api/images`; portadas solo `https:`). ✅

## Privacidad
Sin teléfono, documento ni fecha de nacimiento; fixtures «Ada Ejemplo» y dominios `example.*`; log del e2e sin token, IP, títulos ni comentario; `.env` ignorado y fuera de la imagen. ✅

## Skills consultadas (criterios aplicados sobre el diff)
- `simplify`: sin hallazgos (`panelPath` reutilizado por el proxy en redirección y cabecera; `isContentKind` compartido; `dropFields` único para todas las listas).
- `next-best-practices`: sin hallazgos (`proxy.ts:22-26` usa `NextResponse.next({ request: { headers } })`, la forma soportada de pasar datos al layout; `headers()` esperado en el layout; matcher sin cambios).
- `strict-typing`: sin hallazgos (`update(change, fieldId?, reordered?: readonly string[])`, `RowList.onChange(items, reordered: boolean)` tipados; sin `any`).
- `security-best-practices`: sin hallazgos bloqueantes (cabecera interna sobrescrita y revalidada, sin open redirect, 405 sin llamar a la API). Nota O-1.
- `ui-ux-pro-max`: sin hallazgos (barra móvil, botón desactivado atenuado, foco gestionado, nombres accesibles únicos).
- `testing-strategy`: sin hallazgos (los extras comprueban comportamiento; el impl declara que fallan sin el arreglo; T423 inspecciona los chunks reales).

## Checkpoints
- C1 ✅ (ejecutado arriba; sin `console.log`/TODO en el código nuevo) · C2 ✅ · C3 ✅ · C4 ✅ (datos por `lib/api`/`lib/api/admin`; el único `fetch` del navegador es `browser-client.ts`) · C5 ✅ (panel noindex; a11y verificada en V1–V13) · C6 ✅ (informes en `progress/web-admin/<slug>/`) · C7 ⏳ pendiente (ver abajo).

## Verificaciones visuales parciales
- **V6 sin `parity:diff` por píxeles:** no bloquea. Se comprobó el mismo SVG normalizado y los mismos nodos/textos con `data-probe` entre la vista previa y el plano público; la diferencia de píxeles es una mejora de confianza, no un criterio funcional. Pendiente opcional.
- **V8 sin arrastrar y soltar:** no bloquea. La subida real por selector (5 MiB exactos aceptados, +1 byte y no imagen rechazados) sí se hizo, y el `drop` está cubierto por T376/T377 (`image-uploader.test.tsx`, `dataTransfer`). Comprobarlo a mano en el navegador una vez.
- **Miniaturas no vistas:** no bloquea; es la URL ficticia `media.example.test` de la fake. Se ve con R2 real tras desplegar (ya en la lista de manuales).

## Cambios requeridos
Ninguno.

## Observaciones fuera de alcance
- **O-1 (baja):** `components/admin/login-form.tsx:85` y `password-form.tsx:114` usan `<form method="post">` sin `action`. Si se envía antes de hidratar (o sin JS), el navegador hace POST a la propia página y ahora recibe un 405 vacío en vez de volver a ver el formulario. Es seguro (la contraseña no va a la URL ni a los logs, y la API no se llama), y el panel exige JS. Si molesta: una página 405 mínima con enlace o `action` a una ruta que redirija; no hace falta para cerrar.
- **O-2:** T422 tolera el `.env` local de Julio dentro de `.next/standalone` (Next lo copia). No llega a la imagen (`.dockerignore`), pero conviene no compartir a mano ese directorio.
- **O-3:** el 405 de las páginas depende del matcher; si un cambio futuro excluyera una página, volvería a renderizarse con POST (sin riesgo: no muta). El riesgo ya está anotado en el impl para `x-admin-path`.

## Pendiente de la serie completa antes de cerrar (C7)
1. **Validación humana** de Julio sobre los 10 slugs y autorización explícita («cerrá …»). Los 10 slugs están sin commitear en una sola rama, `feature/web-admin-api-client`: el `closer` debe acordar con Julio si se hace un commit por slug (`… [web-admin-<slug>]`, con línea `Verificación`) o se agrupan, y luego hacer merge a `develop` y mover el resumen a `progress/history.md`. Sin `Co-Authored-By` (regla del repo).
2. **Manuales tras desplegar (humano):** cookie `Secure` tras el túnel; que la auditoría de la API registre `X-Client-IP`; regla WAF sobre `cv-api.floreslab.dev/api/v1/admin/*`; prueba de R2 real (con miniaturas y portada pública); opcional, rate limit de Cloudflare en `/admin/api/login`.
3. **Contra la API real** (runbook de `cv`): confirmar los 404 deducidos (`limit`/`{version}` del historial, `olderThanHours=abc`) y añadirlos a `docs/admin-runbook.md` de `cv`.
4. **Repo `cv`:** endurecer `dryRun` no booleano en `POST /images/cleanup`.
5. **Opcionales de la web:** V6 por píxeles (`probe.mjs` + `parity:diff`), arrastrar y soltar real (V8), O-1.
