# Analysis — web-runtime (fase 1: servidor Next en el NAS), v2 con las decisiones del humano

Solo plan: no se ha tocado código de la web ni tests. El `Write` de `progress/web-runtime/analysis.md` fue rechazado por el entorno («Subagents should return findings as text»), así que se devuelve completo como texto para que lo guardes. Esta v2 incorpora R1–R5, R12 y R13 del humano:
- **R1:** sin caché de datos entre peticiones. Una API caída da 500.
- **R2:** estados vacíos por sección.
- **R3:** se mantiene `trailingSlash`.
- **R4:** sin redirección de `cv.floreslab.dev`.
- **R5:** un solo compose.
- **R12:** los 6 slugs `web-redesign-*` se cierran y suben a GitHub (repo público) antes de empezar. Se añade el slug `web-runtime-ci`.
- **R13:** valores aceptados, salvo lo que desaparece con la caché.

## 0. Lo verificado (2026-11-11)

**Versiones:** `next@16.4.5`, `react@19.3.1`, Node 22 (`.nvmrc`). Documentación leída en `node_modules/next/dist/docs/01-app/`: `output.md`, `revalidateTag.md`, `unstable_cache.md`, `fetch.md`, `route.md`, `proxy.md`, `caching-without-cache-components.md`, `self-hosting.md`.

**Experimento** (proyecto desechable en el scratchpad, copia de `node_modules` del repo, `output:'standalone'`, API falsa con contador). Se resume lo que sigue vigente tras R1:

| # | Comprobado | Resultado |
|---|---|---|
| V1 | `next build` con una página `force-dynamic` | El build **no llama a la API** (contador 0). Rutas `ƒ`. Genera `.next/standalone/server.js`. |
| V5 | Con `unstable_cache`, API a 503 tras cachear y TTL vencido | Next **sigue sirviendo el dato viejo** (200). Es la razón de que el humano descarte la caché (R1). |
| V6 | Arranque en frío con API caída | La página da **500** (no 200 vacío). `/api/health` aislado sigue 200. Con R1 este es el comportamiento en **toda** petición. |
| V7 | Servidor standalone | Lee `HOSTNAME` y `PORT`. Docker inyecta `HOSTNAME`=id del contenedor, así que hay que fijar `HOSTNAME=0.0.0.0`. No copia `public/` ni `.next/static`. Sin caché de datos ya no hay nada que persistir; Next sigue escribiendo `.next/cache` (imágenes/compilación) y hay que dejarlo escribible. |
| V8 | `trailingSlash:true` con route handlers | `/api/x` → **308** a `/api/x/` (también `POST`). Archivos con extensión: `/cv-x.pdf` → 200, y con barra → 308 a sin barra. R3 mantiene `trailingSlash`, así que los llamadores usan barra final. |
| V9 | `proxy.ts` con `matcher` acotado bajo standalone | Funciona. Los route handlers reciben `CF-Connecting-IP`. |
| V10 | Fuentes por `process.cwd()/node_modules/@fontsource` | El trazado las incluyó en el caso simple. El caso real lo demuestra el test del PDF (T59). |
| V11 | Docs `route.md` | Los `GET` son dinámicos por defecto desde Next 15. Hay que quitar `force-static` del PDF, `robots` y `sitemap` (si no, hornean `process.env`). |
| V13 | Sin `unstable_cache` ni `fetch` de Next | `lib/api/request.ts` usa `node:http`, así que **no hay caché de datos de Next**. Con `force-dynamic` cada petición re-lee la API. |

**API del repo `cv` (comprobado en el código):**
- Lecturas `GET /api/v1/{resume,services,projects,architecture}?lang=`.
- Contacto `POST /api/v1/contact/messages?lang=`; el remitente se identifica por **`CF-Connecting-IP`** (`ContactMessagesResource.java:33,119-126`).
- Salud `GET /q/health/ready`.
- **La API tiene su propia caché en memoria**: `cv.resume.cache-ttl=PT5M` y `cv.content.cache-ttl=PT5M` (`application.properties:28,42`). Un CV no encontrado se recuerda 10 s. **Si la base de datos falla al refrescar, la API sigue sirviendo lo último leído** (`ARCHITECTURE.md:84`, `PostgresSiteContentRepository.java:27`).
- Consecuencia anotada para la **fase 2**: al guardar, el admin debe **invalidar la caché de contenido de la API** (`cv.content.cache-ttl`, 5 min; y la del CV, `cv.resume.cache-ttl`). La web, sin caché propia, lo verá al instante en cuanto la API lo sirva.

**Estilo del repo `cv`:**
- **Compose:** comentarios en español, pegable sin `.env`, valores `CAMBIA`, `container_name`, `restart: unless-stopped`, `healthcheck` con `start_period`, `depends_on … service_healthy`, sin `ports` (comentado), red externa `padelhub_default`; `cv-db` no se une a ella.
- **Dockerfile:** cabecera con comandos locales, usuario `app` no root, `EXPOSE`, `ENTRYPOINT` en forma exec.
- **CI:**
  - Disparadores: `push main`, tags `v*` y `pull_request`.
  - `concurrency` que solo cancela en PR; `permissions: contents: read`.
  - Job `test`, y luego job `docker` (`needs: test`, solo en `push`) con:
    - comprobación de secretos `DOCKERHUB_USERNAME/TOKEN`;
    - `setup-qemu@v4`, `setup-buildx@v4`, `login@v4`, `metadata-action@v6` (`latest`, `sha`, `semver`);
    - build amd64 con `load:true` + smoke test del contenedor;
    - publicación `linux/amd64,linux/arm64` con `cache-from: type=gha`;
    - resumen en `$GITHUB_STEP_SUMMARY`.
  - `actions/checkout@v7`.
- **cv-web no tiene** `.github/`, `Dockerfile` ni `deploy/`.

**Código actual de cv-web (relevante):**
- `lib/api`:
  - `request.ts` (`node:http`, 2 reintentos, 10 s).
  - `content.ts`: API → escribe respaldo → lee respaldo, con memo por proceso.
  - `cache.ts`; `config.ts` con `cacheDir`, `CV_CACHE_DIR` y `SITE_URL` por defecto `cv.floreslab.dev`.
  - Resultados con `source`; `ContentUnavailableError`.
- `page.tsx` con `generateStaticParams`; pasa `apiUrl` hasta `ContactForm`, que hace fetch CORS desde el navegador.
- `components/home-view.tsx`:
  - `hasServices = !isProfile && services.length>0`, `hasProjects`, y `plane` nulo sin puertos.
  - Omite secciones y enlaces de nav, y la numeración «sigue las secciones renderizadas».
  - `projects.tsx` hace `return null` sin proyecto destacado.
  - `EngagementProvider` solo si hay servicios.
- `robots`/`sitemap` con `force-static`; PDF con `force-static` y memo por idioma.
- `tests/build/build.test.ts` (export, lee `out/`) y `tests/source.test.ts` (CO-T70/71/72).
- Se reutilizan los helpers y fixtures («Ada Ejemplo» + centinelas).

## 1. Objetivo

Servidor Next standalone en el contenedor `cv-web` (junto a `cv-api` y `cv-db`), publicado por el túnel en `floreslab.dev` → `http://cv-web:3000`. **Cada render lee la API por la red interna** (`http://cv-api:8080`) con memo solo por petición (`React.cache`) y **sin ninguna caché entre peticiones**.
- El build no toca API ni BD. Sin respaldo ni datos en el repo.
- API caída o recurso inválido → **500**; nunca datos viejos.
- Con servicios/proyectos/arquitectura vacíos, las secciones **se muestran con estado vacío** (R2).
- El navegador solo habla con su origen (contacto por route handler).
- `GET /api/health` (comprueba también la API), `HEALTHCHECK` y `depends_on: service_healthy`.
- PDF dinámico con caché **en memoria, acotada y con clave por contenido**.
- Dominio `https://floreslab.dev`; **nada referencia `cv.floreslab.dev`** (sin redirección).
- Dockerfile multi-arch, CI que publica `julioflores781/cv-web` y un único compose para el NAS.
- No bloquear la fase 3.
- Repo **público**: nada de secretos ni datos reales en tests, fixtures, docs ni compose.

## 2. Diseño

### 2.1 Datos sin caché
- Páginas `export const dynamic = 'force-dynamic'`, sin `generateStaticParams`. Se mantiene `resolveRoute() ?? notFound()`.
- `lib/api/content.ts` pasa a una función `getContent(resource, lang)` que hace `requestJson(...)` envuelta en **`React.cache`** (memo por petición: `generateMetadata` y `Page` comparten la lectura). No hay `unstable_cache`, `revalidateTag`, etiquetas, TTL, memo por proceso ni archivos.
- Sin `ContentUnavailableError`/`ResumeUnavailableError`, `ContentSource` ni `source`. `getResume` devuelve `{ resume }`, etc.
- Se conservan `parse`, `mismatch` de idioma, `ApiFetchError`, validadores y `request.ts` con **timeout 4 s y 1 reintento** (R13). Se actualiza el comentario del transporte.
- Cualquier fallo (red, 5xx, 4xx, JSON/forma/idioma inválidos) **lanza** y la página da **500** (R1). Un `resume` 404 también es 500 controlado (R2, sin cambios).
- Se eliminan `lib/api/cache.ts` (+test), `CV_CACHE_DIR`, `cacheDir`, `resolveCacheDir`, `client.ts` (si no tiene usos). No se crean `lib/api/tags.ts` ni `/api/revalidate`.
- `config.ts` (único sitio con `process.env`, leído **en la llamada**): `apiUrl` (def. `http://cv-api:8080`) y `siteUrl` (def. `https://floreslab.dev`). Nada más.
- `resolveProjectImages` sigue leyendo `public/projects/<id>.webp` sobre `cwd/public`; la imagen copia `public/`.

### 2.2 Salud
`GET /api/health/` (`app/api/health/route.ts` + `lib/api/health.ts`): `GET ${apiUrl}/q/health/ready`, timeout 2 s, sin reintentos. Devuelve `200 {"status":"ok","api":"up"}` o `503 {"status":"degraded","api":"down"}`, con `no-store`, sin URLs ni mensajes internos.

### 2.3 PDF con caché en memoria por contenido
- Rutas `app/cv-julio-flores-{es,en}.pdf/route.ts` sin `force-static`.
- `getCvPdf(lang)`:
  1. `await getResume(lang)` **en cada petición** (la API se consulta siempre; si falla, el error se propaga → 5xx, **aunque haya PDF en memoria**).
  2. Clave `lang + ':' + sha256(stableStringify(resume))` (claves ordenadas), en `lib/pdf/cache-key.ts`.
  3. Mapa en memoria por proceso, **acotado** (LRU, máx. 4 entradas = 2 idiomas × 2 versiones) que guarda `Promise<Buffer>`. Así hay dedupe de renders concurrentes con la misma clave.
  4. Un render fallido **no se guarda** (se borra la entrada), da `null` con `console.warn`, y la ruta responde 404 `text/plain` (el botón se omite, como hoy).
- Como la clave deriva del contenido, **nunca se sirve un PDF de datos distintos a los que la API devuelve ahora**.
- `response.ts`: `200 application/pdf`, `Content-Disposition: inline; filename="cv-julio-flores-<lang>.pdf"`, `ETag: "<hash>"`, `Cache-Control: no-cache`. Con `If-None-Match` coincidente → `304` sin cuerpo. `no-cache` más `ETag` evita que Cloudflare, que cachea `.pdf` por extensión, sirva un CV viejo.
- Privacidad intacta (mismo `CvDocument`, `lib/contact-links.ts`). `outputFileTracingIncludes` para los 3 `.woff` de `@fontsource` en ambas rutas.
- `page.tsx` muestra el botón solo en el perfil y si `getCvPdf` devolvió buffer (el primer render del contenido lo paga la primera visita).

### 2.4 Contacto vía route handler
- El navegador hace `POST /api/contact/` (relativo, barra final por V8). `lib/contact/client.ts` pierde `apiUrl`, `mode` y `credentials`, y sigue siendo el único `fetch` de cliente.
- `lib/api/contact.ts` (`forwardContact`) hace el POST a `${apiUrl}/api/v1/contact/messages?lang=` con `node:http` y **solo** `Content-Type` y `CF-Connecting-IP` (si es IP válida, ≤45 chars). No reenvía cookies, `User-Agent`, `Referer`, `X-Forwarded-For` ni `Authorization`. Timeout 10 s, sin reintento.
- `app/api/contact/route.ts`:
  - Solo `POST` JSON ≤8 KiB, `lang` es|en (si no, `es`).
  - Valida con `lib/contact/validate.ts`.
  - Responde transparente al contrato: 201, 400/429 con el `problem+json` de la API, y 502/504 con problem propio (`CONTACT_UPSTREAM`/`CONTACT_TIMEOUT`).
  - `no-store`, sin cookies, sin loguear nombre, email, mensaje ni IP.
- Se retira `apiUrl` de `HomeView`/`ContactSection`/`ContactForm`: la URL interna no aparece en el HTML.

### 2.5 Estados vacíos (R2)
Servicios, proyectos y arquitectura (plano hexagonal) **siempre se renderizan**; con datos vacíos muestran un estado vacío.
- **Texto:** claves nuevas `empty.services`, `empty.projects` y `empty.architecture` en `lib/i18n/dictionaries.ts` (ES/EN, breves, ≤160 caracteres, sin datos, precios ni nombres inventados).
- **Estructura:** cada estado vacío vive **dentro de su `SectionShell`** (con su `h2` y `aria-labelledby`) y se pinta con los tokens existentes (sin hex nuevos, contraste AA). Sin `role="alert"` ni `aria-live` (no es un error).
- **Servicios vacío** (página de servicios):
  - Sección `#services` con título y estado vacío; sin tarjetas.
  - No hay aside «Tu encargo» ni controles de selección.
  - El formulario de contacto funciona sin prefijo.
  - `EngagementProvider` solo envuelve cuando hay servicios.
  - La sección «proceso» sigue (es copy del diccionario, no dato).
- **Proyectos vacío:** sección `#projects` con estado vacío; sin tarjeta destacada.
- **Arquitectura vacía** (`ports: []` o sin objeto): el bloque del plano en el hero **no desaparece**, sino que muestra su panel con el estado vacío.
  - Con `core` de la API se dibuja solo el hexágono central, sin nodos, ni noscript por puerto.
  - Sin `core`, solo el texto.
  - Esto **revierte la decisión D4 de la ronda 4** (hero a una columna sin plano); ver R9.
- **Nav y numeración:** el header enlaza siempre `#projects` y `#contact`. La numeración incluye siempre servicios, proceso, proyectos y contacto en la página de servicios, y arquitectura, proyectos y contacto en el perfil (trayectoria solo si hay datos, como hoy). No quedan anclas rotas.
- Quedan fuera de R2 las demás secciones (trayectoria, impacto, stack), que siguen con su comportamiento actual.

### 2.6 Dominio
- `siteUrl` por defecto `https://floreslab.dev`. `robots` y `sitemap` pasan a `force-dynamic` (lectura en runtime).
- **Sin redirección**: no hay `redirects()` ni segundo hostname en el túnel.
- Se **limpian** todas las menciones a `cv.floreslab.dev` y a «Cloudflare Pages»: `CLAUDE.md`, `AGENTS.md`, `docs/web-standards.md`, `.env.example`, `lib/api/config.ts`, `request.ts`, `.claude/agents/analyst.md`. La web aún no está en producción, así que nada debe referenciar ese dominio.

### 2.7 Docker, compose y túnel
- **Dockerfile:**
  - Cabecera en español con comandos locales; `node:22-alpine` deps → build → run.
  - Usuario no root; copia `.next/standalone`, `.next/static` y `public`; `.next/cache` escribible por `app`.
  - `ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1`; `EXPOSE 3000`.
  - `HEALTHCHECK` con `node -e fetch('http://127.0.0.1:3000/api/health/')`; `CMD ["node","server.js"]` en forma exec.
  - `.dockerignore`. El `next build` se ejecuta por plataforma (arm64 bajo QEMU).
- **`deploy/docker-compose.yml`** (R5: un solo compose) con `cv-db`, `cv-api` (copiados del de `cv`, sin CORS) y `cv-web`:
  - `image: julioflores781/cv-web:latest`, `container_name: cv-web`, `restart: unless-stopped`.
  - `depends_on: cv-api: service_healthy`.
  - `environment`: `CV_API_URL: http://cv-api:8080`, `SITE_URL: https://floreslab.dev` (no hay secretos propios de la web).
  - `healthcheck` con `start_period`.
  - `networks: [default, padelhub]`; sin `ports` (comentado).
  - Los secretos de la base de datos y de la sal usan `CAMBIA-…`.
- **Túnel** (manual): solo `floreslab.dev` → `http://cv-web:3000`.
- **Fuera de este repo:** marcar el compose de `cv` como solo-API (y quitar su CORS si se desea), y anotar para la fase 2 la invalidación de la caché de contenido de la API.

### 2.8 CI (R12) y repo público
- **`web-runtime-ci`** (primer slug, antes de tocar el runtime): `.github/workflows/ci.yml` con la estructura de `cv`: `on: push main, tags v*, pull_request`; `concurrency` (solo cancela PR); `permissions: contents: read`; job `test` con `actions/checkout@v7`, `actions/setup-node` (versión de `.nvmrc`, 22, `cache: npm`), `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, y `timeout-minutes` (los tests incluyen `next build`).
- **El job `docker`** (comprobación de secretos, QEMU/buildx/login/metadata, build amd64 `load:true` + smoke + publicación amd64+arm64, resumen) **llega en `web-runtime-docker`**, porque no puede pasar sin `Dockerfile` ni standalone. Alternativa: incluirlo ya en `web-runtime-ci` desactivado con `if: false`; no se recomienda por añadir código muerto.
- **Repo público:**
  - Los secretos solo vía `secrets.*`.
  - Sin `pull_request_target`.
  - El job `docker` solo corre en `push` (los PR de forks no ven secretos).
  - Los tests de CI no pueden depender de archivos no versionados (p. ej. `design/artifact-v2/.rendered`, `private/`).
  - Nada de datos reales en tests, fixtures, docs ni compose: solo «Ada Ejemplo» y valores `CAMBIA-…`.
  - **Auditoría previa** (R10): `design/preview.html`, `design/artifact*`, `scripts/parity/design-data.json` y `progress/` van a un repo público; hay que revisar que no contengan datos personales reales.

### 2.9 `generate:api`
Sigue siendo una herramienta manual de desarrollo; no forma parte del build ni de la CI (R7).

## 3. Archivos

**Crear:**
- `.github/workflows/ci.yml` (slug 0; el job `docker` lo añade el slug 7).
- `lib/api/{health,contact}.ts` y sus tests.
- `lib/pdf/cache-key.ts` y sus tests.
- `app/api/{health,contact}/route.ts` y sus `route.test.ts`.
- `Dockerfile`, `.dockerignore`, `deploy/docker-compose.yml`.
- `tests/helpers/standalone.ts` (arranca `.next/standalone/server.js` desde un temporal con `public/` y `.next/static/`, puerto libre, env por escenario, captura de log) y `tests/global-build.ts` (un solo `next build` por ejecución, sin API).
- `tests/runtime/*.test.ts` y `tests/deploy/deploy-files.test.ts`.

**Tocar:**
- `next.config.ts` (`output:'standalone'`; se conservan `images.unoptimized` y `trailingSlash`; `outputFileTracingIncludes`; **sin `redirects`**).
- `lib/api/{config,content,request,get-resume,services,projects,architecture,errors,index}.ts` y tests. Borrar `cache.ts` y `cache.test.ts`.
- `app/[[...slug]]/page.tsx`, `app/robots.ts`, `app/sitemap.ts` y `app/sitemap.test.ts`.
- `lib/pdf/{build-cv-pdf,response}.ts`, `app/cv-julio-flores-*.pdf/route.ts`.
- `lib/contact/client.ts`, `components/{home-view,contact-section,contact-form,services-section,service-cards,projects,hero,hex-plane-section,hex-plane,site-header,engagement-aside}.tsx` y sus tests; `lib/i18n/dictionaries.ts` (`empty.*`).
- `tests/source.test.ts`, `vitest.config.ts` (`globalSetup`), `package.json` (`start`), `.env.example`.
- Docs: `CLAUDE.md`, `AGENTS.md`, `docs/web-standards.md`, `CHECKPOINTS.md` (C1/C4 obsoletos), `.claude/agents/analyst.md`.
- Sustituir `tests/build/build.test.ts` por `tests/runtime/*`.

## 4. Criterios de aceptación

- **A1** El build funciona sin API ni BD y sin peticiones a ellas, produce `server.js` y las 4 rutas son dinámicas.
- **A2** **Sin caché ni respaldo entre peticiones:** el cambio de datos de la API se ve en la siguiente petición; con la API caída (aunque antes respondiera) la página da **500** sin filtrar URL ni stack; no se escriben archivos de datos. Un `resume` 404 da 500 controlado.
- **A3** Con servicios/proyectos/arquitectura vacíos, las 4 páginas dan 200 y **muestran cada sección con estado vacío** (texto ES/EN, sin datos inventados). Sin anclas rotas, con numeración y navegación coherentes, y accesible.
- **A4** Las lecturas salen del servidor contra `CV_API_URL`; esa URL no aparece en HTML, RSC ni JS. Un render hace **una** petición por recurso e idioma (memo por petición).
- **A5** `/api/health/` da 200 con la API lista y 503 si está caída o lenta (≤2 s), sin datos privados ni caché.
- **A6** PDF dinámico en su idioma y sin datos privados, con caché en memoria acotada y con clave por contenido: nunca un PDF distinto de los datos actuales. Con la API caída da 5xx aunque haya PDF en memoria. Render fallido → 404 y botón omitido. `ETag`/304.
- **A7** El contacto va por `POST /api/contact/`, valida, reenvía con `CF-Connecting-IP` y solo ese header, mapea 201/400/429/502/504, y no loguea ni guarda datos ni pone cookies.
- **A8** Nada de teléfono/documento/nacimiento en ninguna salida; sin cookies; el navegador no habla con otro origen.
- **A9** Todo apunta a `https://floreslab.dev` con `siteUrl` en runtime; **ninguna mención a `cv.floreslab.dev`** ni a Cloudflare Pages; sin redirección de host.
- **A10** La imagen es multi-stage, Node 22, standalone, no root, `HOSTNAME=0.0.0.0`, `HEALTHCHECK`, `CMD` exec, sin secretos, amd64+arm64.
- **A11** CI pública: lint+typecheck+test en cada push/PR; en push a `main`, build amd64 + smoke + publicación multi-arch `julioflores781/cv-web` (`latest`, `sha`, semver); secretos solo vía `secrets.*`.
- **A12** Compose con `cv-db`, `cv-api` y `cv-web` (`depends_on: service_healthy`, `healthcheck`, red `padelhub`, sin `ports`, sin `.env`, valores `CAMBIA-…`).
- **A13** Bajo standalone funcionan un route handler `POST` con cookie y un `proxy.ts` con `matcher` acotado.
- **A14** Paridad y regresión: el contenido de las 4 páginas con datos es el mismo que antes y los tests de componentes y de `scripts/parity` siguen en verde.
- **A15** Reglas de fuente: `process.env` solo en `lib/api/config.ts`; `fetch(` solo en `lib/api` y `lib/contact/client.ts` (ruta relativa); sin `node:` en cliente; sin `console.log`; sin `next/cache` ni `unstable_cache` en código de producción.
- **A16** Respuestas inválidas (JSON, forma, idioma, 4xx) → error 500; nunca se sirven.
- **A17** Idioma o ruta desconocidos → 404 sin petición a la API.
- **A18** Repo público: ningún secreto, token ni dato personal real en el repo versionado (tests, fixtures, docs, compose, `.env.example`, workflow).

## 5. Plan de tests (catálogo completo)

Prefijo `RT-`. Tipos:
- **unit**: Vitest.
- **componente**.
- **runtime**: servidor standalone real más la API falsa de `tests/helpers/fake-api.ts`, con un único `next build` previo vía `tests/global-build.ts`.
- **config/archivos**: lee texto del repo.
- **CI**: paso del workflow, no Vitest.

Los fixtures son «Ada Ejemplo» más los centinelas, nunca el CV real. Cada test indica entre paréntesis archivo, tipo y criterio.

### Slug 0 — web-runtime-ci

- **T1** — Dado `.github/workflows/ci.yml`, cuando se parsea, entonces dispara en `push` a `main`, tags `v*` y `pull_request`, con `concurrency` que solo cancela en PR y `permissions: contents: read`. (`tests/deploy/deploy-files.test.ts`, config. A11)
- **T2** — Dado el job `test`, cuando se lee, entonces usa `actions/checkout@v7`, `setup-node` con la versión de `.nvmrc` (22) y ejecuta `npm ci`, `npm run lint`, `npm run typecheck` y `npm test`, con `timeout-minutes`. (mismo archivo, config. A11)
- **T3** — Dado el workflow, cuando se analiza, entonces no usa `pull_request_target`, no contiene tokens ni credenciales literales y cualquier credencial va por `secrets.*`. (config. A11, A18)
- **T4** — Dado un clon limpio del repo versionado, cuando se ejecutan lint, typecheck y `npm test`, entonces todo pasa (ningún test depende de archivos no versionados como `.rendered`, `.shots` o `private/`). (CI. A11)
- **T5** — Dado el árbol versionado, cuando se escanea (excluye `node_modules`, `.next`, `package-lock.json`), entonces no hay `.env*` salvo `.env.example`, ni patrones de secretos (`ghp_`, `AKIA`, `-----BEGIN`, `xox[bp]-`, `password:`/`SECRET:` con valor distinto de `CAMBIA-…`), y `.gitignore` cubre `.env*`. (`tests/source.test.ts`, config. A18)

### Slug 1 — web-runtime-datos

**Config** (`lib/api/config.test.ts`, unit)
- **T6** — Dado un entorno vacío, cuando se llama `getConfig()`, entonces `apiUrl=http://cv-api:8080` y `siteUrl=https://floreslab.dev`. A4, A9
- **T7** — Dado `CV_API_URL` y `SITE_URL` con barras finales, cuando se llama `getConfig()`, entonces se devuelven sin barras. A4, A9
- **T8** — Dado el objeto de `getConfig()` y las variables `CV_CACHE_DIR` y `CV_CACHE_TTL_SECONDS`, cuando se inspeccionan, entonces solo existen `apiUrl` y `siteUrl` y esas variables no tienen efecto. A2
- **T9** — Dado que el entorno cambia entre dos llamadas, cuando se llama `getConfig()` dos veces, entonces cada una refleja el entorno actual (runtime, no al importar). A4, A9

**Capa de datos** (`lib/api/content.test.ts`, unit; reescritura)
- **T10** — Dado una API sana, cuando se piden dos veces `getServices('es')` fuera de un render (sin ámbito de petición), entonces hay **2** peticiones (no hay caché entre llamadas). A2
- **T11** — Dado una API cuyo contenido cambia entre dos llamadas, cuando se pide el recurso, entonces la segunda devuelve el contenido nuevo. A2
- **T12** — Dado una API que da 500, cuando se pide un recurso, entonces lanza `ApiFetchError` tras 1 reintento y no queda estado: la siguiente llamada vuelve a intentar. A2, A16
- **T13** — Dado una API con 200 y JSON inválido, forma incorrecta o `language` distinto, cuando se pide, entonces lanza. A16
- **T14** — Dado una API con 404 o 400, cuando se pide, entonces lanza sin reintentar. A16
- **T15** — Dado una respuesta válida vacía (`[]`; arquitectura sin puertos), cuando se pide, entonces devuelve el vacío sin error (el estado vacío lo pinta la UI, slug 2). A3
- **T16** — Dado una API sana y un cwd temporal, cuando se piden los 4 recursos, entonces no se crea ningún archivo. A2
- **T17** — Dado el código de producción, cuando se analiza, entonces no existen `lib/api/cache.ts`, `ContentUnavailableError`, `ContentSource`, `unstable_cache`, `revalidateTag`, importaciones de `next/cache` ni el texto `CV_CACHE_DIR`. (`tests/source.test.ts`, config. A2, A15)
- **T18** — Dado `getResume`, `getServices`, `getProjects` y `getArchitecture`, cuando se llaman, entonces devuelven solo el dato tipado (sin `source`). A15

**Transporte** (`lib/api/request.test.ts`, unit; adaptado)
- **T19** — Dado los valores por defecto, cuando se inspeccionan, entonces timeout 4000 ms y 1 reintento. A16
- **T20** — Dado un 5xx y luego un 200, cuando se pide, entonces reintenta una vez y devuelve el dato; con 4xx no reintenta. A16
- **T21** — Dado un servidor que no contesta, cuando se pide, entonces falla en torno al timeout con `timed out after 4000 ms`. A2
- **T22** — Dado un puerto cerrado, cuando se pide, entonces el error describe `ECONNREFUSED`. A2

**Configuración y páginas**
- **T23** — Dado `next.config.ts`, cuando se importa, entonces `output='standalone'`, `images.unoptimized=true`, `trailingSlash=true`, sin `export` y sin `redirects`. (`next.config.test.ts`, config. A1, A9, A10)
- **T24** — Dado `app/[[...slug]]/page.tsx`, cuando se lee, entonces no exporta `generateStaticParams`, declara `force-dynamic`, no recibe `apiUrl`/`source` y comparte el memo por petición. (`tests/source.test.ts`, config. A1, A4)

**Runtime** (`tests/runtime/{build,pages,resilience}.test.ts`)
- **T25** — Dado `next build` con `CV_API_URL` a un puerto cerrado y una API falsa que registra peticiones, cuando termina, entonces sale con 0, la API falsa recibió 0 peticiones y existe `.next/standalone/server.js`. A1
- **T26** — Dado la salida del build, cuando se lee la tabla de rutas y `.next/server/app`, entonces las 4 páginas son dinámicas y ningún `.html` prerenderizado contiene «Ada». A1
- **T27** — Dado una API sana, cuando se piden `/`, `/servicios/`, `/en/` y `/en/services/`, entonces 200 `text/html` con `lang` y `data-mode` correctos y `Cache-Control` no cacheable. A14
- **T28** — Dado una API sana, cuando se piden `/fr/`, `/en/servicios/`, `/servicios` (sin barra, 308 a la versión con barra) y `/zzz/`, entonces dan 404 o 308 y las 404 no llaman a la API. A17
- **T29** — Dado una API sana, cuando se piden las 4 páginas, entonces cada una tiene un solo `h1`, landmarks, título/description/canonical propios, 3 `hreflang` recíprocos, `og:*` y JSON-LD `Person` válido en su idioma (migra BA-T45/46, T60). A14, A9
- **T30** — Dado una API sana, cuando se piden las páginas, entonces los datos de Ada salen en su idioma sin mezclarse (BA-T47). A14
- **T31** — Dado una API con centinelas de teléfono/documento/nacimiento, cuando se piden las páginas y los JS de `/_next/static`, entonces ningún centinela aparece en HTML, RSC ni JS (BA-T48). A8
- **T32** — Dado una API sana, cuando se piden las páginas, entonces el plano hexagonal con sus puertos, el `noscript` por puerto, los servicios y proyectos («a consultar») y la numeración de secciones coinciden con HX-T41, CO-T74 y CO-T81 (migrados). A14
- **T33** — Dado una API sana, cuando se piden las páginas, entonces los enlaces externos llevan `noopener noreferrer`, cada `#ancla` tiene `id`, las fuentes salen de `/_next/static/media`, no hay Google Fonts y el favicon da 200 (BA-T49, CO-T80). A8, A14
- **T34** — Dado una API sana, cuando se pide una página, entonces el log de la API muestra **exactamente 1** petición por recurso e idioma usado (`resume`, `architecture`, `services`, `projects`) pese a `generateMetadata` + `Page`. A4
- **T35** — Dado una API sana, cuando se piden dos veces seguidas `/servicios/` y entre ambas la API cambia un servicio, entonces la segunda respuesta muestra el cambio y el log tiene 2 peticiones por recurso (sin caché entre peticiones). A2
- **T36** — Dado una API sana, cuando se piden las páginas, entonces HTML, RSC y JS no contienen la URL de `CV_API_URL` ni `cv-api` (inversión de CO-T75/77). A4
- **T37** — Dado una API caída desde el arranque, cuando se pide `/`, entonces 500, cuerpo sin `cv-api`, URL interna ni stack, y log con error `[cv-web]`. A2
- **T38** — Dado una API que da 404 al CV, cuando se pide `/`, entonces 500 controlado (no 200 con h1 vacío) sin filtrar datos internos. A2
- **T39** — Dado una API que da JSON basura a `projects` y válido al resto, cuando se pide `/`, entonces 500, y tras corregir la API la siguiente petición da 200. A16
- **T40** — Dado una página que acaba de responder 200 y una API que pasa a 503, cuando se pide de nuevo la página, entonces **500** (no hay datos viejos). A2
- **T41** — Dado `public/projects/<id>.webp` para un proyecto propio y público, cuando se pide la página con el standalone, entonces la `<img>` aparece y la imagen da 200; para anónimo o de empleador no. A14

**Migración:** `tests/build/build.test.ts` se borra y sus casos viven en `tests/runtime`. Se eliminan el respaldo por idioma (T64 viejo), los respaldos de services/projects, el bloque «build with the API down» y BA-T50. Se invierten CO-T75 y CO-T77.

### Slug 2 — web-runtime-vacios (R2)

- **T42** — Dado `lib/i18n/dictionaries.ts`, cuando se leen ES y EN, entonces existen `empty.services`, `empty.projects` y `empty.architecture`, no vacías, ≤160 caracteres, sin marcadores de relleno, y el test de paridad de claves ES/EN pasa. (`lib/i18n/i18n.test.ts`, unit. A3)
- **T43** — Dado `HomeView` de la página de servicios con `services=[]`, cuando se renderiza, entonces existe `#services` con su `h2`, el texto vacío en su idioma, sin tarjetas, sin aside «Tu encargo» ni controles de selección, y el formulario de contacto presente. (`components/home-view.test.tsx`, componente. A3)
- **T44** — Dado `HomeView` (perfil y servicios) con `projects=[]`, cuando se renderiza, entonces existe `#projects` con su `h2` y el texto vacío, sin tarjeta destacada ni enlaces rotos. (`components/projects.test.tsx` y `home-view.test.tsx`, componente. A3)
- **T45** — Dado el hero con `architecture` nulo o con `ports=[]`, cuando se renderiza, entonces el bloque del plano muestra el estado vacío (región con nombre accesible, sin botones de nodo ni `noscript` por puerto); con `core` solo se dibuja el hexágono central y sin `core` solo el texto. (`components/hex-plane-section.test.tsx`, `hero.test.tsx`, componente. A3)
- **T46** — Dado el header en las 4 combinaciones (perfil/servicios × es/en) con datos vacíos, cuando se renderiza, entonces enlaza `#projects` y `#contact` y cada `href="#x"` de la página tiene su `id` (matriz servicios/proyectos/arquitectura vacíos × página × idioma). (`components/site-header.test.tsx`, `home-view.test.tsx`, componente. A3)
- **T47** — Dado `HomeView` con servicios, proyectos y arquitectura vacíos, cuando se renderiza, entonces la numeración de secciones es consecutiva sin huecos: servicios «01 servicios, 02 proceso, 03 proyectos, 04 contacto» y perfil «01 trayectoria (si hay datos), 02 arquitectura, 03 proyectos, 04 contacto» (CO-T81 ampliado). (componente. A3)
- **T48** — Dado los estados vacíos, cuando se renderizan, entonces cada uno está dentro de su sección con `aria-labelledby`, no usa `role="alert"` ni `aria-live`, el `h1` sigue siendo único, y su CSS usa solo variables de tokens (sin hex nuevos; el test de `globals` sigue en verde). (componente + `*.module.test.ts`. A3)
- **T49** — Dado `HomeView` de servicios con `services=[]`, cuando el usuario envía el formulario, entonces `sendContactMessage` se invoca con el mensaje sin prefijo de servicios y sin error. (`components/contact-form.test.tsx`, componente. A3, A7)
- **T50** — Dado una API con servicios, proyectos y arquitectura vacíos, cuando se piden las 4 páginas, entonces 200 y los tres textos vacíos aparecen en el idioma de cada página (sin mezclarse), no aparece contenido de Ada en esas secciones, el JSON-LD y el h1 siguen, y no hay anclas rotas. (`tests/runtime/pages.test.ts`, runtime. A3)
- **T51** — Dado los tests existentes que afirmaban «sin servicios no hay sección», «sin proyectos no hay sección» o «sin puertos no hay plano» (`home-view.test.tsx`, `projects.test.tsx`, `hex-plane-section.test.tsx`), cuando se actualizan, entonces afirman el estado vacío y el resto de la suite sigue en verde. A3, A14

### Slug 3 — web-runtime-salud

(`lib/api/health.test.ts`, `app/api/health/route.test.ts`, `tests/runtime/endpoints.test.ts`)
- **T52** — Dado una API con 200 en `/q/health/ready`, cuando se llama `checkApi()`, entonces `up`. A5
- **T53** — Dado una API con 503, puerto cerrado o respuesta >2 s, cuando se llama `checkApi()`, entonces `down` en ~2 s. A5
- **T54** — Dado una API sana, cuando `GET /api/health/`, entonces 200 `{"status":"ok","api":"up"}`, `Content-Type: application/json` y `Cache-Control: no-store`. A5
- **T55** — Dado una API caída, cuando `GET /api/health/`, entonces 503 `{"status":"degraded","api":"down"}` sin URL interna, mensaje de error ni centinelas. A5, A8
- **T56** — Dado el servidor, cuando `GET /api/health` (sin barra), entonces 308 a `/api/health/`. A5, A10

### Slug 4 — web-runtime-pdf

- **T57** — Dado el servidor standalone y una API sana, cuando se piden los PDF es y en, entonces 200 `application/pdf`, `%PDF-`, <1 MiB y el texto «Ada Ejemplo» en su idioma; prueba además que las fuentes `.woff` están en el standalone (migra PD-T22). (runtime. A6)
- **T58** — Dado una API con centinelas, cuando se piden los PDF, entonces ni el texto, ni los metadatos ni los bytes crudos los contienen (PD-T24). (runtime. A6, A8)
- **T59** — Dado perfil y servicios, cuando se piden las páginas, entonces solo el perfil enlaza el PDF de su idioma y ni `sitemap.xml` ni `robots.txt` lo listan (PD-T23/26). (runtime. A6)
- **T60** — Dado `cacheKey`, cuando se calcula, entonces el mismo `resume` da la misma clave aunque cambie el orden de claves, cualquier campo cambiado da otra y el idioma forma parte de la clave. (`lib/pdf/cache-key.test.ts`, unit. A6)
- **T61** — Dado un renderizador inyectado, cuando se llama `getCvPdf` dos veces con el mismo contenido, entonces se renderiza **una** vez. (`lib/pdf/build-cv-pdf.test.ts`, unit. A6)
- **T62** — Dado el servidor y una API cuyo currículum cambia entre dos peticiones del PDF, cuando se pide de nuevo, entonces el PDF nuevo contiene el texto actualizado y el `ETag` cambia. (runtime. A6, A2)
- **T63** — Dado más contenidos distintos que el tope (5 con máx. 4), cuando se llama `getCvPdf` con cada uno, entonces el mapa nunca supera 4 entradas y se expulsa la menos reciente. (unit. A6)
- **T64** — Dado dos peticiones simultáneas con la misma clave, cuando se renderizan, entonces el renderizador se invoca una sola vez. (unit. A6)
- **T65** — Dado un renderizador que lanza, cuando se llama `getCvPdf`, entonces devuelve `null` con `console.warn`, el fallo no se guarda (la siguiente llamada vuelve a renderizar) y la ruta responde 404 `text/plain`. (unit + runtime. A6)
- **T66** — Dado un PDF ya en memoria y una API que pasa a caída, cuando se pide el PDF, entonces la ruta responde 5xx (no se sirve el PDF en memoria). (runtime. A6, A2)
- **T67** — Dado una respuesta 200, cuando se inspeccionan sus cabeceras, entonces tiene `Content-Disposition: inline; filename="cv-julio-flores-<lang>.pdf"`, `Cache-Control: no-cache` y `ETag` con el hash; con `If-None-Match` coincidente da 304 sin cuerpo y con otro valor da 200. (`lib/pdf/response.test.ts`, unit. A6)
- **T68** — Dado `lib/pdf` y las rutas, cuando se analizan, entonces no usan `unstable_cache` ni `next/cache`, y el mapa tiene un tope constante. (`tests/source.test.ts`, config. A6, A15)
- **T69** — Dado los tests existentes `cv-document`, `fonts`, `theme`, `privacy` y PD-T28, cuando se ejecutan, entonces siguen en verde sin cambios. A14

### Slug 5 — web-runtime-contacto

- **T70** — Dado valores válidos y `CF-Connecting-IP: 203.0.113.9`, cuando `forwardContact`, entonces la API recibe `POST /api/v1/contact/messages?lang=es`, `Content-Type: application/json`, el JSON `{name,email,message,website}` recortado y ese header. (`lib/api/contact.test.ts`, unit. A7)
- **T71** — Dado `Cookie`, `Authorization`, `User-Agent`, `Referer`, `X-Forwarded-For` y un `CF-Connecting-IP` inválido (`<script>`, `1.2.3.4, 5.6.7.8`, >45 caracteres), cuando se reenvía, entonces la API no recibe ninguno, y el IP solo si es válido. (unit. A7, A8)
- **T72** — Dado una API con 201, 400 `CONTACT_INVALID`, 429, 500, timeout o puerto cerrado, cuando se reenvía, entonces `sent`, el problem, el rate-limit, `upstream-error`, `timeout` y `unreachable`, sin lanzar. (unit. A7)
- **T73** — Dado una API con 5xx, cuando se reenvía, entonces no hay reintento (1 petición). (unit. A7)
- **T74** — Dado un `POST` JSON válido con API 201, cuando llega, entonces 201 sin cuerpo, `no-store` y sin `Set-Cookie`. (`app/api/contact/route.test.ts`, unit. A7, A8)
- **T75** — Dado una API con 400 `CONTACT_INVALID` o 429, cuando llega el `POST`, entonces mismo status y `problem+json` de la API. (unit. A7)
- **T76** — Dado una API caída o sin respuesta, cuando llega el `POST`, entonces 502/504 con `CONTACT_UPSTREAM`/`CONTACT_TIMEOUT`, sin URL ni error interno. (unit + runtime. A7, A4)
- **T77** — Dado un `POST` >8 KiB, `Content-Type` no JSON, JSON inválido, campos no string, `name` vacío, `email` mal formado o `message` <10 o >2000, cuando llega, entonces 400/413/415 con problem y la API no recibe petición. (unit. A7)
- **T78** — Dado `GET`, `PUT` o `DELETE`, cuando llega, entonces 405 con `Allow: POST`. (unit. A7)
- **T79** — Dado el honeypot `website` con contenido, cuando llega, entonces se reenvía tal cual a la API. (unit. A7)
- **T80** — Dado envíos válidos e inválidos, cuando se observa el log del servidor, entonces no contiene nombre, email, mensaje ni IP. (runtime. A7, A8)
- **T81** — Dado `lang=en` en la query, cuando llega, entonces la API recibe `?lang=en`; con `fr` o ausente, `es`. (unit. A7)
- **T82** — Dado el servidor, cuando `POST /api/contact` (sin barra), entonces 308 a `/api/contact/`, y el cliente llama directamente a la ruta con barra. (runtime. A7)
- **T83** — Dado `sendContactMessage`, cuando envía, entonces hace `fetch('/api/contact/?lang=…')` relativo, `POST`, solo `Content-Type`, sin `mode`/`credentials`, y mapea 201/400/429/5xx/red/timeout/aborto a los mismos `SendResult` (adapta `lib/contact/client.test.ts`). A7
- **T84** — Dado `ContactForm`, `ContactSection` y `HomeView`, cuando se renderizan, entonces no aceptan `apiUrl` y los tests de componente existentes siguen en verde. (componente. A4, A14)
- **T85** — Dado el código de producción, cuando se analiza, entonces `fetch(` solo está en `lib/api/*` y `lib/contact/client.ts`; este último sin `http(s)://` ni `process.env`; y `process.env` solo en `lib/api/config.ts` (CO-T70/71). (`tests/source.test.ts`, config. A15)
- **T86** — Dado el cliente `'use client'`, cuando se analiza, entonces no importa `node:*` ni `@/lib/api` salvo tipos (CO-T72, sin cambios). (config. A15)

### Slug 6 — web-runtime-dominio

- **T87** — Dado `buildMetadata`, `buildPersonJsonLd`, `sitemap` y `robots` con el `siteUrl` por defecto, cuando se invocan, entonces todas las URLs empiezan por `https://floreslab.dev`. (`lib/seo/*.test.ts`, `app/sitemap.test.ts`, test nuevo de `robots`. A9)
- **T88** — Dado el servidor con `SITE_URL=https://example.test`, cuando se piden `/sitemap.xml`, `/robots.txt` y `/`, entonces canonical, hreflang, OG, JSON-LD, sitemap (4 URLs con alternates) y `Sitemap:` usan ese origen (runtime, no horneado). (runtime. A9)
- **T89** — Dado el repo versionado (código, docs, config, scripts, tests, compose, workflow, `.env.example`; excluye `progress/`), cuando se buscan `cv.floreslab.dev`, `pages.dev` y «Cloudflare Pages», entonces no hay coincidencias. (`tests/source.test.ts`, config. A9)
- **T90** — Dado el servidor con `Host: cv.floreslab.dev` a `/`, cuando se envía, entonces **no** hay redirección especial (responde como cualquier host). (runtime. A9)
- **T91** — Dado `robots.txt`, cuando se pide, entonces permite `/`, apunta al sitemap de `floreslab.dev` y `/api/*` no figura en el sitemap. (runtime. A9)

### Slug 7 — web-runtime-docker

- **T92** — Dado `Dockerfile`, cuando se lee, entonces es multi-stage con `node:22…`, copia `.next/standalone`, `.next/static` y `public`, define `USER` no root, `HOSTNAME=0.0.0.0`, `PORT=3000`, `EXPOSE 3000`, un `HEALTHCHECK` contra `/api/health/` (con barra) y `CMD` en forma exec, sin `.env*` ni secretos. (`tests/deploy/deploy-files.test.ts`, config. A10)
- **T93** — Dado `.dockerignore`, cuando se lee, entonces excluye `node_modules`, `.next`, `out`, `.git`, `.env*`, `progress` y `design`. (config. A10)
- **T94** — Dado `deploy/docker-compose.yml`, cuando se parsea, entonces declara `cv-db`, `cv-api` y `cv-web`; `cv-web` usa `julioflores781/cv-web`, `depends_on.cv-api.condition = service_healthy`, `healthcheck`, redes `default` y `padelhub`, `restart: unless-stopped`, sin `ports` activos, sin `env_file` ni `${VAR}`, con `CV_API_URL=http://cv-api:8080` y `SITE_URL=https://floreslab.dev`, y sin variables `REVALIDATE_*` ni `CV_CACHE_*`. (config. A12)
- **T95** — Dado el compose, cuando se parsea, entonces `cv-db` no está en `padelhub`, `cv-api` conserva el `healthcheck` `/q/health/ready` y todo secreto tiene el valor `CAMBIA-…` (nada real). (config. A12, A18)
- **T96** — Dado `ci.yml`, cuando se parsea, entonces el job `docker` tiene `needs: test` e `if: github.event_name == 'push'`, usa qemu, buildx, login y metadata con `images` terminando en `/cv-web`, hace el build de prueba `linux/amd64` con `load:true` y la publicación `linux/amd64,linux/arm64`, y los secretos van solo por `secrets.*`. (config. A11)
- **T97** — Dado el standalone arrancado desde el temporal del harness (estructura de la imagen), cuando se piden `/`, un CSS de `/_next/static/…` y `/hex-grid-plano.svg`, entonces los tres dan 200. (runtime. A10)
- **T98** — Dado la imagen de CI (amd64) con la API falsa (`scripts/parity/design-api.mjs`, datos del diseño) en una red desechable, cuando se levanta, entonces `healthy`, `/api/health/` 200, `/` con `<h1>`, `/en/` con `lang="en"`, `sitemap.xml` con `floreslab.dev` y PDF `%PDF-`. (CI, smoke. A10, A11)
- **T99** — Dado el contenedor del smoke, cuando recibe `SIGTERM`, entonces se detiene en <10 s con código 0 o 143 (Node como PID 1 sin handler muere por la señal; 137 = SIGKILL por timeout es fallo). (CI. A10)
- **T100** — Dado la imagen publicada, cuando se inspecciona el manifiesto, entonces contiene `linux/amd64` y `linux/arm64`. (CI, `buildx imagetools inspect`. A11)

### Slug 8 — web-runtime-regresion

- **T101** — Dado el árbol completo, cuando se ejecutan lint, typecheck y `npm test`, entonces todo verde y el nº de archivos de test no baja salvo los borrados de §5. A14
- **T102** — Dado `scripts/parity/*.test.ts`, cuando se ejecutan, entonces pasan sin cambios, y `parity:api` + `CV_API_URL=http://localhost:4020 npm run dev` sirve las 4 páginas con los datos del diseño. A14
- **T103** — Dado la API «datos del diseño» y el standalone, cuando se capturan `perfil` y `servicios`, entonces `parity:diff` queda bajo el umbral del 3 % por banda (manual con Chrome DevTools, como en la ronda 4). A14
- **T104** — Dado una copia temporal del proyecto con un `proxy.ts` (`matcher ['/admin/:path*']`) y un `POST /api/probe` que escribe una cookie `httpOnly` (solo en un directorio temporal, nunca en el repo), cuando se construye y arranca en standalone, entonces el build lista el Proxy, `/admin/x` pasa por él, sale `Set-Cookie` y las 4 páginas públicas no cambian. (`tests/runtime/proxy-ready.test.ts`, lento. A13)
- **T105** — Dado `CLAUDE.md`, `AGENTS.md`, `docs/web-standards.md`, `CHECKPOINTS.md` y `.env.example`, cuando se leen, entonces describen el servidor standalone, `CV_API_URL`/`SITE_URL`, la política «sin caché, API caída → 500», los estados vacíos y la nota de la caché de contenido de la API para la fase 2, y no mencionan `output:'export'`, `CV_CACHE_DIR`, respaldo ni Cloudflare Pages (T89 + revisión humana). A2, A9
- **T106** — Dado el flujo local completo (API falsa + standalone + contacto), cuando se recorre la lista de verificación real, entonces todos los pasos se cumplen. (manual, evidencia en `impl.md`. A1–A17)

**Lista de verificación real:** `parity:api` → `next build` sin esa API → standalone con `CV_API_URL=http://localhost:4020` → curl a páginas, health, PDF y sitemap → cambiar datos de la API falsa y ver el cambio en la siguiente petición → matar la API falsa y comprobar el 500 → API con listas vacías y comprobar los estados vacíos → `docker build` + `docker run` con el `HOSTNAME` por defecto de Docker → `buildx` multi-arch (opcional).

### Matriz criterio → tests

| Criterio | Tests |
|---|---|
| A1 | T23–T26 |
| A2 | T8, T10–T12, T16, T17, T21, T22, T35, T37, T38, T40, T62, T66, T105 |
| A3 | T15, T42–T51, T49 |
| A4 | T6, T7, T9, T24, T34, T36, T76, T84 |
| A5 | T52–T56 |
| A6 | T57–T68 |
| A7 | T49, T70–T83 |
| A8 | T31, T33, T55, T58, T71, T74, T80 |
| A9 | T6, T7, T9, T23, T29, T87–T91, T105 |
| A10 | T23, T56, T92, T93, T97–T99 |
| A11 | T1–T4, T96, T98, T100 |
| A12 | T94, T95 |
| A13 | T104 |
| A14 | T27, T29–T33, T41, T51, T69, T84, T101–T103 |
| A15 | T17, T18, T68, T85, T86 |
| A16 | T12–T14, T19, T20, T39 |
| A17 | T28 |
| A18 | T3, T5, T95 |

Todos los criterios tienen al menos un test.

## 6. Consideraciones de privacidad / SEO / accesibilidad

- **Privacidad:**
  - El CV sigue sin teléfono, documento ni nacimiento (T31, T55, T58).
  - Los visitantes anónimos no reciben cookies, analítica ni terceros.
  - La web no registra ni guarda los datos del formulario (T80).
  - Solo reenvía `CF-Connecting-IP`, que la API guarda hasheada con sal.
  - Hay que documentarlo en `docs/web-standards.md`.
  - **Repo público:** sin secretos ni datos reales (T3, T5, T95).
- **SEO:**
  - HTML en servidor con `metadataBase` en runtime.
  - Sitemap y robots dinámicos en `floreslab.dev`, sin referencias al dominio antiguo.
  - PDF fuera del sitemap.
  - Los 500 no se cachean.
- **Accesibilidad:** los estados vacíos son texto dentro de su sección con encabezado, tokens y contraste AA (T48). El resto del marcado no cambia.

## 7. Datos y resiliencia

- **Sin caché ni respaldo propios:** el único estado es el memo por petición y el mapa acotado de PDF (con clave por contenido).
- **API caída o respuesta inválida → 500** (T37–T40). Sin CV (404) → 500 controlado.
- **Latencia:** cada render hace hasta 4 lecturas en paralelo por LAN. Lecturas con timeout 4 s + 1 reintento (peor caso ~8 s), salud 2 s, contacto 10 s sin reintento. La API absorbe la carga con su caché de 5 min.
- **La API sí mantiene sus cachés:** `cv.resume.cache-ttl` y `cv.content.cache-ttl` (5 min) y sirve lo último leído si la BD falla. Por tanto, si la caída es de la BD y no de la API, la web puede mostrar datos de hasta 5 min o los últimos leídos. **Fase 2:** el admin debe invalidar esa caché al guardar.
- **Arranque:** `depends_on: cv-api: service_healthy`, y `HEALTHCHECK` con `start_period`.

## 8. Alternativa descartada

1. **`unstable_cache`/`use cache` con etiquetas y `revalidateTag`** (el plan v1). Descartada por el humano: servía datos viejos con la API caída (V5). Se retiran la caché, el endpoint de revalidación, las etiquetas, el TTL y sus tests.
2. **PDF cacheado con TTL.** Descartado: podría servir un CV viejo. Se usa clave por hash del contenido.
3. **ISR de páginas.** Exigiría leer la API en el build, que el brief prohíbe.
4. **WebSocket/SSE.** Descartado por el brief.
5. **Redirección de `cv.floreslab.dev`.** Descartada: la web aún no está en producción y nada debe referenciar ese dominio.

## 9. Riesgos / dudas

- **R1 — IP del remitente en el contacto.** Sin reenviar `CF-Connecting-IP`, la API vería la IP del contenedor y todos los visitantes compartirían el límite de 5/h. Verificar con un smoke manual en el NAS tras desplegar.
- **R2 — Cloudflare cachea `.pdf` por extensión.** `Cache-Control: no-cache` + `ETag` fuerza la revalidación. Confirmar la regla de caché de la zona.
- **R3 — Un solo compose duplica el de `cv`.** Tarea **fuera de este repo**: marcar `cv/deploy/docker-compose.yml` como solo-API y quitar `QUARKUS_HTTP_CORS_ORIGINS` (ya no hay navegador→API).
- **R4 — Invalidación de la caché de la API (fase 2).** `cv.resume.cache-ttl` y `cv.content.cache-ttl` (5 min) deben invalidarse al guardar desde el admin; hasta entonces la web mostrará el contenido de la API con ese retraso.
- **R5 — Cada petición de página consulta la API.** Un rastreador agresivo multiplica las lecturas. La API tiene caché y está en la LAN; vigilar. Si molestara, se reabre la decisión R1 del humano (no se hace aquí).
- **R6 — D4 revertida.** El hero ya no pasa a una columna cuando no hay puertos: muestra el panel del plano con estado vacío (R2 del humano). No hay referencia de diseño para estos estados vacíos; el implementer usa tokens existentes y el humano valida el aspecto.
- **R7 — `generate:api`.** El brief lo lista entre lo que «cambia»; se deja como herramienta manual sin uso en build ni CI. Confirmar.
- **R8 — Error en frío.** El 500 es la página por defecto de Next (sin marca). Una página de mantenimiento ES/EN sería un añadido no pedido.
- **R9 — arm64 bajo QEMU** tarda más en CI; medir antes de decidir un runner arm64.
- **R10 — Repo público: auditoría previa.** Antes de subirlo, revisar `design/preview.html` (el estado anota «datos reales pendientes»), `design/artifact*`, `scripts/parity/design-data.json` y `progress/` por datos personales o menciones al dominio antiguo (T89 excluye `progress/`; si contiene menciones, decidir si se limpian o se mantienen como historial). Esta auditoría es previa a `web-runtime-ci` y no la cubre ningún test automático salvo T3 y T5.
- **R11 — Orden con los slugs previos.** Los 6 `web-redesign-*` deben estar cerrados y subidos antes de empezar. `web-runtime-ci` valida en CI ese estado (T4: sin dependencias de archivos no versionados) antes de tocar el runtime.
- **R12 — `design/artifact-v2/.rendered` y `.shots`** están en `.gitignore`: los tests de paridad que los necesiten fallarán en CI limpia. T4 lo detecta; el implementer decide si esos tests se saltan en CI o generan el render antes.
- **R13 — Valores aceptados por el humano:** timeouts 4 s + 1 reintento, 8 KiB del contacto y valores del PDF propuestos aquí (tope de 4 entradas, `no-cache` + `ETag`).

## 10. Slugs hijos recomendados (orden y dependencias)

Una tarea a la vez; cada slug deja lint, typecheck y `npm test` en verde. Requisito previo: los 6 `web-redesign-*` cerrados y subidos a GitHub (repo público, tras la auditoría R10).

| Orden | Slug | Contenido | Depende de | Tests |
|---|---|---|---|---|
| 0 | `web-runtime-ci` | `.github/workflows/ci.yml` con el job `test`, y `concurrency`/`permissions` como en `cv`; escáner de secretos; verificación en clon limpio | cierre de `web-redesign-*` | T1–T5 |
| 1 | `web-runtime-datos` | `next.config` standalone; `lib/api` sin caché (config, content con `React.cache`, request, borrado de respaldo/`source`); páginas dinámicas; harness (`standalone`, `global-build`); migración de `tests/build` a `tests/runtime`; limpieza de `source.test.ts` | 0 | T6–T41 |
| 2 | `web-runtime-vacios` | Estados vacíos de servicios, proyectos y plano; `empty.*` en i18n; nav y numeración; tests inversos | 1 | T42–T51 |
| 3 | `web-runtime-salud` | `/api/health/` | 1 | T52–T56 |
| 4 | `web-runtime-pdf` | PDF dinámico con caché por contenido, `ETag`/304, `outputFileTracingIncludes` | 1 | T57–T69 |
| 5 | `web-runtime-contacto` | `POST /api/contact/`, `lib/api/contact.ts`, cliente y componentes sin `apiUrl` | 1 | T70–T86 |
| 6 | `web-runtime-dominio` | `floreslab.dev`, robots/sitemap dinámicos, limpieza de menciones (sin redirect) | 1 | T87–T91 |
| 7 | `web-runtime-docker` | `Dockerfile`, `.dockerignore`, compose único, job `docker` del CI y smoke | 1–6 | T92–T100 |
| 8 | `web-runtime-regresion` | Paridad y regresión, test de `proxy.ts`, docs finales, verificación extremo a extremo | 1–7 | T101–T106 |

Los slugs 2–6 son independientes entre sí tras el 1; el orden propuesto lleva primero lo que desbloquea el smoke del 7. Si el 1 resulta demasiado grande, partirlo en «`lib/api` + unitarios» (T6–T24) y «runtime: harness + migración» (T25–T41), con el primero obligatorio antes.
