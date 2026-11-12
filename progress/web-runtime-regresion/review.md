# web-runtime-regresion — review

## Veredicto final (ronda 2): APPROVED

Ronda 1 (histórico): CHANGES_REQUESTED solo por `progress/current.md`. Ronda 2: el líder lo reescribió; releído y contrastado con los `review.md` reales de cada slug: sin estados obsoletos ni contradicciones. Código y verificación real correctos desde la ronda 1 (no se repiten). Observación del 3 % y lista de NO verificado se mantienen abajo.

## Ronda 2
- `progress/current.md`: «Tarea en curso: ninguna»; los 9 slugs de web-runtime (ci, datos, vacios, salud, pdf, contacto, dominio, docker, regresion) figuran con review APPROVED y sin cerrar. Contrastado: `review.md` de ci, contacto, dominio, salud, vacios = APPROVED; datos, docker y pdf = APPROVED final tras CHANGES_REQUESTED en ronda 1 (histórico, resuelto); regresion = APPROVED con esta ronda. Ya no queda ninguna línea «pendiente review» de web-runtime. Declara Docker NO verificado (T98–T100 solo CI) y la validación visual pendiente del humano, coherentes con esta review. `web-redesign` CERRADO y los slugs en pausa no contradicen nada.
- Cambios requeridos: ninguno.

## Cambios requeridos (ronda 1, resuelto)
1. `progress/current.md:5,7,9,11,13,28` siguen diciendo «pendiente review» para `web-runtime-contacto`, `-pdf`, `-salud`, `-vacios`, `-datos` y `-dominio`, y `:3` / `:35` (última línea) dice «(pendiente el review de web-runtime-regresion)»; pero los `review.md` de esos 6 slugs (y de `-ci`, `-docker`) son APPROVED, y la línea final afirma «slugs 0–8 … APPROVED». El brief pide que quede «web-runtime: slugs 0–8 implementados y APPROVED, sin cerrar». Actualizar esas líneas a «APPROVED, sin cerrar» y, tras esta review, quitar el paréntesis de pendiente.
   (Las líneas de `web-redesign-*` pendientes son de otro plan; no entran.)

## Verificación ejecutada (Node 22.23.1)
- `npm run lint`, `npm run typecheck`: verdes. `npm run build`: verde sin API; rutas `ƒ` (+ `○ /_not-found`, `○ /icon.svg`).
- `npm test` x2: 76 archivos / 345 tests, verdes las dos veces (35 s y 36 s). Coincide con `impl.md`.
- Procesos y temporales: antes/después de los tests, mismo conjunto de PIDs; sin `cv-web-*` en `os.tmpdir()` (directorio temporal local); sin `proxy.ts` ni `app/api/probe` en el repo.
- T104 (`tests/runtime/proxy-ready.test.ts:51-110`): hace lo que declara el plan. Copia en `os.tmpdir()` (sin tests), `proxy.ts` con `matcher ['/admin/:path*']` y `POST /api/probe` con cookie httpOnly; build exit 0 con «Proxy» en la salida; `/admin/x` 404 con `x-probe-proxy: ran`; `Set-Cookie` con `probe=1` y `HttpOnly`; 4 páginas públicas 200, sin cabecera ni cookie y HTML normalizado idéntico al del standalone sin proxy. Limpieza en `afterEach` (`rm` del temporal, cierre de API). `standaloneDir` en `tests/helpers/standalone.ts:17-18,42` es opcional y no afecta a los demás tests.

## E2E independiente (standalone copiado fuera del repo; API `npm run parity:api` en :4020 + mi API falsa con modos y POST en :4021)
- Páginas `/`, `/servicios/`, `/en/`, `/en/services/` 200 text/html; `/api/health/` 200; `sitemap.xml` 200; `robots.txt` 200; PDF es/en 200 `application/pdf`.
- Contacto: `POST /api/contact/` por curl -> 201 y la API recibió `{name,email,message,website:""}` en `/api/v1/contact/messages?lang=es`; también desde el navegador (formulario real en Chrome DevTools), 1 POST recibido, consola limpia.
- Cambio de datos: con `profile.label` cambiado, la siguiente petición a `/` y `/en/` ya lo muestra y el ETag del PDF cambia.
- API caída: `/`, `/servicios/`, `/en/`, PDF -> 500; `/api/health/` -> 503; el HTML no contiene `4021` ni `localhost`; el log muestra ECONNREFUSED. Al volver la API, `/` -> 200 (sin datos viejos ni estado pegado).
- Listas vacías: 4 páginas 200; textos vacíos de servicios, proyectos y arquitectura presentes (ES/EN). Capturas: `design/artifact-v2/.shots/rv-empty-{perfil,servicios}-1440.png` (revisé la de Servicios: cada sección con su encabezado y su caja punteada).
- Chrome DevTools, Perfil y Servicios a 1440 y 390 (scrollbar oculta a 1440 como declara el implementer): sin desborde horizontal a 390 (`scrollWidth = clientWidth = 390`) en ambas; consola vacía; capturas `rv-{ref,web}-{perfil,servicios}-{1440,390}.png`. Referencia re-renderizada con `npm run parity:reference` desde `Main.dc.html`.
- `parity:diff` web vs web aprobada de la ronda `web-redesign-paridad` (`pa-web-*`): max 0.00 % (1440 Perfil y Servicios), 0.04 % (390 Perfil), 0.03 % (390 Servicios); 0 bandas > 3 %; mismas alturas (4961, 4723, 8118, 8469). Sin regresión.
- Lighthouse desktop (navegación) en `/`, `/servicios/`, `/en/`, `/en/services/`: Accessibility 100, Best Practices 100, SEO 100, Agentic 100; 58 pasados, 0 fallos en las cuatro (`rv-lh-*`).

## Diferencias con lo declarado por el implementer
- Coincide en todas las cifras y en el recorrido. Matiz que `impl.md` ya explica pero que el plan T103 («`parity:diff` bajo el umbral del 3 % por banda») no cumple literalmente: `parity:diff` página entera web vs artefacto falla (mis medidas: Perfil 1440 max 93.7 %, 12/13 bandas > 3 %; Perfil 390 max 40.5 %; Servicios 1440 max 34.8 %; Servicios 390 max 96.8 %), con alturas distintas (ref 4533/4645/8096/8844). Es el estado ya aceptado en `web-redesign-paridad` (diffs D1–D9/E1–E4; ese slug alineó por sección), y la web es idéntica píxel a píxel a la aprobada, así que no es regresión. Lo trato como observación, no como bloqueo; el humano debe saber que T103 se cumple como «sin cambios respecto a la ronda de paridad», no como «<3 % contra el artefacto». No se repitió el diff alineado por sección (`pa-sections.js`).

## Docs finales (T105)
`CLAUDE.md`, `AGENTS.md`, `docs/web-standards.md`, `CHECKPOINTS.md`, `.env.example` coherentes entre sí y con el código: standalone, `CV_API_URL`/`SITE_URL` solo en `lib/api/config.ts`, sin caché -> 500, vacíos, healthcheck con barra final y `HOSTNAME=0.0.0.0` (Dockerfile:23-24,35-36), compose único `cv-db`/`cv-api`/`cv-web` con `CV_API_URL`/`SITE_URL` y túnel a `cv-web:3000` (`deploy/docker-compose.yml`), job `docker` solo en push con smoke y SIGTERM (`.github/workflows/ci.yml`), `.dockerignore` coherente con lo que afirma web-standards. Sin `output:'export'`, `CV_CACHE*`, Cloudflare Pages ni `cv.floreslab.dev`. El `Dockerfile` no necesita `design/` ni `progress/` en el build (ningún `app|components|lib|tests|scripts` los importa). Única incoherencia: `progress/current.md` (ver Cambios requeridos).

## Trazabilidad Tn <-> it()
| Tn | it() / evidencia |
|---|---|
| T101 | lint/typecheck/`npm test` x2 verdes (arriba); archivos de test 75 -> 76 (solo sube) |
| T102 | `scripts/parity/*.test.ts` dentro de `npm test`; `parity:api` + standalone sirvió las 4 páginas |
| T103 | manual (arriba), con la salvedad de la sección «Diferencias» |
| T104 | `tests/runtime/proxy-ready.test.ts` › `T104: …` (verificado línea a línea) |
| T105 | revisión de docs (arriba); T89 en `tests/source.test.ts` verde |
| T106 | recorrido repetido por mí (arriba) |
Criterios: A13 -> T104; A14 -> T101–T103; A2/A9 -> T105; A1–A17 -> T106. Todos cubiertos.

## Privacidad
Sin teléfono, documento ni fecha de nacimiento en las páginas servidas (fixtures de diseño; solo email/LinkedIn/GitHub). Repo público: `proxy.ts`/probe solo en temporal.

## Skills consultadas
- `simplify`: sin hallazgos accionables en el diff (un test, una opción de helper, una frase de docs).
- `next-best-practices`: sin hallazgos (rutas `ƒ`, proxy con matcher acotado, cookie `httpOnly` vía `cookies()` asíncrono, standalone con `.next/static` y `public` copiados como en el Dockerfile).
- `strict-typing`: sin hallazgos bloqueantes; `proxy-ready.test.ts:39` usa `as () => Promise<void>` tras `pop()` y `:68` un `as` del JSON de tsconfig (preexistente en estilo del repo; no accionable).
- `seo-audit` / `ui-ux-pro-max`: no se tocó SEO ni UI; verificación runtime con Lighthouse 100/100/100.
- `testing-strategy`: el cambio es un test lento; correcto y aislado. Solo una fragilidad menor: `proxy-ready.test.ts:97-101` registra la limpieza de `probe`/`baseline` después de arrancar ambos; si `baseline` fallara, `probe` quedaría vivo hasta el `process.on('exit')` de `tests/helpers/standalone.ts:34` (lo mata). No bloquea.

## Observaciones fuera de alcance
- Había procesos `next-server` huérfanos de sesiones previas (puertos 4030/4031/4041/4077/4130/4201–4203/4299/4932…) ya antes de mi revisión; no los toqué. Un `next-server` (PID 60326, arrancado 00:25, anterior a mi línea base) desapareció durante mi limpieza al cerrar los puertos que usé; no pude atribuirlo con certeza (probablemente de la sesión del implementer).
- Evidencia nueva en `design/artifact-v2/.shots/rv-*` (ignorada por git).

## NO verificado (solo CI / Docker)
`docker build`/`docker run` con el `HOSTNAME` por defecto de Docker; `HEALTHCHECK` del contenedor y del compose en ejecución; smoke del job `docker` (T98); parada con SIGTERM en < 10 s (T99); `buildx` multi-arch/arm64 y publicación en Docker Hub (T100); secretos `DOCKERHUB_*` en GitHub; ejecución del workflow de GitHub Actions en sí; despliegue real en el NAS (red externa `padelhub_default`, túnel, imagen `julioflores781/cv-api`); diff de paridad alineado por sección; Lighthouse en móvil.
