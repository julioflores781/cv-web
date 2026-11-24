# Web Standards — cv-web

> Patrones y convenciones. `analyst`, `implementer` y `reviewer` la consultan.

## Stack
- **Next.js** (App Router) con `output: 'standalone'` (servidor Node pensado para un contenedor; páginas `force-dynamic`, `trailingSlash`, imágenes sin optimizar), **React**, **TypeScript estricto**.
- Estilos: **CSS Modules + variables CSS** con los tokens de `design/artifact-v2/project/Main.dc.html`. Sin librería de UI.
- Tests: **Vitest** + Testing Library. Lint: ESLint (config de Next). Las versiones exactas las fija el analyst tras comprobarlas.

## Datos
- Una sola puerta de entrada: `lib/api`. Hace `GET ${CV_API_URL}/api/v1/<recurso>?lang=<es|en>` (resume, services, projects, architecture) **en cada render**, nunca en el build (el build no toca la API).
- Los tipos salen del OpenAPI de la API (`/openapi.json`); no se escriben a mano.
- Sin caché ni respaldo: solo hay memo por petición (`React.cache`), para que `generateMetadata` y la página compartan la lectura. Si la API falla o responde algo inválido,
  la página da **500**; nunca se sirven datos viejos. (Una caché de contenido invalidable de la API queda para la fase 2.)
- Servicios, proyectos y arquitectura vacíos se muestran con un estado vacío (textos `empty.*` del diccionario), no desaparecen.
- Los componentes reciben props tipadas; no hacen `fetch` ni leen `process.env`. El único `process.env` está en `lib/api/config.ts` (`CV_API_URL`, `SITE_URL`), leído en cada llamada.
- Contacto: el navegador hace `POST /api/contact/` a su propio origen; `app/api/contact/route.ts` valida y reenvía a la API (`lib/api/contact.ts`). La URL interna de la API no llega al HTML.
- Salud: `GET /api/health/` responde 200 `{"status":"ok","api":"up"}` o 503 si la API no contesta (pensado para el healthcheck del contenedor).
- Portadas de proyectos: `Project.images[]` (`{url, alt, width, height}`, tipos generados del OpenAPI) lo valida `parseProject`; la portada es `images[0]` (`coverOf` en `lib/projects/images.ts`) solo si el proyecto es `own`+`public` y la URL es `https:` absoluta sin credenciales (decisión de Julio, 2026-11-14: una `http:` o cualquier otra se descarta, sin caer a la segunda imagen). Sin portada se pinta el bloque de malla. No se lee `public/projects/`.

## i18n
Español en `/`, inglés en `/en`. Diccionarios en `lib/i18n`. Las dos rutas comparten componentes. `hreflang` y `lang` correctos.
- Rutas (`lib/i18n/routes.ts`, única tabla): Servicios es la portada, `/` (ES) y `/en/` (EN); el Perfil vive en `/perfil/` (ES) y `/en/profile/` (EN). Cualquier otra ruta es 404 sin llamar a la API.
- `/servicios/` y `/en/services/` (las URLs viejas de Servicios) redirigen **308** (`permanent: true` en `next.config.ts`) a `/` y `/en/`, con `Location` relativa y conservando la query; van antes que las páginas, así que no leen la API. Las dos reglas llevan barra final en `source` y `destination` (por `trailingSlash`): sin barra, `/servicios` llega en dos saltos 308.

## Diseño y accesibilidad
Tokens por variables CSS. Contraste AA, foco visible, `prefers-reduced-motion`, un solo `h1` por página, landmarks, HTML semántico,
mobile-first (probar a 360 px y a escritorio).

## SEO
`title`, `description`, Open Graph, `hreflang`, canonical y JSON-LD `Person` por idioma; `sitemap.xml` y `robots.txt`.
Todas esas URLs salen de `SITE_URL` (por defecto `https://floreslab.dev`), leído en runtime: `app/sitemap.ts` y `app/robots.ts` son `force-dynamic` (salen `ƒ` en la tabla de rutas del build). No hay redirección entre hosts.
- El sitemap lista exactamente `/`, `/perfil/`, `/en/` y `/en/profile/`, cada una con los alternates de su pareja; hreflang con `x-default` en español (`/` para Servicios, `/perfil/` para el Perfil). El JSON-LD `Person.url` apunta al Perfil del idioma.
- Las únicas redirecciones de ruta son las dos 308 de i18n (`/servicios/` → `/`, `/en/services/` → `/en/`); las URLs viejas no están en el sitemap.

## Seguridad y privacidad
Sin teléfono, documento ni fecha de nacimiento. Sin secretos en el repo; `CV_API_URL` es pública. Enlaces externos con `rel="noopener noreferrer"`. Panel: ver «Admin» (cookie `httpOnly`, CSRF, `X-Client-IP` sin `CF-*`, noindex).

## Testing
Unitarios para `lib/`, de componente para UI (con fixtures ficticios «Ada Ejemplo») y pruebas de runtime (`tests/runtime`) que levantan el servidor standalone contra una API falsa e inspeccionan el HTML
(privacidad, SEO, idiomas, dominio). Las del panel (`tests/runtime/admin-*.test.ts`) usan la API falsa con el contrato admin (`scripts/parity/admin-fake.mjs`, vía `startFakeApi({ admin })`); `admin-e2e.test.ts` recorre login → guardar → web pública → imagen → restaurar → `logout-all`. Cada criterio de aceptación tiene al menos un test.
- **Retirado `tests/runtime/proxy-ready.test.ts` (T104)** en `web-admin-regresion`: construía una copia temporal con un `proxy.ts` y una ruta de prueba para demostrar que cabían en el standalone sin alterar las páginas públicas. Con el proxy y el panel reales en el repo, esa sonda dejó de aportar (y costaba un segundo `next build`): lo cubren `proxy.test.ts`, T280/T281/T283 (`admin-gate.test.ts`: `ƒ Proxy`, páginas públicas sin cookie ni cabeceras del panel) y T423/T427 (`admin-regression.test.ts`: ningún chunk ni cadena del panel en las páginas públicas; rutas del panel `ƒ`).

## PDF del CV
- `lib/pdf/` (`@react-pdf/renderer@4.9.0`, JS puro): `files.ts` (nombres/ruta, única fuente), `fonts.ts` (`.woff` de `@fontsource/*@5.3.0`, sin copias), `theme.ts` (= tokens «obra» de `globals.css`, con test), `cv-document.tsx` (A4, una columna, ATS), `build-cv-pdf.ts` (`getCvPdf`, memo en memoria por contenido), `response.ts`.
- Rutas `app/cv-julio-flores-{es,en}.pdf/route.ts`. Rutas dinámicas: cada petición consulta la API (`getResume`; si falla, 5xx aunque haya PDF en memoria). Caché en memoria acotada con clave por contenido (`lang + hash del CV`), `ETag` y `Cache-Control: no-cache`. Si el render falla: `null` + un WARN `pdf_render_failed` (`lib/log.ts`), la ruta responde 404 y el botón se omite.
- Solo email + LinkedIn + GitHub (`lib/contact-links.ts`). El botón vive en la sección de arquitectura del Perfil (`#architecture`) y solo si hay PDF. Los PDF no van en el sitemap.
- Gotcha: el PDF no usa IBM Plex Mono: el `.woff` de fontsource tiene el glifo de espacio roto para fontkit (falla al medir). Solo Barlow Condensed 700 e IBM Plex Sans 400/600.

## Paridad visual
Herramientas en `scripts/parity/` (solo desarrollo; no se publican). Referencia: `design/artifact-v2/project/Main.dc.html`.
- `npm run parity:reference` renderiza el artifact a HTML estático en `design/artifact-v2/.rendered/` (`perfil`, `servicios` y variantes con otro `sel`/`picks`), con las mismas fuentes (`app/fonts/*.woff2`) y fondos (`public/hex-grid-*.svg`) que la web.
- `node scripts/parity/serve.mjs --port 4010` sirve ese render, `public/` y `app/fonts/` (fuentes en `/app/fonts/<archivo>`).
- `npm run parity:api -- --port 4020` levanta la API falsa «datos del diseño» (`design-data.json`); construir la web con `CV_API_URL=http://localhost:4020`.
- `scripts/parity/spec.mjs` es la tabla única de métricas (§2.10.1 del plan). Los selectores `web` son `[data-probe="<clave>"]`: los componentes exponen ese atributo en el elemento medido.
- `node scripts/parity/probe.mjs <ref|web> <perfil|servicios>` imprime la función para `evaluate_script` de Chrome DevTools; devuelve `getComputedStyle` + `getBoundingClientRect` por clave.
- `npm run parity:diff -- a.png b.png` compara dos capturas por bandas de 400 px (umbral 3 %; código de salida 1 si alguna lo supera).
- Los datos de `design-data.json` son el copy del diseño: nunca se mezclan con los fixtures «Ada Ejemplo» de los tests ni se publican.

## Logs
- **Única salida:** `lib/log.ts` (`logEvent(level, event, fields)`); `console.*` está prohibido en el resto (lo vigila `tests/log-gate.test.ts` y `no-console`). Una línea JSON por evento: `timestamp`, `level`, `service:"cv-web"`, `event` y campos primitivos; INFO por stdout, WARN/ERROR por stderr. Nunca lanza.
- **Privacidad:** lista negra de claves (`password`, `token`, `authorization`, `cookie`, `email`, `message`, `name`, `ip`, `body`, `website`, comparadas normalizadas), un `Error` se registra solo como su clase, valores saneados (sin saltos de línea, máx. 200 caracteres). Nunca IP, cabeceras, query, cuerpos ni datos del formulario.
- **`X-Request-Id`:** `lib/request-id.ts` (32 hex). `requestJson` genera un id por llamada a la API, lo envía en `X-Request-Id` y lo reutiliza en los reintentos; `POST /api/contact` devuelve el suyo en la respuesta.
- **Eventos de la web pública:** `api_call` (WARN por intento fallido; el éxito es silencio), `contact`, `health` (solo degradado), `render_error` (`instrumentation.ts`, `onRequestError`; también para el panel) y `pdf_render_failed`.
- **Eventos del panel** (todos con `request_id`; campos en «Admin»): `admin_login`, `admin_logout`, `admin_logout_all`, `admin_password_change`, `admin_session_expired`, `admin_content_save`, `admin_rollback`, `admin_image_upload`, `admin_image_delete`, `admin_image_cleanup`, `admin_messages_view`, `admin_api_call` y `admin_internal`. `tests/source.test.ts` (T424) exige que cada evento que emite el código figure aquí.
- No hay línea por visita: `proxy.ts` no escribe logs.
- **Despliegue:** el compose rota los logs de Docker (`json-file`, `max-size: "10m"`, `max-file: "5"`; `tests/deploy/deploy-files.test.ts`). Guía de lectura y búsqueda: `docs/observability.md` del repo `cv`.

## Docker y despliegue
- `Dockerfile` (Node 22 alpine, multi-stage): `deps` (`npm ci`) → `build` (`npm run build`, sin API) → `runtime` con `.next/standalone`, `.next/static` y `public`, usuario no root `app`,
  `HOSTNAME=0.0.0.0`, `PORT=3000`, `HEALTHCHECK` contra `/api/health/` (con barra por `trailingSlash`) y `CMD ["node","server.js"]` en forma exec (SIGTERM llega a node). `.dockerignore` deja fuera `node_modules`, `.next`, `.env*`, `progress` y `design`.
- Construir: `docker build -t cv-web .`; ejecutar: `docker run --rm -p 3000:3000 -e CV_API_URL=<api> -e SITE_URL=<origen> cv-web`. Variables de runtime: `CV_API_URL` y `SITE_URL`; no hay secretos propios de la web. El panel `/admin` va en la misma imagen y no añade variables (T422).
- NAS: `deploy/docker-compose.yml` (único; `cv-db` + `cv-api` + `cv-web`, sin `.env`, valores `CAMBIA-…`, sin `ports`, redes `default` y `padelhub`). El túnel de Cloudflare apunta `floreslab.dev` → `http://cv-web:3000`.
- CI: el job `docker` (`needs: test`, solo en `push`) construye amd64, hace un smoke con la API falsa de `scripts/parity/design-api.mjs` (incluye `curl` a `/admin/login/` → 200 con `X-Robots-Tag: noindex, nofollow` y a `/admin/` sin sesión → 307; T426) y publica amd64+arm64; los secretos solo vía `secrets.*`.

## Admin
Panel `/admin` de un único administrador (solo contraseña), solo en español (`lib/admin/messages.ts`), modo visual «obra» (`data-mode="services"`). Plan y decisiones: `progress/web-admin/` (`brief.md`, `analysis.md`).

**Rutas.** Páginas (`app/admin/`, root layout propio con `<html lang="es">` y `robots: noindex`): `login/`, y en el grupo `(panel)` el dashboard `/admin/`, `services/`, `projects/`, `architecture/`, `images/`, `history/{services,projects,architecture}/?lang=&v=`, `messages/?before=` y `settings/`; `[...rest]` y `not-found.tsx` dan el 404 del panel. Handlers (`app/admin/api/`): `login`, `logout`, `logout-all`, `password`, `content/[kind]` (GET/PUT), `content/[kind]/[lang]/rollback`, `images` (GET/POST), `images/[id]` (DELETE), `images/cleanup`. Todas `ƒ`.

**Flujo de datos.** El navegador solo habla con su origen: las páginas son Server Components que leen la API en el servidor (`lib/api/admin`, `pageContext`) y las mutaciones van por route handlers (`lib/admin/handler.ts`, `lib/admin/browser-client.ts` es el único `fetch(` del navegador; URLs con barra final). No hay Server Actions. El token nunca llega al HTML, al JS ni a los logs.

**Sesión y `proxy.ts`.**
- Cookie `cv_admin_token` (el nombre solo en `lib/admin/session.ts`): `httpOnly`, `SameSite=Strict`, `Path=/admin`, `Max-Age` = caducidad del JWT; `Secure` si `SITE_URL` es `https:` (no se mira el esquema de la petición: tras el túnel, cloudflared → `cv-web` va por HTTP). Se borra con los mismos atributos y `maxAge: 0`.
- `proxy.ts` (único; matcher `['/admin', '/admin/((?!api/images(?:/|$)).*)']`) solo mira si la cookie está: sin ella, las páginas van a `/admin/login/?next=<ruta>` y los handlers dan 401 `ADMIN_UNAUTHORIZED`; con ella, el login redirige a `/admin/` salvo `?expired=1`, donde borra la cookie muerta. Las páginas solo aceptan GET/HEAD (otro método → 405 `Allow: GET, HEAD`). A las páginas que deja pasar les pasa su ruta en la cabecera interna `x-admin-path` (siempre sobrescrita), para que el layout mande una sesión caducada a `login?expired=1&next=<ruta>` (validada otra vez con `safeNext`).
- **`/admin/api/images` queda fuera del matcher** (decisión de Julio, 2026-11-14): con el proxy delante, Next leía el cuerpo entero de la subida antes del handler (el 413 llegaba al terminar de enviar y, por encima de 10 MB, escribía una línea no JSON). Esos handlers exigen la sesión ellos mismos (401 sin cookie), comprueban CSRF y responden `no-store`; las cabeceras del panel salen de `next.config.ts`.
- La autoridad es la API: el layout `(panel)` llama a `GET /auth/session` en cada entrada; un 401 en layout, página o handler borra la cookie y lleva al login con `expired=1` (y `next`). «Cerrar sesión» solo borra la cookie (el token vale hasta caducar, 8 h); «Cerrar todas» llama a `logout-all`.
- `next` saneado (`lib/admin/next-path.ts`): solo `/admin…`, sin `//`, `\`, esquemas, `..` ni sus codificaciones; si no, `/admin/`.

**CSRF y cabeceras.** Todo handler que muta exige `Origin` de un host permitido (`SITE_URL`, `Host` o `X-Forwarded-Host`; sin `Origin` solo `Sec-Fetch-Site: same-origin`), rechaza `Sec-Fetch-Site` `cross-site`/`same-site` y exige `Content-Type: application/json` (la subida, multipart): 403 `ADMIN_CSRF` / 415 `ADMIN_UNSUPPORTED_MEDIA` sin llamar a la API. `next.config.ts` pone en `/admin/:path*` `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store`, `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `Referrer-Policy: no-referrer` y `X-Content-Type-Options: nosniff`. `robots.txt` lleva `Disallow: /admin/` y el sitemap no tiene URLs del panel.

**Llamadas a la API (`lib/api/admin`).** Lista blanca de cabeceras: `Authorization: Bearer`, `Accept`, `Content-Type` (con cuerpo), `X-Request-Id` (generado o propagado) y **`X-Client-IP`** con la IP del navegador tomada de `CF-Connecting-IP` de la petición entrante, solo si es una IP válida (`lib/api/client-ip.ts`). **Nunca se reenvían cabeceras `CF-*`**: el `AdminEdgeGuard` de la API responde 404 a toda petición admin con `CF-Ray`/`CF-Connecting-IP` (`CV_ADMIN_EDGE_BLOCK=true` en producción). Resultado tipado que nunca lanza (`ok | problem | unreachable | timeout | invalid`), sin URL ni cuerpo en los errores. Reintento único solo en GET; las mutaciones nunca se reintentan. Timeouts: 4 s lecturas, 10 s guardados, 30 s subida. Los textos al usuario salen del `code` (`lib/admin/messages.ts`), nunca del `detail` de la API; cada error muestra el `requestId` como «Referencia».

**Edición.** Pares ES/EN en la misma pantalla (lado a lado ≥900 px, apilados en móvil), común editado una vez; un acordeón por tipo y una barra de guardado (documento completo con `baseVersions`, comentario ≤200, tope de 96 KB). Validador espejo de la API (`lib/admin/content/validate.ts`, contrastado con `tests/fixtures/admin-validation-vectors.json`). 409 → banner con diff, «Guardar encima» o «Descartar», sin perder el borrador (`sessionStorage`); 422 → error en su campo por `path` y resumen enfocable. Las marcas del servidor sobre filas de listas internas (logros, enlaces, imágenes, adaptadores) se quitan al reordenar o quitar filas, porque la API las sitúa por posición. Imágenes solo en proyectos `own`+`public` (subida ≤5 MiB, comprobada en navegador y handler); un proyecto `anonymous` no admite cliente.

**Eventos de log del panel** (por `lib/log.ts`; nunca contraseñas, tokens, nombres de archivo, comentarios, títulos, datos de mensajes ni IP):
- `admin_login` (`outcome`: ok|invalid|locked|rate_limited|unavailable, `status`), `admin_logout` (`status`), `admin_logout_all` (`outcome`, `status`), `admin_password_change` (`outcome`, `status`), `admin_session_expired` (layout, 401 de `GET /auth/session`).
- `admin_content_save` (`kind`, `outcome`, `status`, `es_version`, `en_version`, `error_count`), `admin_rollback` (`kind`, `lang`, `outcome`, `from`, `to`).
- `admin_image_upload` (`outcome`, `status`, `bytes`, `content_type`), `admin_image_delete` (`outcome`, `status`), `admin_image_cleanup` (`outcome`, `status`, `dry_run`, `count`).
- `admin_messages_view` (`outcome`: ok|expired|unavailable, `count`; nunca nombre, email ni cuerpo).
- `admin_api_call` (WARN por fallo de transporte, 5xx o timeout: `operation`, `outcome`, `status`, `attempt`, `duration_ms`) y `admin_internal` (ERROR, excepción inesperada en un handler: solo la clase del error).

**Pruebas sin la API real.** `scripts/parity/admin-fake.mjs` implementa el contrato (sesión, bloqueo, contenido versionado, imágenes, mensajes, réplica del `AdminEdgeGuard`, inyección de fallos). Para verlo en el navegador: `DESIGN_ADMIN_PASSWORD=<dev> npm run parity:api -- --port 4020` y la web con `CV_API_URL=http://localhost:4020` (sin esa variable, `/api/v1/admin/*` da 404, como una API con el admin deshabilitado).

**Pendiente de confirmar con la API real** (deducido del código de la API, no ejecutado contra ella; comprobarlo con el runbook de `cv`, `docs/admin-runbook.md`, tras desplegar):
- Los 404 que la fake da a parámetros no enteros (`limit` y `{version}` del historial, `olderThanHours=abc` de la limpieza), deducidos de JAX-RS (`@QueryParam int` / `@PathParam int` no convertibles → `NotFoundException`).
- `dryRun` no booleano en `POST /images/cleanup`: Java lo convierte a `false`; la web solo envía booleanos y la fake responde 400. Endurecerlo es tarea del repo `cv`.
- Manuales del humano: la cookie `Secure` tras el túnel real, que la auditoría de la API registra `X-Client-IP`, la regla WAF sobre `cv-api.floreslab.dev/api/v1/admin/*` y la prueba de R2 real.
