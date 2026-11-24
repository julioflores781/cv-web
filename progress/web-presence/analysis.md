# Analysis — web-presence (2026-11-23)

Plan de los dos slugs hijos del brief (`progress/web-presence/brief.md`). Se implementan uno detrás de otro:

| Slug | Prefijo de criterios / tests | Qué cambia |
|------|------------------------------|------------|
| `web-trajectory-split` | `TR-A*` / `TR-T*` | Experiencia y Formación pasan a ser secciones separadas del Perfil. Experiencia lleva solo trabajos, con fases y logros. Formación es un bloque de tres columnas. |
| `web-home-services` | `HS-A*` / `HS-T*` | Servicios pasa a `/` y `/en/`. El Perfil pasa a `/perfil/` y `/en/profile/`. `/servicios/` y `/en/services/` redirigen con 308. |

Los dos prefijos están libres en el repo: en los tests solo aparecen `BA`, `CO`, `HX`, `PD` y `RF`. Un test reescrito lleva el id nuevo y cita el viejo entre paréntesis, por ejemplo «TR-T1 (BA-T30)», como en planes anteriores.

## Validación de Julio (2026-11-23)

Plan **aprobado**. Respuestas a las dudas abiertas («trayectoria es ok, texto ok como indicas, ok el resto»):

- **TR-D1:** la sección de trabajos **sigue llamándose «trayectoria» / «career»** (y el CTA «Ver trayectoria»), como deja el plan.
- **TR-D2:** textos de Formación aprobados: ceja/título «formación» / «Formación» y «education» / «Education»; columnas
  Titulación · Certificaciones · Cursos y Degree · Certifications · Courses.
- **TR-D3 a TR-D8:** como los decide el plan (Formación tras Experiencia, sin fondo `alt`, entradas en blanco descartadas, orden de la API).
- **HS-D1 (cambia el plan de B):** **no se añade** el enlace `header.profileLink`. En su lugar, el segmento «Perfil» del interruptor
  de modo pasa a llamarse **«Perfil / CV» / «Profile / CV»** (`dict.mode.profile`). §3 ya está ajustado por el leader (2026-11-23):
  §3.1, §3.3, §3.4, HS-A4, HS-A5, HS-T7, HS-T9, HS-T11 (retirado), HS-T21, la cobertura, §3.7, HS-D7 y la tabla de §4.2.
- **HS-D2:** orden del interruptor **Servicios · Perfil / CV**.
- **HS-D5:** `web-home-services` se valida en local antes del PR `develop → main` (Watchtower despliega `latest` solo).

---

## 0. Lo verificado (2026-11-23)

### 0.1 Estado del repo
- La copia de trabajo está en `feature/nas-autodeploy`. Apunta al mismo commit que `develop` (`d618e9f`; `git log develop..HEAD` sale vacío). El código analizado es, por tanto, el de `develop`, de donde saldrán las ramas.
- Hay dos cambios sin commitear: `deploy/docker-compose.yml` (de Julio: etiquetas de Watchtower en `cv-api` y `cv-web`) y `progress/current.md`. No se tocan, y ninguno de los dos slugs necesita tocar el compose.
- Versiones instaladas (según `node_modules/*/package.json`):
  - `next` 16.4.5
  - `react` 19.3.1
  - `vitest` 5.1.0
  - `jsdom` 30.1.3
  - `@testing-library/react` 16.3.3
- No hace falta ninguna dependencia nueva. No está `@testing-library/user-event`, pero basta con `fireEvent`.

### 0.2 Contrato y datos de la API (sin copiar datos reales)
- **Contrato** (`https://cv-api.floreslab.dev/openapi.json`, descargado hoy):
  - `Experience` exige `id`, `company`, `position`, `period`, `phases` y `highlights`.
  - `Phase` = `{ title (obligatorio), client?: string|null }`.
  - `highlights` es `string[]`.
  - `Qualifications` exige `education`, `certificates` y `courses`.
  - `Education` = `{ institution, studyType?, area? }`.
  - `Certificate` y `Course` = `{ name, issuer? }`.
  - Coincide con `lib/api/schema.d.ts`: **no hay que regenerar tipos**.
- **Validador** (`lib/api/validate.ts`):
  - Ya trata `phases` y `highlights` como listas obligatorias (`list(raw.phases, parsePhase)`, `list(raw.highlights, str)`).
  - Acepta `client` ausente o `null`.
  - Descarta cualquier campo desconocido: `parsePhase` solo copia `title` y `client`.
  - Hoy **ningún test** de `lib/api/validate.test.ts` cubre fases ni logros; se añade TR-T21.
- **Datos en vivo** (`GET /api/v1/resume?lang=es`; solo se contó la forma):
  - 6 trabajos, **2 de ellos en curso a la vez**. El que la API manda segundo empezó después que el primero, así que la web no debe reordenar.
  - 3 trabajos con fases y/o logros: 3 fases + 7 logros, 0 + 5 y 2 + 2. Todas las fases tienen cliente.
  - Formación: 1 titulación (tipo + área), 1 certificado con emisor y 3 cursos con emisor.
  - Los tests no usan nada de esto: solo fixtures «Ada Ejemplo».
- **PDF** (`lib/pdf/cv-document.tsx`):
  - **Ya pinta** las fases («título — cliente») y los logros como viñetas.
  - Del diccionario solo usa `dict.pdf.*`, `dict.education.certificate` y `dict.education.course`.
  - Publicar fases y clientes en la web no expone nada que no esté ya en el PDF.

### 0.3 Redirecciones en Next 16.4.5 con `trailingSlash: true` y `app/[[...slug]]`
Fuentes: la documentación que trae el paquete (`node_modules/next/dist/docs/…`) y su código compilado (`node_modules/next/dist/…`).

- **`permanent` y `statusCode`.**
  - `docs/01-app/03-api-reference/05-config/01-next-config-js/redirects.md`, l. 30: `permanent: true` da **308**; `false`, 307.
  - Misma página, l. 351: se puede usar `statusCode` «instead of the `permanent` property, but not both», y «a `Refresh` header is automatically added for the 308 status code».
  - `dist/lib/redirect-status.js`, l. 28-37: los códigos permitidos son 301, 302, 303, 307 y 308; `getRedirectStatus = route.statusCode || (route.permanent ? 308 : 307)`.
  - `dist/server/lib/router-server.js`, l. 453-461: escribe `Location` con `url.format(parsedUrl)` del destino y añade `Refresh: 0;url=<destino>` si es 308.
- **`Location` relativa.** `dist/shared/lib/router/utils/parse-url.js` manda a `parseRelativeUrl` todo destino que empieza por `/`. Esa función (`parse-relative-url.js`) devuelve `host: null` y `protocol: null`, así que la cabecera sale como `/` o `/en/`, sin host.
- **Las redirecciones van antes que las páginas.**
  - `redirects.md`, l. 39: «Redirects are checked before the filesystem which includes pages and `/public` files».
  - `dist/server/lib/router-utils/resolve-routes.js`, l. 50-84: el orden es `headers` → `redirects` → `middleware` (el `proxy.ts`) → `beforeFiles` → `check_fs`.
  - Por tanto el catch-all `app/[[...slug]]` nunca ve `/servicios/`: ni `generateMetadata` ni `Page` se ejecutan, y **no se llama a la API**.
  - El `proxy.ts` tampoco interviene: va después y su matcher (`['/admin', '/admin/((?!api/images(?:/|$)).*)']`) solo cubre `/admin`.
- **La query se conserva.** `redirects.md`, l. 43: «any query values provided in the request will be passed through».
- **`trailingSlash: true` añade sus propias redirecciones delante.** `dist/lib/load-custom-routes.js`, l. 529-552: con `trailingSlash` hace `redirects.unshift(...)` de dos reglas internas con `permanent: true` y `priority: true`. La que importa aquí es `/:notfile((?!\.well-known(?:/.*)?)(?:[^/]+/)*[^/\.]+)` → `/:notfile/`, y va **antes** que las reglas del usuario.
- **El `source` se compara en modo estricto.** En `dist/server/lib/router-utils/filesystem.js`, l. 134-150, cada regla se compila con `getPathMatch(item.source, { strict: true, ... })`. En `resolve-routes.js`, l. 244, se compara con el `pathname` tal como llega. Lo comprobé ejecutando el `getPathMatch` de Next con un script en el scratchpad, fuera del repo:

  | `source` \ ruta pedida | `/servicios` | `/servicios/` | `/SERVICIOS/` | `/servicios/x/` |
  |---|---|---|---|---|
  | `/servicios` | sí | **no** | no | no |
  | `/servicios/` | no | **sí** | sí | no |
  | regla interna `/:notfile(...)` | sí | no | — | no |

  Consecuencias:
  1. `source` y `destination` se escriben **con barra final** (`/servicios/` → `/`, `/en/services/` → `/en/`). Una regla `source: '/servicios'` nunca se aplicaría, porque la regla interna convierte antes `/servicios` en `/servicios/`.
  2. Un destino `/en` sin barra añadiría un salto más.
  3. `/servicios` sin barra llega en **dos saltos 308** (`/servicios` → `/servicios/` → `/`). Es inevitable sin `skipTrailingSlashRedirect`.
  4. La comparación no distingue mayúsculas (`caseSensitiveRoutes: false` por defecto, `dist/server/config-shared.js`, l. 205): `/SERVICIOS/` también redirige.
- **Servidor standalone.** Las reglas se escriben en `.next/routes-manifest.json` al construir (`dist/build/index.js`, `generate-routes-manifest`) y el servidor las lee de ahí (`filesystem.js`, l. 426). No dependen de variables de entorno ni de la API.
- **Google y 301/308.** En Search Central («Redirects and Google Search», consultado hoy): «The 301 and 308 status codes mean that a page has permanently moved to a new location». Las dos son redirecciones permanentes que el indexador usa como señal de canónica.

### 0.4 Referencia de diseño (`design/artifact-v2/project/Main.dc.html`, revisada por grep)
- **Cabecera** (l. 36-50): logo «JF» y nombre con `href="#inicio"`; enlaces «proyectos» y «contacto»; grupo «Modo de la web» con **Perfil · Servicios**, en ese orden.
- **Cajetín** (l. 117-140): la celda «Hoja» vale `01 / 02 · Perfil` en el Perfil y `02 / 02 · Servicios` en Servicios (l. 512).
- **Perfil** (l. 145-175):
  - Ceja «01 / trayectoria» y un `ol` con borde izquierdo.
  - Marcador relleno de 13 px para el trabajo actual y hueco de 11 px para los demás.
  - La formación es el **último `li`** de la misma línea de tiempo.
- **No hay referencia** para fases, logros desplegables ni un bloque de formación en columnas. Se construyen solo con los tokens y las escalas que ya existen.

### 0.5 Barandillas que ya existen y condicionan el plan
- **`app/globals.test.ts`:**
  - **BA-T10**: ningún hex ni `rgb(` fuera de los bloques de tokens, en ningún `.css`.
  - **BA-T16**: un único bloque `prefers-reduced-motion`, en `globals.css`; **ningún módulo** puede declarar el suyo.
  - **BA-T18**: el interruptor, el selector de idioma y `.link` de la cabecera con `min-height` ≥44 px.
  - Hay un `:focus-visible` global con `outline: 2px solid currentColor`.
- **`lib/i18n/i18n.test.ts` (BA-T42):** ES y EN con las mismas claves, todas cadenas no vacías, sin `[…]` ni marcadores del diseño.
- **`next.config.test.ts`:** T23 y T240 exigen hoy `not.toHaveProperty('redirects')`. Hay que reescribirlos en `web-home-services`.
- **`jsdom` 30.1.3:** un `summary` que es el primer `summary` de un `details` es enfocable (`living/helpers/focusing.js`, l. 66-68) y tiene comportamiento de activación: el clic alterna `open` (`HTMLElement-impl.js`, l. 25-35). Se puede probar en tests de componente.
- **`tests/helpers/runtime-pages.ts`:** su `PAGES` es la tabla de rutas de casi todos los tests de runtime (`pages`, `pdf`, `admin-gate`, `admin-regression`). Cambiarla arrastra esos tests a las rutas nuevas.

### 0.6 Suposiciones «perfil = portada» encontradas
Búsqueda con grep, excluyendo `node_modules`, `.next`, `out`, `progress` y `design`.

- **Código:**
  - `lib/i18n/routes.ts`: `SERVICES_SLUG`, `[]` resuelve al Perfil, `PAGES = ['profile','services']`.
  - `components/site-header.tsx`: `home = page === 'profile' ? '#inicio' : routePath(profile)`.
  - `lib/i18n/dictionaries.ts`: `cajetin.sheets`.
  - `lib/seo/json-ld.ts`: `url` apunta al Perfil. Eso ya es correcto; solo cambia su ruta.
  - `metadata.ts`, `sitemap.ts`, `language-switch.tsx` y `mode-toggle.tsx` derivan todo de `routePath`, `alternatesFor` y `PAGES`: no tienen rutas escritas.
- **Tests con rutas literales:**
  - `lib/i18n/routes.test.ts`, `components/site-header.test.tsx`, `components/cajetin.test.tsx`.
  - `lib/seo/metadata.test.ts`, `lib/seo/json-ld.test.ts`, `app/sitemap.test.ts`, `next.config.test.ts`.
  - `tests/helpers/runtime-pages.ts`.
  - `tests/runtime/pages.test.ts` (T28, T29, T32, T34), `domain.test.ts` (T88), `resilience.test.ts` (T35, T40).
  - `tests/runtime/admin-e2e.test.ts` (l. 52-53, 89), `admin-images.test.ts` (l. 205), `admin-history.test.ts` (l. 21, 37-38, 47) y `admin-content.test.ts` (T339, l. 24, 32-33, 54).
  - Los `send()` y `get()` usan `redirect: 'manual'`. Tras el cambio, `/servicios/` devolvería un 308 sin el texto del servicio, así que esas líneas **deben** pasar a `/` y `/en/`.
- **`instrumentation.test.ts`** usa `/servicios/?utm=…` solo como ruta de ejemplo para sanear logs; no depende de que la ruta exista. Se deja como está.
- **Docs:**
  - `AGENTS.md`: fila `app/` del mapa.
  - `CLAUDE.md`: apartado «Qué es».
  - `docs/web-standards.md`: secciones de i18n y SEO, y la frase «El botón vive en «02 / arquitectura» del Perfil».
- **CI** (`.github/workflows/ci.yml`, paso de smoke): comprueba `/` con `<h1`, `/en/` con `lang="en"`, el sitemap y el PDF. Sigue valiendo, pero no prueba ni el Perfil nuevo ni las 308. `tests/deploy/deploy-files.test.ts` (T426) vigila el texto del smoke.
- **`scripts/parity/*` no tiene rutas públicas.** `perfil` y `servicios` son los nombres de los modos del artifact (`render-reference.mjs`, `spec.mjs`, `probe.mjs`), y `design-api.mjs` solo sirve `/api/v1/*`. No cambia.
- **`app/not-found.tsx`** enlaza a `/`, que sigue siendo la portada. No cambia.

---

## 1. Decisiones comunes
1. **Los ids de página no cambian.** `PageId` sigue siendo `'profile' | 'services'`. De él dependen:
   - `<body data-mode>`
   - los tokens de `globals.css` (`[data-mode="services"]`)
   - `dict.mode`, `dict.cajetin.sheets` y `dict.form.message`
   - la vista previa del panel (`data-mode="profile"`)
   - la sonda de paridad

   Solo cambia la tabla de URLs de `lib/i18n/routes.ts`.
2. Sin dependencias, variables de entorno ni cambios de API. Todo lo nuevo son Server Components (sin `'use client'`).
3. Los textos nuevos van a `lib/i18n/dictionaries.ts`, con las mismas claves en ES y EN (BA-T42).
4. **Fixtures:** nada del CV real. Las variantes nuevas («Ada Ejemplo» con varios trabajos actuales, fases y logros) se construyen a partir de `resumeEs` y `resumeEn` sin modificar los fixtures existentes, de los que dependen el PDF y muchos tests.

---

## 2. Slug A — `web-trajectory-split` (prefijo `TR`)

### 2.1 Objetivo
Separar en el Perfil la línea de tiempo actual en dos secciones numeradas:
- **Experiencia** (`#experience`): solo trabajos, con las fases visibles y los logros en un `<details>` nativo cerrado.
- **Formación** (`#education`): un bloque compacto en tres columnas, sin línea de tiempo.

La numeración se recalcula sola, el CTA «Ver trayectoria» sigue yendo a `#experience` y el PDF no se toca.

### 2.2 Diseño concreto

**Experiencia** (`components/trajectory.tsx`; sigue exportando `Trajectory` y pierde la prop `education`):
- **Trabajos.** Cada trabajo, en el orden de la API, muestra periodo (`formatPeriod`), un `h3` «puesto · empresa» y el resumen si lo hay, como hoy.
  - Marcador relleno en **todo** trabajo con `period.current` (dos a la vez si los hay) y hueco en el resto.
  - Se mantienen los `data-probe` `timeline*`.
- **Fases.** Si el trabajo tiene alguna fase con título no vacío, se pinta una `<ul>` debajo del resumen, visible sin interacción.
  - Un `li` por fase: «título · cliente».
  - Solo «título» si `client` falta, es `null` o está en blanco; se usa el mismo `clean(…, ' · ')` de hoy.
- **Logros.** Si el trabajo tiene algún logro no vacío, lleva un único `<details>` **sin `open`**.
  - Su primer hijo es un `<summary>` con `interpolate(dict.experience.achievements, { count: String(n) })`: «Ver logros (3)» / «See achievements (3)», donde `n` es el número de logros no vacíos.
  - Después va una `<ul>` con los logros en orden.
  - Sin logros, no hay `<details>`.
  - Ni `tabIndex`, ni `onClick`, ni `aria-expanded` propios: el navegador da el rol, el estado y el teclado (Intro/Espacio).
- **Sin trabajos**, no se pinta nada: ni sección, ni ancla, ni h2.

**Formación** (`components/education-section.tsx`, nuevo; el nombre evita chocar con el tipo `Education` de `lib/api/types.ts`):
- **Función pura `educationColumns(education, dict)`.** Devuelve una lista de columnas `{ key, heading, items: { main, detail | null }[] }`, en este orden y omitiendo las vacías:
  - **Titulación**: `main` es «studyType · area» o, si faltan los dos, `institution`. `detail` es `institution`, solo cuando hubo tipo o área.
  - **Certificaciones**: `main` es `name`; `detail`, `issuer`.
  - **Cursos**: igual que Certificaciones.
  - Una entrada cuyo texto principal queda vacío tras `trim()` se descarta; una columna sin entradas no aparece.
- **`EducationSection`.** Recibe esas columnas: las calcula `HomeView` una sola vez, como hace con `buildHexPlane`.
  - Sin columnas, devuelve `null`.
  - Con columnas pinta `SectionShell id="education" labelledBy="education-title"` (sin `alt`), un `SectionHead` con `dict.sections.education` y un `SectionBody` con las columnas.
  - Cada columna es un `div` con un `h3` de cabecera y una `ul` de entradas (un `p` principal y un `p` de detalle).
  - Sin `ol`, sin marcadores y sin borde de línea de tiempo.
- **CSS** (`education-section.module.css`): rejilla `repeat(auto-fit, minmax(min(200px, 100%), 1fr))`, el mismo patrón del cajetín, y una regla explícita `@media (max-width: 640px)` que la deja en una columna.

**Numeración** (`components/home-view.tsx`):
- `numbered` pasa a ser: experiencia (si la hay), formación (si la hay), `'architecture'` (Perfil), `'services'` (Servicios), `'process'` (si lo hay), `'projects'` y `'contact'`.
- `hasExperience = isProfile && experience.length > 0`; `hasEducation = isProfile && columns.length > 0`.
- Con el fixture completo: 01 trayectoria · 02 formación · 03 arquitectura · 04 proyectos · 05 contacto.
- Formación va **justo después** de Experiencia, el mismo orden que tenía dentro de la línea de tiempo.
- El `Hero` sigue recibiendo `hasExperience`.

**Estilos.** Solo tokens y escalas que la web ya usa; ni colores ni familias nuevas.
- Cabecera de columna como el periodo de la línea de tiempo: `mono`, 14 px, `--muted`.
- Texto principal: `display` 600 a 22 px, la escala de la etiqueta de selección del hero.
- Detalle y logros: 15 px en `--muted`.
- Fases: 15 px en `--ink`, con el cliente en `--muted`.
- `summary`: `mono` 14 px, `min-height: 44px`, `cursor: pointer` y su marcador nativo.
- Sin `transition` ni `animation` propias. Si alguna hiciera falta, la anula el bloque global; los módulos no pueden declarar `prefers-reduced-motion` (BA-T16).

**Diccionario** (ES / EN):
- `sections.education` = `{ label: 'formación', title: 'Formación' }` / `{ label: 'education', title: 'Education' }`. Sigue el patrón de `sections.projects`: etiqueta y título iguales.
- `education` pasa a ser `{ certificate, course, degrees, certificates, courses }`:
  - Se **conservan** `certificate` («Certificado» / «Certificate») y `course` («Curso» / «Course») porque los usa el PDF.
  - Se añaden `degrees` («Titulación» / «Degree»), `certificates` («Certificaciones» / «Certifications») y `courses` («Cursos» / «Courses»).
  - Se **quita** `education.education` («Formación»), que solo usaba la línea de tiempo.
- `experience` = `{ achievements: 'Ver logros ({count})' }` / `{ achievements: 'See achievements ({count})' }`.
- `sections.trajectory` (etiqueta «trayectoria» / «career» y título) no cambia; ver la duda TR-D1.

### 2.3 Archivos a crear/tocar

**Código**
- `components/trajectory.tsx`: solo trabajos, con fases y `<details>` de logros. Quita la prop `education` y el `entriesOf` de formación.
- `components/trajectory.module.css`: estilos de las fases, del `details`/`summary` y de la lista de logros.
- `components/education-section.tsx` (nuevo): `EducationSection` y `educationColumns()`.
- `components/education-section.module.css` (nuevo).
- `components/home-view.tsx`:
  - numeración con `experience` y `education`;
  - `<EducationSection>` justo después de `<Trajectory>`;
  - `Trajectory` ya sin `education`.
- `lib/i18n/dictionaries.ts`: interfaz `Dictionary` y objetos `es` y `en`, con las claves de §2.2.
- `docs/web-standards.md`, sección «PDF del CV»: decir que el botón vive en «03 / arquitectura». Mejor aún, «en la sección de arquitectura del Perfil», sin número, para que no vuelva a quedar viejo.

**Tests**
- `components/trajectory.test.tsx`: reescrito (TR-T1…TR-T8; sustituye BA-T30, BA-T31 y BA-T32).
- `components/education-section.test.tsx` (nuevo): TR-T9…TR-T13.
- `components/home-view.test.tsx`: numeración (TR-T14…TR-T17; actualiza BA-T37, T47 y CO-T81 y amplía BA-A9).
- `components/trajectory.module.test.ts` (nuevo): CSS de los dos módulos (TR-T18, TR-T19).
- `lib/i18n/i18n.test.ts`: TR-T20.
- `lib/api/validate.test.ts`: TR-T21.
- `tests/fixtures/resume.ts`: se **añade** `careerResume(lang)`, ficticio, con 2 trabajos actuales, fases con y sin cliente, 3 logros, un trabajo sin nada y formación parcial. No se modifican `resumeEs`, `resumeEn`, `minimalResume`, `emptyListsResume` ni `manyJobsResume`.
- `tests/runtime/trajectory.test.ts` (nuevo): TR-T22…TR-T25. **Las rutas se toman de `PAGES` filtrando por `mode` y `lang`, nunca escritas a mano**, para que `web-home-services` no tenga que tocar este archivo.
- `tests/runtime/pages.test.ts`: solo T32. Sus cuatro aserciones finales de cejas se reescriben **recorriendo `PAGES` por `(mode, lang)`**, no por ruta literal (TR-T26).
- `tests/source.test.ts`: TR-T27 y TR-T28.
- `components/home-view-pdf.test.tsx`: TR-T29.

**No se tocan** (comprobado):
- `lib/api/validate.ts`, salvo que TR-T21 destape un hueco.
- `lib/pdf/*`.
- `app/[[...slug]]/*`.
- `components/hero.tsx`: el CTA ya depende de `hasExperience`.
- `scripts/parity/*`: `design-data.json` trae fases y logros vacíos, así que la sonda de la línea de tiempo sirve de regresión.
- `lib/i18n/routes.ts`, la cabecera y el SEO.

### 2.4 Criterios de aceptación
- **TR-A1 — Experiencia.**
  - `#experience` (h2 `experience-title`, ceja «NN / trayectoria» / «NN / career») lista **solo** los trabajos, en el orden de la API, con periodo, h3 «puesto · empresa» y resumen si existe.
  - Marcador relleno en todo trabajo actual (también si hay dos a la vez) y hueco en el resto.
  - Ningún dato de formación dentro.
  - Sin trabajos: ni sección, ni ancla, ni h2.
- **TR-A2 — Fases.**
  - Todo trabajo con al menos una fase de título no vacío muestra una lista «título · cliente» (solo «título» si no hay cliente).
  - La lista es visible sin interacción y está fuera de cualquier `<details>`.
  - Sin fases, no hay lista.
- **TR-A3 — Logros.**
  - Todo trabajo con al menos un logro no vacío tiene exactamente un `<details>` sin `open`.
  - Su primer hijo es un `<summary>` con «Ver logros (n)» / «See achievements (n)», donde n son los logros no vacíos, seguido de la lista de logros en orden.
  - Sin logros, no hay `<details>`.
  - Funciona sin JavaScript: el HTML del servidor ya trae los logros y los componentes no tienen `'use client'` ni manejadores.
- **TR-A4 — Formación.**
  - Es una sección propia, `#education` (h2 `education-title`, ceja «NN / formación» / «NN / education», título «Formación» / «Education»).
  - No tiene línea de tiempo: ni `ol` ni marcadores.
  - Tiene hasta tres columnas, en este orden: Titulación · Certificaciones · Cursos (EN: Degree · Certifications · Courses).
  - Una columna sin entradas, o solo con entradas en blanco, no se pinta; si no queda ninguna, no hay sección.
  - El contenido de cada entrada sigue §2.2.
  - A ≤640 px las columnas se apilan.
- **TR-A5 — Numeración.**
  - En el Perfil, Experiencia y Formación cuentan por separado y el resto se recalcula sin huecos. Con todo presente: 01 trayectoria · 02 formación · 03 arquitectura · 04 proyectos · 05 contacto. Si falta cualquiera de las dos, las siguientes se corren.
  - Servicios no cambia (01 servicios · 02 proceso · 03 proyectos · 04 contacto) y no muestra ninguna de las dos.
- **TR-A6 — CTA del hero.** «Ver trayectoria» / «See career» lleva a `#experience` y solo aparece si hay trabajos; entonces el ancla existe.
- **TR-A7 — Diseño y accesibilidad.**
  - Solo tokens: sin hex ni `rgb(`, y sin `font-family` fuera de `var(--font-…)` o de las clases `display` y `mono`.
  - Sin animaciones ni `prefers-reduced-motion` propios; los cubre el bloque global.
  - `summary` enfocable, con el foco visible global y un alto ≥44 px.
  - Un solo h1, jerarquía h2 → h3 sin saltos y listas semánticas.
- **TR-A8 — Diccionarios.**
  - Existen en ES y EN `sections.education.{label,title}`, `education.{degrees,certificates,courses}` y `experience.achievements` (con `{count}`).
  - Se conservan `education.certificate` y `education.course`; desaparece `education.education`.
  - BA-T42 sigue en verde.
- **TR-A9 — Datos y privacidad.**
  - Fases y logros solo entran por `lib/api`, ya validados.
  - Un `resume` con fases o logros mal formados da 500 en cualquier página, sin datos viejos.
  - Un campo desconocido dentro de una fase, un trabajo o una entrada de formación (por ejemplo, un teléfono centinela) no llega al HTML, al RSC ni a los chunks.
- **TR-A10 — PDF y docs.**
  - Las pruebas de `lib/pdf` y `tests/runtime/pdf.test.ts` siguen en verde sin cambios.
  - El botón de descarga sigue dentro de `#architecture` del Perfil.
  - `docs/web-standards.md` ya no dice «02 / arquitectura».

### 2.5 Plan de tests (catálogo completo)

*Experiencia* — `components/trajectory.test.tsx` (componente)
- **TR-T1 (BA-T30)** — **Dado** `resumeEs` (3 trabajos, el primero actual, más formación) **cuando** se pinta `Trajectory` **entonces**:
  - hay 3 `ol > li` en el orden del fixture;
  - el primero muestra «2017 — hoy», el h3 «Desarrolladora de ejemplo · Acme Ejemplo» y su resumen, y es el único con marcador relleno;
  - la sección es `section#experience`, con h2 = `dict.sections.trajectory.title`;
  - dentro no aparecen «Universidad Ejemplo», «Certificado Ejemplo» ni «Curso Ejemplo».

  *(TR-A1)*
- **TR-T2** — **Dado** dos trabajos `current: true` (el segundo con un inicio posterior) y uno cerrado **cuando** se pinta **entonces** los dos actuales llevan el marcador relleno, el cerrado el hueco, y el orden es el de entrada: no se reordena por fecha. *(TR-A1)*
- **TR-T3** — **Dado** un trabajo con las fases `[{A, cliente X}, {B, sin cliente}, {C, client: null}]` **cuando** se pinta **entonces** se ven «A · X», «B» y «C» en ese orden, fuera de cualquier `<details>` y sin « · » colgando. *(TR-A2)*
- **TR-T4** — **Dado** un trabajo con 3 logros **cuando** se pinta en ES y en EN **entonces** hay exactamente un `<details>` sin atributo `open`. Su primer hijo es un `<summary>` con «Ver logros (3)» / «See achievements (3)», y contiene una `ul` de 3 `li` en orden. *(TR-A3)*
- **TR-T5** — **Dado** tres trabajos (sin fases ni logros / con logros y sin fases / con fases y sin logros) **cuando** se pinta **entonces** el primero no tiene ni lista de fases ni `<details>`, el segundo solo `<details>` y el tercero solo la lista de fases. *(TR-A2, TR-A3)*
- **TR-T6** — **Dado** un `<details>` de logros **cuando** se llama a `focus()` sobre su `summary` y después se hace clic **entonces**:
  - el `summary` es `document.activeElement`, enfocable sin `tabindex`;
  - el `details` pasa a `open`;
  - el `summary` no lleva `tabindex`, `aria-expanded` ni `onclick`.

  *(TR-A3, TR-A7)*
- **TR-T7** — **Dado** los logros `['Logro ficticio', '   ']` y una fase de título `'  '` **cuando** se pinta **entonces** el `summary` dice «Ver logros (1)», la lista tiene 1 `li` y la fase en blanco no aparece. **Dado** solo logros en blanco **entonces** no hay `<details>`. *(TR-A2, TR-A3)*
- **TR-T8 (BA-T31)** — **Dado** `experience: []` con formación completa **cuando** se pinta **entonces** no hay nada: `innerHTML` vacío, sin `#experience` ni h2. **Dado** un trabajo sin `summary` **entonces** no hay párrafo vacío y sus fases se ven igual. *(TR-A1)*

*Formación* — `components/education-section.test.tsx` (componente y unit de `educationColumns`)
- **TR-T9 (BA-T32)** — **Dado** `resumeEs.education` (1 titulación, 1 certificado, 1 curso sin emisor) en ES **cuando** se pinta **entonces**:
  - hay una `section#education` con ceja «0N / formación» y h2 «Formación»;
  - tiene tres columnas en orden, con h3 «Titulación», «Certificaciones» y «Cursos»;
  - se ve «Grado · Informática» con «Universidad Ejemplo», «Certificado Ejemplo» con «Entidad Ejemplo» y «Curso Ejemplo» sin línea de emisor;
  - no hay `ol` ni `span[aria-hidden]` (sin línea de tiempo).

  *(TR-A4)*
- **TR-T10** — **Dado** solo certificados **cuando** se pinta **entonces** hay una única columna «Certificaciones», sin h3 «Titulación» ni «Cursos». **Dado** titulación y cursos **entonces** hay dos columnas, con Titulación antes que Cursos. *(TR-A4)*
- **TR-T11** — **Dado** las tres listas vacías **entonces** `educationColumns` devuelve `[]` y la sección no pinta nada. **Dado** listas con solo entradas en blanco (`name: '  '`, `institution: ' '` sin tipo ni área) **entonces** también devuelve `[]` y no pinta nada. *(TR-A4)*
- **TR-T12** — **Dado** una titulación sin `studyType` ni `area` **entonces** la línea principal es el centro y no hay detalle. **Dado** solo `area` **entonces** la principal es «Informática» y el centro va de detalle. **Dado** un curso con `issuer` **entonces** el emisor aparece de detalle. *(TR-A4)*
- **TR-T13** — **Dado** `resumeEn` en EN **cuando** se pinta **entonces** el h2 es «Education», la ceja «0N / education», las columnas «Degree», «Certifications» y «Courses», y salen los datos ingleses («Example University», «Example Body»). *(TR-A4, TR-A8)*

*Vista* — `components/home-view.test.tsx` (componente)
- **TR-T14 (BA-T37, T47, CO-T81)** — **Dado** `resumeEs` o `resumeEn` en el Perfil **cuando** se pinta `HomeView` **entonces** las cejas son `01 / trayectoria · 02 / formación · 03 / arquitectura · 04 / proyectos · 05 / contacto` y `01 / career · 02 / education · 03 / architecture · 04 / projects · 05 / contact`, también con servicios, proyectos y arquitectura vacíos. *(TR-A5)*
- **TR-T15** — Numeración del Perfil cuando falta alguna sección:
  - **Dado** un Perfil sin trabajos pero con formación **entonces** `01 / formación · 02 / arquitectura …`, sin `#experience` ni «Ver trayectoria».
  - **Dado** trabajos sin formación **entonces** `01 / trayectoria · 02 / arquitectura …`, sin `#education`.
  - **Dado** `emptyListsResume()` **entonces** `01 / arquitectura · 02 / proyectos · 03 / contacto`.
  - **Dado** formación solo en blanco **entonces** no hay `#education` ni hueco en la numeración.

  *(TR-A5, TR-A6)*
- **TR-T16** — **Dado** la página de Servicios en ES y EN con `resumeEs` **entonces** no existen `#experience` ni `#education`, ni textos de fases, logros o formación, y la numeración sigue `01 / servicios · 02 / proceso · 03 / proyectos · 04 / contacto`. *(TR-A5)*
- **TR-T17** — **Dado** el Perfil completo **entonces**:
  - hay un solo h1;
  - `#experience` y `#education` son `section[aria-labelledby]` cuyo id es su h2;
  - trabajos y columnas usan h3, sin ningún h4 ni salto de nivel;
  - todo `a[href^="#"]`, incluido «Ver trayectoria», apunta a un id existente.

  *(TR-A6, TR-A7)*

*CSS* — `components/trajectory.module.test.ts` (unit, con `tests/helpers/css.ts`)
- **TR-T18** — **Dado** `trajectory.module.css` y `education-section.module.css` **entonces**:
  - todo `color`, `background*` y `border*` usa `var(--…)`, `currentColor` o `transparent`;
  - no hay `font-family` salvo `var(--font-…)`;
  - no hay `transition`, `animation`, `@keyframes` ni `prefers-reduced-motion`;
  - BA-T10 y BA-T16 siguen en verde.

  *(TR-A7)*
- **TR-T19** — **Dado** `education-section.module.css` **entonces** tiene un `@media (max-width: N px)`, con N ≤ 640, que deja las columnas en una (`grid-template-columns: 1fr`). **Dado** `trajectory.module.css` **entonces** la regla del `summary` declara `min-height` ≥ 44 px y `cursor: pointer`. *(TR-A4, TR-A7)*

*Diccionarios* — `lib/i18n/i18n.test.ts` (unit)
- **TR-T20** — **Dado** ES y EN **entonces**:
  - existen `sections.education.label/title`, `education.degrees/certificates/courses/certificate/course` y `experience.achievements`;
  - `achievements` contiene `{count}` en los dos, e `interpolate(…, { count: '3' })` da «Ver logros (3)» / «See achievements (3)»;
  - `education.education` ya no existe;
  - BA-T42 sigue en verde.

  *(TR-A8)*

*Validador* — `lib/api/validate.test.ts` (unit)
- **TR-T21** — **Dado** `resumeEs` con alguna de estas faltas **cuando** se llama a `parseResume` **entonces** devuelve `null` en todos los casos:
  - (a) una fase sin `title`;
  - (b) una fase con `client: 7`;
  - (c) `phases` ausente o `{}`;
  - (d) un logro numérico;
  - (e) `highlights` ausente.

  **Dado** `client: null` o ausente **entonces** lo acepta. **Dado** una fase con `phone` y un trabajo con `dni` **entonces** el resultado no contiene ninguno de los dos. *(TR-A9)*

*Runtime* — `tests/runtime/trajectory.test.ts` (servidor standalone con `startFakeApi({ resume })`; rutas tomadas de `PAGES`)
- **TR-T22** — **Dado** una API cuyo `resume` es `careerResume(lang)` **cuando** se piden los Perfiles ES y EN **entonces**:
  - responden 200, y `#experience li` coincide con el número de trabajos, con dos marcadores rellenos;
  - las fases están en el HTML, fuera de `<details>`;
  - hay un `<details>` por trabajo con logros, ninguno con `open`, con «Ver logros (3)» / «See achievements (3)»;
  - el texto de los logros ya viene en el HTML del servidor;
  - `#education` solo tiene las columnas con datos.

  *(TR-A1, TR-A2, TR-A3, TR-A4)*
- **TR-T23** — **Dado** la misma API **cuando** se piden las páginas de Servicios **entonces** no hay `#experience`, `#education` ni `<details>` de logros. *(TR-A5)*
- **TR-T24** — **Dado** una API cuyo `resume` trae una fase sin título **cuando** se pide cualquiera de las 4 páginas **entonces** responde 500, sin «Ada Ejemplo» ni detalles internos (`cv-api`, pila, `ECONNREFUSED`). **Cuando** la API vuelve a un `resume` válido **entonces** la siguiente petición da 200. *(TR-A9)*
- **TR-T25** — **Dado** un `resume` con centinelas privados dentro de una fase (`phone`), de un trabajo (`birthDate`) y de una entrada de formación (`dni`) **cuando** se piden las 4 páginas y su RSC **entonces** ningún centinela aparece en el HTML, el RSC ni los chunks JS. Control positivo: el RSC del Perfil sí contiene el título de una fase. *(TR-A9)*

*Runtime* — `tests/runtime/pages.test.ts` (runtime)
- **TR-T26 (T32)** — **Dado** la API falsa por defecto **cuando** se leen las cejas de cada página de `PAGES` **entonces** el Perfil ES/EN da `01 / trayectoria … 05 / contacto` / `01 / career … 05 / contact` y Servicios no cambia. La tabla esperada se indexa por `(mode, lang)`, no por ruta. *(TR-A5)*

*Fuente y docs* — `tests/source.test.ts` (unit)
- **TR-T27** — **Dado** `components/trajectory.tsx` y `components/education-section.tsx` **entonces** no contienen `'use client'`, `useState`, `useEffect`, `onClick` ni `fetch(`. *(TR-A3, TR-A9)*
- **TR-T28** — **Dado** `docs/web-standards.md` **entonces** no contiene «02 / arquitectura». *(TR-A10)*

*PDF* — `components/home-view-pdf.test.tsx` (componente) y regresión
- **TR-T29** — **Dado** `HomeView` del Perfil con `pdfHref` **entonces** el enlace de descarga está dentro de `#architecture`, cuya ceja pasa a ser «03 / arquitectura» con `resumeEs`. Además, las pruebas existentes de `lib/pdf/*.test.ts(x)` y `tests/runtime/pdf.test.ts` (T57–T62) pasan sin modificarse. *(TR-A10)*

*Paridad* (protocolo con Chrome DevTools, no vitest)
- **TR-T30** — **Dado** la web construida contra `npm run parity:api` (datos del diseño, sin fases ni logros) **cuando** se ejecuta `probe.mjs web perfil` a 1440 y a 390 **entonces** `timeline`, `timeline-marker`, `timeline-period` y `timeline-title` siguen dentro de tolerancia. El reviewer adjunta el JSON a `progress/web-trajectory-split/review.md`. *(TR-A1, TR-A7)*

**Cobertura TR:**

| Criterio | Tests |
|---|---|
| TR-A1 | T1, T2, T8, T22, T30 |
| TR-A2 | T3, T5, T7, T22 |
| TR-A3 | T4, T5, T6, T7, T22, T27 |
| TR-A4 | T9–T13, T19, T22 |
| TR-A5 | T14, T15, T16, T23, T26 |
| TR-A6 | T15, T17 |
| TR-A7 | T6, T17, T18, T19, T30 |
| TR-A8 | T13, T20 |
| TR-A9 | T21, T24, T25, T27 |
| TR-A10 | T28, T29 |

### 2.6 Privacidad, SEO y accesibilidad
- **Privacidad:**
  - No entra ningún campo nuevo. Fases, clientes de fase y logros son datos públicos de la API que el PDF ya publica.
  - El validador descarta todo campo desconocido (TR-T21, TR-T25).
  - Nada de teléfono, documento ni fecha de nacimiento.
- **SEO:**
  - El contenido de un `<details>` cerrado está en el HTML del servidor, así que es indexable.
  - No cambian `metadata`, JSON-LD ni sitemap.
- **Accesibilidad:**
  - `details` y `summary` nativos: el rol, el estado expandido y el teclado los da el navegador.
  - Foco visible por el `:focus-visible` global y objetivo de 44 px.
  - El texto del `summary` dice cuántos logros hay.
  - Un h2 por sección, un h3 por trabajo y por columna, y listas semánticas.
  - Sin animaciones: el reduced motion se respeta por construcción.
  - Los colores son los pares ya validados por BA-T11.

### 2.7 Datos y resiliencia
- **Sin lecturas nuevas.** La página sigue con sus 4 lecturas memoizadas por petición (`getResume`, etc.). Fases y logros vienen del mismo `resume`.
- **API caída o respuesta inválida:** 500, como hoy; T37–T40 siguen valiendo. Una fase o un logro mal formado invalida el `resume` entero y la página da 500 (TR-T24).
- **Listas vacías:** Experiencia y Formación se **omiten**, como hoy la trayectoria, y no muestran estado vacío. El brief dice «sin ningún dato, no hay sección». Los estados vacíos siguen siendo solo de servicios, proyectos y arquitectura.
- **Campos opcionales ausentes:** resumen, cliente de fase, tipo y área de titulación y emisor se omiten sin dejar separadores ni párrafos vacíos.

### 2.8 Alternativas descartadas
- **Acordeón con estado de React (`'use client'`):** añade un chunk e hidratación para algo que el HTML ya resuelve, y el brief pide `<details>` nativo sin JavaScript.
- **Mantener la formación en la línea de tiempo**, con marcadores huecos o con subentradas por trabajo: es justo lo que el brief elimina.
- **Logros siempre visibles o fases dentro del desplegable:** contradicen la decisión 2 del brief (fases visibles, logros cerrados).
- **Ampliar `resumeEs` con más fases y logros:** rompería expectativas del PDF, de la vista y de runtime que dependen de su forma. Por eso se añade `careerResume()` aparte.

### 2.9 Riesgos / dudas
- **TR-D1 — Etiqueta de la sección de trabajos.** Sigue siendo «trayectoria» / «career» (diseño y CTA «Ver trayectoria»), pero el brief la llama «Experiencia». ¿Se queda así o pasa a «experiencia» / «experience»? El plan la deja como está.
- **TR-D2 — Textos nuevos que el brief no fija.** La ceja y el título «formación» / «Formación» y «education» / «Education», y las cabeceras inglesas «Degree · Certifications · Courses». Confirmar.
- **TR-D3 — Posición.** Formación va justo después de Experiencia, así que Arquitectura (con el botón del PDF) pasa a «03».
- **TR-D4 — Fondo.** Formación va sin fondo alternativo (`alt`): quedan dos secciones seguidas con el mismo fondo antes de Arquitectura (`alt`). Validar a la vista.
- **TR-D5 — Entradas en blanco (decisión del plan).** Las entradas, fases y logros con texto en blanco se descartan y no cuentan en «(n)». Así se cumple «columna sin datos no se pinta» y el número del desplegable coincide con lo visible.
- **TR-D6 — Sin referencia de diseño.** No la hay para fases, desplegable ni columnas, así que se usan las escalas de §2.2. Julio valida en escritorio y a 360 px. La página del Perfil crece bastante con los 6 trabajos reales; los logros cerrados lo amortiguan.
- **TR-D7 — Texto del `summary`.** Dice «Ver logros (n)» también estando abierto, porque sin JavaScript no se puede cambiar. Es lo que pide el brief.
- **TR-D8 — Orden de los trabajos.** Es el de la API. Con dos trabajos actuales, se ve primero el que la API manda primero.

---

## 3. Slug B — `web-home-services` (prefijo `HS`)

### 3.1 Objetivo
Que `floreslab.dev` abra Servicios:
- `/` (ES) y `/en/` (EN) sirven Servicios; `/perfil/` y `/en/profile/`, el Perfil.
- Las URLs viejas `/servicios/` y `/en/services/` redirigen de forma permanente a `/` y `/en/`.
- El logo lleva a Servicios del idioma actual y el segmento del Perfil en el interruptor pasa a llamarse «Perfil / CV» (HS-D1, decisión de Julio): no se añade ningún enlace a la cabecera.
- Todo lo que suponía «perfil = portada» se invierte: cajetín, interruptor, SEO, sitemap, JSON-LD, docs, tests y smoke.
- El PDF sigue enlazado solo desde el Perfil.

### 3.2 Decisión: 308 (`permanent: true`), no 301
1. **Es la forma nativa de Next.** `permanent: true` da 308 (§0.3), y es el mismo código que Next ya usa para la barra final. La web ya responde 308 en `/servicios` → `/servicios/` (T28), `/api/health` (T56) y `/api/contact` (T82). Con 308 toda la cadena es homogénea.
2. **Para buscadores es equivalente.** Google trata 301 y 308 como «moved permanently», y los dos transfieren la canónica (§0.3).
3. **El método no importa aquí.** 308 conserva el método, pero aquí solo llegan GET y HEAD, así que ni aporta ni resta. Next añade además `Refresh: 0;url=` en los 308 para clientes muy viejos.
4. **301 no compensa.** `statusCode: 301` solo ganaría con clientes HTTP/1.0 que no conocen 308, una audiencia despreciable. Y mezclaría dos códigos en la misma cadena (`/servicios` → 308 → `/servicios/` → 301 → `/`).

### 3.3 Diseño concreto

**`lib/i18n/routes.ts`**
- `PAGES = ['services', 'profile'] as const`. Es el orden del interruptor y del sitemap; ver HS-D2.
- `PROFILE_SLUG: Record<Lang, string> = { es: 'perfil', en: 'profile' }` sustituye a `SERVICES_SLUG`.
- `resolveRoute`, tras quitar el prefijo de idioma:
  - sin segmentos → `services`;
  - un segmento igual a `PROFILE_SLUG[lang]` → `profile`;
  - cualquier otra cosa → `null`. Incluye `servicios`, `services`, `perfil` en EN, `profile` en ES, idiomas desconocidos y segmentos extra.
- `routeSlug`, `routePath` y `alternatesFor` se invierten en consecuencia: Servicios en `/` y `/en/`, Perfil en `/perfil/` y `/en/profile/`. El x-default es la ruta ES de la misma página.

**`next.config.ts`**
- `async redirects()` devuelve exactamente:
  - `{ source: '/servicios/', destination: '/', permanent: true }`
  - `{ source: '/en/services/', destination: '/en/', permanent: true }`
- Un comentario explica que la barra final es obligatoria en los dos lados, por `trailingSlash` y por la comparación estricta (§0.3).
- Sin `has` ni `missing`. No se añade regla para la forma sin barra: no se aplicaría nunca.

**`components/site-header.tsx`**
- **Logo:** `href = route.page === 'services' ? '#inicio' : routePath({ lang: route.lang, page: 'services' })`. En la portada lleva arriba del todo: el hero `#inicio` ya tiene `scroll-margin-top: var(--header-h)`.
- **Sin enlace nuevo (HS-D1, decisión de Julio).** El acceso al CV en un clic es el segmento del Perfil del interruptor, que pasa a
  decir «Perfil / CV» / «Profile / CV». No se crea `dict.header.profileLink` ni se toca el grupo derecho de la cabecera.

**Componentes sin cambio de código.** `mode-toggle.tsx`: al reordenar `PAGES`, muestra «Servicios · Perfil / CV»; el texto sale de
`dict.mode` (comprobado el 2026-11-23: `dict.mode` solo lo usa el interruptor). `language-switch.tsx`: sin cambio.

**`lib/i18n/dictionaries.ts`**
- `cajetin.sheets = { profile: '02 / 02 · Perfil', services: '01 / 02 · Servicios' }`; en EN, `'02 / 02 · Profile'` y `'01 / 02 · Services'`.
- `mode.profile = 'Perfil / CV'` / `'Profile / CV'` (hoy `'Perfil'` / `'Profile'`). `mode.services` no cambia.

**Sin cambio de código**, porque derivan de `routes.ts` (se verifica con sus tests):
- `lib/seo/metadata.ts`: title y description por id de página, así que la portada recibe los de Servicios.
- `lib/seo/json-ld.ts`: `url` = Perfil del idioma.
- `app/sitemap.ts` y `app/robots.ts`.
- `app/[[...slug]]/page.tsx` (el PDF sigue condicionado a `page === 'profile'`) y `layout.tsx`.

**CI** (`.github/workflows/ci.yml`, paso «Smoke test the container»). Tras las comprobaciones actuales, se añade:
- `curl -fsS http://localhost:3000/perfil/ | grep -q '<h1' || fail "/perfil/ has no <h1>"`
- `[ "$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' http://localhost:3000/servicios/)" = '308 http://localhost:3000/' ] || fail …`
- La misma comprobación para `/en/services/`, esperando `308 http://localhost:3000/en/`.

**Docs**
- `AGENTS.md`, fila `app/`: «`/` y `/perfil/` en español, `/en/` y `/en/profile/` en inglés; `/servicios/` y `/en/services/` redirigen 308».
- `CLAUDE.md`, «Qué es»: Servicios en la portada y Perfil en `/perfil/`.
- `docs/web-standards.md`:
  - i18n: las rutas nuevas y las redirecciones;
  - SEO: el sitemap lista las 4 URLs nuevas. La frase «No hay redirección entre hosts» se mantiene, y se añaden las dos redirecciones de ruta.

### 3.4 Archivos a crear/tocar

**Código y configuración**
- `lib/i18n/routes.ts`, `next.config.ts`, `components/site-header.tsx`, `lib/i18n/dictionaries.ts` y `.github/workflows/ci.yml`.
- `components/mode-toggle.module.css` no se toca: el segmento ya tiene 44 px y `padding: 0 18px`. Revisar a la vista que «Perfil / CV» cabe a 360 px (HS-D7).

**Docs:** `AGENTS.md`, `CLAUDE.md` y `docs/web-standards.md`.

**Tests**
- `lib/i18n/routes.test.ts`: HS-T1…T4 (sustituyen BA-T1…T3 y el extra).
- `next.config.test.ts`: HS-T5 y HS-T6 (reescriben T23 y la línea `redirects` de T240).
- `components/site-header.test.tsx`: HS-T7…T10 (sustituyen BA-T20 y BA-T21).
- `app/globals.test.ts`: HS-T11, solo si hay clase nueva.
- `components/cajetin.test.tsx`: HS-T12 (cambia las expectativas de BA-T27…T29).
- `lib/seo/metadata.test.ts` (HS-T13), `lib/seo/json-ld.test.ts` (HS-T14) y `app/sitemap.test.ts` (HS-T15).
- `tests/helpers/runtime-pages.ts`: `PAGES` pasa a ser `/` es/services, `/perfil/` es/profile, `/en/` en/services y `/en/profile/` en/profile, cada una con su canonical.
- `tests/runtime/pages.test.ts`: T28, T29 y T34, más los nuevos HS-T17, HS-T18 y HS-T21.
- `tests/runtime/domain.test.ts`: T88.
- `tests/runtime/resilience.test.ts`: T35, T40 y un caso nuevo.
- `tests/runtime/admin-e2e.test.ts`, `admin-images.test.ts`, `admin-history.test.ts` y `admin-content.test.ts`: solo las rutas de §0.6 (`/servicios/` → `/`, `/en/services/` → `/en/`). T339 cambia también su título.
- `tests/deploy/deploy-files.test.ts`: HS-T28.
- `tests/source.test.ts`: HS-T29.

**No se tocan** (comprobado):
- `proxy.ts`: su matcher solo cubre `/admin` y las redirecciones van antes.
- `scripts/parity/*` y `app/not-found.tsx`.
- `lib/pdf/*`, `lib/seo/*.ts`, `app/sitemap.ts`, `app/robots.ts` y `app/[[...slug]]/*`.
- `instrumentation.test.ts` y `deploy/docker-compose.yml`.

### 3.5 Criterios de aceptación
- **HS-A1 — Rutas.**
  - `/` = Servicios ES, `/perfil/` = Perfil ES, `/en/` = Services EN y `/en/profile/` = Profile EN, todas con 200 y `lang` y `data-mode` correctos.
  - Cualquier otra ruta es 404 sin llamar a la API. Incluye el slug en el idioma equivocado (`/en/perfil/`, `/profile/`), un idioma desconocido (`/fr/`) y segmentos extra.
  - Sin barra final: 308 a la forma con barra.
- **HS-A2 — Redirecciones.**
  - `/servicios/` → `/` y `/en/services/` → `/en/` con **308** y `Location` relativa (sin host), conservando la query.
  - Las formas sin barra llegan en dos saltos 308.
  - No llaman a la API y funcionan con la API caída.
  - Ninguna redirección tapa una ruta viva.
- **HS-A3 — Logo.** En Servicios lleva a `#inicio`; en el Perfil, a Servicios del mismo idioma (`/` o `/en/`).
- **HS-A4 — Segmento «Perfil / CV» / «Profile / CV».** En las 4 páginas, el segmento del Perfil del interruptor dice «Perfil / CV» (ES) o «Profile / CV» (EN), lleva al Perfil del idioma, con `aria-current="page"` en el propio Perfil y un objetivo ≥44 px. La cabecera no gana ningún otro enlace (HS-D1).
- **HS-A5 — Interruptor e idioma.**
  - El interruptor de modo va en orden Servicios · Perfil / CV, cada segmento a su página del idioma y con `aria-current` en la actual.
  - El selector de idioma lleva a la misma página en el otro idioma.
- **HS-A6 — Cajetín.** Servicios: «01 / 02 · Servicios» («01 / 02 · Services»). Perfil: «02 / 02 · Perfil» («02 / 02 · Profile»).
- **HS-A7 — SEO.**
  - `/` y `/en/` llevan el title y la description de Servicios, y cada página su canonical.
  - hreflang es/en/x-default por pareja: Servicios `/` y `/en/` (x-default `/`); Perfil `/perfil/` y `/en/profile/` (x-default `/perfil/`).
  - `og:url` = canonical.
  - `sitemap.xml` tiene exactamente las 4 URLs nuevas con sus alternates, sin las viejas.
  - El JSON-LD `Person.url` es el Perfil del idioma en las 4 páginas.
  - `robots.txt` no cambia.
  - Todo sale de `SITE_URL` en runtime.
- **HS-A8 — PDF.** Solo `/perfil/` y `/en/profile/` enlazan su PDF; las páginas de Servicios, ninguno. Las rutas de los PDF no cambian.
- **HS-A9 — Docs, tests y CI.**
  - `AGENTS.md`, `CLAUDE.md` y `docs/web-standards.md` describen las rutas nuevas y las redirecciones.
  - El smoke del job `docker` comprueba `/perfil/` y las dos 308.
  - Ningún test lee una página por `/servicios/` o `/en/services/`.
- **HS-A10 — Resiliencia y privacidad**, iguales que hoy pero en las rutas nuevas:
  - API caída o inválida: 500 sin datos viejos.
  - Listas vacías: estados vacíos.
  - Una lectura por recurso e idioma.
  - Ningún centinela privado ni la URL de la API en el HTML, RSC o JS de las 4 páginas, ni en el cuerpo de las 308.

### 3.6 Plan de tests (catálogo completo)

*Rutas* — `lib/i18n/routes.test.ts` (unit)
- **HS-T1 (BA-T1)** — **Dado** `[]`, `undefined`, `['perfil']`, `['en']` y `['en','profile']` **cuando** se resuelven **entonces** dan (es, services), (es, services), (es, profile), (en, services) y (en, profile). *(HS-A1)*
- **HS-T2 (BA-T2)** — **Dado** `['servicios']`, `['en','services']`, `['profile']`, `['en','perfil']`, `['Perfil']`, `['fr']`, `['es']`, `['en','en']`, `['perfil','x']` y `['en','profile','x']` **cuando** se resuelven **entonces** dan `null` en todos, sin lanzar. *(HS-A1, HS-A2)*
- **HS-T3 (BA-T3)** — **Dado** cada ruta **entonces**:
  - `routePath` da `/`, `/perfil/`, `/en/` y `/en/profile/`;
  - `alternatesFor('services')` = `{ es: '/', en: '/en/', 'x-default': '/' }`;
  - `alternatesFor('profile')` = `{ es: '/perfil/', en: '/en/profile/', 'x-default': '/perfil/' }`.

  *(HS-A1, HS-A7)*
- **HS-T4** — **Dado** `allRoutes()` **entonces** hay 4 rutas, `routeSlug` es el inverso de `resolveRoute` y `PAGES` es `['services','profile']`. *(HS-A1, HS-A5)*

*Configuración* — `next.config.test.ts` (unit)
- **HS-T5 (T23, T240)** — **Dado** `nextConfig` **cuando** se llama a `redirects()` **entonces**:
  - devuelve exactamente las dos reglas de §3.3, con `permanent: true` y sin `statusCode`, `has`, `missing` ni `basePath`;
  - `trailingSlash` sigue en `true`, `output` en `'standalone'` y las imágenes sin optimizar;
  - `headers()` sigue con solo `/admin/:path*`.

  *(HS-A2)*
- **HS-T6** — **Dado** cada redirección **entonces** `source` y `destination` acaban en `/`; `resolveRoute(<segmentos del source>)` es `null`, es decir, no tapa una página viva; y `destination === routePath({ lang, page: 'services' })` del idioma del `source`. *(HS-A2)*

*Cabecera* — `components/site-header.test.tsx` (componente)
- **HS-T7 (BA-T20)** — **Dado** Servicios ES **cuando** se pinta la cabecera **entonces** el grupo «Modo de la web» tiene, en este orden, «Servicios» (`/`, `aria-current="page"`) y «Perfil / CV» (`/perfil/`). **Dado** Perfil EN **entonces** «Services» lleva a `/en/` y «Profile / CV» a `/en/profile/`, con `aria-current`. *(HS-A5)*
- **HS-T8 (BA-T21, logo)** — **Dado** Servicios ES y EN **entonces** el enlace con el nombre («Ada Ejemplo») apunta a `#inicio`. **Dado** Perfil ES, apunta a `/`; **dado** Perfil EN, a `/en/`. *(HS-A3)*
- **HS-T9** — **Dado** las 4 páginas **entonces** el segmento del Perfil del grupo «Modo de la web» se llama «Perfil / CV» (ES) o «Profile / CV» (EN) y lleva a `/perfil/` o `/en/profile/`, con `aria-current="page"` solo en el Perfil; y en toda la cabecera no hay ningún otro enlace al Perfil (el único `a[href="/perfil/"]` o `a[href="/en/profile/"]` es el segmento). BA-T22 y T46 siguen pasando sin cambios. *(HS-A4)*
- **HS-T10 (BA-T21, idioma)** — **Dado** Servicios ES **entonces** «EN» lleva a `/en/` con `hreflang="en"`. **Dado** Perfil EN **entonces** «ES» lleva a `/perfil/`. *(HS-A5)*

*CSS* — `app/globals.test.ts` (unit)
- **HS-T11 — retirado (HS-D1).** Sin enlace nuevo no hay clase nueva: BA-T18 ya cubre los 44 px del segmento del interruptor. No se escribe test; en `impl.md` figura como «retirado, cubierto por BA-T18». *(HS-A4)*

*Cajetín* — `components/cajetin.test.tsx` (componente)
- **HS-T12 (BA-T27–T29)** — **Dado** Servicios ES/EN **entonces** «Hoja» / «Sheet» vale «01 / 02 · Servicios» / «01 / 02 · Services». **Dado** Perfil ES/EN **entonces** vale «02 / 02 · Perfil» / «02 / 02 · Profile». El resto de celdas no cambia. *(HS-A6)*

*SEO* (unit)
- **HS-T13** (`lib/seo/metadata.test.ts`; sustituye BA-T4, BA-T5, T29, T31 y T87):
  - **Dado** Servicios ES **entonces** el title es `interpolate(meta.services.title, { name })` y la description la de servicios; canonical `SITE/`, alternates `{ es: SITE/, en: SITE/en/, x-default: SITE/ }` y `og:url` `SITE/`.
  - **Dado** Perfil ES **entonces** canonical `SITE/perfil/` y alternates `{ SITE/perfil/, SITE/en/profile/, x-default SITE/perfil/ }`.
  - **Dado** Perfil EN **entonces** canonical `SITE/en/profile/`, `og:locale en_US` y `alternateLocale ['es_ES']`.
  - Con el `siteUrl` por defecto, las 5 URLs de cada página empiezan por `https://floreslab.dev/`.

  *(HS-A7)*
- **HS-T14** (`lib/seo/json-ld.test.ts`; sustituye T87 y BA-T7) — **Dado** ES y EN **entonces** `Person.url` es `SITE/perfil/` y `SITE/en/profile/` (por defecto, `https://floreslab.dev/perfil/` y `/en/profile/`), y sigue sin email, `telephone`, `birthDate` ni `taxID`. *(HS-A7, HS-A10)*
- **HS-T15** (`app/sitemap.test.ts`; sustituye BA-T6 y T87) — **Dado** el sitemap **entonces** tiene exactamente `SITE/`, `SITE/perfil/`, `SITE/en/` y `SITE/en/profile/`, ninguna con `servicios` ni `services`, y cada una con los alternates es/en de su pareja. *(HS-A7)*

*Runtime* — `tests/runtime/pages.test.ts` con el `PAGES` nuevo
- **HS-T16 (T27)** — **Dado** las 4 rutas nuevas **entonces** responden 200 `text/html`, con el `lang` correcto, `data-mode` `services` en `/` y `/en/` y `profile` en `/perfil/` y `/en/profile/`, y un `Cache-Control` no cacheable. *(HS-A1)*
- **HS-T17** — **Dado** el standalone **cuando** se piden `/servicios/`, `/en/services/` y `/servicios/?utm_source=ejemplo` con `redirect: 'manual'` **entonces**:
  - responden 308 con `Location` exactamente `/`, `/en/` y `/?utm_source=ejemplo`;
  - las `Location` son relativas: sin `http` y sin el host del servidor ni el de la API;
  - la API falsa no recibe ninguna petición.

  *(HS-A2)*
- **HS-T18** — **Dado** `/servicios` y `/en/services` sin barra **entonces** responden 308 a `/servicios/` y `/en/services/`, y estas a su vez 308 a `/` y `/en/`, sin ningún 404 por el camino. *(HS-A2)*
- **HS-T19 (T28)** — **Dado** `/fr/`, `/en/perfil/`, `/profile/`, `/en/servicios/`, `/perfil/x/` y `/zzz/` **entonces** dan 404. `/perfil` y `/en/profile` sin barra dan 308 a la forma con barra. Ninguna llama a la API. *(HS-A1)*
- **HS-T20 (T29)** — **Dado** las 4 páginas **entonces**:
  - tienen un h1 y los landmarks;
  - title propio (el de `/` es el de servicios) y canonical propio;
  - 3 hreflang recíprocos de su pareja, con x-default;
  - `og:url` = canonical;
  - un JSON-LD `Person` cuyo `url` es el Perfil del idioma;
  - el h1 de `/` es distinto del de `/perfil/`.

  *(HS-A7)*
- **HS-T21** — **Dado** el HTML de las 4 páginas **entonces**:
  - el logo apunta a `#inicio` en `/` y `/en/`, y a `/` o `/en/` en los Perfiles;
  - el segmento «Perfil / CV» / «Profile / CV» está en las cuatro y no hay otro enlace al Perfil en la cabecera;
  - el cajetín dice «01 / 02 · Servicios» en `/` y «02 / 02 · Perfil» en `/perfil/`;
  - el interruptor lista Servicios antes que Perfil / CV.

  *(HS-A3, HS-A4, HS-A5, HS-A6)*
- **HS-T22 (T59, en `tests/runtime/pdf.test.ts` vía `PAGES`)** — **Dado** las 4 páginas **entonces** solo `/perfil/` y `/en/profile/` tienen un `a[href$=".pdf"]`, el de su idioma; `sitemap.xml` y `robots.txt` no nombran ningún PDF. *(HS-A8)*
- **HS-T23 (T88, en `tests/runtime/domain.test.ts`)** — **Dado** `SITE_URL=https://example.test` **cuando** se pide `/` **entonces** la canonical es `SITE/` y el `url` del JSON-LD es `SITE/perfil/`. El sitemap tiene las 4 `<loc>` nuevas y 12 `xhtml:link`, todas con ese origen y sin `floreslab.dev`. *(HS-A7)*
- **HS-T24 (T35, T40, en `tests/runtime/resilience.test.ts`)** — **Dado** una API que cambia un servicio entre dos peticiones y luego pasa a 503 **cuando** se pide `/` **entonces** la segunda respuesta muestra el cambio y, tras el 503, da 500 sin «Ada Ejemplo». **Dado** la API caída desde el inicio **entonces** `/perfil/` da 500 y `/servicios/` sigue respondiendo 308 a `/`. *(HS-A2, HS-A10)*
- **HS-T25 (T31, T36 y nuevo)** — **Dado** la API con centinelas privados **entonces** ningún centinela, ni las etiquetas de teléfono o nacimiento, ni la URL de la API aparecen en el HTML, el RSC y los chunks de las 4 rutas nuevas, ni en el cuerpo de las respuestas 308. *(HS-A10)*
- **HS-T26 (T50, T34)** — **Dado** servicios, proyectos y arquitectura vacíos **entonces** las 4 rutas dan 200 con sus estados vacíos (`empty.services` en `/` y `/en/`, no en los Perfiles). **Dado** una API limpia **entonces** `/` y `/en/profile/` hacen una sola petición por recurso e idioma. *(HS-A10)*
- **Ajuste sin id nuevo.** T339 y las comprobaciones de servicio de `admin-e2e`, `admin-images` y `admin-history` leen `/` y `/en/` en lugar de `/servicios/` y `/en/services/`. Los que ya leían `/` o `/en/` para proyectos y arquitectura, que están en las dos páginas, no cambian. *(HS-A9)*

*CI y despliegue*
- **HS-T27 (CI, no vitest)** — **Dado** la imagen construida en el job `docker` (solo en push a `main`) **cuando** corre el smoke con `design-api.mjs` **entonces** pasan las comprobaciones nuevas de `/perfil/` y de las dos 308. Lo verifica la CI, como T98–T100. *(HS-A9)*
- **HS-T28 (`tests/deploy/deploy-files.test.ts`, unit)** — **Dado** el paso «Smoke test the container» **entonces**:
  - contiene el `curl` a `http://localhost:3000/perfil/` con `grep -q '<h1'`;
  - contiene las dos comprobaciones `'%{http_code} %{redirect_url}'`, que esperan `308 http://localhost:3000/` y `308 http://localhost:3000/en/`;
  - sigue sin variables nuevas (T426).

  *(HS-A9)*

*Docs* — `tests/source.test.ts` (unit)
- **HS-T29** — **Dado** `AGENTS.md`, `CLAUDE.md` y `docs/web-standards.md` **entonces**:
  - los tres nombran `/perfil/`;
  - `AGENTS.md` y `docs/web-standards.md` nombran `/en/profile/` y dicen que `/servicios/` y `/en/services/` redirigen (308) a `/` y `/en/`;
  - la fila de `app/` de `AGENTS.md` ya no dice «`/` y `/servicios/` en español».

  *(HS-A9)*

**Cobertura HS:**

| Criterio | Tests |
|---|---|
| HS-A1 | T1, T2, T3, T4, T16, T19 |
| HS-A2 | T2, T5, T6, T17, T18, T24 |
| HS-A3 | T8, T21 |
| HS-A4 | T7, T9, T21 (T11 retirado) |
| HS-A5 | T4, T7, T10, T21 |
| HS-A6 | T12, T21 |
| HS-A7 | T3, T13, T14, T15, T20, T23 |
| HS-A8 | T22 |
| HS-A9 | T27, T28, T29 y el ajuste de los tests de admin |
| HS-A10 | T14, T24, T25, T26 |

### 3.7 Privacidad, SEO y accesibilidad
- **Privacidad:**
  - No entra ningún dato nuevo.
  - La 308 la responde el router antes de renderizar, con cuerpo = destino y `Location` relativa.
  - Tras el túnel no se filtra el host interno (`cv-web:3000`) ni la URL de la API (HS-T17, HS-T25).
- **SEO:**
  - La redirección es permanente para que Google consolide en `/` las señales de `/servicios/` (§3.2).
  - El sitemap solo lista URLs canónicas.
  - Cada pareja tiene hreflang recíproco, con x-default en español.
  - La canónica de `/` es Servicios, y `Person.url` apunta al Perfil.
  - Search Console, `og:image` y el JSON-LD de servicios quedan para `web-seo-presence`, fuera de alcance.
- **Accesibilidad:**
  - El logo conserva su nombre accesible, el de la persona.
  - «Perfil / CV» es el texto visible del segmento, que es también su nombre accesible.
  - `aria-current="page"` en el segmento de la página actual.
  - La cabecera es igual en las 4 páginas (navegación coherente) y los objetivos son de 44 px.

### 3.8 Datos y resiliencia
- **Las redirecciones no dependen de la API ni de variables.** Salen del `routes-manifest.json` del build y responden aunque la API esté caída (HS-T24). El destino sí lee la API y, si cae, da 500 como siempre.
- **Las páginas leen lo mismo que hoy:** 4 recursos por página, con memo por petición. Solo cambia en qué URL vive cada una.
- `/api/health`, los PDF, `/api/contact` y el panel no se mueven.

### 3.9 Alternativas descartadas
- **301 con `statusCode: 301`:** ver §3.2.
- **Redirigir en `proxy.ts`:** el proxy es la puerta de `/admin` por decisión de Julio (matcher sin rutas públicas y sin lógica por visita). Ampliarlo haría que corriera en todas las páginas públicas para algo que la configuración resuelve en dos líneas.
- **`permanentRedirect()` desde la página** cuando `resolveRoute` reconoce una URL vieja: se ejecuta después de `generateMetadata`, que lee la API. Con la API caída, `/servicios/` daría 500 en vez de redirigir, y además mezcla la redirección con el render RSC.
- **Renombrar los ids de página** (`home`/`profile`) o el `data-mode`: arrastra tokens CSS, diccionarios, la sonda de paridad y la vista previa del panel sin aportar nada. Lo único que cambia es la URL.
- **Servir `/servicios/` como copia con canonical a `/`:** contenido duplicado; el brief pide redirección.
- **Regla extra para `/servicios` sin barra** (un solo salto): nunca se aplicaría, porque la regla interna de `trailingSlash` va antes (§0.3).

### 3.10 Riesgos / dudas
- **HS-D1 — Enlace «Perfil / CV». RESUELTA (Julio, 2026-11-23): sin enlace nuevo; el segmento del interruptor pasa a «Perfil / CV».** El brief pide confirmarlo en la validación del plan. Es redundante con el segmento «Perfil» del interruptor: mismo destino, nombres distintos. El plan lo pone en las 4 páginas, primero del grupo derecho y con `aria-current` en el Perfil. Alternativa: no añadirlo y renombrar el segmento del interruptor a «Perfil / CV».
- **HS-D2 — Orden del interruptor «Servicios · Perfil». RESUELTA (Julio, 2026-11-23): Servicios · Perfil / CV.** Es la lectura del punto 5 del brief, que incluye el interruptor de modo entre lo que se invierte. Es coherente con las hojas 01 Servicios / 02 Perfil, pero se aparta del orden del artifact (Perfil · Servicios). Confirmar.
- **HS-D3 — Un 308 se cachea en los navegadores sin caducidad.** Si algún día se quisiera volver a usar `/servicios/` como página, los visitantes que ya pasaron por ella seguirían redirigidos. Es lo que pide el brief (permanente); se deja dicho.
- **HS-D4 — Dos saltos sin barra.** `/servicios` y `/en/services` sin barra dan dos saltos 308. Es inevitable con `trailingSlash`, y Google sigue hasta 10.
- **HS-D5 — Despliegue automático.** Con el cambio pendiente de Julio en el compose (Watchtower), cada imagen `latest` se despliega sola: el PR `develop → main` es el paso que publica las redirecciones permanentes. Validar `web-home-services` en local antes de ese PR.
- **HS-D6 — Página 404.** Sigue con los tokens del Perfil y `lang="es"`, y enlaza a `/`, que ahora es Servicios. Fuera de alcance.
- **HS-D7 — Cabecera en móvil.** No gana enlace (HS-D1), pero el segmento «Perfil / CV» es más ancho que «Perfil»: revisar a 360 px que la cabecera no salte de línea de más. `--header-h` se recalcula solo (`HeaderOffset`).
- **HS-D8 — Caché de Cloudflare.** No se verificó si cachea los 308 de rutas sin extensión (por defecto no cachea HTML). No afecta a la corrección.
- **HS-D9 — Fragmentos en enlaces viejos.** Un enlace como `/servicios/#contact` conserva el fragmento tras la 308: lo hace el navegador, porque el `Location` no trae fragmento. Los ids de Servicios no cambian. No se puede probar del lado del servidor.

---

## 4. Orden recomendado y conflictos

### 4.1 Orden: primero `web-trajectory-split`, después `web-home-services`
1. **Riesgo.** A solo cambia el contenido del Perfil, en una URL que no se mueve, y es reversible. B cambia URLs públicas y SEO, y publica una redirección permanente: una puerta de un solo sentido (HS-D3, HS-D5). Conviene que B salga sobre una base ya estable y validada.
2. **Valor inmediato.** El CV real con fases y logros se está publicando estos días; A lo muestra ya en el Perfil actual.
3. **Menos retrabajo.** B reescribe muchos tests de rutas. Si va segundo, los reescribe una sola vez y ya con la numeración de A. A, a su vez, se escribe sin depender de las rutas (§4.2), así que no hay que tocarlo después.
4. **El orden contrario también funcionaría**, pero obligaría a escribir los tests de runtime de A contra `/perfil/` antes de tenerlo validado, y adelantaría el cambio de URLs, que es lo más delicado.

### 4.2 Archivos compartidos y cómo evitar el choque

| Archivo | A (`web-trajectory-split`) | B (`web-home-services`) | Choque esperado |
|---|---|---|---|
| `lib/i18n/dictionaries.ts` | interfaz y objetos: `sections.education`, `education.*`, `experience` | `mode.profile`, `cajetin.sheets` | Bloques distintos, merge limpio. Si dos cambios quedan en líneas contiguas, se conservan **las dos** claves. |
| `tests/runtime/pages.test.ts` | solo T32: las 4 aserciones finales de cejas, reescritas por `(mode, lang)` | T28, T29, T34 y tests nuevos; **no toca T32** | Ninguno, si A escribe T32 por `(mode, lang)`. Si A dejara rutas literales, B las cambiaría en las mismas líneas: se toma el contenido de A y se aplica el mapa de rutas de B. |
| `tests/runtime/trajectory.test.ts` (nuevo en A) | rutas tomadas de `PAGES` | no lo toca; al cambiar `PAGES`, el test pasa solo a `/perfil/` y `/en/profile/` | Ninguno. |
| `docs/web-standards.md` | sección «PDF del CV» | secciones de i18n y SEO | Párrafos distintos. |
| `components/home-view.tsx` y su test | numeración y Formación | **no los toca**: «Perfil / CV» es texto de `dict.mode` en el interruptor | Ninguno. |
| `progress/current.md` | estado | estado | Lo escribe el leader; no hay conflicto de código. |

La cabecera (`site-header.tsx`, `mode-toggle.tsx`, `cajetin`) y todo el SEO son solo de B. `trajectory.*`, `education-section.*`, `home-view.*` y el validador son solo de A.

### 4.3 Cómo debe partir y rebasar el segundo
- **Lo normal (una tarea a la vez):** `feature/web-home-services` sale de `develop` **después** de que el closer haya mergeado `feature/web-trajectory-split`. No hay rebase.
- **Si B tuviera que empezar antes del merge de A:** sale de `feature/web-trajectory-split`. Cuando A entre en `develop`, el closer lo rebasa con `git rebase --onto develop feature/web-trajectory-split feature/web-home-services` y resuelve los choques con la tabla de §4.2.
- **Tras el rebase**, el implementer de B:
  - vuelve a pasar `npm run lint`, `npm run typecheck`, `npm test` y `npm run build`;
  - comprueba con grep que en `tests/` no queda ninguna lectura de página por `/servicios/` o `/en/services/`, salvo las de las redirecciones y el ejemplo de `instrumentation.test.ts`;
  - comprueba que T32 da las cejas de A en `/perfil/` y `/en/profile/`.
