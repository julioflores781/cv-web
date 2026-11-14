# Analysis — web-admin

Estado: plan para validación humana, sin código ni tests escritos y sin git de escritura. Faltan por comprobar tres cosas:
- el `/openapi.json` público no se consultó: el contrato sale del código de la API (repo `cv`);
- la ruta de la API falsa para `chrome-devtools`: el MCP está desconectado;
- Docker no se ejecutó en local.

## 0. Qué se comprobó

**Next 16.4.5 instalado** (`node_modules/next/dist/docs/01-app/...`):
- `proxy.md`:
  - Runtime Node por defecto y `runtime` prohibido en proxy.
  - Orden de ejecución: `headers` y `redirects` de `next.config` van antes del proxy.
  - El matcher `/admin/:path*` cubre también `/admin`.
  - `onRequestError` admite `routeType: 'proxy'` (`instrumentation.md`), así que conviven.
- `proxyClientMaxBodySize.md`: con proxy, Next clona y bufferiza el cuerpo (10 MB por defecto, experimental). Pasado el límite, **trunca en silencio** y la petición sigue.
  - Consecuencia: un multipart de 5 MiB cabe, pero un cuerpo de 12 MiB llegaría truncado. El handler debe imponer su propio tope (`Content-Length` y conteo en streaming) y no fiarse del cuerpo.
- `route.md`: los route handlers leen `request.formData()` sin `bodyParser`. El límite de 1 MB es de los Server Actions (`serverActions.md`: `bodySizeLimit`).
- Server Actions (`serverActions.md` y `data-security.md`):
  - Comparan `Origin` con `Host`/`X-Forwarded-Host`, y sin `Origin` dejan pasar con un aviso.
  - Detrás del túnel dependen de qué `Host` reenvíe cloudflared, que no está verificado.
  - Por eso se confirma la decisión de la brief: **route handlers con comprobación explícita de `Origin`/`Sec-Fetch-Site`**.
- `cookies.md`: `cookies().delete(name)` solo admite el nombre, sin `path`. Una cookie con `Path=/admin` hay que borrarla con `set(...)` con los mismos atributos y `maxAge: 0`. `delete(name)` apuntaría a `Path=/` y no la borraría.
- `layout.md` y `route-groups.md`: sin `app/layout.tsx`, cada `layout` de primer nivel es un root layout propio. Hoy el único es `app/[[...slug]]/layout.tsx`, así que `app/admin/layout.tsx` será el segundo.
  - `admin` estático gana al catch-all.
  - Un `/admin/zzz` sin ruta lo serviría el catch-all público (404 con el layout público), salvo que se añada `app/admin/[...rest]/page.tsx` con `notFound()`.
- `generate-metadata.md#robots`: `metadata.robots = {index:false, follow:false}`.
- `output.md`: el standalone no necesita `outputFileTracingIncludes` nuevos; el panel solo usa `node:http`.

**Repo `cv-web`** (ya existente):
- `lib/api/request.ts`: `httpRequest` solo envía método GET/POST, cuerpo `string` y **no devuelve cabeceras de respuesta**. Esto bloquea leer `Retry-After`, subir binarios y usar PUT/DELETE.
- `lib/api/contact.ts` ya tiene `validIp` (privado) y reenvía `CF-Connecting-IP` al endpoint público. Eso sigue valiendo para contacto. El admin debe enviar `X-Client-IP`.
- `lib/log.ts`: la lista negra ya cubre `password`, `token`, `authorization`, `cookie`, `ip`, `body`.
- `docs/web-standards.md` dice «No hay línea por visita (no se usa `proxy.ts`)». Hay que actualizarlo.
- `tests/runtime/proxy-ready.test.ts` (T104) prueba en una copia que un proxy con matcher `/admin/:path*` y un POST con cookie `httpOnly` caben en el standalone.
- **Tests existentes que el panel obliga a tocar:**
  - T85 (`fetch(` solo en `lib/api` y `lib/contact/client.ts`).
  - T86 (los `'use client'` no importan `@/lib/api` en runtime).
  - T87 (`robots` con reglas exactas `{userAgent:'*', allow:'/'}`).
  - T23 (`next.config` sin `redirects`; `headers` es compatible).
  - BA-T10 (ningún hex/rgb fuera de los bloques de tokens; el CSS del panel solo usa variables).
  - BA-T17 y BA-T18 (colapso a ≤640 px y objetivos de 44 px).
  - T26 (ningún `.html` prerenderizado contiene «Ada»; las páginas del panel deben ser dinámicas).
- Los tokens `plano`/`obra` están en `app/globals.css`. El formulario de contacto público indica errores con texto, `aria-invalid` y borde, **sin rojo**. El diseño v2 no define color de error.

**Repo `cv` (contrato real)**:
- **Divergencia respecto a `api-admin/analysis.md` §4.2:** el `GET /content/projects` devuelve la forma almacenada, y `images[]` guarda `{key, alt, width, height}` **sin `url`** (`db/sample/projects.es.json`, `ProjectImage`). El panel debe resolver `key→url` con `GET /admin/images`. La web pública sí recibe `images[].url`.
- `ContentValidator` y `ContentParity`:
  - Límites: 30 servicios, 50 proyectos, 20 puertos, 20 adaptadores por puerto, 10 imágenes por proyecto, comentario ≤200, `alt` ≤200.
  - Paridad ES/EN:
    - ids y orden iguales en cada nivel;
    - servicios: `price` igual;
    - proyectos: `relation`, `disclosure`, `client`, `startDate`, `endDate` e imágenes por posición (`key`, `width`, `height`; el `alt` se traduce);
    - arquitectura: `status` de cada adaptador.
  - Las rutas de paridad **no llevan prefijo de idioma** (`projects[1].relation`). Las de validación sí (`es.projects[1].client`).
  - Una `key` inexistente no da error de guardado: da imagen rota.
- `application.properties`: el cuerpo de un guardado se limita a 98 304 bytes (`CONTENT_TOO_LARGE`). La subida admite 5 MiB (`5L*1024*1024`), con tope duro de 6 MB.
- Mensajes: `GET /contact-messages?limit=1..100&before=<int>` devuelve `{messages:[{id,name,email,body,createdAt}], next:string|null}`.

**Referencia `fion-gastronomy`**: patrón login → cookie, `proxy.ts` solo comprueba presencia, 401 → `?expired=1` con borrado de la cookie.
- Diferencias deliberadas aquí: `SameSite=Strict`, `Path=/admin` (allí `Lax` y `/`), `Secure` derivado de `SITE_URL` y no de `NODE_ENV`.

**Librerías:** no se propone ninguna dependencia nueva (formularios y validación a mano, espejo del validador de la API). Por eso no se consultó context7/WebFetch.
- Node activo en esta máquina: v20.20.2. Las pruebas y el build deben ir con `nvm use 22` (`engines >=22.12`).

## 1. Objetivo

Panel `/admin` en `cv-web` para un único administrador (solo contraseña). Permite editar servicios, proyectos (con imágenes) y el hexágono de arquitectura en ES+EN en la misma pantalla. Incluye historial con rollback, imágenes (subir, listar, borrar, limpiar huérfanas), mensajes de contacto en solo lectura y ajustes de contraseña/sesiones.

- El navegador solo habla con route handlers de `cv-web`; estos llaman a la API por red interna con el JWT de la cookie `httpOnly`.
- La web pública pasa a leer `images[0].url` como portada.
- Todo se prueba contra una API falsa que implementa el contrato admin.

## 2. Decisiones de diseño (resumen)

1. **Edición por pares ES/EN, no por idioma.** Cada ítem tiene un bloque «común» editado una vez y un bloque «traducible» en dos columnas.
   - Común = exactamente el conjunto que la API fuerza a ser igual. La paridad queda garantizada por construcción.
   - Añadir, quitar y reordenar actúa sobre los dos idiomas.
   - Lo que la API no compara (`stack`, `highlights`, `links`, `role`, `clientLabel`, notas) se edita por idioma en cada columna, con «Copiar ES → EN».
   - **Escritorio (≥900 px): lado a lado. Móvil: apilado (ES y luego EN), sin pestañas.**
2. **Un tipo = una pantalla con acordeón de ítems y una única barra de guardado fija.** El guardado de la API es del documento completo con un solo `baseVersions`, así que un maestro/detalle con rutas por proyecto daría una falsa idea de guardado independiente.
3. **Hexágono con formularios y vista previa en vivo** reutilizando `buildHexModel` y `HexPlane`. No hay editor JSON.
4. **Mutaciones por route handlers**, no Server Actions (ver §0). Navegación y lectura son Server Components que llaman a la API directamente.
5. **Idioma de la interfaz del panel: solo español**, en un único archivo `lib/admin/messages.ts` (ver Riesgos).
6. **Estados de error sin color nuevo:** texto con prefijo, icono, borde grueso y `aria-invalid`, igual que el contacto público. Sin tokens nuevos (ver Riesgos).
7. **Modo visual:** `data-mode="services"` (obra, claro) en todo el panel. La vista previa del hexágono va en un contenedor `data-mode="profile"`.

## 3. Archivos a crear o tocar

**Raíz y config**
- `proxy.ts` (nuevo, único). `next.config.ts` (+`headers()` para `/admin/:path*`). `app/robots.ts` (+`disallow:'/admin/'`).
- `.env.example` (nota: con `SITE_URL=http://localhost:3000` la cookie no lleva `Secure`).
- `docs/web-standards.md`, `CLAUDE.md`, `AGENTS.md` (mapa, logs, admin, quitar «no se usa proxy.ts»).
- `deploy/docker-compose.yml` (solo comentario; sin variables nuevas).
- `lib/api/schema.d.ts` (regenerado con `npm run generate:api`), `scripts/generate-api.mjs` (check de `images` en `Project`).

**Transporte y cliente servidor (`lib/api/`)**
- `lib/api/request.ts` (+`headers` en la respuesta, cuerpo `string|Uint8Array`, métodos PUT/DELETE; compatible hacia atrás).
- `lib/api/client-ip.ts` (nuevo; `validIp` extraído de `contact.ts`, que lo importa).
- `lib/api/admin/client.ts` (núcleo `adminRequest`), `auth.ts`, `content.ts`, `images.ts`, `messages.ts`, `parse.ts`, `index.ts`.
- `lib/api/types.ts` (+tipos admin y `ProjectImage`).

**Lógica compartida cliente/servidor, sin `node:` ni `lib/api` en runtime (`lib/admin/`)**
- `session.ts` (única que conoce el nombre de la cookie; **solo servidor**), `csrf.ts`, `next-path.ts`, `handler.ts` (envoltorio de route handlers), `request-context.ts` (requestId + IP), `messages.ts`, `password.ts`, `format.ts` (fechas es-ES, bytes).
- `browser-client.ts` (único `fetch(` nuevo permitido; URLs con barra final).
- `images.ts` (pre-comprobación en navegador: bytes mágicos y 5 MiB).
- `content/model.ts`, `validate.ts`, `paths.ts`, `diff.ts`, `drafts.ts`, `slug.ts`, `size.ts`, `kinds.ts`.

**Rutas (`app/admin/`)**
- `layout.tsx` (root layout propio), `not-found.tsx`, `[...rest]/page.tsx`, `login/page.tsx`.
- `(panel)/layout.tsx`, `(panel)/loading.tsx`, `(panel)/error.tsx`, `(panel)/page.tsx` (dashboard).
- `(panel)/services/page.tsx`, `(panel)/projects/page.tsx`, `(panel)/architecture/page.tsx`, `(panel)/images/page.tsx`, `(panel)/history/[kind]/page.tsx`, `(panel)/messages/page.tsx`, `(panel)/settings/page.tsx`; cada una con su `loading.tsx` donde cambie el esqueleto.
- `api/login/route.ts`, `api/logout/route.ts`, `api/logout-all/route.ts`, `api/password/route.ts`.
- `api/content/[kind]/route.ts` (GET, PUT), `api/content/[kind]/[lang]/rollback/route.ts`.
- `api/images/route.ts` (GET, POST), `api/images/[id]/route.ts` (DELETE), `api/images/cleanup/route.ts`.

**Componentes (`components/admin/`)**, con CSS Modules que solo usan tokens (BA-T10):
- Estructura: `admin-shell`, `confirm-dialog`, `status-banner`, `error-summary`.
- Autenticación: `login-form`, `password-form`, `session-actions`.
- Editor: `editor-frame` (barra de guardado, comentario, 409, borrador), `paired-field`, `item-list`, `parity-panel`.
- Contenido: `services-editor`, `projects-editor`, `architecture-editor`, `hex-preview`.
- Imágenes: `image-uploader`, `project-images-block`, `gallery`, `cleanup-panel`.
- Historial y mensajes: `history-list`, `snapshot-view`, `messages-list`, `local-time`.

**Tests y fakes**
- `scripts/parity/admin-fake.mjs` (nuevo; API admin falsa **única**), `scripts/parity/design-api.mjs` (la monta si hay `DESIGN_ADMIN_PASSWORD`).
- `tests/helpers/fake-api.ts` (+opción `admin`, delega en `admin-fake.mjs`).
- `tests/fixtures/admin-validation-vectors.json`, `tests/fixtures/admin-samples/*.json` (copias ficticias de `db/sample`).
- Tests nuevos y ampliados, listados en §13.
- Retirar `tests/runtime/proxy-ready.test.ts` (T104) en el slug de regresión.
- Modificar T85, T86, T87, `next.config.test.ts`.

**Web pública (`images[]`)**
- `lib/api/validate-content.ts` (`parseProject` + `images`), `lib/api/types.ts`.
- `lib/projects/images.ts` (de `resolveProjectImages` a `coverOf`).
- `components/project-card.tsx`, `project-featured.tsx`, `projects.tsx`, `home-view.tsx`, `app/[[...slug]]/page.tsx`, y los tests de esos archivos.

## 4. Rutas y árbol de componentes

```
/admin/                     dashboard (3 tarjetas: versiones ES/EN, publicado, fuente, paridad)
/admin/login/               login (fuera del grupo (panel): sin shell)
/admin/services/            editor
/admin/projects/            editor (+ bloque de imágenes por proyecto)
/admin/architecture/        editor + vista previa
/admin/images/              galería, borrado, limpieza
/admin/history/[kind]/      ?lang=es|en  &v=N   lista, instantánea, restaurar
/admin/messages/            ?before=<id>        solo lectura, paginado por enlaces
/admin/settings/            contraseña y «cerrar todas las sesiones»
```

Raíz: `app/admin/layout.tsx` (`<html lang="es">`, fuentes, `globals.css`, `data-mode="services"`, `metadata.robots`) → `login/page` o `(panel)/layout.tsx`.

`(panel)/layout.tsx` hace `GET /auth/session` por entrada (es la autoridad). Si da 401, borra la cookie y redirige a `login?expired=1`. Si la API cae, pinta «API no disponible» con reintento.
- Contiene `AdminShell` (skip link, `header`, `nav` con `aria-current`, `main#contenido`, botón «Cerrar sesión», hora de caducidad).

Cada editor = Server Component que carga con `GET content/{kind}` (+ `GET images` para `projects`) y pasa datos serializables a un cliente:

```
EditorFrame
 ├─ DraftBanner (restaurar borrador)
 ├─ ErrorSummary (role=alert, enlaces a campos)
 ├─ ConflictBanner (409)
 ├─ ParityPanel
 ├─ <XxxEditor> → ItemList → ItemAccordion → PairedField (común una vez | columna ES | columna EN)
 └─ SaveBar (sticky: estado, comentario ≤200, «Guardar»)
```

- **Ids**: editables solo en ítems nuevos; los guardados quedan de solo lectura.
- **Moneda**: se escribe en mayúsculas automáticamente.
- **Fechas**: campo de texto con patrón `YYYY-MM` (el `type=month` no existe en Firefox/Safari de escritorio).

## 5. Cliente de la API admin en el servidor

`adminRequest({operation, method, path, token, body?, query?, requestId, clientIp?, timeoutMs, signal?})` sobre `httpRequest`.

- **Cabeceras: lista blanca estricta**:
  - `Authorization: Bearer`;
  - `Accept: application/json`;
  - `Content-Type` solo con cuerpo;
  - `X-Request-Id` (se reutiliza el recibido o se genera con `newRequestId`);
  - `X-Client-IP` solo si `validIp(CF-Connecting-IP entrante)` (`isIP`, ≤45).
  - Nunca `CF-*`, cookies, `X-Forwarded-*`, `Referer`, `Origin` ni `User-Agent` del navegador. Los datos del entorno de la petición entran por una función que los transforma, no por copia de cabeceras.
- **Resultado tipado** (nunca lanza):
  - `ok{status,data,headers}`;
  - `problem{status,code,title,errors?,retryAfterSeconds?}`;
  - `unreachable | timeout | invalid`.
  - Un 4xx sin `problem+json` se normaliza a `code:'HTTP_<status>'`.
  - Los errores no contienen URL, host ni cuerpo.
- **Reintentos:** solo GET, uno, en error de transporte o 5xx, con el mismo `request_id` (como `requestJson`). **Las mutaciones nunca se reintentan** (un reintento podría duplicar efectos).
- **Timeouts:** 4 s lecturas, 10 s guardados, 30 s subida. Cada fallo registra `admin_api_call` WARN con `request_id`, `operation`, `outcome`, `status`, `attempt`, `duration_ms`, sin ruta con ids ni token.
- **Parsers** (`parse.ts`) en el estilo de `validate-content.ts`: validan forma, descartan campos desconocidos, extraen `errors[]` (`path`,`code`) y `Retry-After` entero.
- **Subida:** el handler reconstruye un multipart nuevo (boundary propio, una parte `file`, nombre fijo `upload`, bytes validados) y lo manda por `httpRequest` con cuerpo binario. No se reenvía el stream del navegador, para no pasar bytes sin validar.
- **Cliente del navegador** (`lib/admin/browser-client.ts`, único `fetch(` nuevo):
  - todas las URLs terminan en `/` (`trailingSlash: true` haría 308 en cada POST);
  - `credentials:'same-origin'`;
  - resultado `ok | expired | problem | network | offline | timeout`;
  - `expired` lleva a `/admin/login/?expired=1&next=<ruta>`.

## 6. Sesión, cookie, `proxy.ts` y CSRF

**Cookie** `cv_admin_token` (valor = JWT):
- `httpOnly`, `SameSite=Strict`, `Path=/admin`.
- `Secure` = `getConfig().siteUrl` empieza por `https:`. No se usa `X-Forwarded-Proto` ni el esquema de la petición: tras el túnel, cloudflared→`cv-web` va por HTTP, y el navegador ve HTTPS.
  - Con `SITE_URL=http://localhost:3000` no lleva `Secure`. Chrome y Firefox aceptan `Secure` en `localhost`; Safari no.
- `Max-Age = floor((expiresAt − now)/1000)`; un valor ≤0 o un `expiresAt` inválido cuenta como login fallido (502).
- Borrado: `set(name,'',{…mismos atributos, maxAge:0})`.
- **El token no llega nunca al JS, al HTML ni a los logs.**

**`proxy.ts`** (único, matcher `['/admin/:path*']` — cambiado en `web-admin-images` a `['/admin', '/admin/((?!api/images(?:/|$)).*)']`, ver Riesgo 2 —, sin logs por visita):
- Normaliza quitando la barra final.
- Sin cookie (o con valor vacío):
  - `/admin/login` y `POST /admin/api/login` pasan;
  - `/admin/api/*` responde 401 JSON `ADMIN_UNAUTHORIZED` (una petición de datos no se redirige);
  - lo demás redirige a `/admin/login/?next=<ruta+query>`.
- Con cookie:
  - `/admin/login` redirige a `/admin/`, salvo `?expired=1`, donde pasa y borra la cookie muerta con `Path=/admin`.
- **Solo mira presencia.** La autoridad es la API (layout, páginas y handlers).
- `next-path.ts` sanea `next` (solo `/admin/…`, sin `//`, `\`, esquemas, `..`, `%2F%2F`, ≤512 caracteres; si no, `/admin/`).

**CSRF** en todo handler que muta (`lib/admin/csrf.ts`, usado por `handler.ts`):
- `Origin` obligatorio y de host permitido: `SITE_URL`, `Host` o `X-Forwarded-Host`. Sin `Origin` solo vale `Sec-Fetch-Site: same-origin`.
- Se rechazan `Origin: null` y `Sec-Fetch-Site` ∈ {`cross-site`,`same-site`} (un subdominio comprometido no pasa).
- `Content-Type: application/json` obligatorio (415 `ADMIN_UNSUPPORTED_MEDIA`), salvo la subida, que exige multipart y sí comprueba `Origin`.
- Respuestas 403 `ADMIN_CSRF`, sin llamar a la API.
- Además cookie `SameSite=Strict` y `Path=/admin`.

**Envoltorio `handler.ts`** (todas las respuestas):
- `Cache-Control: no-store`, `X-Request-Id` y `requestId` en el cuerpo de error.
- Lee el token; sin token → 401.
- Un 401 de la API borra la cookie y devuelve 401 `ADMIN_UNAUTHORIZED`. Un **403 (`ADMIN_CURRENT_PASSWORD_WRONG`) no cuenta como caducidad.**
- Una excepción inesperada → 500 `ADMIN_INTERNAL`, sin traza.
- **Códigos web propios:** `ADMIN_CSRF`, `ADMIN_UPSTREAM`, `ADMIN_TIMEOUT`, `ADMIN_BAD_REQUEST`, `ADMIN_UNSUPPORTED_MEDIA`, `ADMIN_NOT_FOUND`, `ADMIN_INTERNAL`.
- **Los textos al usuario salen siempre del `code`** (`lib/admin/messages.ts`), nunca del `detail` de la API.

**Cabeceras de `next.config.ts`** en `/admin/:path*` (también cubren handlers y el 404):
- `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store`, `X-Frame-Options: DENY` y `Content-Security-Policy: frame-ancestors 'none'`.
- `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`.

**Sesiones:**
- «Cerrar sesión» solo borra la cookie. **El token sigue válido hasta caducar (8 h)** y la pantalla lo avisa.
- «Cerrar todas» llama a `logout-all` y borra la cookie. Si falla, **conserva la sesión** y muestra el error con reintento.
- Cambio de contraseña: `PUT /auth/password` devuelve token nuevo, la cookie se sustituye y la antigua queda invalidada.

## 7. Guardado, 409 y 422

**Cliente:**
1. Se valida con `lib/admin/content/validate.ts`, un espejo de `ContentValidator` con **las mismas rutas y códigos** (`es.projects[1].client`).
2. El tamaño UTF-8 de `{baseVersions, comment, documents}` debe ser ≤98 304 bytes.
3. Con errores no se envía nada: se enfoca el resumen y se abren los ítems con error.
4. Si es válido, `PUT /admin/api/content/{kind}/` con `{baseVersions, comment?, documents}`.

**Handler PUT:**
- Reenvía **solo** esos tres campos y limita el cuerpo a 128 KB antes de la API.
- 200 → documento guardado con las versiones nuevas.
- 409 → responde `{code:'CONTENT_VERSION_CONFLICT', latest}` tras un `GET` inmediato. Si ese `GET` falla, sin `latest`.
- 422 `CONTENT_INVALID` / `CONTENT_PARITY_BROKEN` → `errors[]` (`path`,`code`), máx. 200.
- 413, 401 y 5xx se mapean sin reintento.

**Éxito:** `dirty=false`, nuevas `baseVersions`, borrador borrado, anuncio `role=status` «Guardado: ES v4, EN v4».

**409, sin perder lo escrito:** el borrador no se toca. Un banner (`role=alert`) indica qué idioma y versión cambió y ofrece:
1. «Ver qué cambió» (`diff` por `id`: añadidos, quitados, modificados);
2. «Guardar encima» (confirmación; reenvía con las versiones del `latest`);
3. «Descartar los míos y cargar lo nuevo» (confirmación).

**422:** `paths.ts` convierte cada `path` en `{ítem, campo, idioma|común}`.
- Campo → `aria-invalid` + `aria-describedby` con el mensaje por código.
- Ruta de paridad sin prefijo → campo común.
- Ruta desconocida → solo en el resumen.

**Red/timeouts:** error en línea con reintento; el borrador se conserva.

**Borradores:** `sessionStorage` por tipo (envuelto en `try/catch`, ≤200 KB), guardado en cada cambio con rebote y al recibir un 401. Tras reloguear, el panel ofrece «Restaurar borrador» (si las `baseVersions` difieren, avisa y muestra el diff). Hay `beforeunload` solo mientras hay cambios.

## 8. Pantallas, con carga, vacío y error

Todas con `loading.tsx` (esqueleto `role=status aria-busy`) y `error.tsx` (texto en español, **referencia = request id**, botón reintentar). Ninguna deja pasar trazas ni URL de la API.

- **Login:**
  - Una etiqueta «Contraseña» (`type=password`, `autocomplete=current-password`), sin campo de usuario.
  - Error genérico idéntico para 400/401. En 429 `LOCKED` muestra el tiempo restante de `Retry-After` y bloquea el envío hasta que termine (se anuncia al final, no cada segundo). `RATE_LIMITED` pide esperar. Errores de red/502/504 genéricos.
  - Aviso `role=status` «Tu sesión caducó» con `?expired=1`.
  - Tras vaciar el campo en error, el foco vuelve a él.
- **Dashboard:**
  - Tres tarjetas con versión ES/EN, fecha de publicación, origen (`seed` → «Inicial», `admin` → «Panel»), insignia de paridad (texto + forma) y enlace a editar/historial.
  - Versión 0: «Sin publicar todavía» y CTA. `allSettled`: un tipo caído muestra su tarjeta en error y las demás siguen.
- **Servicios:**
  - Ítem = título/resumen ES|EN + `id` + precio común (casilla «A consultar» → `price:null`; si no, `from` decimal ≥0 con ≤2 decimales y `currency` de 3 letras mayúsculas).
  - Vacío: `EmptyState` con CTA «Añadir servicio». Máx. 30.
- **Proyectos:**
  - Acordeón con cabecera «título · relación · visibilidad · N imágenes · badge de errores». Nuevo proyecto por defecto con la **opción más restrictiva (`employer` + `anonymous`)**.
  - Común: `id`, `relation`, `disclosure`, `client`, `startDate`, `endDate`, imágenes.
  - Por idioma: `title`, `summary`, `role`, `clientLabel`, `stack`, `highlights`, `links`, `alt`.
  - **Reglas de privacidad en pantalla:**
    - `anonymous` desactiva y vacía `client` (con texto de por qué);
    - `employer`+`public` exige `client`;
    - el bloque de imágenes solo existe para `own`+`public`, con nota si no. Cambiar un proyecto con imágenes a no elegible avisa y exige quitarlas (no las borra solas).
  - Quitar un proyecto con imágenes avisa de que quedan en el almacenamiento.
- **Hexágono:**
  - Núcleo (`name` ≤80, `description` ≤300) por idioma; lista de puertos (≤20) y adaptadores (≤20 por puerto) con selector de `status` (3 valores, etiqueta + `StatusShape`, nunca solo color), `note` ≤200.
  - **Vista previa en vivo** (alternable ES/EN) con `buildHexModel`+`HexPlane`.
  - El formulario marca «no se dibuja» para puertos sin adaptadores y adaptadores sin nombre (lo que `buildHexModel` descarta), y avisa de que más de 6 puertos van en lista bajo el plano.
  - Publicar un núcleo vacío no se permite (`core.name` obligatorio).
- **Imágenes (en proyectos):**
  - `ImageUploader`: zona de arrastre **y** botón de archivo (accesible por teclado), selección múltiple en cola secuencial, estado por archivo.
  - Pre-comprobación: bytes mágicos JPEG/PNG/GIF/WebP y ≤5 MiB. Lo rechazado se lista con su motivo sin hacer petición.
  - Tras subir, la imagen entra en el proyecto **pendiente de guardar**; el foco pasa al `alt` ES y se anuncia.
  - `ProjectImagesBlock`: miniatura (por `key→url` del listado), «Portada» (la primera), «Hacer portada», subir/bajar, quitar del proyecto (no del almacenamiento), `alt` ES y EN obligatorios (≤200), máx. 10.
  - `width`/`height` solo de lectura. Si una `key` no está en el listado: «No encontrada en el almacenamiento (se verá rota)».
  - Si el listado da 503: «Almacenamiento no disponible», se puede seguir editando el resto.
- **Galería `/admin/images/`:**
  - Miniatura, tamaño humano, fecha, insignia «En uso / Sin usar» (texto+icono). «En uso (versión antigua)» se calcula contrastando con las `key` del documento de proyectos actual.
  - Borrar con confirmación. 409 `IMAGE_IN_USE` explica que puede estar en una versión del historial.
  - **Limpieza en dos pasos:** «Simular» (`dryRun`, `olderThanHours` ≥1, por defecto 24) muestra `wouldDelete`/`kept`; «Borrar N» solo se habilita tras una simulación vigente con N>0 (cambiar las horas la invalida) y con confirmación.
  - Estados: sin imágenes, esqueleto, 503 con puntero al runbook, `loading="lazy"` en miniaturas.
- **Historial `/admin/history/[kind]/`:** selector ES|EN, versiones (hasta 50) con número, fecha, origen, comentario escapado y «Activa». «Ver» abre la instantánea con resumen de cambios frente a la activa. «Restaurar» pide confirmación indicando que ES pasa de vX a vY (reactiva, el historial se conserva) y que EN no cambia.
  - 409 (la activa cambió) → «Recargar». 404/422 → explica que no se puede restaurar. Al terminar, se refresca el estado de paridad.
- **Mensajes:** lista de solo lectura (id, fecha, nombre, email, cuerpo) ordenada por reciente.
  - Todo se pinta como texto (React escapa); el cuerpo conserva saltos y rompe líneas largas.
  - `mailto:` solo si el email pasa una regex simple.
  - Paginación por enlace `?before=<next>`; el parámetro se valida como entero positivo (si no, se ignora). `limit` fijo en 50.
  - Estado vacío «Aún no hay mensajes».
  - La fecha se formatea en cliente (`LocalTime`, `<time dateTime>`) para no inventar zona horaria en el servidor.
- **Ajustes:** cambio de contraseña (actual, nueva, confirmación; 12–128 puntos de código, ≠ actual, `autocomplete=new-password`; 403/422/429 por código; aviso de que un 403 cuenta para el bloqueo). «Cerrar todas las sesiones» con confirmación. «Cerrar sesión» con la nota de las 8 h.
- **Diálogo de confirmación:** `<dialog>` nativo `showModal()` con foco inicial en «Cancelar», Esc cancela y devuelve el foco al disparador. jsdom no lo implementa del todo, por lo que en pruebas se usa un stub y la verificación real va en Chrome (ver §16).

## 9. API falsa con el contrato admin

Una única implementación en `scripts/parity/admin-fake.mjs` (`createAdminFake({seed, password, clock, storage})` → `{handle(req,res), state}`), usada por `tests/helpers/fake-api.ts` (opción `admin`) y por `design-api.mjs` (si `DESIGN_ADMIN_PASSWORD`; sin ella, `/api/v1/admin/*` da 404, como una API con admin deshabilitado).

- Cubre todos los endpoints y errores del §10 de `api-admin/analysis.md`, con los códigos del contrato.
- Estado en memoria:
  - sesión: `session_version`, bloqueo de 5 fallos / 15 min con `Retry-After`;
  - contenido: versiones con `active`;
  - imágenes: R2 simulado con reloj inyectable;
  - mensajes: lista.
- Los GET públicos salen del mismo almacén. Así un guardado se ve de inmediato en `/servicios/` del standalone.
- Réplica el `AdminEdgeGuard`: 404 si llega `CF-Ray`/`CF-Connecting-IP`.
- Inyección de fallos y latencia por operación (500, silencio, JSON inválido, `storage:false`).
- Registro de cabeceras recibidas (ya existe en `TestServer`).
- **Validador:** porta `ContentValidator`/`ContentParity` de la API. Para evitar deriva con el espejo del cliente, **ambos se prueban con el mismo `admin-validation-vectors.json`** (T-vectores).
- Datos: solo fixtures ficticios (Ada Ejemplo); nunca el CV real.

## 10. Web pública y `images[]`

- Regenerar `lib/api/schema.d.ts` y exportar `ProjectImage {url, alt, width, height}`; `Project.images: ProjectImage[]`.
- `parseProject`:
  - `images` ausente o `null` → `[]` (API anterior).
  - Forma inválida (url no string, `alt` ausente, `width/height` no enteros positivos) → payload inválido (500), como el resto.
  - Una `images` con elementos en un proyecto que no sea `own`+`public` se descarta (barrera de privacidad igual que `client`).
- `lib/projects/images.ts`: `coverOf(project)` devuelve `images[0]` solo si `canShowImage(project)` y la URL es `https:` absoluta sin credenciales (enmienda 2026-11-14, decisión de Julio; antes `safeHttpUrl`, que admitía `http:`). Desaparece `resolveProjectImages` y la convención `public/projects/<id>.webp`.
- `ProjectCard`/`ProjectFeatured` leen la portada del propio proyecto (`src`, `alt` de la imagen, o título si el `alt` viene vacío, `width`/`height`, `loading="lazy"`). El bloque de malla sigue siendo el estado sin imagen. `HomeView` pierde la prop `projectImages`.

## 11. Observabilidad

Todo por `lib/log.ts`; cada línea lleva `request_id`.

- Eventos nuevos:
  - `admin_login` (`outcome`: ok|invalid|locked|rate_limited|unavailable);
  - `admin_logout`, `admin_logout_all`, `admin_password_change`;
  - `admin_session_expired`;
  - `admin_content_save` (`kind`, `outcome`, `es_version`, `en_version`, `error_count`);
  - `admin_rollback` (`kind`, `lang`, `outcome`, `from`, `to`);
  - `admin_image_upload` (`outcome`, `bytes`, `content_type`);
  - `admin_image_delete`, `admin_image_cleanup` (`dry_run`, `count`);
  - `admin_messages_view` (`outcome`, `count`);
  - `admin_api_call` (WARN por fallo de transporte, 5xx o timeout).
- **Nunca** contraseñas, tokens, nombre de archivo, comentario, títulos, nombre/email/cuerpo de mensajes ni IP. La lista negra de `lib/log.ts` ya cubre `password`, `token`, `ip`, `body` y `cookie`; se añade una prueba de barrido sobre el log real del standalone.
- Cada error de la UI muestra `requestId` como «Referencia» para cruzarlo con `docker logs cv-api`. Además, `X-Client-IP` hace que la auditoría de la API registre la IP del navegador.
- `proxy.ts` no escribe líneas por visita. `docs/web-standards.md` debe reflejarlo.

## 12. Criterios de aceptación

- **AC1** Login solo con contraseña: 200 → cookie `cv_admin_token` `httpOnly`, `SameSite=Strict`, `Path=/admin`, `Secure` si `SITE_URL` es https, `Max-Age` ≈ `expiresAt`. El token no aparece en cuerpo, HTML, JS ni logs.
- **AC2** Errores de login genéricos e idénticos para 400/401; 429 con tiempo restante desde `Retry-After`; fallos de API sin URL ni detalle.
- **AC3** `proxy.ts` es único con matcher `/admin/:path*`:
  - Reglas de acceso (§6), con `next` saneado y cookie muerta borrada con `?expired=1`.
  - Solo presencia de cookie.
  - Páginas públicas intactas: sin cabeceras ni cookies del panel.
- **AC4** La API es la autoridad: 401 en layout, páginas o handlers → cookie borrada (con `Path=/admin`) y redirección o 401 JSON, y el cliente lleva a `login?expired=1`.
- **AC5** «Cerrar sesión» y «Cerrar todas» según §6; el fallo de `logout-all` conserva la sesión.
- **AC6** Cambio de contraseña con validación cliente (12–128, ≠ actual, confirmación), 403/422/429 por código y cookie sustituida por el token nuevo.
- **AC7** Todo handler que muta rechaza `Origin` ausente o ajeno, `Sec-Fetch-Site` cross/same-site y tipo de contenido no permitido, con 403/415 y **0 llamadas a la API**.
- **AC8** Todo `/admin/**` (incluidos handlers y 404) con `X-Robots-Tag: noindex, nofollow`, `no-store` y protección de iframe. Meta `robots` en las páginas. `robots.txt` con `Disallow: /admin/`. Ninguna URL del panel en `sitemap.xml`.
- **AC9** Cliente API admin: cabeceras según lista blanca (nunca `CF-*`); `X-Client-IP` solo si es una IP válida; `X-Request-Id` propagado y devuelto; reintento solo en GET; mutaciones sin reintento; errores sin URL.
- **AC10** Carga de contenido y estados:
  - Versión 0 / `content:null` arranca vacío con `baseVersion` 0.
  - Forma inválida → pantalla de error con reintento, sin colapsar.
  - Un tipo caído no tumba el dashboard.
- **AC11** Edición por pares:
  - Paridad por construcción.
  - Altas, bajas y reordenaciones actúan en ES y EN.
  - Los datos ya desiguales se ven como «sin pareja» con acciones de reparación y panel de paridad.
- **AC12** El validador del cliente reproduce los 14 códigos y todos los límites de la API con rutas idénticas. Con errores no se envía; además se comprueba el tope de 96 KB.
- **AC13** Guardado correcto: `PUT` con `baseVersions` y comentario ≤200; el estado «sin cambios/guardando/guardado» se anuncia. El cambio se ve en la web pública sin rebuild.
- **AC14** 409: el borrador se conserva; ofrece ver el diff, guardar encima (confirmado) o descartar (confirmado). Respalda el borrador en `sessionStorage` y lo ofrece tras un 401/relogin.
- **AC15** 422: cada error en su campo por `path` (`aria-invalid`, `aria-describedby`, resumen enfocable). Las rutas de paridad sin prefijo van a los campos comunes. Las rutas desconocidas, al resumen.
- **AC16** Privacidad en la UI: `anonymous` sin cliente; `employer`+`public` con cliente obligatorio; imágenes solo en `own`+`public` (el cambio de elegibilidad con imágenes avisa).
- **AC17** Hexágono con formularios, tres `status` con forma+texto, límites, vista previa fiel a lo que dibuja la web y avisos de «no se dibuja».
- **AC18** Subida: pre-comprobación en navegador (bytes mágicos, 5 MiB). El handler comprueba `Content-Length`, el tope en streaming y exactamente una parte `file`; no pasa bytes sin validar. Errores 400/413/415/503 mapeados. Funciona en el standalone con proxy (5 MiB sí, 5 MiB+1 no).
- **AC19** Galería: «en uso» y borrado con 409 explicado; limpieza con simulación previa obligatoria; estados vacío y 503.
- **AC20** Portada/orden/`alt`: primera imagen = portada; `alt` ES/EN obligatorios; ≤10 imágenes; `key`/`width`/`height` idénticos en ES y EN.
- **AC21** Historial: lista, instantánea, restauración con confirmación, `baseVersion` enviado siempre; 409/404/422 explicados; la paridad se refresca.
- **AC22** Mensajes: solo lectura, paginados por `before`, texto escapado, sin `ip_hash`, vacío y error cubiertos.
- **AC23** Cada pantalla tiene carga, vacío y error visibles; los errores incluyen request id; ninguna fuga de URL interna.
- **AC24** Web pública: `images[]` tipado y validado; portada = `images[0]` solo si `own`+`public` y URL `https:` (enmienda 2026-11-14, decisión de Julio: `http:` plano no, sin caer a la segunda imagen); sin lectura de `public/projects`; los estados vacíos se mantienen; nunca una imagen en proyectos de empleador o anónimos.
- **AC25** Logs del §11 sin datos sensibles (barrido con centinelas).
- **AC26** Accesibilidad: etiquetas, teclado completo (incluido reordenar), gestión de foco, regiones vivas, AA con tokens, `prefers-reduced-motion`, objetivos ≥44 px, sin scroll horizontal a 360 px.
- **AC27** Sin dependencias nuevas. `fetch(` solo en `lib/api`, `lib/contact/client.ts` y `lib/admin/browser-client.ts`. El nombre de la cookie solo en `lib/admin/session.ts`. `process.env` solo en `lib/api/config.ts`. Los `'use client'` no importan `lib/api` en runtime ni `session.ts`.
- **AC28** `next build` pasa con proxy y panel. Las rutas del panel salen `ƒ` y no hay HTML prerenderizado con datos. Las páginas públicas no cambian (misma comparación normalizada que T104).
- **AC29** La API falsa implementa el contrato; sus respuestas pasan por los parsers de la web.
- **AC30** Documentación actualizada (`web-standards.md`, `CLAUDE.md`, `AGENTS.md`, `.env.example`, comentario del compose).

## 13. Plan de tests (catálogo completo)

Numeración nueva desde **T201** (los existentes llegan hasta ~T104). `Tn — Dado … cuando … entonces …`. Archivo y tipo en la cabecera de grupo, o `[archivo · tipo]` si difiere. Entre corchetes, el criterio que cubre.

### 13.1 Slug `web-admin-api-client`

**`lib/api/request.test.ts` (unit)**
- **T201** — Dado un servidor que responde `Retry-After: 900` cuando `httpRequest` lo llama entonces el resultado incluye `headers['retry-after']==='900'`. [AC9]
- **T202** — Dado un servidor eco cuando `httpRequest` manda `PUT`/`DELETE` y un cuerpo binario (con `0x00` y `0xFF`) entonces el método, `Content-Length` y los bytes llegan idénticos. [AC9, AC18]
- **T203** — Dado el uso actual (`requestJson`) cuando se ejecuta tras el cambio entonces sigue enviando solo `Accept` y `X-Request-Id` y los tests existentes pasan. [AC9]

**`lib/api/client-ip.test.ts` (unit)**
- **T204** — Dado IPv4, IPv6, vacío, texto, lista `a, b`, >45 caracteres y espacios cuando `validIp` evalúa entonces acepta las dos IP (recortadas) y rechaza el resto; `contact.ts` mantiene su comportamiento. [AC9]

**`lib/api/admin/client.test.ts` (unit, API local `startServer`)**
- **T205** — Dado una llamada con token, id e IP válida cuando `adminRequest` envía entonces la API recibe solo `Authorization`, `X-Request-Id` (32 hex), `Accept`, `X-Client-IP` y `Content-Type` si hay cuerpo. [AC9]
- **T206** — Dado un contexto entrante con `CF-Connecting-IP`, `CF-Ray`, `Cookie`, `X-Forwarded-For`, `Referer` y `User-Agent` cuando se llama entonces la API no recibe ninguna de esas cabeceras y `X-Client-IP` lleva la IP; con IP inválida no hay `X-Client-IP`. [AC9]
- **T207** — Dado un `requestId` aportado cuando se llama entonces la API lo recibe y el resultado lo devuelve; sin él se genera uno. [AC9]
- **T208** — Dado un GET con 500 o conexión reseteada cuando se llama entonces reintenta una vez con el mismo id; con 4xx no reintenta; con POST/PUT/DELETE y 500 la API cuenta **una** petición. [AC9]
- **T209** — Dado una API muda, una caída y una respuesta con JSON no válido cuando se llama entonces devuelve `timeout` (en el tiempo configurado), `unreachable` e `invalid`, y ningún mensaje contiene URL ni host. [AC9]
- **T210** — Dado `problem+json` 401, 403, 409, 422 con `errors`, 429 con `Retry-After` y un 4xx sin cuerpo cuando se llama entonces devuelve `problem` con `code`, `errors` filtrados a `{path,code}` válidos, `retryAfterSeconds` entero (ausente si es basura) y `HTTP_<status>` en el caso sin cuerpo. [AC9, AC15]
- **T211** — Dado un fallo cuando se registra entonces sale una línea `admin_api_call` WARN con `request_id`, `operation`, `outcome`, `status`, `attempt` y `duration_ms`, sin token, contraseña, IP ni cuerpo. [AC25]

**`lib/api/admin/auth.test.ts`, `content.test.ts`, `images.test.ts`, `messages.test.ts`, `parse.test.ts` (unit)**
- **T212** — Dado un 200 de login con/sin `accessToken` o con `expiresAt` inválido cuando `adminLogin` parsea entonces `ok` solo con los tres campos válidos; si no, `invalid`. [AC1]
- **T213** — Dado 401, 429 con `Retry-After` y 400 cuando `adminLogin` los recibe entonces los devuelve como `problem` con su `code`. [AC2]
- **T214** — Dado `session`, `password` (200/403/422/429) y `logout-all` 204 cuando se llaman entonces parsea `authenticated/expiresAt/passwordChangedAt`, el token nuevo y los `problem`, y el 204 sin cuerpo no se parsea como JSON. [AC4–AC6]
- **T215** — Dado `GET content/{kind}` con versiones, con `version:0/content:null` y con `parity` cuando se parsea entonces devuelve los tres casos; un `kind` desconocido se rechaza antes de pedir. [AC10]
- **T216** — Dado respuestas sin `languages`, con `version` negativa o no entera, con `content` no objeto o sin `parity` cuando se parsean entonces son `invalid`. [AC10]
- **T217** — Dado `saveAdminContent` cuando envía entonces el cuerpo es exactamente `{baseVersions, comment?, documents}` (sin `comment` si está vacío); mapea 409, 422 `CONTENT_INVALID` con `errors`, `CONTENT_PARITY_BROKEN` y 413. [AC13–AC15]
- **T218** — Dado `listVersions`, `getVersion` y `rollback` cuando se llaman entonces validan `lang`/enteros antes de pedir, parsean la lista y la instantánea y mapean 404/409/422. [AC21]
- **T219** — Dado `uploadImage` con 100 KB cuando se llama entonces la API recibe un multipart con una sola parte `file`, boundary propio, nombre fijo y bytes idénticos (sha256); 201 parseado; 400/413/415/503 mapeados. [AC18]
- **T220** — Dado `listImages`, `deleteImage` y `cleanup` cuando se llaman entonces parsean `{key,url,bytes,lastModified,referenced}`, rechazan ids no UUID (`../`, vacío), construyen `dryRun`/`olderThanHours` enteros ≥1 y mapean 204/404/409. [AC19]
- **T221** — Dado `listMessages` cuando se llama entonces valida `limit` 1–100 y `before` entero positivo antes de pedir, parsea `next` (`null` incluido) y descarta campos desconocidos como `ip_hash`. [AC22]
- **T222** — Dado el esquema regenerado cuando se comprueba entonces `Project` incluye `images` con `url, alt, width, height`; `checkSchema` marca un esquema sin ellas. [AC24] [`scripts/generate-api.test.ts`]

### 13.2 API falsa — `scripts/parity/admin-fake.test.ts` (unit, `// @vitest-environment node`)
- **T223** — Dado la contraseña correcta cuando hace login entonces 200 con token; con una incorrecta, 401 idéntico al de «cuenta inexistente»; tras 5 fallos, 429 `ADMIN_LOGIN_LOCKED` con `Retry-After`, incluso con la correcta; un `unlock` de prueba lo reabre. [AC29]
- **T224** — Dado cualquier ruta `/admin/*` sin token o con token inválido cuando se llama entonces 401 `ADMIN_UNAUTHORIZED`; con `CF-Ray` o `CF-Connecting-IP` entonces 404; todas con `Cache-Control: no-store`. [AC29]
- **T225** — Dado `session`, cambio de contraseña (débil, igual, actual incorrecta, correcta) y `logout-all` cuando se ejecutan entonces 200/422/403 y el token antiguo queda en 401 tras el cambio. [AC29]
- **T226** — Dado contenido vacío cuando se lee entonces `version:0/content:null`; un `kind` desconocido da 404. [AC29]
- **T227** — Dado un guardado correcto cuando se hace `PUT` entonces las versiones suben en 1, `GET` lo refleja y el `GET` público de la misma fake lo muestra al instante. [AC13, AC29]
- **T228** — Dado una `baseVersion` obsoleta en solo un idioma cuando se hace `PUT` entonces 409 `CONTENT_VERSION_CONFLICT` y **ningún** idioma cambia. [AC14]
- **T229** — Dado el fichero de vectores cuando el validador de la fake los evalúa entonces cada código (los 14) y límite produce exactamente los `(path,code)` esperados. [AC12, AC29]
- **T230** — Dado un `PUT` con ES y EN desiguales cuando se envía entonces 422 `CONTENT_PARITY_BROKEN` con rutas **sin prefijo**; con más de 96 KB, 413 `CONTENT_TOO_LARGE`. [AC15]
- **T231** — Dado versiones cuando se listan, se lee una instantánea y se restaura entonces refleja `active`, 404 en versión inexistente, 409 si la base no coincide y 422 si el destino ya no valida. [AC21]
- **T232** — Dado imágenes cuando se suben JPEG/PNG/WebP/GIF por bytes mágicos entonces 201; SVG/HEIC/renombrados 415 o 400; >5 MiB 413; 0 o 2 partes 400; con `storage:false` 503; la clave es `site/projects/<uuid>.<ext>`. [AC18, AC29]
- **T233** — Dado imágenes y versiones cuando se listan y borran entonces `referenced` cuenta cualquier versión, el borrado de una usada da 409, el inexistente 404; `cleanup` respeta `dryRun` y la gracia ≥1 h con reloj inyectable. [AC19]
- **T234** — Dado mensajes cuando se listan con `limit`/`before` entonces pagina con `next`, devuelve 400 con parámetros inválidos y nunca incluye `ip_hash`. [AC22]
- **T235** — Dado la inyección de fallos cuando se activa una operación (500, silencio, JSON roto) entonces la fake la ejecuta y registra las cabeceras recibidas. [AC29]
- **T236** — Dado `design-api.mjs` sin `DESIGN_ADMIN_PASSWORD` cuando se pide `/api/v1/admin/auth/login` entonces 404; con ella, habilitado; los GET públicos y `design-api.test.ts` existentes no cambian. [AC29]
- **T237** — Dado las respuestas de la fake cuando pasan por los parsers de `lib/api/admin` entonces todas son válidas (contrato fake↔web). [AC29]
- **T238** — Dado `startFakeApi()` sin `admin` cuando se piden rutas admin entonces 404 y el resto se comporta como antes; con `admin`, el store alimenta también los GET públicos. [AC29]
- **T239** — Dado los mismos vectores cuando los evalúan el validador del cliente y el de la fake entonces dan el mismo conjunto `(path,code)` (anti-deriva). [AC12] [`tests/contract/validation-vectors.test.ts`]

### 13.3 Slug `web-admin-auth` (base + sesión)

**`next.config.test.ts` y `app/robots.test.ts` (unit)**
- **T240** — Dado `headers()` cuando se evalúa `/admin/:path*` entonces incluye `X-Robots-Tag: noindex, nofollow`, `no-store`, `X-Frame-Options`, CSP `frame-ancestors 'none'`, `Referrer-Policy`, `nosniff`; la config sigue sin `redirects` (T23). [AC8]
- **T241** — Dado `robots()` cuando se evalúa entonces permite `/`, desautoriza `/admin/` y mantiene el sitemap; `sitemap` no contiene rutas del panel. [AC8] [actualiza T87]

**`proxy.test.ts` (unit, `NextRequest`)**
- **T242** — Dado `/admin/` sin cookie cuando pasa por el proxy entonces redirige a `/admin/login/?next=%2Fadmin%2F`. [AC3]
- **T243** — Dado `/admin/projects/?x=1` sin cookie cuando pasa entonces `next` conserva ruta y query. [AC3]
- **T244** — Dado `/admin/login/` y `/admin/login` sin cookie cuando pasan entonces continúan; `POST /admin/api/login/` también. [AC3]
- **T245** — Dado cualquier otro `/admin/api/*` sin cookie cuando pasa entonces 401 JSON `ADMIN_UNAUTHORIZED`, no redirección. [AC3]
- **T246** — Dado cookie presente cuando se pide `/admin/` entonces continúa; `/admin/login/` redirige a `/admin/`; `/admin/login/?expired=1` continúa y borra la cookie con `Path=/admin; Max-Age=0`. [AC3, AC4]
- **T247** — Dado una cookie con valor basura o vacío cuando se evalúa entonces basura = presente (la API decide) y vacía = ausente; el proxy nunca decodifica el token. [AC3]

**`lib/admin/next-path.test.ts` (unit)**
- **T248** — Dado `/admin/x/?a=1` entonces se acepta; dado `//evil.com`, `/\evil`, `https://x`, `javascript:`, `/admin/../x`, `%2F%2Fx`, `/administrator`, `/`, vacío o >512 caracteres entonces devuelve `/admin/`. [AC3]

**`lib/admin/session.test.ts` (unit)**
- **T249** — Dado `SITE_URL` https cuando se calculan opciones entonces `httpOnly`, `sameSite:'strict'`, `path:'/admin'`, `secure:true`, `maxAge` desde `expiresAt`; con http, sin `secure`; con `expiresAt` pasado o inválido se rechaza. [AC1]
- **T250** — Dado el borrado cuando se construye entonces usa los mismos atributos con `maxAge:0`. [AC4, AC5]
- **T251** — Dado cookies vacías, con espacios/control o de más de 4 KB cuando `readToken` las lee entonces devuelve `undefined`. [AC1]

**`lib/admin/csrf.test.ts` y `lib/admin/handler.test.ts` (unit)**
- **T252** — Dado `Origin` igual a `Host`, a `SITE_URL` o a `X-Forwarded-Host` cuando se comprueba entonces pasa. [AC7]
- **T253** — Dado `Origin` ajeno, `null`, ausente sin `Sec-Fetch-Site`, o `Sec-Fetch-Site` cross-site/same-site (aunque `Origin` coincida) cuando se comprueba entonces 403 `ADMIN_CSRF`; sin `Origin` pero `same-origin` pasa. [AC7]
- **T254** — Dado `text/plain` o un formulario simple cuando se muta entonces 415 `ADMIN_UNSUPPORTED_MEDIA` (salvo multipart en la subida); un GET no exige `Origin`. [AC7]
- **T255** — Dado sin cookie cuando se llama un handler entonces 401; dado 401 de la API entonces cookie borrada y `ADMIN_UNAUTHORIZED`; dado 403 `ADMIN_CURRENT_PASSWORD_WRONG` entonces la cookie no se toca. [AC4]
- **T256** — Dado una excepción inesperada cuando responde el envoltorio entonces 500 `ADMIN_INTERNAL` sin traza y `X-Request-Id`; toda respuesta lleva `no-store`. [AC9, AC23]
- **T257** — Dado todos los códigos del contrato (auth, contenido, imágenes y web) y los 14 de violación cuando se consulta `lib/admin/messages.ts` entonces cada uno tiene mensaje en español y un código desconocido cae en un mensaje genérico. [AC2, AC15] [`lib/admin/messages.test.ts`]

**`app/admin/api/login/route.test.ts`, `logout`, `logout-all`, `password` (unit)**
- **T258** — Dado API 200 cuando se hace login entonces 200 `{ok:true}` sin token en el cuerpo, `Set-Cookie` con los atributos exactos, `X-Request-Id` de 32 hex, y la API recibió `X-Client-IP` (de `CF-Connecting-IP`) y ninguna cabecera `CF-*`. [AC1, AC9]
- **T259** — Dado un cuerpo no JSON, sin `password`, no string o >1024 caracteres cuando se hace login entonces 400 con el mismo mensaje que el 401 y 0 llamadas a la API. [AC2]
- **T260** — Dado API 401 cuando se hace login entonces 401 con cuerpo idéntico al de 400 y sin `Set-Cookie`. [AC2]
- **T261** — Dado API 429 `LOCKED` con `Retry-After:900` entonces 429 con `retryAfterSeconds:900` y cabecera `Retry-After`; `RATE_LIMITED` sin retry; `Retry-After` basura se omite. [AC2]
- **T262** — Dado API caída, 500, silencio o JSON inválido entonces 502/504 `ADMIN_UPSTREAM`/`ADMIN_TIMEOUT` sin URL y sin cookie. [AC2]
- **T263** — Dado login con `Origin` ajeno entonces 403 `ADMIN_CSRF` con 0 llamadas a la API. [AC7]
- **T264** — Dado cualquier login entonces `admin_login` registra `outcome`, `status`, `request_id` y no contiene la contraseña centinela, el token ni la IP. [AC25]
- **T265** — Dado `POST logout` (con o sin cookie) entonces 200 idempotente, `Set-Cookie` de borrado `HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0` y 0 llamadas a la API. [AC5]
- **T266** — Dado `logout-all` con API 204 entonces 200 y cookie borrada; con API 401 entonces cookie borrada igualmente; con API caída entonces 502 y la cookie **no** se borra. [AC5]
- **T267** — Dado `POST password` válido y API 200 con token nuevo entonces 200 y un único `Set-Cookie` con el token nuevo y su `Max-Age`. [AC6]
- **T268** — Dado API 403 entonces `ADMIN_CURRENT_PASSWORD_WRONG` sin tocar la cookie; 422 `ADMIN_WEAK_PASSWORD`; 429 con `retryAfterSeconds`; cuerpo malformado 400 sin llamar a la API. [AC6]
- **T269** — Dado el cambio de contraseña entonces `admin_password_change` no contiene ninguna contraseña. [AC25]
- **T270** — Dado `lib/admin/password.test.ts` con vacío, 11, 12, 128, 129 caracteres, igual a la actual, confirmación distinta, y emoji (puntos de código) entonces los errores y aceptaciones son los de la política. [AC6]

**Componentes (`components/admin/*.test.tsx`, jsdom)**
- **T271** — Dado `LoginForm` entonces tiene una etiqueta «Contraseña», `type=password`, `autocomplete=current-password` y ningún campo de usuario. [AC1, AC26]
- **T272** — Dado un 401 cuando se envía entonces aparece `role=alert` genérico, el campo se vacía y recupera el foco; un doble envío se impide mientras envía. [AC2, AC26]
- **T273** — Dado un 429 con `retryAfterSeconds` (timers falsos) entonces muestra el tiempo restante, bloquea el envío hasta terminar y anuncia la reapertura una sola vez. [AC2]
- **T274** — Dado red caída, offline y timeout entonces mensajes distintos y reintento posible. [AC2]
- **T275** — Dado `?expired=1` entonces aparece «Tu sesión caducó» (`role=status`); dado `?next=` válido o malicioso entonces se navega a `next` saneado o `/admin/`. [AC3, AC4]
- **T276** — Dado `lib/admin/browser-client.test.ts` entonces las URLs terminan en `/`, usa `credentials:'same-origin'`, clasifica red/offline/timeout y un 401 devuelve `expired`. [AC4, AC27]
- **T277** — Dado `AdminShell` entonces hay skip link, `header`, `nav` con `aria-label` y `aria-current`, `main` con id, botón de cerrar sesión y objetivos ≥44 px; la navegación móvil es operable por teclado. [AC26]
- **T278** — Dado `PasswordForm` entonces etiquetas visibles, `autocomplete` correcto, pista 12–128, mensajes por código (403, 422, 429), confirmación de «cerrar todas» y estado de éxito. [AC6, AC26]
- **T279** — Dado `ConfirmDialog` (con stub de `showModal`) entonces enfoca «Cancelar», Esc cancela, devuelve el foco al disparador y su texto describe la consecuencia. [AC26]

**Runtime (`tests/runtime/admin-gate.test.ts` y `admin-auth.test.ts`, standalone + fake con `admin`)**
- **T280** — Dado el build entonces la salida lista `Proxy` y las rutas `/admin/*` como `ƒ`; `/[[...slug]]` sigue `ƒ`; ningún `.html` prerenderizado contiene «Ada». [AC28] [amplía `build.test.ts`]
- **T281** — Dado el standalone cuando se piden `/`, `/servicios/`, `/en/`, `/en/services/`, `/api/health/`, `/api/contact/` y los PDF entonces responden como antes, sin `set-cookie` ni cabeceras del panel y con HTML normalizado idéntico a la línea base. [AC3, AC28] [sustituye a T104]
- **T282** — Dado `/admin` sin barra con `redirect:'manual'` entonces 308 a `/admin/` y esta, sin cookie, redirige a `login?next=`. [AC3]
- **T283** — Dado `/admin/login/`, un handler y `/admin/zzz/` (404) entonces los tres llevan las cabeceras de §6; `/` no lleva `X-Robots-Tag`. [AC8]
- **T284** — Dado el HTML de `/admin/login/` entonces `lang="es"`, un `h1`, meta `robots` noindex, un campo de contraseña etiquetado y ningún dato de la API. [AC1, AC8, AC26]
- **T285** — Dado login correcto, `/admin/` con cookie y sin ella entonces 200 y 307; con contraseña errónea 401 genérico. [AC1–AC3]
- **T286** — Dado un `logout-all` hecho en la fake cuando se pide `/admin/` con el token antiguo entonces 307 a `login?expired=1` con `Set-Cookie` que borra con `Path=/admin`. [AC4]
- **T287** — Dado el flujo de cambio de contraseña cuando se completa entonces el token antiguo queda inválido y el nuevo accede. [AC6]
- **T288** — Dado `SITE_URL` https y luego http cuando se hace login entonces `Set-Cookie` lleva `HttpOnly`, `SameSite=Strict`, `Path=/admin`, `Max-Age` y `Secure` solo en el primer caso. [AC1]
- **T289** — Dado un recorrido completo (login, fallo, bloqueo, cambio) cuando se barre el log del servidor entonces hay líneas `admin_*` y no aparecen contraseña, token, IP, `Authorization`, ni cuerpos. [AC25]
- **T290** — Dado el HTML de `/admin/`, `/admin/login/` y las respuestas JSON cuando se escanean entonces no contienen el token ni su nombre de cookie. [AC1]
- **T291** — Dado `GET`/`PUT`/`OPTIONS` en `/admin/api/login/` entonces 405 con `Allow: POST`. [AC7]
- **T292** — Dado un `/admin/api/nope/` y `/admin/nope/` autenticados entonces 404 bajo el layout del panel con noindex. [AC8]
- **T293** — Dado el servidor con `proxy.ts` e `instrumentation.ts` cuando arranca entonces llega a «Ready» sin avisos de ninguno y un error de render del panel genera un único `render_error` sin cabeceras. [AC28]

**`tests/source.test.ts` (build/estático, amplía T85/T86)**
- **T294** — Dado el código de producción entonces `fetch(` solo está en `lib/api`, `lib/contact/client.ts` y `lib/admin/browser-client.ts` (este sin `https?://` ni `process.env`); `process.env` solo en `config.ts`; el nombre `cv_admin_token` solo en `lib/admin/session.ts`. [AC27]
- **T295** — Dado los `'use client'` entonces no importan `@/lib/api` en runtime, `lib/admin/session.ts` ni `node:*`. [AC27]
- **T296** — Dado `package.json` entonces las dependencias coinciden con las de hoy (sin librerías nuevas). [AC27]

### 13.4 Slug `web-admin-content-core` (contenido, servicios y dashboard)

**`lib/admin/content/*.test.ts` (unit)**
- **T297** — Dado documentos ES/EN de servicios del sample cuando se aparejan y se vuelven a serializar entonces el resultado es semánticamente igual (`price:null` ≡ ausente) y pasa el validador. [AC11]
- **T298** — Dado `content:null` en ambos o en uno cuando se apareja entonces lista vacía, o los ítems del otro idioma aparecen «sin pareja». [AC10, AC11]
- **T299** — Dado ids, orden o campos neutros distintos cuando se calculan diferencias entonces coinciden con los de `ContentParity` (rutas sin prefijo) usando los mismos vectores. [AC11]
- **T300** — Dado alta, baja y reordenación cuando actúan sobre un par entonces cambian ES y EN a la vez sin mutar el original; el `id` sugerido sale del título y se desambigua (`-2`). [AC11]
- **T301** — Dado `slug` con «Reserva de turnos», «Ñandú & Co.», vacío y >64 entonces `reserva-de-turnos`, `nandu-co`, vacío y recorte; siempre cumple `[a-z0-9]+(-[a-z0-9]+)*`. [AC11]
- **T302** — Dado los vectores de servicios cuando valida el espejo entonces produce exactamente los códigos y rutas del contrato (REQUIRED, TOO_LONG 120/600, INVALID_VALUE de precio y moneda, DUPLICATE_ID, INVALID_ID, TOO_MANY 30, UNKNOWN_FIELD). [AC12]
- **T303** — Dado los vectores de proyectos entonces cubre enums, `ANONYMOUS_CLIENT_FORBIDDEN`, `CLIENT_REQUIRED`, fechas (formato, fin anterior, fin sin inicio), `stack` 30×60, `highlights` 20×400, enlaces 10 con https ≤300 sin espacios, imágenes (no elegible, clave inválida, ancho/alto, `alt`, TOO_MANY 10), TOO_MANY 50. [AC12, AC16]
- **T304** — Dado los vectores de arquitectura entonces cubre `core` requerido, 80/300/200, 20 puertos, 20 adaptadores, `status`, ids duplicados por ámbito. [AC12]
- **T305** — Dado textos con emoji, solo espacios y valores en el límite exacto entonces cuenta puntos de código, solo-espacios = REQUIRED y el validador no modifica los valores. [AC12]
- **T306** — Dado varios errores cuando valida entonces devuelve **todos**, ordenados por ruta; `comment` >200 → `TOO_LONG` en `comment`. [AC12]
- **T307** — Dado un guardado de exactamente 98 304 bytes y de 98 305 (UTF-8) entonces el primero pasa y el segundo da error de tamaño antes de enviar. [AC12]
- **T308** — Dado rutas `es.projects[1].images[0].key`, `projects[1].relation`, `en.core`, `es.`, `..`, `es.projects[x]` y `__proto__` entonces las válidas se parsean (con/sin idioma) y el resto da `null` sin lanzar ni contaminar prototipos. [AC15]
- **T309** — Dado errores del servidor cuando se mapean a un borrador entonces cada uno cae en `{ítem, campo, idioma|común}`, los duplicados ES/EN de un campo común se fusionan y lo desconocido va a «general» con orden estable. [AC15]
- **T310** — Dado dos documentos cuando se hace `diff` entonces informa añadidos, quitados, modificados (campos) y reordenados por `id`; imágenes por `key`; el orden de claves no importa. [AC14, AC21]
- **T311** — Dado `drafts` cuando guarda/carga/borra entonces usa `sessionStorage` por tipo con `{baseVersions, draft, savedAt}`; con almacenamiento que lanza, JSON corrupto, otro tipo o >200 KB no lanza y devuelve nulo. [AC14]

**Handlers `app/admin/api/content/**` (unit)**
- **T312** — Dado `GET` entonces devuelve el documento de la API más `no-store`; un `kind` desconocido da 404 `ADMIN_NOT_FOUND` con 0 llamadas. [AC10]
- **T313** — Dado `PUT` válido entonces reenvía solo `baseVersions`, `comment` y `documents` (ignora `kind` u otros campos); devuelve lo guardado; `admin_content_save` registra `kind`, `outcome`, versiones. [AC13, AC25]
- **T314** — Dado cuerpos no JSON, >128 KB, sin `baseVersions` enteros o con `documents` no objeto entonces 413/400 `ADMIN_BAD_REQUEST` sin llamar a la API. [AC13]
- **T315** — Dado API 409 cuando se guarda entonces 409 con `latest` (tras un `GET`); si ese `GET` falla, 409 sin `latest`. [AC14]
- **T316** — Dado API 422 cuando se guarda entonces responde con `errors` (máx. 200, solo `path`/`code`); el log solo trae `error_count`. [AC15, AC25]
- **T317** — Dado API 401, 413 y 5xx/caída entonces 401 con cookie borrada, 413 `CONTENT_TOO_LARGE`, 502 sin reintento (la fake cuenta 1). [AC9]
- **T318** — Dado un doble envío del mismo guardado entonces el segundo da 409 y la UI lo muestra como conflicto, no como «guardado dos veces». [AC14]

**Componentes del editor (jsdom)**
- **T319** — Dado `EditorFrame` entonces la barra distingue sin cambios / N cambios / guardando / guardado, «Guardar» se desactiva sin cambios o guardando y `beforeunload` solo existe mientras hay cambios. [AC13]
- **T320** — Dado el comentario con contador y 201 caracteres entonces error visible, sin truncar. [AC12, AC13]
- **T321** — Dado «Guardar» con errores cliente entonces no hay petición, el resumen recibe el foco (`role=alert`), enlaza a cada campo, el campo tiene `aria-invalid`/`aria-describedby` y se limpia al corregir. [AC12, AC15]
- **T322** — Dado un guardado correcto entonces `dirty=false`, el borrador se borra, `role=status` anuncia las versiones y el siguiente guardado usa las `baseVersions` nuevas. [AC13]
- **T323** — Dado un 409 entonces aparece el banner con idioma y versiones, los campos conservan lo escrito, «Ver qué cambió» lista el `diff`, «Guardar encima» (con confirmación) reenvía con las versiones de `latest` y «Descartar» (con confirmación) carga lo nuevo. [AC14]
- **T324** — Dado un conflicto solo en un idioma entonces el banner lo nombra y «guardar encima» reenvía ambas bases desde `latest`. [AC14]
- **T325** — Dado un 422 de servidor (cliente saltado vía fake) entonces cada error va a su campo y mensaje por código, lo desconocido al resumen y el foco al resumen. [AC15]
- **T326** — Dado `CONTENT_PARITY_BROKEN` con rutas sin prefijo entonces se muestran en los campos comunes con un banner explicativo. [AC15]
- **T327** — Dado fallo de red al guardar entonces error en línea con reintento y el borrador intacto. [AC13]
- **T328** — Dado un 401 al guardar entonces el borrador pasa a `sessionStorage` y navega a `login?expired=1&next=<página>`; tras volver, aparece «Restaurar borrador». [AC14]
- **T329** — Dado un borrador con las mismas `baseVersions` entonces «Restaurar/Descartar» funciona; con otras, avisa y muestra el diff. [AC14]
- **T330** — Dado `ParityPanel` entonces lista diferencias locales y del `parity` de la API, ofrece «Crear gemelo en EN/ES» y «Quitar» para ítems sin pareja, anuncia el recuento y muestra «coinciden» cuando no hay. [AC11]
- **T331** — Dado `PairedField` entonces cada campo tiene etiqueta visible e id único, atributo `lang` en cada columna, bloque común una sola vez, y apila las columnas por debajo de 900 px. [AC11, AC26]
- **T332** — Dado `ItemList` cuando se añade entonces el foco va al primer campo del nuevo; al quitar pide confirmación solo si el ítem tiene contenido o existía guardado y el foco va al vecino; subir/bajar tiene `aria-label` con el título, se deshabilita en los extremos, mantiene el foco y anuncia la posición. [AC11, AC26]
- **T333** — Dado el acordeón entonces usa `aria-expanded`, la cabecera muestra título, `id` y badge de errores, y los ítems con error se abren tras un guardado fallido. [AC12, AC26]

**Dashboard y servicios**
- **T334** — Dado el dashboard con la fake entonces cada tarjeta muestra versiones ES/EN, fecha es-ES, origen, insignia de paridad y enlaces. [AC10, AC23] [`app/admin/(panel)/page.test.tsx`]
- **T335** — Dado un tipo con versión 0 entonces «Sin publicar todavía» con CTA; dado un tipo que falla (500) entonces solo esa tarjeta muestra error con reintento. [AC10, AC23]
- **T336** — Dado la pantalla de servicios entonces pinta los pares, etiquetas, precio con «A consultar», estado vacío con «Añadir servicio» y el tope de 30 desactiva «Añadir». [AC11, AC23]
- **T337** — Dado precios `''`, `1500`, `1500.50`, `-1`, `1e3` y moneda en minúsculas entonces `null`/número/número/error/error y la moneda se pasa a mayúsculas al escribir. [AC12]
- **T338** — Dado `loading.tsx` y `error.tsx` entonces hay esqueleto con `role=status` y `aria-busy`; un GET 500 muestra el error en español con referencia y reintento, sin trazas. [AC23]
- **T339** — Dado el standalone cuando se edita un servicio por los handlers entonces `/servicios/` y `/en/services/` muestran el cambio al instante, sin rebuild. [AC13] [`tests/runtime/admin-content.test.ts`]
- **T340** — Dado un cambio concurrente en la fake cuando se guarda entonces 409 con `latest` y la web pública queda intacta. [AC14]
- **T341** — Dado el log tras guardar entonces hay `admin_content_save` y no aparecen títulos, resúmenes ni el comentario. [AC25]

### 13.5 Slug `web-admin-projects`
- **T342** — Dado el sample de proyectos cuando se aparejan entonces común = `id, relation, disclosure, client, startDate, endDate, images(key,width,height)`; por idioma `title, summary, role, clientLabel, stack, highlights, links, alt`; la ida y vuelta es idéntica. [AC11]
- **T343** — Dado un proyecto cuando pasa a `anonymous` entonces `client` se desactiva y vacía con texto explicativo y aviso; al volver a `public` sigue vacío. [AC16]
- **T344** — Dado `employer`+`public` sin cliente entonces `CLIENT_REQUIRED` en el campo; con `own`+`public` es opcional. [AC16]
- **T345** — Dado un proyecto no `own`+`public` entonces el bloque de imágenes está desactivado con la nota; si tenía imágenes y cambia de elegibilidad, avisa y bloquea el guardado hasta quitarlas, sin borrarlas solo. [AC16]
- **T346** — Dado `startDate`/`endDate` con `2024-13`, `abc`, fin anterior a inicio y fin sin inicio entonces `INVALID_DATE`; fin vacío = «en curso». [AC12]
- **T347** — Dado el editor de `stack` entonces añade con Enter/coma, quita con botón etiquetado, máx. 30×60, rechaza vacíos y «Copiar ES → EN» copia la lista. [AC12]
- **T348** — Dado `highlights` y `links` entonces añadir/quitar/mover, enlaces ≤10, `label` ≤80 y `url` solo https (un `http://` da `INVALID_URL`). [AC12]
- **T349** — Dado la pantalla entonces acordeón con la cabecera del §8, un proyecto nuevo con `employer`+`anonymous`, estado vacío y el tope de 50. [AC16, AC23]
- **T350** — Dado quitar un proyecto con imágenes entonces confirmación que avisa de que las imágenes siguen en el almacenamiento. [AC19]
- **T351** — Dado errores de servidor en `es.projects[1].links[0].url`, `en.projects[0].images` y `es.projects[1].client` entonces caen en el campo, el bloque de imágenes y el campo común respectivamente. [AC15]
- **T352** — Dado el standalone cuando se editan proyectos entonces `/` y `/en/` lo reflejan; un proyecto `anonymous` con `client` es rechazado por la fake y nunca aparece en el HTML público. [AC13, AC16] [`tests/runtime/admin-content.test.ts`]
- **T353** — Dado cada input de proyectos cuando se consulta por rol y nombre accesible entonces todos tienen nombre único. [AC26]

### 13.6 Slug `web-admin-architecture`
- **T354** — Dado el sample de arquitectura cuando se apareja entonces común = `id` de puerto y de adaptador + `status`; por idioma `core`, `name`, `description`, `note`; `description` `null` ≡ ausente; ida y vuelta idéntica. [AC11, AC17]
- **T355** — Dado el formulario entonces núcleo, puertos y adaptadores añaden/quitan/mueven, `status` ofrece los 3 valores con texto + `StatusShape` y `note` ≤200. [AC17, AC26]
- **T356** — Dado 20 puertos o 20 adaptadores entonces «Añadir» se desactiva con mensaje. [AC12, AC17]
- **T357** — Dado ids nuevos entonces salen del nombre y son únicos en su ámbito; los guardados son de solo lectura. [AC11]
- **T358** — Dado el borrador cuando cambia entonces la vista previa (`data-mode="profile"`) se actualiza con `buildHexModel`+`HexPlane`, con alternancia ES/EN y etiquetas del diccionario público. [AC17]
- **T359** — Dado puertos sin adaptadores, adaptadores sin nombre y más de 6 puertos entonces el formulario marca «no se dibuja»/«irá en lista» y un modelo vacío muestra un mensaje en la vista previa. [AC17]
- **T360** — Dado versión 0 o `core.name ''` entonces el editor arranca vacío y no permite publicar un núcleo sin nombre. [AC10, AC17]
- **T361** — Dado errores `es.ports[2].adapters[0].status` y `en.core` entonces caen en el `select` y en el núcleo EN. [AC15]
- **T362** — Dado un `status` distinto entre ES y EN en datos existentes entonces el panel de paridad lo señala y «Igualar EN a ES» lo corrige. [AC11]
- **T363** — Dado el standalone cuando se guarda el hexágono entonces `/` y `/en/` muestran el adaptador nuevo al instante. [AC13, AC17] [`tests/runtime/admin-content.test.ts`]
- **T364** — Dado la vista previa entonces el DOM no contiene los ids de puertos ni adaptadores. [AC17]
- **T365** — Dado la pantalla entonces tiene carga, error y vacío como el resto. [AC23]

### 13.7 Slug `web-admin-images`
**`lib/admin/images.test.ts` (unit)**
- **T366** — Dado cabeceras JPEG, PNG, GIF87a/89a y WebP (`RIFF…WEBP`) con cualquier nombre o MIME entonces se aceptan por bytes; SVG, HEIC, PDF, texto y un HTML renombrado `.jpg` se rechazan por tipo; vacío se rechaza; exactamente 5 MiB pasa y 5 MiB+1 no; solo lee los primeros 12 bytes. [AC18]
- **T367** — Dado `browser-client.uploadImage` entonces envía `FormData` con `file`, sin fijar `Content-Type`, es abortable y devuelve un resultado tipado. [AC18]

**Handlers `app/admin/api/images/**` (unit)**
- **T368** — Dado un PNG de 100 KB cuando se sube entonces la API recibe una sola parte `file` con los mismos bytes (sha256) y sin nombre ni cabeceras del cliente; 201 con `{key,url,contentType,bytes,width,height}`; el log trae `outcome` y `bytes`, sin nombre de archivo. [AC18, AC25]
- **T369** — Dado `Content-Length` > 5 MiB + 64 KiB entonces 413 `IMAGE_TOO_LARGE` sin leer el cuerpo y con 0 llamadas; sin `Content-Length` (chunked) que supera el tope entonces 413 y deja de leer; justo en el límite pasa. [AC18]
- **T370** — Dado no multipart, sin `file`, dos archivos, parte con otro nombre o archivo vacío entonces 400 `IMAGE_INVALID` con 0 llamadas; dado un archivo >5 MiB dentro del tope de cuerpo entonces 413 del propio handler. [AC18]
- **T371** — Dado 400/413/415/503 de la API entonces se reenvían con su código; 401 borra la cookie; caída 502; silencio 504 (a 30 s). [AC18]
- **T372** — Dado `Origin` ajeno o `Sec-Fetch-Site: cross-site` en la subida entonces 403; el multipart se acepta con `Origin` propio. [AC7]
- **T373** — Dado `GET images` entonces devuelve la lista parseada y pasa el 503 `IMAGE_STORAGE_UNAVAILABLE`. [AC19]
- **T374** — Dado `DELETE images/[id]` con `..%2f`, `abc` o id con mayúsculas inválidas entonces 400; con un UUID válido, 204→200, 409 `IMAGE_IN_USE` y 404 pasan; `admin_image_delete` registra el resultado. [AC19, AC25]
- **T375** — Dado `POST cleanup` con `{dryRun, olderThanHours}` entonces valida el cuerpo (entero ≥1; `dryRun` por defecto `true`), lo convierte en query hacia la API y no reenvía 0; el límite del cuerpo es 4 KB. [AC19]

**Componentes (jsdom)**
- **T376** — Dado `ImageUploader` entonces hay zona de arrastre y botón de archivo por teclado, selección múltiple en cola secuencial, estado por archivo y los rechazados se listan con motivo sin petición. [AC18, AC26]
- **T377** — Dado el arrastre de un archivo que no es imagen entonces se rechaza; el resalte de arrastre no depende solo del color. [AC18, AC26]
- **T378** — Dado una subida correcta entonces la imagen entra pendiente en el proyecto con `alt` vacío, el foco pasa al `alt` ES y se anuncia; si falla la vista previa, aparece el texto alternativo y se revoca el object URL. [AC18, AC20]
- **T379** — Dado `ProjectImagesBlock` entonces muestra miniatura, clave corta, tamaño, badge «Portada» en la primera, «Hacer portada», subir/bajar, quitar del proyecto y `alt` ES y EN obligatorios ≤200. [AC20]
- **T380** — Dado una `key` ausente del listado entonces fila con aviso «no encontrada»; dado el listado en 503 entonces aviso «almacenamiento no disponible» y el resto del editor funciona. [AC19, AC20]
- **T381** — Dado 10 imágenes entonces el selector se desactiva con mensaje. [AC20]
- **T382** — Dado la serialización entonces `key`, `width` y `height` salen idénticos en ES y EN y solo cambia el `alt`. [AC20]
- **T383** — Dado la galería entonces muestra miniatura, tamaño, fecha, «En uso / Sin usar» (texto+icono) y «En uso (versión antigua)» contrastando con los proyectos actuales. [AC19]
- **T384** — Dado borrar entonces confirmación; 409 explica el historial; 204 quita la fila, mueve el foco y anuncia; 404 la quita con nota; 503 con mensaje. [AC19]
- **T385** — Dado `CleanupPanel` entonces «Simular» muestra `wouldDelete` y `kept`; «Borrar N» solo se habilita tras una simulación vigente con N>0; cambiar las horas la invalida; confirmación; resultado con el recuento; N=0 → «No hay nada que limpiar». [AC19]
- **T386** — Dado la galería vacía, cargando y con 503 entonces cada estado se muestra (el 503 apunta al runbook). [AC23]
- **T387** — Dado 500 imágenes entonces las miniaturas llevan `loading="lazy"`, `decoding="async"`, dimensiones y `referrerpolicy="no-referrer"`. [AC26]

**Runtime (`tests/runtime/admin-images.test.ts`)**
- **T388** — Dado el standalone **con proxy** cuando se suben 100 KB y exactamente 5 MiB (con `Content-Length`) entonces la fake recibe los bytes completos (hash igual); con 5 MiB+1 y 6,5 MiB entonces 413; con 12 MiB (mayor que el buffer del proxy) entonces 413 sin colgarse. [AC18, AC28]
- **T389** — Dado una subida chunked sin `Content-Length` de 3 MiB entonces pasa; de 8 MiB, 413. [AC18]
- **T390** — Dado la fake con `storage:false` cuando se sube entonces 503 `IMAGE_STORAGE_UNAVAILABLE` y el guardado de contenido sigue funcionando. [AC18]
- **T391** — Dado el log tras subir entonces solo `bytes` y `outcome`, sin nombre ni contenido. [AC25]

### 13.8 Slug `web-admin-history`
- **T392** — Dado `/admin/history/[kind]/` entonces un `kind` inválido da 404; muestra el selector ES|EN y la lista (≤50) con número, fecha, origen, comentario escapado y «Activa» (texto+forma); «Ver» y «Restaurar» (desactivado en la activa). [AC21]
- **T393** — Dado una sola versión o ninguna entonces estado adecuado («Nunca publicado» incluido). [AC21, AC23]
- **T394** — Dado `?v=N` entonces muestra la instantánea de solo lectura con el resumen de cambios frente a la activa; un `v` inexistente da un 404 amable. [AC21]
- **T395** — Dado «Restaurar» entonces el diálogo indica «ES pasa de vX a vY (se conserva el historial)» y que EN no cambia; al confirmar envía `baseVersion` y `targetVersion`. [AC21]
- **T396** — Dado el handler `rollback` entonces valida `kind`, `lang` e enteros ≥1, descarta campos extra y no llama a la API con datos inválidos. [AC21] [`app/admin/api/content/[kind]/[lang]/rollback/route.test.ts`]
- **T397** — Dado un 409 entonces mensaje «la activa cambió (ahora es la N)» con «Recargar»; dado 404/422 entonces explica que no se puede restaurar y la versión sigue inactiva. [AC21]
- **T398** — Dado el éxito entonces la insignia «Activa» se mueve, se anuncia y se refresca la paridad con aviso (y enlace al editor) si queda rota. [AC21]
- **T399** — Dado `admin_rollback` entonces registra `kind`, `lang`, `outcome`, `from`, `to` y nada más. [AC25]
- **T400** — Dado el standalone cuando se restaura una versión anterior entonces la web pública vuelve al contenido anterior al instante. [AC21] [`tests/runtime/admin-history.test.ts`]
- **T401** — Dado un comentario largo y otro con `<script>` entonces el primero se trunca con `title` completo y el segundo se ve como texto. [AC21]

### 13.9 Slug `web-admin-messages`
- **T402** — Dado la pantalla con la fake entonces filas por fecha descendente con id, fecha (`<time dateTime>`), nombre, email y cuerpo. [AC22]
- **T403** — Dado nombre, email y cuerpo con `<script>` o `"><img onerror=…>` entonces se muestran como texto, sin elementos; los saltos de línea se conservan y las cadenas largas se parten. [AC22]
- **T404** — Dado un email válido entonces enlace `mailto:`; uno raro entonces texto plano. [AC22]
- **T405** — Dado `next` no nulo entonces enlace «Más antiguos» a `?before=<next>`; en la última página, sin enlace; con `before` no numérico, 0, negativo o enorme entonces se ignora y la API solo recibe enteros válidos; `limit` no lo controla el usuario. [AC22]
- **T406** — Dado cero mensajes, carga y fallo de la API entonces vacío, esqueleto y error con referencia. [AC22, AC23]
- **T407** — Dado que la API (fake) envía campos desconocidos como `ip_hash` entonces no aparecen en el DOM. [AC22]
- **T408** — Dado el log tras ver mensajes entonces `admin_messages_view` solo con `outcome` y `count`; los centinelas de nombre, email y cuerpo no aparecen. [AC25]
- **T409** — Dado la respuesta entonces `no-store` y noindex; la tabla/lista tiene encabezados accesibles y se lee apilada a 360 px. [AC8, AC26] [`tests/runtime/admin-messages.test.ts`]

### 13.10 Slug `web-admin-public-images` (web pública)
- **T410** — Dado `parseProject` con `images` ausente o `null` entonces `[]` (API anterior). [AC24] [`lib/api/validate-content.test.ts`]
- **T411** — Dado `images` válidas entonces se conservan en orden con `url, alt, width, height`; dado `url` no string, `alt` ausente o `width/height` no enteros positivos entonces el payload es inválido (500). [AC24]
- **T412** — Dado un proyecto `employer` o `anonymous` con `images` (API hostil) entonces el parser las descarta. [AC24]
- **T413** — Dado `coverOf` entonces devuelve `images[0]` solo con `own`+`public` y URL `https:` absoluta sin credenciales; `http:` plano, `javascript:`, relativa o lista vacía dan `undefined`, sin caer a la segunda imagen. *(Enmienda 2026-11-14, decidida por Julio en la review de `web-admin-public-images`: se exige `https:`; antes decía «http(s)».)* [AC24] [`lib/projects/images.test.ts`]
- **T414** — Dado `ProjectCard` y `ProjectFeatured` con portada entonces `<img src alt width height loading="lazy">`; el `alt` viene de la imagen y, si está vacío, del título; sin portada, bloque de malla. [AC24]
- **T415** — Dado `HomeView`/`Projects` entonces ya no existe la prop `projectImages` y los tests existentes se migran sin perder cobertura. [AC24]
- **T416** — Dado el standalone con proyectos `own`+`public` con imagen entonces el HTML contiene `<img>` con la URL pública y el `alt`; un `employer` con imágenes no deja `<img>` ni URL; con `images:[]`, malla; la API caída sigue dando 500. [AC24] [`tests/runtime/pages.test.ts`]
- **T417** — Dado el HTML público entonces no contiene la `key` interna de R2, solo la URL. [AC24]
- **T418** — Dado `next.config` entonces `images.unoptimized` sigue activo y no hace falta `remotePatterns`. [AC24]
- **T419** — Dado el repositorio entonces no queda lectura de `public/projects` ni referencias a `resolveProjectImages`. [AC24]

### 13.11 Slug `web-admin-regresion` (regresión y docs)
- **T420** — Dado un recorrido completo en el standalone (login → editar servicios → ver público → proyecto con imagen → ver público → restaurar → ver público → `logout-all` → 401) cuando se ejecuta entonces todo pasa. [AC13, AC21, AC24, AC28] [`tests/runtime/admin-e2e.test.ts`]
- **T421** — Dado `tests/runtime/proxy-ready.test.ts` entonces se elimina o se sustituye, y la documentación explica por qué. [AC28]
- **T422** — Dado `deploy-files.test.ts` y `docker-layout.test.ts` entonces el compose no añade variables a `cv-web`, el standalone no contiene `.env` y los archivos del panel están en él. [AC30]
- **T423** — Dado el HTML público entonces ningún `<script>` referencia chunks del panel y no hay cadenas `/admin` en el bundle público. [AC28]
- **T424** — Dado todos los eventos que emite el código entonces cada nombre aparece en `docs/web-standards.md`, que menciona `X-Client-IP` y la sección Admin. [AC30]
- **T425** — Dado el código y los fixtures entonces no hay secretos ni datos reales del CV; los fixtures son «Ada Ejemplo». [AC25, AC30]
- **T426** — Dado `.github/workflows/ci.yml` entonces el smoke añade `curl` a `/admin/login/` (200 + `X-Robots-Tag`) y `/admin/` (307). Docker no se ejecuta en local. [AC28]
- **T427** — Dado CHECKPOINTS C1 entonces `lint`, `typecheck`, `test` y `build` pasan y el listado de rutas muestra `ƒ` en el panel. [AC28]

## 14. Privacidad, seguridad, SEO y accesibilidad

- **Privacidad:** el panel no ofrece teléfono, documento ni fecha de nacimiento. El `client` de un proyecto anónimo no se puede escribir. Solo `own`+`public` admite imágenes. Los mensajes de contacto (datos personales) solo se pintan para la sesión válida, escapados y sin IP, y no entran en logs. Fixtures solo ficticios.
- **Seguridad:**
  - Token solo en cookie `httpOnly`. La API es la autoridad en cada llamada. CSRF por `Origin`/`Sec-Fetch-Site`, tipo de contenido y `SameSite=Strict`.
  - `X-Client-IP` solo con IP válida y sin `CF-*`; así el `AdminEdgeGuard` de la API no corta la llamada interna.
  - Subidas validadas dos veces (navegador y handler) sin pasar bytes sin validar.
  - `next` saneado contra open redirect. Cabeceras anti-iframe y `no-referrer`.
  - La regla WAF de Cloudflare para `/api/v1/admin/*` sigue siendo tarea del humano.
- **SEO:** el panel queda fuera de índices (cabecera, meta, `robots.txt`, sitemap). Ver el matiz del `Disallow` en Riesgos.
- **Accesibilidad:** el §8 y AC26 la fijan: teclado completo, foco gestionado, regiones vivas, etiquetas, AA solo con tokens (sin color nuevo), `prefers-reduced-motion` global, 360 px sin scroll horizontal.

## 15. Datos y resiliencia

- Si la API cae, la web **y el panel** muestran error con referencia (la web pública sigue la regla actual de 500; el panel usa su propio estado de error). Nunca datos viejos.
- El borrador nunca se pierde por 409, 401 o fallo de red (copia en `sessionStorage`).
- Los guardados no se reintentan y el conflicto de versión lo resuelve la API de forma atómica para los dos idiomas.
- El almacenamiento de imágenes caído (503) no bloquea la edición de contenido.
- Listas vacías, versión 0 y campos opcionales ausentes tienen su estado.
- La API falsa permite probar caídas, silencios, JSON roto, 409, 422, 429 y 503 sin la API real.

## 16. Verificaciones visuales (Chrome DevTools)

**Reconectar el MCP `chrome-devtools` es imprescindible para todas las de esta tabla.** Preparación: `nvm use 22`; `DESIGN_ADMIN_PASSWORD=<dev> npm run parity:api -- --port 4020`; `CV_API_URL=http://localhost:4020 npm run build && npm start`.

| # | Verificación | Requiere MCP |
|---|---|---|
| V1 | Login a 360 y 1280 px: foco visible, error y bloqueo 429 | Sí |
| V2 | Dashboard y shell a 360/768/1280 px, navegación móvil | Sí |
| V3 | Editor de servicios y proyectos: columnas ES/EN lado a lado ≥900 px y apiladas en móvil, barra de guardado fija | Sí |
| V4 | Acordeón, reordenación con teclado y anillo de foco | Sí |
| V5 | Banner de 409 y resumen de errores 422 (composición visual, no solo DOM) | Sí |
| V6 | Hexágono: vista previa del panel frente al plano de la web pública (`probe.mjs` y `diff`) | Sí |
| V7 | `<dialog>` nativo real (foco inicial, Esc, retorno de foco) | Sí |
| V8 | Subida real por selector de archivos y arrastre, y 5 MiB reales; progreso y miniaturas | Sí (`upload_file`) |
| V9 | Galería con muchas miniaturas, estados vacío, 503 y limpieza | Sí |
| V10 | Mensajes a 360 px con cuerpo largo | Sí |
| V11 | `prefers-reduced-motion` emulado, contraste AA y auditoría de accesibilidad | Sí |
| V12 | Consola sin errores de hidratación ni avisos; panel Application: atributos de la cookie sobre `http://localhost` | Sí |
| V13 | Esqueletos de `loading.tsx` con red limitada | Sí |

**Sin MCP (automatizado o por consola):** todas las aserciones de DOM/ARIA, cabeceras, cookies, HTML renderizado, logs y flujos del §13.

**Manuales del humano tras desplegar (no automatizables):** que el navegador conserva la cookie `Secure` tras el túnel real; que la auditoría de la API registra `X-Client-IP`; que la regla WAF bloquea `cv-api.floreslab.dev/api/v1/admin/*`; la prueba de R2 real del runbook.

## 17. Alternativas descartadas

1. **Server Actions para mutar.** Dependen de que el `Host` reenviado por el túnel coincida con `Origin`, tienen un límite de 1 MB por defecto y dejarían pasar peticiones sin `Origin` con solo un aviso. Los route handlers con comprobación explícita son más controlables y más fáciles de probar. (Decidido en la brief; aquí queda justificado con la documentación.)
2. **Maestro/detalle con ruta por proyecto.** El guardado de la API es de documento completo con un solo `baseVersions`.
3. **Editor JSON del hexágono.** Más rápido de escribir, pero sin validación guiada ni accesibilidad; los formularios con vista previa dan feedback inmediato.
4. **Pestañas ES/EN.** Obligan a recordar el otro idioma y multiplican la gestión de foco y ARIA; el par lado a lado evita la deriva ES/EN.
5. **Reenviar el stream del navegador a la API.** Evita buffer, pero pasa bytes sin validar y el proxy ya los copia.
6. **`Secure` según `X-Forwarded-Proto`.** Frágil tras el túnel; `SITE_URL` es determinista.
7. **Librería de formularios/validación (zod, react-hook-form).** Sin dependencias nuevas; el espejo del validador es corto y se contrasta con vectores.
8. **Panel en Server Actions + `useActionState` para todo el formulario.** Rechazado junto con el punto 1.

## 18. Slugs hijos recomendados (orden y dependencias)

1. **`web-admin-api-client`** (base de todo): `httpRequest` ampliado, `validIp` compartida, `lib/api/admin/*`, tipos regenerados, `admin-fake.mjs`, integración en `fake-api.ts` y `design-api.mjs`, vectores. T201–T239. *Sin dependencias.*
2. **`web-admin-auth`** (base + sesión): `next.config` (cabeceras), `robots`, `proxy.ts`, layout raíz, login, shell, handlers de sesión, CSRF, `handler.ts`, ajustes de contraseña, logs, diálogo. T240–T296. *Depende de 1.*
3. **`web-admin-content-core`**: modelo, validador, paths, diff, borradores, `EditorFrame`, 409/422, dashboard, servicios. T297–T341. *Depende de 2.*
4. **`web-admin-projects`**: editor de proyectos y reglas de privacidad (sin subir imágenes). T342–T353. *Depende de 3.*
5. **`web-admin-architecture`**: hexágono con vista previa. T354–T365. *Depende de 3; en paralelo con 4.*
6. **`web-admin-images`**: subida, bloque por proyecto, galería, borrado, limpieza. T366–T391. *Depende de 4.*
7. **`web-admin-history`**: versiones, instantánea, rollback. T392–T401. *Depende de 3.*
8. **`web-admin-messages`**: lista de solo lectura. T402–T409. *Depende de 2; en paralelo con 3–7.*
9. **`web-admin-public-images`**: tipos, parser, `coverOf`, componentes públicos. T410–T419. *Depende de 1 (esquema regenerado); puede ir en paralelo, pero se prueba de extremo a extremo con 6.*
10. **`web-admin-regresion`**: recorrido completo, retirada de T104, CI, docs. T420–T427 y las verificaciones visuales V1–V13. *Depende de todos.*

Orden de ejecución sugerido (un slug a la vez): 1 → 2 → 3 → 4 → 5 → 6 → 9 → 7 → 8 → 10.

## 19. Riesgos y dudas (recomendación en cada una)

1. **Cookie `Secure` tras el túnel (no verificado en producción).** Se deriva de `SITE_URL` https y no del esquema entrante; la prueba automatizada solo valida la cabecera `Set-Cookie`. *Recomendación:* verificación manual post-despliegue (§16).
2. **Subida de 5 MiB con `proxy.ts`.** Next bufferiza el cuerpo hasta 10 MB y **trunca en silencio** por encima. *Recomendación:* tope propio en el handler (`Content-Length` + conteo) y los tests T388/T389; no activar la opción experimental `proxyClientMaxBodySize`. Duda: si un cuerpo >10 MB hace que Next registre un aviso aun cuando el handler responde 413 (T388 solo exige 413 sin colgarse). Validar `request.formData()`/lectura limitada en el primer spike de `web-admin-images`.
   - **Resuelto en `web-admin-images` (2026-11-14, aprobado por Julio):** medido con cliente lento, con el proxy delante Next lee el cuerpo **entero** antes del handler (12 MiB → 413 a los 2,6 s, tras enviarse todo; también el 401 sin cookie) y por encima de 10 MB escribe `Request body exceeded 10MB…` (línea no JSON). Decisión: **el matcher de `proxy.ts` excluye `/admin/api/images` y subrutas** (`['/admin', '/admin/((?!api/images(?:/|$)).*)']`); el handler exige sesión, CSRF y `no-store`, y `next.config.ts` pone las cabeceras del panel. Con el cambio, el 413 llega con menos de 1 MiB enviado y no hay línea no JSON (T388/T389 lo comprueban). Esto modifica §6 («matcher `['/admin/:path*']`») y AC3.
3. **`SameSite=Strict` (decisión de la brief).** Un enlace externo (p. ej. un correo) a `/admin/...` no lleva cookie y envía al login aunque haya sesión. *Recomendación:* aceptarlo; es coherente con un panel de un solo usuario.
4. **Discrepancia con `api-admin/analysis.md` §4.2.** El `GET /admin/content/projects` real no trae `url` en `images[]`. *Recomendación:* el panel resuelve `key→url` con `GET /admin/images`. Confirmar contra la API desplegada antes del slug de imágenes; si cambiara, el ajuste es mínimo.
5. **Divergencia validador del cliente ↔ validador de la API.** Son dos implementaciones de la misma regla. *Recomendación:* los vectores compartidos (T229, T239) y mapear siempre los errores del servidor; el servidor sigue siendo la autoridad.
6. **La fake duplica reglas de la API.** Es su función (sustituta), pero puede derivar del servicio real. *Recomendación:* vectores comunes, copiar los `db/sample` ficticios como fixtures y usar la prueba manual del runbook contra la API real antes de cerrar.
7. **jsdom y `<dialog>`.** `showModal` no está completo en jsdom. *Recomendación:* stub en tests unitarios y verificación real en Chrome (V7); si el stub resulta frágil, reemplazar por un `role="alertdialog"` propio con trampa de foco.
8. **Sin color de error en el diseño v2.** *Recomendación:* el panel usa texto, icono, borde grueso y `aria-invalid` (sin tokens nuevos, BA-T8/BA-T10 intactos). Alternativa: añadir un token `--danger` con contraste AA comprobado; decide el humano.
9. **Idioma del panel solo en español.** La brief pide diccionarios para el texto visible de la web pública, no del panel. *Recomendación:* un solo archivo ES; internacionalizar solo si hace falta.
10. **`robots.txt` con `Disallow: /admin/` frente a `noindex`.** Un robot que no puede leer la página no ve el `noindex`. *Recomendación:* mantener ambos (nadie enlaza `/admin`, sin riesgo práctico) y validar con el humano si prefiere solo `noindex`.
11. **Bloqueo de 15 min por fuerza bruta** (R-4 de la API): cualquiera que llegue a `/admin/login` puede bloquear al administrador. *Recomendación:* regla de rate limit de Cloudflare sobre `/admin/api/login` (tarea del humano, opcional).
12. **Sesión de 8 h y «cerrar sesión» sin invalidar el token.** *Recomendación:* la nota en la pantalla y «Cerrar todas» como medida fuerte.
13. **Ids existentes de solo lectura.** Es una decisión de UX (los ids son estables); la API no lo exige. *Recomendación:* mantenerlo; revertir es un cambio trivial si estorba.
14. **Galería con muchas imágenes.** La API devuelve toda la lista sin paginar. *Recomendación:* miniaturas `lazy`; paginar en cliente solo si pasa de unas cientos.
15. **Hora de los mensajes.** Se formatea en el navegador para no asumir zona horaria. *Recomendación:* mantenerlo; si el humano prefiere una zona fija, se cambia en `LocalTime`.
16. **Node 20 activo en esta máquina.** Los tests de runtime y el build deben ejecutarse con `nvm use 22`.
17. **`chrome-devtools` desconectado.** No se pudo verificar nada visual; las verificaciones V1–V13 quedan pendientes de reconectarlo.
