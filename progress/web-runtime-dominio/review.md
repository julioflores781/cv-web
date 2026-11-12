# Review — web-runtime-dominio (ronda 2)

## Veredicto: APPROVED

Ronda 2: el hallazgo de la ronda 1 está corregido y no se introdujo nada nuevo. «Cambios requeridos» queda vacío. Los hallazgos de la ronda 1 se conservan abajo como historial.

### Ronda 2
- `docs/web-standards.md:18`: ahora dice «pensado para el healthcheck del contenedor». Ya no afirma que `HEALTHCHECK` o `depends_on` existan.
- `CLAUDE.md:26`: «pensado para correr en un contenedor del NAS… (imagen y compose: slug `web-runtime-docker`, aún no existen)». Es exacto.
- Búsqueda de Dockerfile, compose, HEALTHCHECK, depends_on, workflow, ghcr e imagen en `CLAUDE.md`, `AGENTS.md`, `CHECKPOINTS.md`, `docs/web-standards.md`, `.claude/agents/*` y `.env.example`: ninguna otra afirmación presenta como existente algo del slug de Docker o CI.
- Node 22.23.1: lint y typecheck limpios. El build sale con `ƒ /robots.txt` y `ƒ /sitemap.xml`. `npm test` dos veces: 74 archivos y 337 tests verdes en ambas.
- Búsqueda de `cv.floreslab.dev`, `pages.dev` y `Cloudflare Pages` fuera de `progress/`: 0 coincidencias.

## Ronda 1 (historial): hallazgos

## Verificación ejecutada (Node 22.23.1)
- `npm run lint` y `npm run typecheck`: limpios.
- `npm run build`: OK. `ƒ /robots.txt`, `ƒ /sitemap.xml`, `ƒ /[[...slug]]`, `ƒ /api/contact`, `ƒ /api/health`, `ƒ` ambos PDF. Solo `/_not-found` e `/icon.svg` son `○`.
- `npm test` dos veces: 74 archivos, 337 tests verdes en ambas.
- Búsqueda propia (todo el árbol, incluidos archivos sin versionar; excluye `node_modules`, `.next`, `.git`, `progress/`) de `cv.floreslab.dev`, `pages.dev`, `Cloudflare Pages`: 0 coincidencias.
- Búsqueda de `output: 'export'`, `CV_CACHE_DIR`, respaldo, «propuesta B» y `preview.html` en docs, `.claude`, `.env.example`, `app`, `lib` y `next.config.ts`: las únicas coincidencias son negaciones correctas («sin caché ni respaldo») y `lib/api/config.test.ts:22`, un test que comprueba que `CV_CACHE_DIR` se ignora.
- Standalone real (copia de `.next/standalone`, API falsa de `scripts/parity`, `SITE_URL=https://rev.example.org`):
  - `robots.txt` da `Allow: /` y `Sitemap: https://rev.example.org/sitemap.xml`.
  - `sitemap.xml`: 16 URLs (4 `<loc>` + 12 alternates), todas en `rev.example.org`.
  - Las 4 páginas dan 200 y llevan canonical, hreflang es/en/x-default, `og:url` y JSON-LD `url` en el origen dado.
  - La única aparición de `floreslab` en el HTML es la URL de un proyecto (`padelhub.floreslab.dev`) del copy de `scripts/parity/design-data.json`, no el host del sitio.
  - `Host: cv.floreslab.dev` responde 200 sin `Location`: no hay redirección.
  - `/api/health/` da `degraded/api:down` porque esa API falsa no tiene `/q/health/ready`. Es coherente con lo documentado.

## Trazabilidad Tn ↔ it()
| Tn | it() | Comprobación |
|---|---|---|
| T87 | `lib/seo/metadata.test.ts:14`, `lib/seo/json-ld.test.ts:10`, `app/sitemap.test.ts:7`, `app/robots.test.ts:6` | Cubre las cuatro funciones con el `siteUrl` por defecto. OK. |
| T88 | `tests/runtime/domain.test.ts` (T88) | Servidor con `SITE_URL=https://example.test`. Comprueba canonical, 3 hreflang, `og:url`, JSON-LD, sitemap con 4 `<loc>` y 12 alternates, y `Sitemap:`. Verifica que no queda `floreslab.dev`. OK. |
| T89 | `tests/source.test.ts:120` | Excluye `progress/` y busca los 3 patrones. OK; ver observación sobre archivos sin versionar. |
| T90 | `tests/runtime/domain.test.ts` (T90) | `Host` con el subdominio antiguo: 200, sin `location`, mismo estado que un host normal. OK. |
| T91 | `tests/runtime/domain.test.ts` (T91) | Servidor con `floreslab.dev`: `User-Agent: *`, `Allow: /`, `Sitemap:` correcto y sin `/api/` en el sitemap. OK. |

Los cinco tests coinciden con el plan. No hay tests extra.

## Trazabilidad criterios ↔ tests
- A9: T87 a T91, más T6, T7, T9, T23 y T29 de slugs anteriores. Cubierto.
- T105 (docs): contrastado a mano contra el código en la sección siguiente.

## Docs contra código
Confirmado en código:
- `output: 'standalone'`, `trailingSlash` e imágenes sin optimizar (`next.config.ts`).
- `force-dynamic` en `page.tsx`, `robots.ts`, `sitemap.ts`, los dos PDF, `/api/health` y `/api/contact`.
- Solo `lib/api/config.ts` lee `process.env`, por llamada; defaults `http://cv-api:8080` y `https://floreslab.dev`.
- `React.cache` solo en `lib/api/content.ts:20`; transporte `node:http(s)` sin caché.
- `/api/health`: 200 `{"status":"ok","api":"up"}` o 503, con `no-store`.
- `/api/contact`: POST que valida y reenvía; el cliente llama a `/api/contact/?lang=`.
- PDF: clave por contenido, `ETag`, `Cache-Control: no-cache`, 404 si el render falla.
- Existe `design/artifact-v2/project/Main.dc.html`.
- `.env.example` y `analyst.md` son consistentes con lo anterior.

## Privacidad
Sin hallazgos. El diff no toca contacto. Los tests usan «Ada Ejemplo».

## Skills consultadas
- simplify: sin hallazgos. `robots.ts` y `sitemap.ts` reutilizan `getConfig`, `pageUrl` y `buildLanguageAlternates`; no hay duplicación.
- next-best-practices: sin hallazgos. `force-dynamic` en metadata routes es correcto y sale `ƒ`; no hay `redirects()`.
- strict-typing: sin hallazgos. `robots.ts` y `sitemap.ts` devuelven `MetadataRoute.*`; `domain.test.ts` tipa `getWithHost` y evita `any`.
- seo-audit: sin hallazgos de código. Canonical, hreflang, `og:url`, JSON-LD y sitemap siguen `SITE_URL` en runtime (curl real arriba).
- ui-ux-pro-max y testing-strategy: no aplican (sin UI ni foco en tests).

## Checkpoints C1–C7
- C1: lint, typecheck, test y build verdes; rutas `ƒ` confirmadas.
- C2: Tn ↔ it() completo.
- C3: sin teléfono, documento ni fecha de nacimiento nuevos.
- C4: docs correctas (500, estados vacíos, 503 de health), salvo el hallazgo de abajo.
- C5: SEO por `SITE_URL` verificado.
- C6: `progress/current.md` indica `web-runtime-dominio`.
- C7: no aplica en esta ronda.

## Cambios requeridos
Ninguno (ronda 2). Hallazgo de la ronda 1, ya corregido:
1. `docs/web-standards.md:18` afirma que `/api/health/` lo usan «el `HEALTHCHECK` y `depends_on: service_healthy`». En el repo no existen `Dockerfile`, `docker-compose*` ni `deploy/` (el propio `impl.md` lo reconoce). El doc describe como real algo que aún no está implementado, y el encargo exige exactitud.
   - Corrección: reformular sin afirmar ese uso, por ejemplo «pensado para el healthcheck del contenedor» o «lo usará…», o quitar el paréntesis hasta que exista el slug de despliegue.

## Observaciones fuera de alcance
- `tests/source.test.ts:114`: T89 recorre `git ls-files`, así que un archivo nuevo sin versionar no se escanea hasta que se haga `git add`. Mi búsqueda sobre todo el árbol dio 0 coincidencias. Conviene repetirla al cerrar.
- `app/not-found.tsx`, estático (`○`): muestra el host de `siteUrl` como etiqueta, fijado en el build. Ya anotado en `impl.md`; es una página noindex.
- `.gitignore` sigue listando `design/preview.html`. Es deliberado y está documentado en `impl.md`.
- `scripts/parity/design-data.json` contiene copy real del CV (por ejemplo URLs de proyectos). Pertenece a la auditoría R10 antes de publicar el repo.
- El puerto 4031 de esta máquina estaba ocupado por un `next-server` previo (PID 25693) que no es mío. Lo dejé intacto y usé otro puerto.
