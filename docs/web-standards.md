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

## i18n
Español en `/`, inglés en `/en`. Diccionarios en `lib/i18n`. Las dos rutas comparten componentes. `hreflang` y `lang` correctos.

## Diseño y accesibilidad
Tokens por variables CSS. Contraste AA, foco visible, `prefers-reduced-motion`, un solo `h1` por página, landmarks, HTML semántico,
mobile-first (probar a 360 px y a escritorio).

## SEO
`title`, `description`, Open Graph, `hreflang`, canonical y JSON-LD `Person` por idioma; `sitemap.xml` y `robots.txt`.
Todas esas URLs salen de `SITE_URL` (por defecto `https://floreslab.dev`), leído en runtime: `app/sitemap.ts` y `app/robots.ts` son `force-dynamic` (salen `ƒ` en la tabla de rutas del build). No hay redirección entre hosts.

## Seguridad y privacidad
Sin teléfono, documento ni fecha de nacimiento. Sin secretos en el repo; `CV_API_URL` es pública. Enlaces externos con `rel="noopener noreferrer"`.

## Testing
Unitarios para `lib/`, de componente para UI (con fixtures ficticios «Ada Ejemplo») y pruebas de runtime (`tests/runtime`) que levantan el servidor standalone contra una API falsa e inspeccionan el HTML
(privacidad, SEO, idiomas, dominio). `tests/runtime/proxy-ready.test.ts` (lento) demuestra, en una copia temporal, que un `proxy.ts` con `matcher ['/admin/:path*']` y un `POST` que escribe una cookie `httpOnly` caben en el standalone sin alterar las páginas públicas (preparación de la fase 3, admin). Cada criterio de aceptación tiene al menos un test.

## PDF del CV
- `lib/pdf/` (`@react-pdf/renderer@4.9.0`, JS puro): `files.ts` (nombres/ruta, única fuente), `fonts.ts` (`.woff` de `@fontsource/*@5.3.0`, sin copias), `theme.ts` (= tokens «obra» de `globals.css`, con test), `cv-document.tsx` (A4, una columna, ATS), `build-cv-pdf.ts` (`getCvPdf`, memo en memoria por contenido), `response.ts`.
- Rutas `app/cv-julio-flores-{es,en}.pdf/route.ts`. Rutas dinámicas: cada petición consulta la API (`getResume`; si falla, 5xx aunque haya PDF en memoria). Caché en memoria acotada con clave por contenido (`lang + hash del CV`), `ETag` y `Cache-Control: no-cache`. Si el render falla: `null` + un WARN `pdf_render_failed` (`lib/log.ts`), la ruta responde 404 y el botón se omite.
- Solo email + LinkedIn + GitHub (`lib/contact-links.ts`). El botón vive en «02 / arquitectura» del Perfil y solo si hay PDF. Los PDF no van en el sitemap.
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
- **Eventos:** `api_call` (WARN por intento fallido; el éxito es silencio), `contact`, `health` (solo degradado), `render_error` (`instrumentation.ts`, `onRequestError`) y `pdf_render_failed`. No hay línea por visita (no se usa `proxy.ts`).
- **Despliegue:** el compose rota los logs de Docker (`json-file`, `max-size: "10m"`, `max-file: "5"`; `tests/deploy/deploy-files.test.ts`). Guía de lectura y búsqueda: `docs/observability.md` del repo `cv`.

## Docker y despliegue
- `Dockerfile` (Node 22 alpine, multi-stage): `deps` (`npm ci`) → `build` (`npm run build`, sin API) → `runtime` con `.next/standalone`, `.next/static` y `public`, usuario no root `app`,
  `HOSTNAME=0.0.0.0`, `PORT=3000`, `HEALTHCHECK` contra `/api/health/` (con barra por `trailingSlash`) y `CMD ["node","server.js"]` en forma exec (SIGTERM llega a node). `.dockerignore` deja fuera `node_modules`, `.next`, `.env*`, `progress` y `design`.
- Construir: `docker build -t cv-web .`; ejecutar: `docker run --rm -p 3000:3000 -e CV_API_URL=<api> -e SITE_URL=<origen> cv-web`. Variables de runtime: `CV_API_URL` y `SITE_URL`; no hay secretos propios de la web.
- NAS: `deploy/docker-compose.yml` (único; `cv-db` + `cv-api` + `cv-web`, sin `.env`, valores `CAMBIA-…`, sin `ports`, redes `default` y `padelhub`). El túnel de Cloudflare apunta `floreslab.dev` → `http://cv-web:3000`.
- CI: el job `docker` (`needs: test`, solo en `push`) construye amd64, hace un smoke con la API falsa de `scripts/parity/design-api.mjs` y publica amd64+arm64; los secretos solo vía `secrets.*`.
