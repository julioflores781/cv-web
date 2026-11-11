# Analysis — web-runtime (fase 1: servidor Next en el NAS)

Sustituye lo que la ronda 4 asumía sobre contenido en build estático: respaldo en `.next/cache/cv-web`, `output: 'export'`, `generateStaticParams`, PDF `force-static`, formulario hablando con la API desde el navegador y `SITE_URL` por defecto `cv.floreslab.dev`.

## 0. Lo verificado (2026-11-11)

**Versiones:** `next@16.4.5`, `react@19.3.1`, Node 22 (`.nvmrc`). Documentación leída en `node_modules/next/dist/docs/01-app/`:
- `03-api-reference/05-config/01-next-config-js/output.md`
- `03-api-reference/04-functions/{revalidateTag,unstable_cache,fetch}.md`
- `03-api-reference/03-file-conventions/{route,proxy}.md`
- `02-guides/{caching-without-cache-components,self-hosting}.md`

**Experimento** (proyecto desechable con la copia de `node_modules` del repo, `output:'standalone'`, API falsa con contador):

| # | Comprobado | Resultado |
|---|---|---|
| V1 | `next build` con página `force-dynamic` que usa `unstable_cache` | El build **no llama a la API** (contador 0). Rutas `ƒ`. Genera `.next/standalone/server.js`. |
| V2 | `unstable_cache(fn,[k],{tags,revalidate:N})` bajo `force-dynamic` | **Sí cachea**: 2 peticiones → 1 llamada a la API. Tras N s, una respuesta aún vieja (SWR) y la siguiente fresca. |
| V3 | `revalidateTag('services','max')` | La siguiente petición **aún recibe el dato viejo**. Insuficiente para un admin. |
| V4 | `revalidateTag('services',{expire:0})` | La siguiente petición **ya ve el dato nuevo**. Es la forma que indica `revalidateTag.md` para llamadas externas. |
| V5 | API pasa a 503 con dato cacheado y TTL vencido | Next **sigue sirviendo el dato anterior** (200) y loguea `revalidating cache … Error: upstream 503`. Es stale-while-error (R1). También con `{expire:0}` mientras la API está caída. |
| V6 | Arranque en frío con API caída | La página da **500** (no 200 vacío). Un `/api/health` que no toca la API sigue en 200. |
| V7 | Servidor standalone | Lee `HOSTNAME` y `PORT`. Docker inyecta `HOSTNAME`=id del contenedor, así que hay que fijar `HOSTNAME=0.0.0.0`. No copia `public/` ni `.next/static`. Su caché va a `.next/cache/fetch-cache`, dentro del contenedor. |
| V8 | `trailingSlash:true` con route handlers | `/api/x` → **308** a `/api/x/` (también `POST`). `/cv-x.pdf` → 200 sin barra y 308 con barra. Los llamadores deben usar barra final. |
| V9 | `proxy.ts` con `matcher` acotado en standalone | Funciona. Un `redirects()` por host con `statusCode:301` también (pierde la barra final del destino, lo que genera doble salto). Los route handlers reciben `CF-Connecting-IP`. |
| V10 | `path.join(process.cwd(),'node_modules','@fontsource',…)` en un handler | El trazado de archivos lo incluyó en el caso simple. El caso real de `lib/pdf/fonts.ts` lo debe probar T55. |
| V11 | Docs `route.md` | Los `GET` son dinámicos por defecto desde Next 15. Hay que quitar `force-static` del PDF, `robots` y `sitemap`, o hornean `process.env` en el build. |
| V12 | `unstable_cache` | Funciona en 16.4.5, pero la doc lo marca como «reemplazado por `use cache`» (requiere `cacheComponents`). En Vitest necesita mock. |

**API del repo `cv`:**
- Lecturas: `GET /api/v1/{resume,services,projects,architecture}?lang=`.
- Contacto: `POST /api/v1/contact/messages?lang=`. El remitente se identifica por **`CF-Connecting-IP`** (`ContactMessagesResource.java:33,119-126`). Si falta usa la IP del socket, y desde `cv-web` sería la del contenedor: todos compartirían el límite de 5/h (R3).
- Salud: `GET /q/health/ready` (ya usado en el `healthcheck` de `cv-api`).
- CORS ya no hace falta para la web.

**Estilo del repo `cv`:**
- **Compose:** comentarios en español, pegable sin `.env`, valores `CAMBIA`, `container_name`, `restart: unless-stopped`, `healthcheck` con `start_period`, `depends_on … service_healthy`, sin `ports` (comentado), red externa `padelhub_default` para el `cloudflared`; `cv-db` no se une a ella.
- **Dockerfile:** cabecera con comandos locales, usuario `app` no root, `EXPOSE`, `ENTRYPOINT` en forma exec.
- **CI:** `on: push main + tags v* + PR`, `concurrency`, `permissions: contents: read`, job `test` y luego job `docker`:
  - `needs: test`, solo en `push`.
  - Comprobación de secretos `DOCKERHUB_*`.
  - `setup-qemu@v4`, `setup-buildx@v4`, `login@v4`, `metadata-action@v6` (`latest`, `sha`, `semver`).
  - Build amd64 con `load:true` y smoke test.
  - Publicación `linux/amd64,linux/arm64` con `cache-from: type=gha`.
  - Resumen en `$GITHUB_STEP_SUMMARY`.
- **cv-web no tiene** `.github/`, `Dockerfile` ni `deploy/`.

**Código actual de cv-web:**
- `lib/api`:
  - `request.ts`: `node:http`, 2 reintentos, 10 s.
  - `content.ts`: API → escribe respaldo → si falla lee respaldo; memo por proceso.
  - `cache.ts`, `config.ts` (`cacheDir`, `CV_CACHE_DIR`, `SITE_URL` por defecto `cv.floreslab.dev`).
  - Resultados con `source`; `ContentUnavailableError`.
- `page.tsx`: `generateStaticParams`; pasa `apiUrl` por `HomeView` → `ContactSection` → `ContactForm`, que hace fetch CORS desde el navegador.
- `robots`/`sitemap` con `force-static`.
- Rutas PDF con `force-static`; fuentes `.woff` por `process.cwd()/node_modules/@fontsource`.
- `tests/build/build.test.ts` construye en export y lee `out/`; `tests/source.test.ts` (CO-T70/71/72).
- Se reutilizan `tests/helpers/{fake-api,http-server,pdf}.ts` y los fixtures «Ada Ejemplo».

## 1. Objetivo

Servidor Next standalone en el contenedor `cv-web` (junto a `cv-api` y `cv-db`), publicado por el túnel en `floreslab.dev` → `http://cv-web:3000`. Lee en el servidor, con caché de datos etiquetada y TTL corto, desde `http://cv-api:8080`.
- Build sin API ni BD, sin respaldo, sin datos en el repo.
- El navegador solo habla con su propio origen.
- Revalidación protegida por etiqueta, sin WebSocket.
- `/api/health` que comprueba también la API, `HEALTHCHECK` de Docker y `depends_on: service_healthy`.
- PDF dinámico con la etiqueta `resume`, manteniendo la privacidad.
- Dominio `floreslab.dev` en todos los metadatos, con 301 desde `cv.floreslab.dev`.
- Dockerfile multi-arch, CI que publica `julioflores781/cv-web` y compose para el NAS.
- No bloquear la fase 3 (`proxy.ts`, route handlers).

## 2. Diseño

### 2.1 Renderizado y caché
- Páginas con `export const dynamic = 'force-dynamic'` y sin `generateStaticParams`. Se mantiene `resolveRoute() ?? notFound()`. Se cachean los **datos**, no el HTML (V2).
- `lib/api/content.ts` reescrito: `getContent(resource, lang)` = `unstable_cache(() => requestJson(resource, lang), ['cv-web', resource.file, lang], {tags:[resource.tag], revalidate: ttl})`, más `React.cache` por petición para no pasar dos veces por la caché de Next.
- La etiqueta es por tipo (cubre es+en). `lib/api/tags.ts` define `CONTENT_TAGS = ['resume','services','projects','architecture']`, única fuente para recursos, endpoint y tests.
- TTL `CV_CACHE_TTL_SECONDS` (def. 60; valores no numéricos o ≤0 → 60). Existe porque los tests de runtime necesitan 1–2 s.
- Los fallos no se cachean. Se conservan `parse`, `mismatch` de idioma y `ApiFetchError`. Se eliminan `ContentUnavailableError`/`ResumeUnavailableError`, `ContentSource` y `source`.
- Transporte: se conserva `request.ts` (`node:http`), con **timeout 4 s y 1 reintento** (R13). El comentario pasa a «evita doble caché con `fetch`».
- Se eliminan `lib/api/cache.ts` (+test), el memo de `content.ts`, `CV_CACHE_DIR`, `resolveCacheDir`, `cacheDir` y `client.ts` (si no tiene usos).
- `config.ts` sigue siendo el único sitio con `process.env`, leído en la llamada:
  - `apiUrl`: def. `http://cv-api:8080`.
  - `siteUrl`: def. `https://floreslab.dev`.
  - `cacheTtlSeconds`.
  - `revalidateSecret`: `null` si falta o está vacío.
- `resolveProjectImages` lee `public/projects/<id>.webp` sobre `cwd/public`; la imagen copia `public/` junto a `server.js`.

### 2.2 Endpoints
- **`GET /api/health/`** (`lib/api/health.ts`): `GET ${apiUrl}/q/health/ready`, timeout 2 s, sin reintentos. Devuelve `200 {"status":"ok","api":"up"}` o `503 {"status":"degraded","api":"down"}`, con `no-store`. No toca la caché, no filtra URLs ni mensajes.
- **`POST /api/revalidate/`**:
  - `Authorization: Bearer <REVALIDATE_SECRET>` con `timingSafeEqual`.
  - Cuerpo `{"tags":[…]}` con 1–4 etiquetas de `CONTENT_TAGS`, sin duplicados y ≤1 KiB.
  - Llama `revalidateTag(tag,{expire:0})` (V4).
  - Respuestas: 200 `{"revalidated":[…]}`, 400, 401, 405, y **503 si no hay secreto (falla cerrado)**.
  - No loguea el token ni el cuerpo.

### 2.3 PDF dinámico
- Rutas `app/cv-julio-flores-{es,en}.pdf/route.ts` sin `force-static`.
- `getCvPdf` pasa a `unstable_cache` devolviendo **base64** (un `Buffer` no sobrevive a la serialización), con `tags:['resume']` y `revalidate: ttl`.
- El `null` por fallo de render **no se cachea**: la función cacheada lanza, el envoltorio captura, hace `console.warn` y devuelve `null`. Si `getResume` lanza, el error se propaga (5xx).
- `response.ts` añade `Content-Disposition: inline; filename=…` y `Cache-Control: public, max-age=0, must-revalidate` (R5).
- `outputFileTracingIncludes` para los 3 `.woff` de `@fontsource` en las dos rutas PDF.
- `page.tsx` muestra el botón solo en el perfil y solo si `getCvPdf` devolvió buffer.

### 2.4 Contacto
- El navegador hace `POST /api/contact/` (relativo, con barra por V8). `lib/contact/client.ts` pierde `apiUrl`, `mode` y `credentials`, y sigue siendo el único `fetch` de cliente.
- `lib/api/contact.ts` (`forwardContact`) hace el POST a `${apiUrl}/api/v1/contact/messages?lang=` con `node:http`, `Content-Type` y **solo** `CF-Connecting-IP` si es una IP válida. No reenvía cookies, `User-Agent`, `Referer`, `X-Forwarded-For` ni `Authorization`. Timeout 10 s, sin reintentos.
- `app/api/contact/route.ts`:
  - Solo `POST` JSON ≤8 KiB, con `lang` es|en.
  - Valida con `validate.ts`.
  - Responde transparente: 201, 400/429 con el problem de la API, y 502/504 con problem propio (`CONTACT_UPSTREAM`/`CONTACT_TIMEOUT`).
  - `no-store`, sin cookies, sin loguear nombre, email, mensaje ni IP.
- Se retira `apiUrl` de `HomeView`/`ContactSection`/`ContactForm`. La URL interna no puede aparecer en el HTML, así que CO-T75 se invierte.

### 2.5 Dominio
- `siteUrl` por defecto `https://floreslab.dev`; `robots` y `sitemap` pasan a `force-dynamic`.
- Se limpian las menciones a `cv.floreslab.dev` (`CLAUDE.md`, `.env.example`, `config.ts`) y a «Cloudflare Pages» (`CLAUDE.md`, `AGENTS.md`, `docs/web-standards.md`, `.claude/agents/analyst.md`, comentarios de código).
- 301 por `redirects()` con `has host cv.floreslab.dev`, `statusCode:301` y destino con barra final. Necesita un segundo hostname del túnel; la alternativa es una Redirect Rule de Cloudflare (R6).

### 2.6 Docker, CI y compose
- **Dockerfile:**
  - Etapas `node:22-alpine` deps → build → run.
  - Usuario no root; copia `.next/standalone`, `.next/static` y `public`.
  - `mkdir .next/cache && chown`.
  - `ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1`.
  - `HEALTHCHECK` con `node -e fetch('http://127.0.0.1:3000/api/health/')` y `CMD ["node","server.js"]` en forma exec.
  - `.dockerignore`.
  - El `next build` se ejecuta por plataforma (binarios opcionales por arquitectura), bajo QEMU para arm64 (R10).
- **CI:** mismo esqueleto que `cv`.
  - Job `test`: `npm ci`, lint, typecheck, `npm test`.
  - Job `docker` (`needs: test`, solo `push`): `metadata` con `images: <user>/cv-web`, build amd64 `load:true`, smoke test con la API falsa `scripts/parity/design-api.mjs` en una red desechable, y publicación amd64+arm64.
  - El smoke comprueba `/api/health/` 200, `/` con `<h1>`, `/en/`, `sitemap.xml` con `floreslab.dev`, PDF `%PDF-` y `POST /api/revalidate/` sin token → 401.
- **`deploy/docker-compose.yml`:** un único stack con `cv-db`, `cv-api` y `cv-web` (R7).
  - `cv-web`:
    - `image: julioflores781/cv-web:latest`, `container_name`, `restart: unless-stopped`.
    - `depends_on: cv-api: service_healthy`.
    - `environment`: `CV_API_URL=http://cv-api:8080`, `SITE_URL=https://floreslab.dev`, `REVALIDATE_SECRET=CAMBIA-…`.
    - `healthcheck` con `start_period`.
    - `networks: [default, padelhub]`, sin `ports` (comentado).
    - `tmpfs: /app/.next/cache` (R1/R11).
  - `cv-db` sin red `padelhub`.
  - Sin CORS.
- **Túnel (manual):** `floreslab.dev` → `http://cv-web:3000`, y opcionalmente `cv.floreslab.dev` al mismo destino.

### 2.7 `generate:api`
Queda como herramienta manual de desarrollo, fuera del build y de la CI (R8).

## 3. Archivos

**Crear:**
- `lib/api/{tags,health,revalidate,contact}.ts` y sus tests.
- `app/api/{health,revalidate,contact}/route.ts` y sus `route.test.ts`.
- `Dockerfile`, `.dockerignore`, `deploy/docker-compose.yml`, `.github/workflows/ci.yml`.
- `tests/helpers/next-cache.ts`, `tests/helpers/standalone.ts` y `tests/global-build.ts` (un solo `next build` por ejecución).
- `tests/runtime/*.test.ts` y `tests/deploy/deploy-files.test.ts`.

**Tocar:**
- `next.config.ts`.
- `lib/api/{config,content,request,get-resume,services,projects,architecture,errors,index}.ts` y sus tests. Borrar `cache.ts` y `cache.test.ts`.
- `app/[[...slug]]/page.tsx`, `app/robots.ts`, `app/sitemap.ts` y `app/sitemap.test.ts`.
- `lib/pdf/{build-cv-pdf,response}.ts` y `app/cv-julio-flores-*.pdf/route.ts`.
- `lib/contact/client.ts`, `components/{home-view,contact-section,contact-form}.tsx` y sus tests.
- `tests/source.test.ts`, `vitest.config.ts` (`globalSetup`), `package.json` (script `start`), `.env.example`.
- `CLAUDE.md`, `AGENTS.md`, `docs/web-standards.md`, `CHECKPOINTS.md` (C1/C4 obsoletos), `.claude/agents/analyst.md`.
- Sustituir `tests/build/build.test.ts` por `tests/runtime/*`.

## 4. Criterios de aceptación

- **A1** El build funciona sin API ni BD y sin peticiones a ellas, produce `server.js`, y las 4 rutas son dinámicas.
- **A2** No hay respaldo ni `CV_CACHE_DIR`. Con la API caída y sin caché la respuesta es un error (no 200 vacío) sin filtrar URL ni stack, y no se escriben archivos de datos.
- **A3** Con servicios/proyectos/arquitectura vacíos las páginas dan 200 sin esas secciones ni anclas rotas, y no hay contenido en el repo.
- **A4** Las lecturas salen del servidor contra `CV_API_URL`; esa URL no aparece en HTML, RSC ni JS.
- **A5** Caché por etiqueta con TTL corto: N peticiones dentro del TTL dan 1 petición a la API por (tipo, idioma), y tras el TTL se refresca.
- **A6** `/api/revalidate/` es cerrado sin secreto, da 401 con token malo, 400 con etiquetas inválidas y 405 con otros métodos, e invalida de inmediato solo lo pedido.
- **A7** `/api/health/` da 200 con la API lista y 503 si está caída o lenta (≤2 s), sin datos privados ni caché.
- **A8** Los PDF son dinámicos, cacheados con `resume`, en su idioma y sin datos privados. Un render fallido da 404 y omite el botón; con la API caída y sin caché da 5xx.
- **A9** El contacto va por `POST /api/contact/`, valida, reenvía con `CF-Connecting-IP` y solo ese header, mapea 201/400/429/502/504, y no loguea ni guarda datos ni pone cookies.
- **A10** Nada de teléfono/documento/nacimiento en ninguna salida; sin cookies; el navegador no habla con otro origen.
- **A11** Todo apunta a `https://floreslab.dev` con `siteUrl` leído en runtime, nada a `cv.floreslab.dev`, y el host antiguo recibe 301.
- **A12** La imagen es multi-stage, Node 22, standalone, no root, con `HOSTNAME=0.0.0.0`, `HEALTHCHECK`, `CMD` exec, sin secretos, amd64+arm64.
- **A13** La CI hace lint+typecheck+test, luego build amd64 + smoke, luego publica multi-arch `julioflores781/cv-web` (`latest`, `sha`, semver) solo en `push`.
- **A14** Compose con los tres servicios, `depends_on: service_healthy`, `healthcheck`, red `padelhub`, sin `ports`, sin `.env`.
- **A15** Bajo standalone funcionan un route handler `POST` con cookie y un `proxy.ts` con `matcher` acotado.
- **A16** Paridad y regresión: el contenido de las 4 páginas es el mismo y los tests de componentes y de `scripts/parity` siguen en verde.
- **A17** `process.env` solo en `lib/api/config.ts`; `fetch(` solo en `lib/api` y `lib/contact/client.ts` (ruta relativa); sin `node:` en cliente; sin `console.log`.
- **A18** Respuestas inválidas (JSON, forma, idioma, 4xx) no se cachean ni se sirven.
- **A19** Idioma o ruta desconocidos dan 404 sin petición a la API.

## 5. Plan de tests (catálogo completo)

Prefijo `RT-`. Tipos:
- **unit**: Vitest con `next/cache` mockeado por `tests/helpers/next-cache.ts`.
- **componente**.
- **runtime**: servidor standalone real más la API falsa de `tests/helpers/fake-api.ts`, con un único `next build` previo vía `tests/global-build.ts`.
- **config/archivos**: lee texto del repo.
- **CI**: paso del workflow, no Vitest.

Los fixtures son «Ada Ejemplo» más los centinelas privados, nunca el CV real.

### Slug 1 — web-runtime-datos

**`lib/api/config.test.ts` (unit)**
- **T1** — Dado un entorno vacío, cuando se llama `getConfig()`, entonces `apiUrl=http://cv-api:8080`, `siteUrl=https://floreslab.dev`, TTL 60 y `revalidateSecret=null`. A4, A5, A11
- **T2** — Dado `CV_API_URL`/`SITE_URL` con barras finales y `CV_CACHE_TTL_SECONDS=5`, cuando se llama `getConfig()`, entonces se devuelven sin barras y con TTL 5. A4, A5
- **T3** — Dado `CV_CACHE_TTL_SECONDS` con `abc`, `0`, `-3` o `1.5x`, cuando se llama `getConfig()`, entonces el TTL vuelve a 60. A5
- **T4** — Dado `REVALIDATE_SECRET` vacío o solo espacios, cuando se llama `getConfig()`, entonces es `null` (nunca `''`). A6
- **T5** — Dado el objeto de `getConfig()`, cuando se inspeccionan sus claves, entonces no hay `cacheDir` y `CV_CACHE_DIR` no tiene efecto. A2
- **T6** — Dado que el entorno cambia entre dos llamadas, cuando se llama `getConfig()` dos veces, entonces cada una refleja el entorno actual (runtime, no al importar). A4, A11

**`lib/api/content.test.ts` (unit, reescritura)**
- **T7** — Dado una API sana, cuando se pide dos veces `getServices('es')` dentro del TTL, entonces hay 1 petición y los mismos datos. A5
- **T8** — Dado una API sana, cuando se piden `es` y `en` del mismo recurso, entonces hay 2 peticiones, cada una en su idioma. A5
- **T9** — Dado el registro del mock, cuando se piden los 4 recursos, entonces usan las etiquetas `resume|services|projects|architecture` y `revalidate` igual al TTL. A5
- **T10** — Dado un dato cacheado y el reloj pasado el TTL, cuando se vuelve a pedir, entonces hay nueva petición. A5
- **T11** — Dado los 4 recursos cacheados, cuando el mock recibe `revalidateTag('services')`, entonces solo `services` (es y en) se vuelve a pedir. A5, A6
- **T12** — Dado una API que da 500 y sin entrada previa, cuando se pide, entonces lanza `ApiFetchError` tras el reintento, no guarda nada y la siguiente llamada reintenta. A2, A18
- **T13** — Dado una API con 200 y JSON inválido, forma incorrecta o `language` distinto, cuando se pide, entonces lanza y no cachea. A18
- **T14** — Dado una API que da 404 o 400, cuando se pide, entonces lanza sin reintentar y no cachea. A18
- **T15** — Dado una respuesta válida vacía (`[]`; arquitectura sin puertos), cuando se pide, entonces devuelve el vacío y se cachea. A3
- **T16** — Dado una API sana y un cwd temporal, cuando se piden los 4 recursos, entonces no se crea ningún archivo. A2
- **T17** — Dado `lib/api` en `tests/source.test.ts`, cuando se lista, entonces no existen `cache.ts`, `ContentUnavailableError`, `ContentSource` ni el texto `CV_CACHE_DIR`. A2
- **T18** — Dado `getResume/getServices/getProjects/getArchitecture`, cuando se llaman, entonces devuelven solo el dato tipado (sin `source`) y comparten el cacheo de T7. A5

**`lib/api/request.test.ts` (unit, adaptado)**
- **T19** — Dado los valores por defecto, cuando se inspeccionan, entonces timeout 4000 ms y 1 reintento. A5
- **T20** — Dado un 5xx y luego un 200, cuando se pide, entonces reintenta una vez y devuelve el dato; con 4xx no reintenta. A18
- **T21** — Dado un servidor que no contesta, cuando se pide, entonces falla en torno al timeout con `timed out after 4000 ms`. A2
- **T22** — Dado un puerto cerrado, cuando se pide, entonces el error describe `ECONNREFUSED`. A2

**`tests/source.test.ts` y `next.config.test.ts` (config)**
- **T23** — Dado `next.config.ts`, cuando se importa, entonces `output='standalone'`, `images.unoptimized=true`, `trailingSlash=true` y no hay `export`. A1, A12
- **T24** — Dado `page.tsx`, cuando se lee, entonces no exporta `generateStaticParams`, declara `force-dynamic` y no recibe `apiUrl`/`source`. A1, A4

**`tests/runtime/{build,pages}.test.ts` (runtime)**
- **T25** — Dado `next build` con `CV_API_URL` a un puerto cerrado y una API falsa que registra peticiones, cuando termina, entonces sale con 0, la API falsa recibió 0 peticiones y existe `.next/standalone/server.js`. A1
- **T26** — Dado la salida del build, cuando se lee la tabla de rutas y `.next/server/app`, entonces las 4 páginas son dinámicas y ningún `.html` prerenderizado contiene «Ada». A1, A3
- **T27** — Dado una API sana, cuando se piden las 4 páginas, entonces 200 `text/html` con `lang` y `data-mode` correctos y `Cache-Control` no cacheable. A16
- **T28** — Dado una API sana, cuando se piden `/fr/`, `/en/servicios/`, `/servicios` y `/zzz/`, entonces dan 404 o 308 y las 404 no llaman a la API. A19
- **T29** — Dado una API sana, cuando se piden las 4 páginas, entonces cada una tiene un solo `h1`, landmarks, título/description/canonical propios, 3 `hreflang` recíprocos, `og:*` y JSON-LD `Person` válido (migra BA-T45/46, T60). A16, A11
- **T30** — Dado una API sana, cuando se piden las páginas, entonces los datos de Ada salen en su idioma sin mezclarse (BA-T47). A16
- **T31** — Dado una API con centinelas de teléfono/documento/nacimiento, cuando se piden las páginas y los JS de `/_next/static`, entonces ningún centinela aparece en HTML, RSC ni JS (BA-T48). A10
- **T32** — Dado una API sana, cuando se piden las páginas, entonces plano hexagonal, `noscript` por puerto, servicios y proyectos («a consultar») y numeración de secciones coinciden con HX-T41, CO-T74 y CO-T81. A16
- **T33** — Dado una API sana, cuando se piden las páginas, entonces los enlaces externos llevan `noopener noreferrer`, cada `#ancla` tiene `id`, las fuentes salen de `/_next/static/media`, no hay Google Fonts y el favicon da 200 (BA-T49, CO-T80). A10, A16
- **T34** — Dado una API con servicios/proyectos/arquitectura vacíos, cuando se piden las 4 páginas, entonces 200 sin esas secciones, sin enlaces a secciones inexistentes y con h1 y contacto. A3
- **T35** — Dado una API sana, cuando se piden las páginas, entonces HTML, RSC y JS no contienen la URL de `CV_API_URL` ni `cv-api` (inversión de CO-T75/77). A4
- **T36** — Dado una API sana, cuando se pide una página dos veces dentro del TTL, entonces el log de la API muestra 1 petición por (recurso, idioma) y ninguna otra ruta. A5
- **T37** — Dado una API caída desde el arranque, cuando se pide `/`, entonces 500, cuerpo sin `cv-api`, URL interna ni stack, y log con error `[cv-web]`. A2
- **T38** — Dado una API que da 404 al CV, cuando se pide `/`, entonces error controlado (no 200 con h1 vacío) sin filtrar datos internos. A2 (condicionado a R2)
- **T39** — Dado una API que da JSON basura a `projects` y válido al resto, cuando se pide `/`, entonces 500, y tras corregir la API la siguiente petición da 200 (el fallo no se cacheó). A18
- **T40** — Dado datos cacheados y una API que pasa a 503 tras el TTL, cuando se pide la página, entonces 200 con datos anteriores y aviso en el log (V5). A2 (condicionado a R1; se invierte si el humano lo prohíbe)
- **T41** — Dado `public/projects/<id>.webp` para un proyecto propio y público, cuando se pide la página con el servidor standalone, entonces la `<img>` aparece y la imagen da 200; para anónimo o de empleador no. A16

Migración: `tests/build/build.test.ts` se borra y sus casos viven en `tests/runtime`. Se eliminan sin sustituto el respaldo por idioma (T64 viejo), los respaldos de services/projects, el bloque «build with the API down» y BA-T50. Se invierten CO-T75 y CO-T77.

### Slug 2 — web-runtime-endpoints

- **T42** — Dado una API con 200 en `/q/health/ready`, cuando se llama `checkApi()`, entonces `up`. A7
- **T43** — Dado una API con 503, puerto cerrado o >2 s, cuando se llama `checkApi()`, entonces `down` en ~2 s. A7
- **T44** — Dado una API sana, cuando `GET /api/health/`, entonces 200 `{"status":"ok","api":"up"}`, `no-store` y JSON. A7
- **T45** — Dado una API caída, cuando `GET /api/health/`, entonces 503 `{"status":"degraded","api":"down"}` sin URL ni error ni centinelas. A7, A10
- **T46** — Dado la API caída con datos ya cacheados, cuando `GET /api/health/`, entonces sigue en 503. A7
- **T47** — Dado el servidor, cuando `GET /api/health` (sin barra), entonces 308 a `/api/health/` (V8). A7, A12
- **T48** — Dado `REVALIDATE_SECRET` sin configurar, cuando llega cualquier `POST`, entonces 503 y no se invalida nada. A6
- **T49** — Dado un secreto, cuando falta `Authorization`, el esquema es otro o el token es incorrecto (incluida otra longitud), entonces 401 sin invalidar ni lanzar. A6
- **T50** — Dado un token correcto, cuando el cuerpo es JSON inválido, `tags` vacío/ausente, etiqueta desconocida, duplicadas, más de 4 o >1 KiB, entonces 400 sin invalidar nada. A6
- **T51** — Dado un token correcto y `{"tags":["services","projects"]}`, cuando se llama, entonces 200 `{"revalidated":[…]}` y `revalidateTag` se llamó con `('services',{expire:0})` y `('projects',{expire:0})`. A6
- **T52** — Dado el endpoint, cuando llega `GET/PUT/DELETE`, entonces 405 con `Allow: POST`. A6
- **T53** — Dado un token correcto o incorrecto, cuando se llama, entonces ni token ni cuerpo aparecen en el log. A6, A10
- **T54** — Dado el servidor real con TTL 300 s y datos cacheados, cuando la API cambia un servicio y se hace `POST /api/revalidate/` con `services`, entonces la siguiente petición a `/servicios/` ya muestra el cambio y `/` no repidió a la API. A5, A6

Archivos: `lib/api/health.test.ts`, `lib/api/revalidate.test.ts`, `app/api/*/route.test.ts` y `tests/runtime/endpoints.test.ts`.

### Slug 3 — web-runtime-pdf

- **T55** — Dado el servidor standalone y una API sana, cuando se piden los PDF es/en, entonces 200 `application/pdf`, `%PDF-`, <1 MiB y texto «Ada Ejemplo» en su idioma (PD-T22). Prueba además que las fuentes `.woff` están en el standalone. A8
- **T56** — Dado una API con centinelas, cuando se piden los PDF, entonces ni texto, ni metadatos ni bytes los contienen (PD-T24). A8, A10
- **T57** — Dado perfil y servicios, cuando se piden las páginas, entonces solo el perfil enlaza el PDF de su idioma y ni `sitemap` ni `robots` lo listan (PD-T23/26). A8
- **T58** — Dado la caché de `resume` y TTL largo, cuando se pide dos veces el PDF, entonces 1 petición a `/resume`; tras revalidar `resume` el siguiente PDF refleja el cambio. A5, A8
- **T59** — Dado un renderizador que lanza, cuando se llama `getCvPdf`, entonces `null` con `console.warn`, el fallo no se cachea y la ruta da 404 `text/plain`. A8
- **T60** — Dado que `getResume` lanza, cuando se llama `getCvPdf` y se pide la ruta, entonces el error se propaga y la ruta da 5xx. A8, A2
- **T61** — Dado `cvPdfResponse`, cuando devuelve un PDF, entonces lleva `Content-Disposition: inline; filename="cv-julio-flores-<lang>.pdf"` y `Cache-Control: public, max-age=0, must-revalidate`. A8
- **T62** — Dado `getCvPdf` con base64 en caché, cuando se obtiene desde la caché, entonces el `Buffer` es idéntico al renderizado y no hay `Map` de memo por proceso. A8
- **T63** — Dado el resto de tests de `lib/pdf` (`cv-document`, `fonts`, `theme`, `privacy`), cuando se ejecutan, entonces siguen en verde (PD-T1..T13, T28). A16

Archivos: `lib/pdf/{build-cv-pdf,response}.test.ts` y `tests/runtime/endpoints.test.ts`.

### Slug 4 — web-runtime-contacto

- **T64** — Dado valores válidos y `CF-Connecting-IP: 203.0.113.9`, cuando `forwardContact`, entonces la API recibe `POST /api/v1/contact/messages?lang=es`, `Content-Type: application/json`, el JSON `{name,email,message,website}` recortado y ese header. A9
- **T65** — Dado `Cookie`, `Authorization`, `User-Agent`, `Referer`, `X-Forwarded-For` y un `CF-Connecting-IP` inválido (`<script>`, `1.2.3.4, 5.6.7.8`, >45), cuando se reenvía, entonces la API no recibe ninguno, y el IP solo si es válido. A9, A10
- **T66** — Dado una API con 201, 400 `CONTACT_INVALID`, 429, 500, timeout o puerto cerrado, cuando se reenvía, entonces `sent`, el problem, el rate-limit, `upstream-error`, `timeout` y `unreachable`, sin lanzar. A9
- **T67** — Dado una API con 5xx, cuando se reenvía, entonces no hay reintento (1 petición). A9
- **T68** — Dado un `POST` JSON válido con API 201, cuando llega, entonces 201 sin cuerpo, `no-store` y sin `Set-Cookie`. A9, A10
- **T69** — Dado una API con 400 `CONTACT_INVALID` o 429, cuando llega el `POST`, entonces mismo status y `problem+json` de la API. A9
- **T70** — Dado una API caída o sin respuesta, cuando llega el `POST`, entonces 502/504 con `CONTACT_UPSTREAM`/`CONTACT_TIMEOUT`, sin URL ni error interno. A9, A4
- **T71** — Dado un `POST` >8 KiB, `Content-Type` no JSON, JSON inválido, campos no string, `name` vacío, `email` mal formado o `message` <10 o >2000, cuando llega, entonces 400/413/415 con problem y la API no recibe petición. A9
- **T72** — Dado `GET/PUT/DELETE`, cuando llega, entonces 405 con `Allow: POST`. A9
- **T73** — Dado el honeypot `website` con contenido, cuando llega, entonces se reenvía tal cual. A9
- **T74** — Dado envíos válidos e inválidos, cuando se observa el log, entonces no contiene nombre, email, mensaje ni IP. A9, A10
- **T75** — Dado `lang=en`, cuando llega, entonces la API recibe `?lang=en`; con `fr` o ausente, `es`. A9
- **T76** — Dado el servidor real, cuando `POST /api/contact` sin barra, entonces 308 a `/api/contact/`, y el cliente llama directo a la ruta con barra. A9
- **T77** — Dado `sendContactMessage`, cuando envía, entonces hace `fetch('/api/contact/?lang=…')` relativo, `POST`, solo `Content-Type`, sin `mode`/`credentials`, y mapea 201/400/429/5xx/red/timeout/aborto a los mismos `SendResult`. A9
- **T78** — Dado `ContactForm`, `ContactSection` y `HomeView`, cuando se renderizan, entonces no aceptan `apiUrl` y los tests de componente siguen en verde. A4, A16
- **T79** — Dado el código de producción, cuando se analiza, entonces `fetch(` solo en `lib/api/*` y `lib/contact/client.ts`; este sin `http(s)://` ni `process.env`; `process.env` solo en `lib/api/config.ts`. A17
- **T80** — Dado el cliente `'use client'`, cuando se analiza, entonces no importa `node:*` ni `@/lib/api` salvo tipos. A17

Archivos: `lib/api/contact.test.ts`, `app/api/contact/route.test.ts`, `lib/contact/client.test.ts`, `components/contact-form.test.tsx`, `tests/source.test.ts` y runtime.

### Slug 5 — web-runtime-dominio

- **T81** — Dado `buildMetadata`, `buildPersonJsonLd`, `sitemap` y `robots` con el `siteUrl` por defecto, cuando se invocan, entonces todas las URLs empiezan por `https://floreslab.dev` y ninguna contiene `cv.floreslab.dev`. A11 (`lib/seo/*.test.ts`, `app/sitemap.test.ts`, test nuevo de `robots`)
- **T82** — Dado el servidor con `SITE_URL=https://example.test`, cuando se piden `/sitemap.xml`, `/robots.txt` y `/`, entonces canonical, hreflang, OG, JSON-LD, sitemap (4 URLs con alternates) y `Sitemap:` usan ese origen (prueba runtime, no horneado). A11
- **T83** — Dado el repo, cuando se buscan `cv.floreslab.dev`, `pages.dev` y «Cloudflare Pages» en código, docs de la web y `.env.example` (sin `design/` ni `progress/`), entonces no hay coincidencias. A11 (`tests/source.test.ts`)
- **T84** — Dado el servidor y `Host: cv.floreslab.dev` a `/`, `/servicios/`, `/en/services/` y `/cv-julio-flores-es.pdf`, cuando se envía, entonces 301 a `https://floreslab.dev/<misma ruta>` en un salto; con `Host: floreslab.dev` no hay redirección. A11
- **T85** — Dado `robots.txt`, cuando se pide, entonces permite `/`, apunta al sitemap de `floreslab.dev`, y `/api/health/` y `/api/revalidate/` no figuran en el sitemap. A11, A6

### Slug 6 — web-runtime-docker

- **T86** — Dado `Dockerfile`, cuando se lee, entonces es multi-stage con `node:22…`, copia `.next/standalone`, `.next/static` y `public`, tiene `USER` no root, `HOSTNAME=0.0.0.0`, `PORT=3000`, `EXPOSE 3000`, `HEALTHCHECK` a `/api/health/` (con barra) y `CMD` exec, sin `.env*` ni secretos. A12
- **T87** — Dado `.dockerignore`, cuando se lee, entonces excluye `node_modules`, `.next`, `out`, `.git`, `.env*`, `progress` y `design`. A12
- **T88** — Dado `deploy/docker-compose.yml`, cuando se parsea, entonces declara `cv-db`, `cv-api` y `cv-web` con `julioflores781/cv-web`, `depends_on.cv-api = service_healthy`, `healthcheck`, redes `default` y `padelhub`, `restart: unless-stopped`, sin `ports` activos, sin `env_file` ni `${VAR}`, con `CV_API_URL`, `SITE_URL` y `REVALIDATE_SECRET=CAMBIA-…`. A14
- **T89** — Dado el compose, cuando se parsea, entonces `cv-db` no está en `padelhub`, `cv-api` conserva su `healthcheck` `/q/health/ready` y `cv-web` monta `tmpfs` en `/app/.next/cache`. A14
- **T90** — Dado `ci.yml`, cuando se parsea, entonces dispara en `push` a `main`, tags `v*` y PR; el job `docker` tiene `needs: test` e `if: push`; usa qemu, buildx, login y metadata con `images` terminando en `/cv-web`; build de prueba `linux/amd64` con `load:true`; publicación `linux/amd64,linux/arm64`; secretos solo vía `secrets.*`; `permissions: contents: read`. A13
- **T91** — Dado el job `test`, cuando se lee, entonces ejecuta `npm ci`, lint, typecheck y `npm test` con Node 22. A13
- **T92** — Dado el standalone arrancado desde el temporal del harness (estructura de la imagen), cuando se piden `/`, un CSS de `/_next/static/…` y `/hex-grid-plano.svg`, entonces los tres dan 200. A12
- **T93** — Dado la imagen de CI (amd64) con la API falsa en una red desechable, cuando se levanta, entonces `healthy`, `/api/health/` 200, `/` con `<h1>`, `/en/` con `lang="en"`, `sitemap.xml` con `floreslab.dev`, PDF `%PDF-` y `POST /api/revalidate/` sin token → 401. A12, A13 (CI)
- **T94** — Dado el contenedor del smoke, cuando recibe `SIGTERM`, entonces sale con 0 en <10 s. A12 (CI)
- **T95** — Dado la imagen publicada, cuando se inspecciona el manifiesto, entonces contiene `linux/amd64` y `linux/arm64`. A13 (CI, `buildx imagetools inspect`)

Archivos: `tests/deploy/deploy-files.test.ts`, `tests/runtime/*` y pasos de CI.

### Slug 7 — web-runtime-regresion

- **T96** — Dado el árbol completo, cuando se ejecutan lint, typecheck y `npm test`, entonces todo verde y el nº de archivos de test no baja salvo los borrados de §5. A16
- **T97** — Dado `scripts/parity/*.test.ts`, cuando se ejecutan, entonces pasan sin cambios, y `parity:api` + `CV_API_URL=http://localhost:4020 npm run dev` sirve las 4 páginas con los datos del diseño. A16
- **T98** — Dado la API «datos del diseño» y el standalone, cuando se capturan `perfil` y `servicios`, entonces `parity:diff` queda bajo el umbral del 3 % por banda (manual con Chrome DevTools, como en la ronda 4). A16
- **T99** — Dado una copia temporal del proyecto con un `proxy.ts` (`matcher ['/admin/:path*']`) y un `POST /api/probe` que escribe cookie `httpOnly`, cuando se construye y arranca en standalone, entonces el build lista el Proxy, `/admin/x` pasa por él, sale `Set-Cookie` y las 4 páginas públicas no cambian. A15 (lento; `tests/runtime/proxy-ready.test.ts`, nunca en el repo)
- **T100** — Dado `CLAUDE.md`, `AGENTS.md`, `docs/web-standards.md`, `CHECKPOINTS.md` y `.env.example`, cuando se leen, entonces describen el servidor standalone y las variables `CV_API_URL`/`SITE_URL`/`REVALIDATE_SECRET`/`CV_CACHE_TTL_SECONDS`, y no mencionan `output:'export'`, `CV_CACHE_DIR`, respaldo ni Cloudflare Pages. A11, A16
- **T101** — Dado el flujo local completo (API falsa + standalone + contacto + revalidación), cuando se recorre la lista de verificación real, entonces todos los pasos se cumplen. A1–A16 (manual, evidencia en `impl.md`)

Lista de verificación real: `parity:api` → `next build` sin esa API → standalone con `CV_API_URL=http://localhost:4020` → curl a páginas, health, PDF y sitemap → matar la API falsa y comprobar T37/T40 → `docker build` + `docker run` con el `HOSTNAME` por defecto de Docker → `buildx` multi-arch (opcional).

### Matriz criterio → tests

| Criterio | Tests |
|---|---|
| A1 | T23–T26 |
| A2 | T5, T12, T16, T17, T21, T22, T37, T38, T40, T60 |
| A3 | T15, T26, T34 |
| A4 | T1, T2, T6, T24, T35, T70, T78 |
| A5 | T1–T3, T7–T11, T18, T19, T36, T54, T58 |
| A6 | T4, T11, T48–T54, T85 |
| A7 | T42–T47 |
| A8 | T55–T63 |
| A9 | T64–T77 |
| A10 | T31, T33, T45, T53, T56, T65, T68, T74 |
| A11 | T1, T2, T6, T29, T81–T85, T100 |
| A12 | T23, T47, T86, T87, T92–T94 |
| A13 | T90, T91, T93, T95 |
| A14 | T88, T89 |
| A15 | T99 |
| A16 | T27, T29–T33, T41, T63, T78, T96–T98 |
| A17 | T79, T80 |
| A18 | T12–T14, T20, T39 |
| A19 | T28 |

Todos los criterios están cubiertos. T38 y T40 dependen de decisiones abiertas (R2, R1).

## 6. Privacidad / SEO / accesibilidad

- **Privacidad:**
  - El CV sigue sin teléfono, documento ni nacimiento (T31, T45, T56).
  - Los visitantes anónimos no reciben cookies, analítica ni terceros.
  - La web no registra ni guarda nada del formulario (T74).
  - Solo reenvía `CF-Connecting-IP` a la API, que la guarda hasheada con sal.
  - Hay que documentarlo en `docs/web-standards.md`.
- **Endpoints internos:**
  - `/api/health/` no devuelve datos.
  - `/api/revalidate/` es cerrado sin secreto.
  - El secreto vive en el compose (`CAMBIA-…`), nunca en el repo.
  - La fase 2 usará un secreto distinto para el admin.
- **SEO:**
  - Metadatos con `metadataBase` en runtime.
  - 301 desde `cv.floreslab.dev`.
  - Sitemap y robots dinámicos en `floreslab.dev`.
  - Los PDF fuera del sitemap.
  - Los 500 no deben ser cacheables por Cloudflare.
- **Accesibilidad:** sin cambios de marcado; el formulario conserva sus estados y el `noscript` del plano.

## 7. Datos y resiliencia

- **Sin respaldo persistente:** la única copia es la caché de Next en el contenedor (memoria + `fetch-cache`), con `tmpfs` para que no sobreviva a un reinicio.
- **Stale-while-error:** con datos cacheados y la API caída, la web sigue sirviendo el último dato (V5). En frío da 500 (V6). Ver R1.
- **API vacía:** secciones omitidas. Sin CV (404 de `resume`): error controlado (R2).
- **Fallos no cacheados:** JSON, forma e idioma inválidos, 4xx y 5xx no se guardan.
- **Latencia:** lecturas 4 s + 1 reintento (peor caso ~8 s en frío), salud 2 s, contacto 10 s sin reintento.
- **Arranque:** `depends_on: cv-api: service_healthy`, y el `HEALTHCHECK` propio lleva `start_period`.

## 8. Alternativa descartada

1. **`use cache` + `cacheComponents`.** Es la API recomendada, pero cambia el modelo de renderizado de toda la app: los segment configs dejan de aplicar, hay que usar `<Suspense>` y se reestructuran `generateMetadata` y `HomeView`. Eso pone en riesgo 6 slugs ya APPROVED. `unstable_cache` está verificado (V2–V5) y queda aislado en `content.ts` y `build-cv-pdf.ts`.
2. **ISR de páginas.** Exigiría leer la API en el build, que el brief prohíbe, y complica la invalidación por tipo.
3. **`fetch` con `next:{revalidate,tags}` en lugar de `node:http` + `unstable_cache`.** Se pierden la validación y los reintentos ya probados, y aparece una segunda caché implícita.
4. **WebSocket/SSE.** Descartado por el brief.
5. **Redirect de `cv.floreslab.dev` por `proxy.ts`.** Funciona (V9), pero `next.config` es declarativo, o se usa una Redirect Rule de Cloudflare (R6).

## 9. Riesgos / dudas

- **R1 (decisión humana) — stale-while-error.** Con datos cacheados y la API caída, la web no cae: sirve el último dato. No es un respaldo persistente (`tmpfs`) y el caso real con ambos contenedores en el mismo NAS es limitado, pero no es literalmente «cae». Opciones: (a) aceptarlo (recomendado); (b) un TTL duro que lance, con más código. T40 se invierte si se elige (b). `/api/health/` sí refleja la API caída (T46).
- **R2 — Base sin CV.** El perfil depende de `resume` (nombre, h1, JSON-LD). Si da 404, este plan lo trata como error controlado (T38). Una portada mínima sin CV sería funcionalidad nueva.
- **R3 — IP del remitente.** Sin `CF-Connecting-IP`, todos los visitantes comparten el límite de 5/h de la API. Verificar con un smoke manual en el NAS tras desplegar.
- **R4 — `trailingSlash:true` con handlers (V8).** Los llamadores deben usar barra final. Alternativa: quitar `trailingSlash`, lo que cambia las canonical (`/servicios` en vez de `/servicios/`). Decisión humana; con dominio nuevo es el momento más barato.
- **R5 — Cloudflare cachea `.pdf` por extensión.** Se usa `max-age=0, must-revalidate`. Confirmar la regla de caché de la zona.
- **R6 — 301:** por `next.config` (necesita segundo hostname del túnel) o por Redirect Rule (sin código, sin test). Si se elige la segunda, se borra T84.
- **R7 — Un solo compose con los tres servicios** duplica el de `cv`. Recomendación: este pasa a ser el canónico del NAS y el de `cv` se marca como solo-API (cambio fuera de este repo). CORS deja de ser necesario.
- **R8 — `generate:api`:** el brief lo lista entre lo que «cambia»; se deja como herramienta manual sin uso en build ni CI. Confirmar.
- **R9 — Error en frío:** la página 500 por defecto de Next, sin marca. Una página de mantenimiento ES/EN sería un añadido.
- **R10 — arm64 bajo QEMU** tarda más; medir antes de decidir un runner arm64.
- **R11 — Caché de runtime en disco** (`.next/cache`): `tmpfs` en el compose, escribible por el usuario no root.
- **R12 — Árbol sin commit:** los 6 slugs `web-redesign-*` siguen sin commit y este trabajo toca los mismos archivos (`page.tsx`, `lib/pdf`, `lib/contact`, `components/contact-*`). Cerrar en orden o aceptar un commit grande.
- **R13 — Valores que este plan propone y no fija el brief:** TTL 60 s, timeout 4 s + 1 reintento, tope de 8 KiB del contacto, 4 etiquetas por revalidación y el `Cache-Control` de los PDF.

## 10. Slugs hijos recomendados

Una tarea a la vez; cada slug deja lint, typecheck y `npm test` en verde.

| Orden | Slug | Contenido | Depende de | Tests |
|---|---|---|---|---|
| 1 | `web-runtime-datos` | `next.config` standalone; `lib/api` (config, tags, content con `unstable_cache`, request, borrado de respaldo/`source`); páginas dinámicas; harness (`next-cache`, `standalone`, `global-build`); migración de `tests/build` a `tests/runtime/{build,pages}`; limpieza de `source.test.ts` | — | T1–T41 |
| 2 | `web-runtime-endpoints` | `/api/health/` y `/api/revalidate/` | 1 | T42–T54 |
| 3 | `web-runtime-pdf` | PDF dinámico cacheado con `resume`, `outputFileTracingIncludes`, cabeceras | 1 (y 2 para T58) | T55–T63 |
| 4 | `web-runtime-contacto` | `POST /api/contact/`, `lib/api/contact.ts`, cliente y componentes sin `apiUrl` | 1 | T64–T80 |
| 5 | `web-runtime-dominio` | `floreslab.dev`, robots/sitemap dinámicos, 301, limpieza de docs, `.env.example` y menciones a Pages | 1 | T81–T85 |
| 6 | `web-runtime-docker` | `Dockerfile`, `.dockerignore`, compose, `ci.yml`, smoke | 1–5 | T86–T95 |
| 7 | `web-runtime-regresion` | Paridad y regresión, test de `proxy.ts`, docs finales, verificación extremo a extremo | 1–6 | T96–T101 |

Los slugs 2–5 son independientes entre sí tras el 1; el orden propuesto prioriza lo que desbloquea el smoke del 6. Si el 1 es demasiado grande, partirlo en «`lib/api` + unitarios» (T1–T22) y «páginas dinámicas + harness + migración» (T23–T41), con el primero obligatorio antes.
