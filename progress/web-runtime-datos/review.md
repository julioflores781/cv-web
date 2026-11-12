# web-runtime-datos — review

## Veredicto final (ronda 2): APPROVED

Ronda 2 abajo; la ronda 1 se conserva como historial (veredicto entonces: CHANGES_REQUESTED).

## Ronda 2
- Cambio 1: `lib/api/content.test.ts:29-31` define `fixtureFor(url)`, usada en T16 (`:97`) y T18; sin copia restante. OK.
- Cambio 2: `tests/helpers/env.ts` (`cleanEnv`) es el único filtro de `process.env`; lo usan `tests/global-build.ts` y `tests/helpers/standalone.ts:63`. OK.
- Cambio 3: `tests/global-build.ts` ahora hace `catch { rm(standaloneDir); throw }`; en éxito lo borra el teardown. OK.
- Repetido con Node 22: lint, typecheck y build verdes (rutas `ƒ` igual que antes); `npm test` x2: 62 archivos / 283 tests verdes ambas veces; 0 procesos standalone/next tras cada ejecución y 0 temporales `cv-web-*` en `$TMPDIR`.
- Cambios requeridos: ninguno. Skills y checkpoints: sin cambios respecto a la ronda 1.

## Ronda 1 (historial) — CHANGES_REQUESTED

Funcionalmente el slug está bien: todo el plan T6–T41 está cubierto y A1/A2 se confirmaron con peticiones reales. Se rechaza solo por tres smells accionables sobre el diff (duplicación y una fuga de directorio temporal en el harness), que la regla del reviewer no permite aprobar con nits. No hay hallazgos de comportamiento, privacidad ni alcance.

## Verificación ejecutada (Node 22.23.1)
- `npm run lint`: verde. `npm run typecheck`: verde.
- `npm test` ejecutado 2 veces seguidas: 62 archivos / 283 tests verdes las dos (9,3 s y 8,5 s). Sin flaky.
- Sin procesos huérfanos tras cada ejecución (`ps` sin `server.js` standalone ni `next`), y los directorios temporales de standalone no quedan.
- `npm run build`: verde. Tabla de rutas: `ƒ /[[...slug]]`, `ƒ` en los dos PDF; `○` solo en `/_not-found`, `icon.svg`, `robots.txt`, `sitemap.xml` (estos tres son de los slugs `-dominio`/`-salud`, fuera de alcance aquí). Las fuentes `.woff` de `@fontsource` están en `.next/standalone/node_modules` (208 archivos).
- **Prueba real con curl** (standalone copiado a un temporal + API falsa propia con contador, puertos 47001/47002; ambos procesos parados al terminar):
  - **A1:** `next build` no hizo peticiones a la API (T25 y el contador a 0 antes de la primera petición).
  - **A4:** una página = 4 peticiones (1 por recurso); 2 páginas = 8, es decir, sin caché entre peticiones.
  - **A2 cambio:** tras cambiar un servicio en la API, la siguiente petición a `/servicios/` ya lo muestra.
  - **A2 caída:** con la API a 503, `/` da **500**; el cuerpo (7,7 KB) tiene 0 apariciones de `127.0.0.1`, `47001`, `cv-api`, `ECONN`, `node_modules`, `ApiFetch`. El log del servidor lleva `[cv-web] <Recurso> (es) unavailable: ...`.
  - **A4 URL:** 0 apariciones de la URL de la API en HTML y RSC de las 4 páginas. `canonical` toma `SITE_URL` en runtime (`https://floreslab.dev/en/`).
  - `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`.

## Trazabilidad Tn ↔ it()
Revisados uno a uno contra el cuerpo real de cada `it()`; todos hacen lo que dice la descripción.

| Tn | it() | Resultado |
|---|---|---|
| T6–T9 | `lib/api/config.test.ts` (4 `it`) | OK. T8 comprueba claves exactas y que `CV_CACHE_*` no tienen efecto; T9 usa `vi.stubEnv` entre llamadas. |
| T10–T16, T18 | `lib/api/content.test.ts` | OK. T10 2 peticiones; T11 contenido nuevo; T12 `ApiFetchError`, 2 peticiones por llamada y sin estado; T13 JSON inválido/forma/idioma; T14 404 y 400 sin reintento; T15 vacío válido; T16 cwd temporal vacío; T18 sin `source`. |
| T17 | `tests/source.test.ts` «T17…» | OK (cache.ts ausente + regex sobre código de producción). |
| T19–T22 | `lib/api/request.test.ts` | OK. T21 mide 3900–6000 ms y `timed out after 4000 ms`. |
| T23 | `next.config.test.ts` | OK. |
| T24 | `tests/source.test.ts` «T24…» | OK. |
| T25, T26 | `tests/runtime/build.test.ts` | OK. T25 usa solo la API falsa que registra (no puerto cerrado): desviación anotada en impl.md y válida (más fuerte: fallaría si el build tocara la API). |
| T27–T34, T36 | `tests/runtime/pages.test.ts` | OK. |
| T35, T37–T40 | `tests/runtime/resilience.test.ts` | OK. T39 envía cuerpo no-JSON crudo (`{ garbage`). |
| T41 | `pages.test.ts` «project screenshots» | OK: solo el proyecto propio y público muestra imagen. |

Extras anotados en impl.md (4) comprobados: son legítimos (migración PA/BA-T51/PD-T27).

## Trazabilidad criterios ↔ tests
A1: T23–T26. A2: T8, T10–T12, T16, T17, T21, T22, T35, T37–T40 (+ curl). A4: T6, T7, T9, T24, T34, T36 (+ curl). A8: T31, T33. A14: T27, T29, T30, T32, T33, T41. A15: T17, T18, T24. A16: T12–T14, T19, T20, T39. A17: T28. Todos cubiertos.

## Eliminaciones
`lib/api/cache.ts`, `cache.test.ts`, `client.ts`, `client.test.ts`, `get-resume.test.ts` y `tests/build/build.test.ts` borrados. `ContentUnavailableError`, `ResumeUnavailableError`, `ContentSource`, `ResumeResult`, `source`, `CV_CACHE_DIR`, `cacheDir` y `resolveCacheDir`: sin ninguna referencia (grep en `app components lib scripts tests next.config.ts docs .env.example CLAUDE.md AGENTS.md .claude`; solo quedan las menciones deliberadas en T8/T17). Sin `unstable_cache`, `next/cache` ni `revalidateTag` en producción.

## Alcance
- `process.env` solo en `lib/api/config.ts:16` (la otra aparición es `scripts/generate-api.mjs`, herramienta de desarrollo preexistente). `fetch(` solo en `lib/contact/client.ts:44` (preexistente, contacto). Sin `console.log`.
- Mínimos fuera de alcance anotados y razonables: PDF `force-dynamic` (`app/cv-julio-flores-{es,en}.pdf/route.ts`), `HomeView.apiUrl` opcional, `.env.example`. No se tocaron contacto/PDF lib/robots/sitemap/dominio más allá de eso.
- Anotado como riesgo temporal, no bloqueante: `components/home-view.tsx:39,43` deja `apiUrl=''`, así que el formulario hace `POST /api/v1/contact/messages` al propio origen, que da 404 hasta `web-runtime-contacto`. El contacto está roto en el working tree entre slugs; está documentado en impl.md y el humano cierra al final.

## Privacidad
T31 y curl: ningún centinela (teléfono/documento/nacimiento) en HTML, RSC ni JS de las 4 páginas; fixtures solo «Ada Ejemplo». Sin datos reales en lo añadido.

## Skills consultadas
(Aplicadas como lente sobre el diff; no se ejecutó ninguna con efecto de escritura.)
- `simplify`: hallazgos 1 y 2 de «Cambios requeridos».
- `next-best-practices`: sin hallazgos. `force-dynamic` sin `generateStaticParams`, `React.cache` por petición, `output: 'standalone'`, `outputFileTracingIncludes` correcto (`lib/..` fuentes presentes en el standalone), params asíncrono mantenido en `app/[[...slug]]/page.tsx:15-25`.
- `strict-typing`: sin hallazgos (sin `any`; únicos `unknown` en `catch` y `JSON.parse(...) as Record<string, unknown>` en `tests/runtime/pages.test.ts:80`, aceptables en test). `lib/api/content.ts` y getters tipados de extremo a extremo.
- `testing-strategy`: hallazgo 3 (harness); tests deterministas, puerto libre, espera por «Ready in», sin sleeps arbitrarios.
- `seo-audit` / `ui-ux-pro-max`: no aplican (sin cambios de metadata ni UI; T29 y T33 migran la cobertura SEO y pasan).

## Checkpoints
C1 lint/typecheck/test/build verdes; sin código muerto adicional (salvo lo de abajo). C1 «API caída con respaldo» y C4 «respaldo» están obsoletos por decisión R1 del humano (actualizar `CHECKPOINTS.md` en el slug de docs/dominio). C2 cubierto. C3 sin datos privados ni reales. C4 datos solo por `lib/api` (componentes sin `fetch`). C5 sin cambios visuales. C6 `progress/current.md` y `impl.md` presentes. C7 no aplica todavía.

## Cambios requeridos (ronda 1, ya corregidos y verificados en la ronda 2; vacío ahora)
1. **Duplicación en `lib/api/content.test.ts:96` y `:111`**: la misma cadena de ternarios que elige el cuerpo por URL (`resume`/`architecture`/`services`/`projects`) aparece copiada en T16 y T18. Extraerla a una función local (p. ej. `fixtureFor(url)`) o reutilizar `startFakeApi` de `tests/helpers/fake-api.ts`, que ya enruta los 4 recursos.
2. **Duplicación en el harness**: el filtrado del entorno heredado (`Object.entries(process.env).filter(...)` + `NODE_ENV: 'production'` + `NEXT_TELEMETRY_DISABLED`) está copiado en `tests/global-build.ts:31-32` y `tests/helpers/standalone.ts:60-72`. Extraer un helper común (p. ej. `cleanEnv(remove, extra)`) en `tests/helpers/`.
3. **Fuga de temporal en `tests/global-build.ts:46-55`**: `standaloneDir` se crea antes del `try`, y la función de limpieza (`rm`) solo se devuelve si `runBuild` no lanza (`reject` por `error` de spawn, o fallo del `cp`). En ese caso el directorio temporal queda sin borrar. Mover el `rm` al camino de error (p. ej. `catch { await rm(...); throw }`) o crear el directorio dentro del `try`.

## Observaciones fuera de alcance
- `CLAUDE.md`, `AGENTS.md` (regla «si la API no responde en el build se usa el último CV bueno»), `docs/web-standards.md` (`output: 'export'`, «solo en el build», respaldo) y `CHECKPOINTS.md` C1/C4 siguen describiendo el modelo estático con respaldo. Ya asignado a `web-runtime-dominio` (docs); no bloquea este slug.
- `lib/pdf/build-cv-pdf.ts` mantiene el memo por proceso sin clave por contenido (puede servir un PDF viejo): corrige `web-runtime-pdf`.
- `app/robots.ts` y `app/sitemap.ts` siguen `○` estáticos y hornean `SITE_URL` en build: corrige `web-runtime-dominio`.
- El 500 es la página por defecto de Next (R8 del plan, decisión aceptada).
