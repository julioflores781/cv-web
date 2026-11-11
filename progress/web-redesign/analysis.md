# Analysis — web-redesign (ronda 4 · diseño v2 «Bosque y lima» + PDF)

> **El `Write` a `progress/web-redesign/analysis.md` fue rechazado** («Subagents should return findings as text»). El plan completo va aquí en el chat, como indicaba la instrucción. Quien reciba esto debe guardarlo en `progress/web-redesign/analysis.md`.
>
> **Sustituye por completo** al plan de la ronda 3. Solo plan: no se ha tocado código ni tests de la web. Los `T1..T74` existentes siguen vigentes salvo donde §3 diga lo contrario. Los `T75..T218` de la ronda 3 nunca se implementaron y quedan **anulados**. Los criterios y tests nuevos llevan prefijo por slug (`RF`, `BA`, `HX`, `CO`, `PD`, `PA`): criterios `XX-An`, tests `XX-Tn`.

## 0. Lo verificado (2026-11-10)

**Diseño v2** (`design/artifact-v2/project/Main.dc.html`, 42 800 bytes, leído entero). `canvas.json` solo lista 4 tableros y solo `Main` se implementa.

- **Tokens** (`<style>` del artifact):
  - `.plano`: `--bg #0F2A1F, --bg2 #0B2118, --surface #17382A, --node #1F4D39, --ink #F1F6EE, --muted #B5CABB, --line rgba(255,255,255,.3), --line2 rgba(255,255,255,.14), --field #0B2118`.
  - `.obra`: `--bg #F4F3EC, --bg2 #E9E8DE, --surface #FFFFFF, --node #FFFFFF, --ink #12382A, --muted #486255, --line rgba(18,56,42,.32), --line2 rgba(18,56,42,.12), --field #FFFFFF`.
  - Acentos: perfil `#C6F24E`, servicios `#2FC98A`. El texto sobre acento es siempre `#0A2016`.
- **Fuentes** pedidas a Google: Barlow Condensed 500/600/700, IBM Plex Sans 400/500/600, IBM Plex Mono 400/500. El diseño **no usa Barlow 500**. `.d` = Barlow en mayúsculas; `.m` = Plex Mono.
- **Fondo `.gridbg`:** `background-size 84px 48.5px` con imagen blob (`/_blob/5a2024…` plano, `/_blob/348ba5…` obra). **Los blobs no son accesibles** desde el repo.
- **`support.js` (el runtime «dc») no está en el repo**, así que el `.dc.html` no se abre en el navegador tal cual. Estado por defecto del diseño: `mode=perfil, sel=0, picks={0:true}`.
- **Datos de ejemplo no verificables que NO se publican:** «Ocho años», «Prisma/TypeORM», `[AÑOS]`, `[TU PRECIO]`, `[CAPTURA…]`, «Hecho con Astro», «© 2026», y los enlaces genéricos a LinkedIn/GitHub.
- **Métricas leídas del marcado:**
  - Contenedor `max-width 1280`; sección `padding 96px 24px`; hero `72px 24px 80px`.
  - Eyebrow `13px` mono 500 con `padding 4px 10px`.
  - h1 `clamp(56px,8.4vw,124px)` con `lh .9`; h2 `clamp(40px,5vw,64px)` `.95`; h2 de contacto `clamp(48px,6.4vw,96px)` `.9`; h3 destacado `clamp(56px,7vw,104px)` `.88`.
  - CTA `min-height 52; padding 0 28px`; toggle `min 44×44`.
  - Nodos `20%`, `aspect .866/1`, `min-height 48`; núcleo `30%`; caja del plano `max-width 540; aspect 1/1`.
  - Posiciones de nodos `[[50,12],[82.9,31],[82.9,69],[50,88],[17.1,69],[17.1,31]]` en %, con `translate(-50%,-50%)`.
  - Tarjeta de servicio `min-height 230; padding 24; border 2px`; marcada: `border 2px acento; box-shadow 8px 8px 0 acento`.
  - Aside `bg var(--ink); color var(--bg); padding 28`; formulario `padding 32`; campos `min-height 48`.

**Versiones (`npm view`):**

| Paquete | Versión | Nota |
|---|---|---|
| `@react-pdf/renderer` | 4.9.0 | peer `react ^16.8…^19`; modificado 2026-08-27; 320 kB; JS puro |
| `pdfmake` | 0.3.14 | |
| `pdf-lib` | 1.17.1 | |
| `puppeteer` | 25.17.0 | |
| `playwright` | 1.65.0 | |
| `@fontsource/barlow-condensed`, `ibm-plex-sans`, `ibm-plex-mono` | 5.3.0 | |
| `pixelmatch` | 8.0.0 | |
| `pngjs` | 7.0.0 | |
| `@types/pngjs` | 6.0.5 | |
| `next` | 16.4.5 | `engines.node >=20.9` |

`.nvmrc` del repo = `22`, que lee Cloudflare Pages. React 19.3.1 y vitest 5.1.0 ya están en el repo.

**Prueba de concepto ejecutada** en un proyecto desechable fuera del repo, con Next 16.4.5 + React 19.3.1 + `@react-pdf/renderer@4.9.0`, `output:'export'` y `trailingSlash:true`:

- Un Route Handler `app/cv-ada-es.pdf/route.jsx` con `export const dynamic='force-static'` que llama a `renderToBuffer(...)` genera **`out/cv-ada-es.pdf`**. Es una ruta sin barra final, de 9,9 kB y «PDF document, 1 pages».
- `pdftotext` extrae el texto con acentos, «Ñ», «—», «·» y «¿» intactos, así que el **texto es seleccionable (ATS)**.
- `pdffonts` muestra las 3 fuentes embebidas (Barlow Condensed Bold, IBM Plex Sans Regular y SemiBold).
- `Font.register({src: <ruta .woff>})` funciona. **`@react-pdf` no admite `.woff2`**: se usan los `.woff` estáticos `latin` que ya trae `@fontsource/*@5.3.0` (existen todos los pesos necesarios).
- Funciona sin `serverExternalPackages`.
- Si el handler **lanza**, el build **falla** («Export encountered an error on /xthrow.pdf/route»).
- Si devuelve `new Response('no',{status:404})`, el build **pasa y publica** `out/x404.pdf` con el cuerpo `no`. De ahí la política de §2.6.
- `Document` acepta `language` (declarado en `index.d.ts`).

**Entorno y código actuales (leídos):**
- `next.config.ts` ya tiene `output:'export'`, `trailingSlash:true` e `images.unoptimized`.
- No existe `public/`.
- `app/` solo tiene `[[...lang]]`.
- `components/` es el diseño Terminal.
- `experience.tsx` pinta `company` (h3), `position` y `summary`.
- `contact.tsx` filtra redes con `safeHttpUrl`.
- `lib/api/*` implementa `getResume` con respaldo en `.next/cache/cv-web`.
- `tests/source.test.ts` T68 limita `fetch(` y `process.env` a `lib/api`.
- No hay `user-event`.
- `schema.d.ts` solo tiene los paths antiguos.

**Contratos de API** (ronda 3, repo `cv` commit `bb7e975`, sin cambios):
- `POST /contact/messages`:
  - Límites: name ≤100, email ≤254, message 10–2000.
  - Honeypot `website`. `201` sin cuerpo; `400 CONTACT_INVALID`; `429 CONTACT_RATE_LIMITED`.
  - CORS verificado para `https://cv.floreslab.dev`.
- `GET /services`, `/projects`, `/architecture` con `?lang`.
- **No hay campo «destacado», imagen ni diagrama de proyecto.**

**Contraste calculado (WCAG 2.x):**

| Par | plano | obra |
|---|---|---|
| ink / bg · bg2 · surface · node | 13.97 · 15.39 · 11.71 · 8.79 | 11.62 · 10.50 · 12.92 · 12.92 |
| muted / bg · bg2 · surface · node | 8.85 · 9.74 · 7.42 · 5.57 | 5.99 · 5.41 · 6.66 · 6.66 |
| `#0A2016` / acento | 13.17 | 7.99 |
| acento / bg (no texto) | 11.82 | **1.92** |
| borde de campo vs `--field` | 3.35 | **1.81** |

Hallazgos que cambian la implementación (§2.9):
- En obra el esmeralda solo sirve como relleno con texto `#0A2016` y **no basta como único indicador de estado**.
- El borde de campo de obra (`.32`) queda en 1.81:1 (<3:1, WCAG 1.4.11). Hace falta `--line-input: rgba(18,56,42,.55)` (3.31:1).

## 1. Objetivo

Sustituir la web Terminal por el diseño v2 «Bosque y lima», con datos 100 % de la API.

- **4 páginas estáticas** (`/`, `/servicios/`, `/en/`, `/en/services/`). Perfil = **plano** (verde bosque + lima); Servicios = **obra** (crema + esmeralda).
- **Perfil:**
  - Cabecera sticky.
  - Hero con h1 enorme y **plano hexagonal interactivo** (puertos y adaptadores de la API).
  - Cajetín.
  - Franja de impacto.
  - 01 trayectoria (timeline + formación).
  - 02 arquitectura (capas A–A′ + stack + descarga del PDF).
  - 03 proyectos.
  - 04 contacto.
  - Pie.
- **Servicios:** cabecera · hero · plano · cajetín · 01 servicios seleccionables + aside «Tu encargo» · 02 proceso · 03 proyectos · 04 contacto · pie. La selección **viaja al formulario**.
- **Contacto real** (`POST /contact/messages`) con honeypot.
- **PDF del CV ES/EN generado en el build** desde la misma API, solo email/LinkedIn/GitHub.
- **Paridad visual medible** contra el artifact v2 con un render de referencia y un protocolo con Chrome DevTools (§2.10). Es obligatoria para cerrar.
- **Se mantienen:** privacidad, build estático, ES `/` y EN `/en`, datos solo por `lib/api` (más la excepción acotada del POST), AA, objetivos ≥44 px, `prefers-reduced-motion`, un solo `h1`.

## 2. Decisiones

### 2.1 Rutas y modos (sigue la ronda 3)
- `app/[[...slug]]` con las 4 rutas.
- `lib/i18n/routes.ts` resuelve rutas, da el path por (lang, página) y `alternatesFor`.
- Canonical y hreflang recíprocos por página; sitemap de 4 URLs.
- El toggle Perfil/Servicios son **enlaces** con `aria-current="page"` estilizados como el control segmentado del diseño. El diseño usa `button aria-pressed` porque allí es estado de cliente; aquí cambia de URL.
- **`data-mode="profile|services"` va en `<body>` desde el layout** (único sitio). Los tokens se cuelgan de él.
- El diseño no trae selector de idioma; se añade (D2).

### 2.2 Tokens únicos (`app/globals.css`)
`app/globals.css` es la **única fuente** de tokens.

- Nombres idénticos a los del diseño (`--bg --bg2 --surface --node --ink --muted --line --line2 --field`), más `--accent`, `--accent-ink:#0A2016`, `--line-input` y los acentos `--accent-plano:#C6F24E` y `--accent-obra:#2FC98A`.
- `:root, [data-mode="profile"]` define el plano; `[data-mode="services"]` define el obra.
- No hay hex fuera de esos bloques. Excepción: los SVG (favicon y fondos hex), que no leen variables y están cubiertos por test.
- Utilidades globales mínimas: `.hex` (clip-path del diseño), `.gridbg`, variables `--font-head|text|mono`, `:focus-visible{outline:2px solid currentColor;outline-offset:3px}`, `@keyframes flow` y **un único** bloque `@media (prefers-reduced-motion:reduce)`.
- El PDF necesita 4 colores. `lib/pdf/theme.ts` los define y **un test los compara con los de `globals.css`**. Generar el CSS desde TS queda descartado (§9).

### 2.3 Fuentes
- `next/font/local` en `app/fonts.ts` con 7 woff2 `latin` estáticos copiados de `@fontsource/*@5.3.0/files/` a `app/fonts/`:
  - Barlow Condensed 600/700.
  - IBM Plex Sans 400/500/600.
  - IBM Plex Mono 400/500.
- `display:'swap'`, variables `--font-head|text|mono`.
- Un test comprueba que cada copia es **idéntica byte a byte** al woff2 de `node_modules`. El PDF usa los `.woff` del **mismo paquete**, sin segunda copia.
- Sin referencias a Google.
- Los glifos `──`, `■`, `→` **no están en el subset latin**. La leyenda del plano se dibuja con formas CSS/SVG, no con texto.

### 2.4 Fondo hexagonal propio
- `public/hex-grid-plano.svg` y `public/hex-grid-obra.svg`, **tile 84×48.5**: hexágonos planos de lado 28 (`s√3=48.497`), trazo de 1 px, dos hexágonos por tile (el segundo desplazado `(42,24.25)`).
- Trazo `#F1F6EE` (plano) y `#12382A` (obra). La opacidad la mide el implementer sobre el artifact por muestreo de píxeles.
- `.gridbg{background-size:84px 48.5px;background-image:url(/hex-grid-plano.svg)}` y `[data-mode="services"] .gridbg{background-image:url(/hex-grid-obra.svg)}`.
- Es un recurso propio y versionado, no el blob.

### 2.5 El plano hexagonal = diagrama de puertos y adaptadores de la API
Apariencia del diseño, contenido de `GET /architecture`.

- **Ubicación:** en el **hero** (columna derecha), en Perfil y en Servicios.
  - El diseño cambia los 6 nodos por servicios en obra.
  - Aquí **no**: el plano es la arquitectura real y es el mismo en ambos modos. Es D3, decisión del humano de la ronda 2.
- **Núcleo** (hex central 30 %, fondo acento, texto `#0A2016`):
  - Etiqueta mono `core/` (diccionario).
  - `core.name` de la API, en Barlow `clamp(18px,2.4vw,30px)`.
  - Nunca cambia.
- **Nodos** (hex 20 %): **un nodo por puerto** (`ports[]`).
  - `button` real con `aria-pressed`, dentro de `role="group" aria-label`.
  - Seleccionado: fondo acento y texto `#0A2016`. Resto: `--node` / `--ink`.
  - Hover `scale(1.07)`. `:focus-visible` invierte colores (fondo `--ink`, texto `--bg`), como el diseño, porque `clip-path` recortaría un outline.
  - La línea punteada animada `flow` va del nodo seleccionado al núcleo.
- **Posiciones:** tabla `SLOTS` sobre las 6 posiciones del diseño (0 arriba, 1 arriba-dcha, 2 abajo-dcha, 3 abajo, 4 abajo-izq, 5 arriba-izq), en sentido horario para que Tab coincida con la lectura visual:

  | Puertos | Posiciones |
  |---|---|
  | 1 | `[0]` |
  | 2 | `[0,3]` |
  | 3 | `[0,2,4]` |
  | 4 | `[1,2,4,5]` |
  | 5 | `[0,1,2,4,5]` |
  | 6 | `[0,1,2,3,4,5]` |

  Con **>6 puertos**, layout `list`: el hex central se mantiene y los puertos pasan a una rejilla de botones hex pequeños debajo. Todos visibles; nada se trunca.
- **Panel de detalle** (el recuadro «01 / 06»):
  - Índice `0n / 0N` en mono 12 px.
  - `port.name` en Barlow 22/600.
  - `port.description` en 15 px muted (se omite si es `null`).
  - Fila de adaptadores: con ≥2, un `fieldset`+`legend` con radios nativos en chip ≥44 px que cambian el adaptador mostrado **sin tocar el núcleo ni los otros puertos**; con 1, solo su nombre.
  - Siempre: `status` en texto + forma SVG distinta (hexágono lleno / vacío / trazo discontinuo) y `note` si existe.
  - Región `aria-live="polite"`.
  - Etiquetas de estado: «implementado en esta API», «en producción», «proyecto de prueba» (EN: «implemented in this API», «in production», «test project»).
- **Leyenda** (`── adaptadores / - - puertos / ■ contrato / toca un nodo para trazar la llamada`): formas dibujadas y textos del diccionario.
- **Sin JS:** el HTML estático lleva el plano con el primer puerto seleccionado y, por puerto, un `<noscript>` con **todos** los adaptadores (nombre, estado, nota).
- **0 puertos (o ninguno con adaptadores):** el bloque no se renderiza y el hero queda a una columna (D4). No quedan ancla ni enlace.
- Modelo puro `lib/architecture/model.ts` (`buildHexModel`) y `slots.ts`. Los ids del DOM son posicionales (`useId` + `p0a1`), nunca los de la API.

### 2.6 PDF del CV (ES/EN) en el build
**Elección: `@react-pdf/renderer@4.9.0` en un Route Handler estático.** Es lo que combina lo verificado: JSX/componentes con los mismos datos tipados `Resume`, texto real, fuentes embebidas, sin Chromium, sin binarios, sin paso externo, y sale en `out/` por el propio `output:'export'`.

- **Salida:** `/cv-julio-flores-es.pdf` y `/cv-julio-flores-en.pdf` (sin barra final aunque `trailingSlash:true`, verificado).
- **Constantes:** los nombres viven en `lib/pdf/files.ts`, única fuente para ruta, enlace y tests.
- **Handlers:** `app/cv-julio-flores-es.pdf/route.ts` y `app/cv-julio-flores-en.pdf/route.ts`, de 3 líneas cada uno, que llaman al mismo `cvPdfResponse(lang)`, con `dynamic='force-static'`. Se evita una ruta `[file]` porque chocaría con `[[...slug]]`.
- **Datos:** `getResume(lang)`, con la misma memoización, caché y reglas que las páginas. Si falta la fuente de datos, el build **falla** igual que las páginas. Cero fetch nuevos.
- **Política de fallo del render** (decisión del humano: «el fallo del PDF no rompe la web salvo que falte la fuente de datos»):
  - `lib/pdf/build-cv-pdf.ts` expone `getCvPdf(lang): Promise<Buffer|null>`, memoizado por idioma. **Captura** el error, hace `console.warn("[cv-web] PDF (es) failed: …; download button omitted")` y devuelve `null`.
  - La página muestra el botón solo si `await getCvPdf(lang) !== null`.
  - Con `null`, el handler devuelve un 404 `text/plain`. Verificado: el build no falla, pero **publica un archivo basura** en esa ruta. Queda **sin enlazar** y fuera del sitemap (riesgo aceptado, R-PD).
  - Así el botón nunca apunta a un PDF roto.
  - Cada worker de Next puede renderizar el PDF una vez (cientos de ms); no se coordina entre workers.
- **Contenido (ATS, una columna, A4, sin iconos, imágenes ni tablas):**
  - Cabecera: nombre en Barlow Condensed 700 en mayúsculas, `label`, ciudad/país.
  - Línea de contacto **solo** email + LinkedIn + GitHub (URL visible y enlace).
  - Resumen.
  - Experiencia: puesto · empresa, periodo, resumen, `highlights` como viñetas, `phases` como líneas.
  - Skills (grupo: palabras clave).
  - Formación (titulaciones, certificados, cursos) e idiomas.
  - Cabeceras de sección localizadas (diccionario `pdf` ES/EN).
  - Colores: tinta `#12382A`, regla fina esmeralda, fondo blanco.
  - Metadatos: `title` «{name} — CV», `author`, `language` `es`/`en`.
  - Cada puesto con `wrap={false}`; número de página en el pie.
- **Redes compartidas:** `lib/contact-links.ts` → `publicProfiles(contact)` (solo `LinkedIn`/`GitHub` sin distinguir mayúsculas + `safeHttpUrl`). Lo usan el PDF y el contacto web.
- **Botón:** «Descargar CV (PDF)» / «Download CV (PDF)» en la columna izquierda de «02 / arquitectura», como el diseño. `<a href="/cv-julio-flores-<lang>.pdf" download>`. Solo en Perfil y solo si hay PDF. En Servicios no aparece.
- **Cloudflare Pages:**
  - El build sigue siendo `npm run build` → `out/`.
  - `react-pdf` es JS puro; las fuentes se leen con `process.cwd()` (raíz del repo en Pages) hacia `node_modules/@fontsource/...`.
  - El tamaño ronda 10–60 kB (límite 25 MiB/archivo). Node 22 por `.nvmrc`.
  - `process.cwd()` no es `process.env`, así que **T68 no se ve afectado**.
  - `lib/pdf` usa `node:fs/path`, solo en el build.

### 2.7 De dónde sale cada texto (sin contenido del CV en el repo)

| Elemento | Fuente |
|---|---|
| Nombre, `label`, `tagline`, `summary`, ciudad/país, email, redes | `/resume` |
| Eyebrow del hero Perfil | `label · <país>` (país con `Intl.DisplayNames(lang)` desde `countryCode`; sin país, solo `label`) |
| Cajetín | Autor=`name`; Especialidad=`tagline` (o `label`); En activo desde=año más antiguo de `experience[].period.start`; Ubicación=ciudad, país; Hoja=«01 / 02 · Perfil» o «02 / 02 · Servicios». Celda sin dato → se omite |
| Impacto, trayectoria, formación, skills | `/resume` |
| Plano | `/architecture` |
| Servicios | `/services` |
| Proyectos | `/projects` |
| **h1 de ambos héroes, párrafo del hero Servicios, titulares y entradillas de sección, 4 pasos del proceso, 3 capas A–A′, textos de contacto, «Tu encargo», microcopy del formulario, etiquetas** | **Diccionarios** (`lib/i18n/dictionaries.ts`). Texto ES del artifact tal cual como **copy provisional**; el EN lo redacta el implementer; el humano lo sustituye luego sin tocar código |
| Pie | `{name} · {ciudad}` + «Hecho con Next.js y una API propia.» (sin «Astro», sin año fijo) |

Cambios deliberados respecto al artifact:
- El h2 de trayectoria pasa a «Una trayectoria en sistemas donde la fiabilidad importa.», sin «Ocho años» (D5).
- El párrafo del hero Perfil es `summary`, con fallback a `tagline` y, si no hay, sin párrafo.

### 2.8 Servicios seleccionables que viajan al formulario
- **Estado compartido:** isla cliente `components/engagement-provider.tsx` (`'use client'`) con `picked` por posición y `toggle(i)`. Envuelve `main` **solo** en la página de Servicios (children RSC). La usan:
  - `ServiceCards`: botones `aria-pressed`, marca «incluido» / «+ añadir», borde 2 px acento y sombra `8px 8px 0` si está marcada, código `S-0n` posicional.
  - `EngagementAside` («Tu encargo»): lista de títulos o el texto «aún no has marcado…», nota de respuesta y «Pedir presupuesto» → `#contact`.
  - `ContactForm`: línea `selección → A + B` o `sin bloques marcados`.
- **Estado inicial = el del diseño** (primer servicio marcado), por paridad. Es visible en el aside y en la línea del formulario y se puede desmarcar. Sin servicios no hay sección, aside ni enlace.
- **Viaje al formulario sin cambiar la API:**
  - Al enviar, `message = <prefijo>\n\n<texto>`, con prefijo del diccionario («Servicios de interés: A + B» / «Services of interest: A + B»). Sin selección no hay prefijo.
  - La validación exige que el **texto del usuario** recortado tenga 10–2000 caracteres **y** que el total recortado sea ≤2000. Si no, error `too-long` con el límite efectivo `2000 − prefijo`, que el contador también muestra.
  - El textarea no se pre-rellena.
- **Precio:** `desde {Intl.NumberFormat(lang,{style:'currency',currency,minimumFractionDigits:0})} + impuestos` (EN: `from … + taxes`). La API define `from` «sin impuestos» (R4). `null` → «a consultar» / «on request». `from:0` es un precio.

### 2.9 Accesibilidad: desviaciones permitidas del diseño
- **D1:** texto de **contenido** ≥12 px. Los nodos usan `clamp(12px,1.25vw,15px)` (el diseño, 11 px). Las anotaciones mono decorativas (cajetín `dt`, `core/`) mantienen 11 px.
- **`--line-input` de obra** = `rgba(18,56,42,.55)` para el borde de `input`/`textarea`. En plano no cambia (3.35:1).
- **Estados no solo por color:**
  - Nodo seleccionado = relleno + `aria-pressed` + panel con nombre e índice.
  - Servicio marcado = borde + sombra + texto «incluido» (7.99:1 en obra) + `aria-pressed`.
  - En obra el acento sobre `--bg` es 1.92:1, así que **nunca** es el único indicador (1.4.1).
  - El límite del nodo no seleccionado (blanco sobre crema) se asume porque su texto lo identifica (riesgo R-A11Y).
- **Foco:** `outline:2px solid currentColor` global; los nodos hex invierten colores.
- **Objetivos ≥44 px:** toggle, idioma, nav, redes, chips de adaptador; nodos `min-height 48`; CTAs 52; campos 48.

### 2.10 Cómo se mide la paridad visual
Cuatro capas. Las dos primeras corren en `npm test`; las otras dos son el protocolo del reviewer y del humano, obligatorio para cerrar.

1. **Tokens estáticos (vitest):** valores exactos de `:root` y `[data-mode]` del §0 y contrastes (`BA-T`).
2. **Contrato de métricas:** `scripts/parity/spec.mjs` es la tabla única de métricas esperadas (§2.10.1). La usan los tests de CSS y la sonda del navegador.
3. **Sonda en Chrome DevTools** (`evaluate_script`) sobre **dos páginas con el mismo copy**: el render de referencia del artifact y la web construida con la API falsa «datos del diseño». Se comparan `getComputedStyle` y `getBoundingClientRect` por clave semántica.
4. **Comparación visual lado a lado:** `take_screenshot` full-page + diff de píxeles por bandas, en **2 modos × 2 viewports** (1440×900 y 390×844) y en los estados interactivos del checklist.

**Render de referencia.** El `.dc.html` no corre sin `support.js`.
- `scripts/parity/render-reference.mjs` extrae la clase `Component` y la instancia con un `DCLogic` mínimo (`props`, `state`, `setState`).
- Llama a `renderVals()` con `{mode, sel, picks}` y expande `sc-if`, `sc-for` y `{{…}}` sobre un DOM de `jsdom`.
- Escribe `design/artifact-v2/.rendered/{perfil,servicios}[-variante].html`, sustituyendo los blobs por `/hex-grid-*.svg` y Google Fonts por `@font-face` de `app/fonts/*.woff2`. Así ambos lados usan **los mismos archivos de fuente**.
- Lo sirve `scripts/parity/serve.mjs` (`node:http`, sin dependencias) junto con `public/` y `app/fonts/`.
- **Limitación declarada:** el render no valida el patrón del fondo hex contra el blob real (inaccesible). Eso lo confirma el humano con el artifact en claude.ai (§2.10.3, punto 9).

**API falsa «datos del diseño»** (`scripts/parity/design-api.mjs`):
- Sirve `/resume`, `/architecture`, `/services` y `/projects` con el copy del artifact:
  - 6 puertos Quarkus/NestJS/Auth0/React·Vue/WebSocket/Docker, de 1 adaptador y `note:null`.
  - 4 servicios, con S-04 «a consultar».
  - PadelHub como proyecto destacado.
  - Experiencia Sale & Brick.
- Vive en `scripts/parity/`: herramienta de desarrollo, no se publica y no se mezcla con los fixtures «Ada Ejemplo» de los tests.

#### 2.10.1 Tabla de métricas (computed; `X → Y` = 1440 → 390)

| Clave | Propiedad | Valor |
|---|---|---|
| `page` | bg / color / fuente | `--bg` / `--ink` / Plex Sans 16 px, lh 1.6 |
| `header` | sticky `top:0`, `z-index:10`, bg `--bg`, borde inf. 1px `--line` | nav `max-width 1280`, padding `14px 24px` |
| `logo` | hex 38×44 bg acento, «JF» Barlow 700 18 px `#0A2016`; nombre Barlow 600 24 px, ls .02em | min-height 44 |
| `navlinks` | mono 14 px, min-height 44 | gap 24 |
| `toggle` | borde 1px `--line`; botón `min 44×44`, padding `0 18px`, mono 14/500; activo bg acento + `#0A2016`; inactivo transparente + `--ink` | |
| `hero` | `padding 72px 24px 80px`, gap 56, borde inf. 1px `--line`, `.gridbg` | col izq `flex 1 1 480`, dcha `1 1 420` |
| `eyebrow` | mono 13/500, `padding 4px 10px`, bg acento, `#0A2016` | |
| `h1` | Barlow 700 mayúsculas `clamp(56px,8.4vw,124px)` → **120.96 → 56 px**; lh .9 (**108.86 → 50.4 px**); ls −.005em | `text-wrap:balance` |
| `lead` | 18 px, `--muted`, `max-width 540` | |
| `cta` | `min-height 52`, `padding 0 28px`; primario bg acento 600; secundario borde 1px `--line` bg `--bg` 500 | gap 12 |
| `plano` | caja `max-width 540`, `aspect 1/1` → **540×540 → 342×342** | SVG viewBox 100 |
| `core` | `width 30%` (**162 → 102.6 px**), `aspect .866/1`, bg acento; tag mono 11/500; label Barlow 700 `clamp(18px,2.4vw,30px)` → **30 → 18 px** | |
| `node` | `width 20%` (**108 → 68.4 px**), `aspect .866/1`, `min-height 48`, Plex Sans 600 `clamp(12px,1.25vw,15px)` → **15 → 12 px** (D1), lh 1.1; centros según la lista de §0 | hover scale 1.07 |
| `legend` | mono 12 px muted, gap `8px 20px`, `max-width 540` | |
| `panel` | `max-width 540`, borde 1px `--line`, bg `--bg`; índice mono 12 px `padding 14px 16px` + borde dcho; nombre Barlow 600 22 px lh 1.1; texto 15 px muted | |
| `cajetin` | borde sup. 1px `--line`, bg `--bg`; celdas `padding 16`; `dt` mono 11 px mayúsculas ls .08em muted; `dd` 500; separador 1px `--line2` | grid `repeat(auto-fit,minmax(min(200px,100%),1fr))` |
| `section` | `max-width 1280`, `padding 96px 24px`, gap 56 (cabecera gap 16) | borde inf. 1px `--line`; alternas bg `--bg2` |
| `h2` | Barlow 600 mayúsculas `clamp(40px,5vw,64px)` → **64 → 40 px**, lh .95 | |
| `timeline` | `ol` borde izq. 1px `--line`, `padding-left 28`; marcador 13×13 acento (actual) / 11×11 borde 1px `--ink` y fondo `--bg`; periodo mono 14 px columna 140; h3 Barlow 600 28 px lh 1.05 | |
| `layers` | caja borde 1px `--line` padding 24; capa media borde dashed; central bg acento `#0A2016`; h3 26 px (30 px centro) | |
| `service-card` | `min-height 230`, `padding 24`, borde 2px `--line2`; marcada: borde 2px acento + `box-shadow 8px 8px 0 acento`; título Barlow 600 30 px lh 1; precio mono 14/500 | grid `repeat(auto-fit,minmax(min(250px,100%),1fr))` gap 16 |
| `aside` | bg `--ink`, color `--bg`, padding 28, gap 16; filas Barlow 600 26 px con borde inf. `currentColor` | |
| `process` | `ol` grid `repeat(auto-fit,minmax(min(220px,100%),1fr))`, borde sup. 1px `--ink`; número Barlow 700 56 px; h3 26 px | |
| `featured` | borde 1px `--line`, bg `--surface`; col izq padding 40 `flex 1 1 480`; h3 Barlow 700 `clamp(56px,7vw,104px)` → **100.8 → 56 px** lh .88; hechos grid `minmax(min(200px,100%),1fr)` borde sup. `--line2`; col dcha padding 40 `.gridbg` borde izq. `--line2` | |
| `card` | borde 1px `--line`, bg `--surface`; bloque 16/9; cuerpo padding 24; h3 Barlow 600 30 px lh 1 | grid `minmax(min(320px,100%),1fr)` gap 24 |
| `contact` | bg `--bg2`; h2 Barlow 700 `clamp(48px,6.4vw,96px)` → **92.16 → 48 px** lh .9; form padding 32, borde 1px `--line`, bg `--surface`, gap 16; campo `min-height 48`, `padding 0 14px`, borde 1px `--line` (obra `--line-input`), radius 0, bg `--field`, 15 px; botón `min-height 52` bg acento 600 | |
| `footer` | mono 13 px muted, `padding 28px 24px`, borde sup. 1px `--line` | |

#### 2.10.2 Tolerancias
- Colores, `font-family` (primera familia), `font-weight` y `text-transform`: **exactos**.
- Tamaños tipográficos: ±0.5 px.
- Cajas: ±2 px (x e y relativos al inicio de su sección), salvo contenidos afectados por una desviación D1–D9.
- Alturas de sección: ±2 % con los mismos datos de diseño.
- Diff de píxeles por banda de 400 px: ≤3 % distintos (umbral `pixelmatch` 0.1, antialiasing ignorado). Las bandas con desviación declarada las anota el reviewer.

#### 2.10.3 Checklist de comparación (Chrome DevTools)
Para **cada** combinación {perfil, servicios} × {1440×900, 390×844 con `emulate`, DPR 1}:
1. `navigate_page` a referencia y web.
2. `take_screenshot` full-page de ambas.
3. `evaluate_script` con la sonda.
4. `scripts/parity/diff.mjs` para el informe por bandas.

Después, a mano:
1. Orden de secciones y numeración idénticos; las omitidas renumeran sin huecos.
2. Cabecera sticky; las anclas no quedan tapadas (`scroll-margin-top` = alto de cabecera).
3. Hero: columnas, h1, CTA y plano alineados. A 390 el plano ocupa el ancho de contenido y sigue cuadrado.
4. Plano: seleccionar los nodos 1, 3 y 6 (clic y teclado): índice `0n / 06`, texto del panel, línea `flow` hacia el núcleo, color del nodo, **núcleo inmóvil**.
5. Servicios: marcar/desmarcar S-01…S-04: borde, sombra, «incluido», aside y línea `selección →`. Enviar con selección (la petición lleva el prefijo).
6. Proyectos: destacado y tarjetas (proporciones, divisores, insignias).
7. Contacto: formulario, errores (vacío, email mal), éxito, 429.
8. Foco visible por teclado en todos los controles. Con `prefers-reduced-motion` emulado, `flow` y las transiciones se detienen.
9. **Humano:** abrir el artifact v2 en claude.ai y la web local a la vez; comparar el **fondo hexagonal** (patrón y opacidad), la tipografía renderizada y el color percibido en ambos modos.

La paridad se declara cuando 1–8 pasan en las 4 combinaciones, las métricas del §2.10.1 están en tolerancia y el humano confirma el punto 9.

### 2.11 Un solo lugar para cada cosa
- **Tokens:** `app/globals.css`, más un test que fuerza a `lib/pdf/theme.ts` a coincidir.
- **Fetch de contenido:** `lib/api` (build). **Fetch de contacto:** solo `lib/contact/client.ts`; la URL base entra por prop desde el Server Component (`getConfig().apiUrl`).
- **Rutas/i18n:** `lib/i18n/routes.ts`. **Formato** de periodo, precio y país: `lib/i18n/format.ts`. **Redes públicas:** `lib/contact-links.ts`.
- **Componentes compartidos** en `components/ui/` con un `ui.module.css`: `SectionShell` (contenedor 1280 + padding + borde + fondo alterno), `SectionHead` (eyebrow `NN / etiqueta` + h2 + texto lateral; el índice lo calcula la vista según las secciones renderizadas), `Eyebrow`, `Cta` (primario/contorno), `HexMark`, `StatusShape`. Las secciones los componen y no repiten CSS.
- **Fondo y favicon:** `public/hex-grid-*.svg`, `app/icon.svg`.
- **Transporte HTTP del build:** `lib/api/request.ts` (de la ronda 3; T1–T22 son la red de seguridad del refactor).

### 2.12 Desviaciones respecto al diseño (cerradas)
- **D1:** nodos ≥12 px.
- **D2:** enlace de idioma ES/EN en la cabecera.
- **D3:** el plano es el mismo en ambos modos y viene de la API.
- **D4:** sin puertos, el hero queda a una columna.
- **D5:** h2 de trayectoria sin «Ocho años».
- **D6:** panel del plano con fila extra de adaptadores/estado, y `--line-input` en obra.
- **D7:** extensiones porque el humano mantiene esos datos en Perfil:
  - franja de impacto (sin eyebrow numerado, entre hero y 01);
  - stack (bloque dentro de «02 / arquitectura»);
  - formación (final del timeline, con marcador hueco).
- **D8:** proyectos sin captura ni «plano del sistema» entrada/núcleo/salida, porque la API no los trae (§2.13).
- **D9:** el logo «JF» son las iniciales de `profile.name` (derivadas, no fijas).

Cualquier otra diferencia visible es un defecto de paridad.

### 2.13 Proyectos (caso destacado + tarjetas)
- **Destacado = el primer proyecto de la API.** El orden se edita en la BD; no hay campo nuevo. El resto va en tarjetas. Con un solo proyecto, solo el destacado.
- **Destacado:**
  - Insignia mono: `period.current` → «EN PRODUCCIÓN» / «IN PRODUCTION»; si no, el periodo. A su lado, `role` si existe.
  - h3 gigante = `title`; `summary` 18 px muted.
  - Cuadrícula de hechos = `highlights[]`, con clave mono posicional `h-01…`. Se omite si está vacía.
  - Botones = `links[]`: el primero primario, el resto contorno. Con `safeHttpUrl`, `target=_blank` y `rel="noopener noreferrer"`.
  - Cliente: `client` (público) o `clientLabel` (anónimo); **nunca** el real en un anónimo.
- **Panel «Plano del sistema»** (columna derecha, `.gridbg`):
  - Cajas con `stack[]` (mono «stack» + nombre).
  - Si existe `public/projects/<id>.webp` y el proyecto es `own`+`public`, la captura (9:16, `loading="lazy"`, `alt`).
  - Sin `stack` ni captura, el panel no se renderiza y el destacado queda a una columna.
  - Los huecos `[CAPTURA…]` **nunca** se publican.
- **Tarjeta:**
  - Bloque 16/9 con `.gridbg` y, centrado en mono, el cliente (`client`/`clientLabel`) o la relación («producto propio» / «proyecto para empresa»).
  - Si hay captura (`own`+`public`), la imagen sustituye al bloque.
  - Cuerpo: h3 30 px, `summary`, `stack` mono y enlaces.
- Título de sección neutro («Proyectos» / «Projects»). La entradilla del diseño va al diccionario.
- **Hueco de backend (fuera de alcance):** un campo opcional «diagrama» por proyecto permitiría el «plano del sistema» real. Se pide en otra tarea del repo `cv`.

### 2.14 Resolución de las dudas R1–R16 (recomendación adoptada)

| Duda | Resolución |
|---|---|
| R1 despliegue / CORS | Orden: desplegar API → confirmar CORS (`https://cv.floreslab.dev` ya admitido) → desplegar web. No se añaden orígenes. `localhost` y `*.pages.dev` no podrán enviar; se prueba contra la API local. Con la API vieja el build falla (404) por diseño |
| R2 sitio del diagrama | En el hero, en ambos modos (diseño v2) |
| R3 copy | ES del artifact como copy provisional en diccionarios; el EN lo redacta el implementer y queda listado para revisión; el proceso se publica con «precio cerrado» |
| R4 precio sin impuestos | «desde X + impuestos» / «from X + taxes» |
| R5 toggle | Enlaces con `aria-current` |
| R6 360 px | Se mide a 390 px con DevTools; sin desbordamiento horizontal (`scrollWidth ≤ innerWidth`) |
| R7 200 vacío / idioma | Un `200` válido vacío manda (sección omitida, respaldo vacío guardado, aviso en el log). El idioma de las respuestas nuevas no es verificable y se cubre con `?lang` + API falsa |
| R8 anónimos | El parser descarta `client`. Lo que escriba la BD en `title/summary/highlights` es responsabilidad editorial |
| R9 destacado / imagen | Destacado = primero. Imagen por convención `public/projects/<id>.webp` solo `own`+`public` |
| R10 honeypot | `name`/`id` neutros `contact-extra`, `autocomplete=off`. Pérdida silenciosa por autorrelleno asumida |
| R11 429 | Mensaje genérico; el formulario no se bloquea |
| R12 verificación local | El implementer ejecuta contra la API local: `quarkus:dev`, `generate:api`, `POST` con `Accept */*` y el preflight |
| R13 PDF | **Sí**: §2.6 |
| R14 pie | Real, sin «Astro» ni año fijo |
| R15 slugs | 6 hijos (§4). `web-home` y `web-polish` quedan superados por este rediseño; sus tests T36–T55 se reescriben en BA. El `closer` los cierra en el orden que decida el humano |
| R16 builds | 4 construcciones reales (sana, vacía, con respaldo, sin respaldo) + 1 con PDF; el resto, tests de componente |

## 3. Qué se reutiliza de la ronda 3 y qué cambia

| Elemento | Estado |
|---|---|
| Rutas `[[...slug]]`, `routes.ts`, SEO por página, sitemap de 4 URLs | **Reutilizado** → BA |
| Fuentes `next/font/local` con woff2 copiados | **Reutilizado** con otras familias (7 archivos) → BA |
| `generate-api.mjs` + schema regenerado, `lib/problem.ts`, `request.ts`, parsers, loaders, caché `<recurso>-<lang>.json`, privacidad del cliente en el parser | **Reutilizado** → HX (arquitectura) y CO (servicios/proyectos) |
| Rejilla 3×3 + radios por puerto | **Cambia:** plano hex del diseño con nodos `button aria-pressed` + radios de adaptador en el panel → HX |
| `lib/architecture/{model,slots}` | **Reutilizado** con `SLOTS` nuevo |
| `lib/contact/*`, formulario, honeypot, regiones vivas, T68 acotada | **Reutilizado** → CO (+ prefijo de selección, estilos v2) |
| Servicios, proyectos, proceso | **Reutilizado y rediseñado** → CO |
| Sección de arquitectura propia bajo el hero | **Obsoleto** (el plano vive en el hero) |
| «Sin PDF» (R13 de la ronda 3) | **Cambia** → PD |
| Tokens de la ronda 1 y `design/artifact/Main.dc.html` | **Obsoleto** |
| `T1–T74` | Vigentes salvo: T29–T32 → BA (metadata por página); T36–T38 → BA (hero); T49–T55a, P2, P3 → BA; T56–T64 → BA/CO (build); T68 → CO |

## 4. Slugs hijos (orden y dependencias)

| # | Slug | Contenido | Depende de |
|---|---|---|---|
| 0 | `web-redesign-referencia` | Render de referencia, servidor, API falsa «datos del diseño», sonda/spec de métricas, diff por bandas, SVG de fondo | — |
| 1 | `web-redesign-base` | Rutas, SEO, tokens, fuentes, cabecera/toggle/idioma, hero (sin plano), cajetín, impacto, trayectoria+formación, capas A–A′ + stack, pie, contacto por enlaces | 0 |
| 2 | `web-redesign-hexagon` | `generate:api`, `lib/api` ampliado, `/architecture`, plano hexagonal y panel | 1 |
| 3 | `web-redesign-contenido` | Servicios (selección + aside), proceso, proyectos, `lib/contact`, formulario con selección | 2 |
| 4 | `web-redesign-pdf` | PDF ES/EN en build, botón, tests de contenido y privacidad | 1; mejor tras 3 |
| 5 | `web-redesign-paridad` | Verificación final obligatoria (2 modos × 2 viewports), informe y correcciones; compuerta humana | 0–4 |

Cada slug pasa por implementer → reviewer; el humano valida y autoriza el cierre de cada uno. Ninguno se promueve a `main` hasta cerrar el 5 y desplegar la API. Cada reviewer ejecuta además la sonda del slug sobre lo ya construido.

---

## 5. Slug 0 — `web-redesign-referencia` (prefijo `RF`)

**Archivos nuevos:**
- `scripts/parity/{render-reference.mjs, serve.mjs, design-api.mjs, spec.mjs, probe.mjs, diff.mjs}` y `scripts/parity/design-data.json`.
- `public/hex-grid-plano.svg` y `public/hex-grid-obra.svg`.
- `package.json`: scripts `parity:reference`, `parity:api`, `parity:diff`; devDeps `pixelmatch@8.0.0`, `pngjs@7.0.0`, `@types/pngjs@6.0.5`.
- `.gitignore` (`design/artifact-v2/.rendered/`, `design/artifact-v2/.shots/`).
- `docs/web-standards.md`: sección «Paridad visual».

**Criterios**
- **RF-A1** `render-reference` produce HTML estático para perfil y servicios con el estado por defecto (`sel=0`, `picks={0:true}`) y variantes con otro `sel`/`picks`. Sin `{{`, `sc-if` ni `sc-for` residuales; sin `/_blob/` ni `fonts.googleapis.com`.
- **RF-A2** El render usa `/hex-grid-*.svg` y las fuentes `app/fonts/*.woff2` (los mismos archivos que la web).
- **RF-A3** `serve.mjs` sirve render, `public/` y `app/fonts/` en el puerto indicado, sin dependencias nuevas y sin escribir fuera de `.rendered/`.
- **RF-A4** `design-api.mjs` sirve los 4 recursos con el copy del diseño, en la forma de los contratos reales, respetando `?lang`. No contiene teléfono, documento ni fecha de nacimiento.
- **RF-A5** `spec.mjs` contiene la tabla §2.10.1 como datos (claves, selectores `ref`/`web`, propiedades, valores por viewport). `probe.mjs` devuelve un JSON por clave con `getComputedStyle` + `getBoundingClientRect` y funciona sobre el render de referencia.
- **RF-A6** `diff.mjs` recibe dos PNG y devuelve el % de píxeles distintos por bandas de 400 px; sale con código ≠0 si alguna supera el umbral.
- **RF-A7** Los dos SVG de fondo miden 84×48.5, solo llevan trazos con colores de la paleta (`#F1F6EE`/`#12382A`) y no referencian recursos externos.

**Tests**
- **RF-T1** — **Dado** el `.dc.html` v2 **cuando** corre `render-reference` en perfil **entonces** el HTML tiene un `h1` «Construyo el núcleo…», 6 botones de nodo con el 1.º `aria-pressed="true"` y ninguna `{{`. *(RF-A1; `scripts/parity/render-reference.test.ts`, node)*
- **RF-T2** — **Dado** modo servicios **entonces** 4 tarjetas con la 1.ª `aria-pressed="true"`, clase `obra`, y el aside «Tu encargo» con un `li` por tarjeta marcada. *(RF-A1)*
- **RF-T3** — **Dado** `sel=3` y `picks={1:true,2:true}` **entonces** el nodo 4 está `aria-pressed`, el índice dice «04 / 06» y el aside lista exactamente 2 servicios. *(RF-A1)*
- **RF-T4** — **Dado** el render **entonces** no contiene `/_blob/`, `fonts.googleapis.com` ni `fonts.gstatic.com` y declara `@font-face` hacia `app/fonts/`. *(RF-A1, RF-A2)*
- **RF-T5** — **Dado** `serve.mjs` en un puerto libre **cuando** se piden el render, `/hex-grid-plano.svg` y un woff2 **entonces** 200 con el `Content-Type` correcto; una ruta con `..` da 403/404. *(RF-A3)*
- **RF-T6** — **Dado** `design-api` **cuando** se pide `/api/v1/architecture?lang=es` **entonces** 6 puertos de 1 adaptador; `/services` 4 elementos con el 4.º `price:null`; `/projects` ≥1 proyecto con `links` y `highlights`. *(RF-A4)*
- **RF-T7** — **Dado** los cuerpos de `design-api` **entonces** ninguno contiene teléfono, documento ni fecha de nacimiento, y `/resume` pasa `parseResume`. *(RF-A4)*
- **RF-T8** — **Dado** `spec.mjs` **entonces** toda clave tiene selector `ref` y `web`, y los clamp se expresan para 1440 y 390 con los números de §2.10.1 (120.96/56, 64/40, 92.16/48, 100.8/56, 30/18, 15/12…). *(RF-A5)*
- **RF-T9** — **Dado** el render de referencia cargado en jsdom **cuando** corre la sonda **entonces** devuelve valor no nulo para todas las claves con selector `ref`. *(RF-A5)*
- **RF-T10** — **Dado** dos PNG idénticos y otros con una banda modificada **cuando** corre `diff.mjs` **entonces** 0 % y código 0 en el primer caso; >3 % en esa banda y código ≠0 en el segundo. *(RF-A6)*
- **RF-T11** — **Dado** `public/hex-grid-*.svg` **entonces** tamaño 84×48.5, sin `<image>` ni `href` externos, y colores ∈ {`#F1F6EE`,`#12382A`}. *(RF-A7)*

---

## 6. Slug 1 — `web-redesign-base` (prefijo `BA`)

**Archivos nuevos:**
- `app/fonts.ts` y 7 woff2 en `app/fonts/`.
- `lib/i18n/routes.ts` y `lib/contact-links.ts`.
- `components/ui/{section-shell,section-head,eyebrow,cta,hex-mark}.tsx` + `ui.module.css`.
- `components/{mode-toggle,language-switch,impact-band,trajectory,architecture-layers,stack-list,cajetin}.tsx` (+CSS por módulo).
- `tests/fixtures/resume.ts` ampliado (6 grupos de skills, `education` poblada, varios puestos).
- `tests/helpers/fake-api.ts` (API falsa común; se amplía en HX y CO).

**Reescritos:**
- `app/globals.css`, `app/icon.svg` (hex con colores de token).
- `app/[[...slug]]/{layout,page}.tsx` (desde `[[...lang]]`), `app/sitemap.ts`.
- `components/{site-header,hero,home-view,site-footer,contact}.tsx` (+CSS).
- `lib/seo/metadata.ts`, `lib/i18n/{dictionaries,format}.ts`.
- `impact`, `experience` (→ `trajectory`) y `skills` se sustituyen o se reestilan.

**Docs (las edita el leader al cerrar):** `CLAUDE.md`, `AGENTS.md`, `docs/web-standards.md`, `CHECKPOINTS.md` (C5: tokens = `globals.css` + artifact v2, no `preview.html`).

**Alcance:** solo `/resume`. Sin plano (hasta HX), sin servicios, proyectos ni formulario. El contacto son enlaces `mailto` + redes; «Pedir presupuesto» va a `#contact`.
- **Perfil:** hero · cajetín · impacto · 01 trayectoria · 02 arquitectura (capas + stack) · contacto.
- **Servicios:** hero · cajetín · contacto.
- La numeración `NN` la calcula la vista **por secciones renderizadas**. En este paso contacto es `03`; pasa a `04` cuando llegan los proyectos.

**Criterios**
- **BA-A1** 4 páginas estáticas; cualquier otra ruta 404; sin `/fr/`.
- **BA-A2** Cada página tiene `lang` correcto, un `h1` distinto por modo e idioma, landmarks, `title`/`description`/OG propios, canonical propio y hreflang es/en/x-default recíprocos. Sitemap de 4 URLs con alternates. `robots` sin cambios.
- **BA-A3** `data-mode` en `<body>`. Tokens de plano y obra **idénticos** al §0. `--accent` por modo. Sin hex fuera de los bloques de tokens (salvo SVG). Pares de color ≥4.5:1. `--line-input` obra = `rgba(18,56,42,.55)`.
- **BA-A4** 7 woff2 vía `next/font/local` servidos desde `/_next/static/media`, copias idénticas a `@fontsource/*@5.3.0`, sin Google, variables `--font-head|text|mono`.
- **BA-A5** `.gridbg` con `background-size:84px 48.5px` y el SVG del modo.
- **BA-A6** Cabecera sticky (`top:0`, `z-index:10`, `--bg`, borde `--line`):
  - Logo `JF` en hex 38×44 acento + nombre.
  - Enlaces proyectos/contacto solo si la sección existe.
  - Selector de idioma (misma página en el otro idioma, con `hreflang`).
  - Toggle de enlaces con `aria-current="page"`.
  - Todo ≥44×44 y operable por teclado.
- **BA-A7** Hero:
  - Eyebrow, h1 (`clamp(56px,8.4vw,124px)`, lh .9, mayúsculas Barlow 700), lead y 2 CTAs.
  - Primario a `#contact` o «Ver trayectoria» según modo; secundario «Ver proyectos» solo si hay proyectos.
  - `id="inicio"`, `.gridbg`.
  - Sin plano, una columna (D4).
- **BA-A8** Cajetín: celdas según §2.7. Celda sin dato → se omite. `dl` semántico.
- **BA-A9** Perfil:
  - Franja de impacto (si hay).
  - 01 trayectoria: marcador relleno el actual y hueco los demás; **formación al final** con marcador hueco.
  - 02 arquitectura: 3 capas A–A′ del diccionario + stack de `skills`. El botón de PDF llega en PD.
  - Sección vacía → ni render ni enlace.
  - Servicios no muestra nada de Perfil.
- **BA-A10** `SectionHead` y `SectionShell` únicos: ninguna sección redefine su padding/borde.
- **BA-A11** Contacto por enlaces: `mailto` + redes filtradas por `lib/contact-links.ts` (`LinkedIn`/`GitHub`, `safeHttpUrl`, `rel="noopener noreferrer"`).
- **BA-A12** Pie real: `{name} · {ciudad}` y «Hecho con Next.js y una API propia.». Sin «Astro» ni año fijo. Mono 13 px.
- **BA-A13** `prefers-reduced-motion: reduce` anula toda `transition`/`animation` de todos los módulos. `:focus-visible` global con `outline`.
- **BA-A14** ≤640 px una columna. Sin desbordamiento horizontal a 390 px. Los clamp dan los valores del §2.10.1.
- **BA-A15** Ningún archivo de `out/` contiene teléfono, documento ni fecha de nacimiento. Diccionarios ES/EN con las mismas claves y sin marcadores ni cadenas vacías.
- **BA-A16** API caída con respaldo → las 4 páginas con aviso. Sin respaldo → el build falla («Refusing to publish a site without data»).
- **BA-A17** La sonda de paridad pasa en Perfil y Servicios, a 1440 y 390, para las claves ya construidas (page, header, logo, toggle, hero, eyebrow, h1, lead, cta, cajetin, section, h2, timeline, layers, contact, footer).

**Tests**

*Rutas* (`lib/i18n/routes.test.ts`, unit)
- **BA-T1** — **Dado** `[]`, `['servicios']`, `['en']`, `['en','services']` **cuando** se resuelven **entonces** (es,perfil), (es,servicios), (en,perfil), (en,servicios). *(BA-A1)*
- **BA-T2** — **Dado** `['services']`, `['en','servicios']`, `['fr']`, `['en','x']`, `['servicios','x']` **entonces** «no existe» sin lanzar. *(BA-A1)*
- **BA-T3** — **Dado** cada (lang,página) **entonces** path `/`, `/servicios/`, `/en/`, `/en/services/`, y `alternatesFor` da es, en y x-default (ruta ES) de la misma página. *(BA-A2)*

*SEO* (`lib/seo/metadata.test.ts`, `app/sitemap.test.ts`, `lib/seo/json-ld.test.ts`)
- **BA-T4** — **Dado** Servicios ES **entonces** title/description distintos de Perfil, canonical `SITE/servicios/` y alternate `SITE/en/services/`. *(BA-A2)*
- **BA-T5** — **Dado** Perfil EN **entonces** canonical `SITE/en/`, `og:locale en_US` y alternate `es_ES`. *(BA-A2)*
- **BA-T6** — **Dado** el sitemap **entonces** 4 URLs con alternates a su homóloga. *(BA-A2)*
- **BA-T7** — **Dado** `buildPersonJsonLd` **entonces** siguen pasando T33–T35 (Person, `inLanguage`, sin campos privados). *(BA-A2, BA-A15)*

*Tokens, fuentes, CSS* (`app/globals.test.ts`, `app/fonts.test.ts`, unit)
- **BA-T8** — **Dado** `globals.css` **entonces** los 9 tokens del plano (`:root`) y los 9 del obra (`[data-mode="services"]`) valen exactamente los del §0, más `--accent-ink #0A2016`, `--accent-plano #C6F24E` y `--accent-obra #2FC98A`. *(BA-A3)*
- **BA-T9** — **Dado** `[data-mode="services"]` **entonces** redefine `--accent` con `var(--accent-obra)` y `--line-input` con `rgba(18,56,42,.55)`, sin hex. *(BA-A3)*
- **BA-T10** — **Dado** todos los `.module.css` y `globals.css` **entonces** no hay hex ni `rgb(` fuera de los bloques de tokens. *(BA-A3)*
- **BA-T11** — **Dado** los pares del §0 (ink/bg, muted/bg·bg2·surface·node, ink/surface·node, `#0A2016`/acento de cada modo) **entonces** todos ≥4.5:1, calculados desde los tokens. *(BA-A3)*
- **BA-T12** — **Dado** `app/fonts.ts` **entonces** usa `next/font/local` con exactamente 7 archivos (familias y pesos del §2.3), `display:'swap'`, variables `--font-head|text|mono`, sin `googleapis`/`gstatic`. *(BA-A4)*
- **BA-T13** — **Dado** cada woff2 de `app/fonts/` **entonces** es idéntico byte a byte al de `node_modules/@fontsource/<familia>/files/`. *(BA-A4)*
- **BA-T14** — **Dado** `globals.css` **entonces** `--font-head|text|mono` empiezan por las variables de `next/font` con respaldo `'Arial Narrow'` / `system-ui` / `ui-monospace`. *(BA-A4)*
- **BA-T15** — **Dado** `.gridbg` **entonces** `background-size:84px 48.5px` y el SVG de obra bajo `[data-mode="services"]`. *(BA-A5)*
- **BA-T16** — **Dado** los módulos CSS **entonces** toda `transition`/`animation`/`@keyframes` queda anulada en `prefers-reduced-motion: reduce` y existe `:focus-visible` con `outline`. *(BA-A13)*
- **BA-T17** — **Dado** los módulos de layout **entonces** hay breakpoint ≤640 px a una columna y ningún ancho fijo >320 px sin `max-width:100%`. *(BA-A14)*
- **BA-T18** — **Dado** toggle, selector de idioma y enlaces de cabecera **entonces** declaran `min-width`/`min-height` ≥44 px. *(BA-A6)*
- **BA-T19** — **Dado** `app/icon.svg` **entonces** es un hexágono con solo colores de token (`#C6F24E`, `#0A2016`). *(BA-A3)*

*Componentes* (`components/*.test.tsx`)
- **BA-T20** — **Dado** el toggle en Perfil ES **entonces** «Perfil» con `aria-current="page"` apunta a `/` y «Servicios» a `/servicios/`; en EN, `/en/` y `/en/services/`. *(BA-A6)*
- **BA-T21** — **Dado** cualquier página **entonces** el selector de idioma enlaza a la misma página en el otro idioma con `hreflang`, y el logo vuelve a `#inicio`/Perfil del idioma. *(BA-A6)*
- **BA-T22** — **Dado** una vista con cada sección presente o ausente **entonces** la cabecera solo enlaza a anclas de secciones renderizadas. *(BA-A6, BA-A9)*
- **BA-T23** — **Dado** `name` «Ada Ejemplo» **entonces** el logo muestra «AE»; con 1 palabra, 1 letra; sin nombre, «—». *(BA-A6; D9)*
- **BA-T24** — **Dado** el hero de Perfil **entonces** un solo `h1` del diccionario, eyebrow `label · país`, lead = `summary` (o `tagline`, o sin párrafo vacío), CTA principal a `#contact` y «Ver trayectoria» (`#experience`) solo si hay experiencia. *(BA-A7; reescribe T36–T38)*
- **BA-T25** — **Dado** el hero de Servicios **entonces** `h1` distinto, eyebrow y lead del diccionario, CTA «Pedir presupuesto» a `#contact`, sin datos inventados. *(BA-A7)*
- **BA-T26** — **Dado** `countryCode` desconocido o ausente **entonces** el eyebrow y la celda Ubicación omiten el país sin lanzar. *(BA-A7, BA-A8)*
- **BA-T27** — **Dado** perfil completo **entonces** el cajetín tiene 5 celdas: Autor=Ada Ejemplo, Especialidad=`tagline`, En activo desde=`2010`, Ubicación, Hoja «01 / 02 · Perfil». *(BA-A8)*
- **BA-T28** — **Dado** sin `tagline`, sin experiencia o sin ciudad **entonces** se omiten solo esas celdas, y Especialidad cae a `label`. *(BA-A8)*
- **BA-T29** — **Dado** Servicios **entonces** Hoja = «02 / 02 · Servicios» (EN «Sheet 02 / 02 · Services»). *(BA-A8)*
- **BA-T30** — **Dado** 3 puestos y formación **entonces** el timeline lista 3 `li` con periodo `formatPeriod`, `h3` «puesto · empresa» y `summary`; el 1.º (actual) con marcador relleno, los demás huecos; la formación al final con marcador hueco. *(BA-A9)*
- **BA-T31** — **Dado** `experience: []` y `education` vacía **entonces** no hay sección, enlace ni ancla; con solo formación, el timeline muestra solo formación. *(BA-A9)*
- **BA-T32** — **Dado** `education` con titulación, certificado y curso **entonces** se listan; con `education.education: []` pero certificados, solo estos. *(BA-A9; reescribe T88)*
- **BA-T33** — **Dado** `impact` de 4 elementos **entonces** una franja de 4 celdas (`value` en Barlow, `text`); con `[]` no se renderiza. *(BA-A9; T39–T40)*
- **BA-T34** — **Dado** `skills` con grupos y uno vacío **entonces** el stack lista solo los grupos con palabras clave; sin ninguno, el bloque stack no se renderiza y las 3 capas siguen. *(BA-A9; T44–T45)*
- **BA-T35** — **Dado** las 3 capas del diccionario **entonces** orden adaptadores > puertos > dominio, la central con fondo acento y `#0A2016`. *(BA-A9)*
- **BA-T36** — **Dado** `SectionHead` con índice 2 y etiqueta **entonces** el eyebrow dice «02 / etiqueta» y el h2 se asocia a su sección por `aria-labelledby`. *(BA-A10)*
- **BA-T37** — **Dado** una vista con una sección intermedia ausente **entonces** la numeración posterior se recalcula sin huecos. *(BA-A10)*
- **BA-T38** — **Dado** los CSS **entonces** `SectionShell` es el único que declara `max-width:1280px` y `padding:96px 24px`. *(BA-A10)*
- **BA-T39** — **Dado** `contact.email` y 2 redes (`LinkedIn`, `GitHub`) **entonces** un `mailto:` y 2 enlaces externos con `rel="noopener noreferrer"`; una red `Twitter` o una URL `javascript:` no genera enlace. *(BA-A11; T46–T48)*
- **BA-T40** — **Dado** `publicProfiles` **entonces** filtra por red (sin distinguir mayúsculas) y por `safeHttpUrl`, conservando el orden. *(BA-A11)*
- **BA-T41** — **Dado** el pie con `city` y nombre **entonces** «Ada Ejemplo · Ciudad Ejemplo» y «Next.js»; sin ciudad, solo el nombre; sin «Astro» ni año. *(BA-A12)*

*Diccionarios* (`lib/i18n/i18n.test.ts`)
- **BA-T42** — **Dado** ES y EN **entonces** mismas claves, ninguna cadena vacía ni marcador (`[`…`]`, «TU PRECIO», «AÑOS», «OTRO PROYECTO», «Astro», «CAPTURA»). *(BA-A15; T23–T28)*
- **BA-T43** — **Dado** `formatCountry('ES','es')` y `('ES','en')` **entonces** «España» y «Spain»; con `'XX'` o vacío, `null`. *(BA-A7)*

*Build* (`tests/build/build.test.ts`, API falsa «Ada Ejemplo», solo `/resume`)
- **BA-T44** — **Dado** una API sana **cuando** se construye **entonces** `out/` tiene `index.html`, `servicios/index.html`, `en/index.html`, `en/services/index.html`, `sitemap.xml`, `robots.txt` y `404.html`, sin `fr/`, `services/` ni `en/servicios/`. *(BA-A1)*
- **BA-T45** — **Dado** las 4 páginas **entonces** `lang` correcto, un `h1`, landmarks, h1 de Perfil ≠ Servicios y `<body data-mode>` correcto. *(BA-A2, BA-A3)*
- **BA-T46** — **Dado** el `<head>` **entonces** title, description, canonical propio, 3 hreflang recíprocos y `og:*` por página. *(BA-A2)*
- **BA-T47** — **Dado** las 4 páginas **entonces** muestran datos de Ada en el idioma de su ruta, sin mezclar. *(BA-A9)*
- **BA-T48** — **Dado** una API falsa que envía teléfono, documento y fecha de nacimiento centinela **entonces** ninguno aparece en `out/`. *(BA-A15)*
- **BA-T49** — **Dado** `out/` **entonces** enlaces externos con `rel="noopener noreferrer"`, cada ancla `#x` apunta a un id existente, fuentes en `/_next/static/media`, sin Google Fonts, favicon enlazado y existente. *(BA-A4, BA-A6, BA-A15)*
- **BA-T50** — **Dado** API caída con respaldo de `/resume` **entonces** las 4 páginas y el aviso; sin respaldo, el build falla. *(BA-A16; reescribe T63)*
- **BA-T51** — **Dado** `out/` **entonces** contiene `hex-grid-plano.svg` y `hex-grid-obra.svg`. *(BA-A5)*

*Paridad (protocolo, no vitest)*
- **BA-T52** — **Dado** la sonda de RF contra la web construida con `design-api` **cuando** se ejecuta en Perfil y Servicios a 1440 y 390 **entonces** todas las claves de BA-A17 están dentro de tolerancia (§2.10.2) y el reviewer adjunta el JSON y las capturas a `progress/web-redesign-base/review.md`. *(BA-A14, BA-A17)*

---

## 7. Slug 2 — `web-redesign-hexagon` (prefijo `HX`)

**Archivos nuevos:**
- `scripts/generate-api.mjs` (y refuerzo de `scripts/strip-examples.mjs`).
- `lib/problem.ts`.
- `lib/api/{request,content,validate-content}.ts`.
- `lib/architecture/{model,slots}.ts`.
- `components/hex-plane-section.tsx` (servidor: construye el modelo; devuelve `null` si no hay puertos).
- `components/hex-plane.tsx` (isla `'use client'`) + `hex-plane.module.css`.
- `components/ui/status-shape.tsx`.
- `tests/fixtures/{content.ts, openapi-mini.json, openapi-mini-incomplete.json}`.
- `tests/helpers/fake-api.ts` ampliado.

**Tocados:**
- `lib/api/{client,cache,types,index}.ts` y `lib/api/schema.d.ts` (regenerado).
- `package.json` (`generate:api`).
- `components/{hero,home-view}.tsx`, `app/[[...slug]]/page.tsx` (carga `getArchitecture`).
- Diccionario.

**Generación del esquema.**
- Wrapper `scripts/generate-api.mjs`. Fuente: argumento CLI > `OPENAPI_SOURCE` > `https://cv-api.floreslab.dev/openapi.json`. Puede ser URL o archivo.
- Hoy la API pública no tiene los endpoints nuevos, así que el implementer arranca la API local y genera desde ella:
  - `cd ../cv && mvn -pl infrastructure -am quarkus:dev` (necesita Docker).
  - `npm run generate:api -- http://localhost:8080/openapi.json`.
- Flujo:
  1. Genera a un archivo temporal.
  2. Aplica `strip-examples` reforzado (elimina también las líneas de continuación de un `@example` multilínea).
  3. Comprueba que existen los 5 paths (`/api/v1/resume`, `/contact/messages`, `/services`, `/projects`, `/architecture`) y que no queda `@example`.
  4. Solo entonces sustituye `lib/api/schema.d.ts`. Si falla, sale con código ≠0 y no toca el archivo.
  5. `--dry-run` imprime la fuente resuelta.
- Motivo: los `example =` de `ApiModels` incluyen datos reales.

**Loaders (regla común).**
- Un `200` válido (incluida la lista vacía) manda.
- API caída, 4xx/5xx, JSON o forma inválidos → respaldo + `console.warn`. Sin respaldo → el build falla nombrando recurso, idioma y archivo.
- Un `404` cuenta como fallo y no se reintenta.
- Un vacío válido se guarda en la caché y avisa «section omitted».
- Caché `architecture-<lang>.json`. `resume-<lang>.json` no cambia.
- Memo por (recurso, idioma).
- `request.ts` extrae el transporte de `client.ts` (timeout, reintento solo en transporte y 5xx, lectura de `code`).
- `validate-content.ts`: enums estrictos (`status` desconocido → inválido), campos opcionales normalizados.

**Criterios**
- **HX-A1** `generate-api` cumple §2 (fuente CLI>env>URL, wrapper con comprobaciones, falla sin tocar el archivo si falta un path o queda un `@example`); `schema.d.ts` regenerado contiene los 5 paths y 0 `@example`.
- **HX-A2** El transporte genérico reintenta solo transporte y 5xx, añade `?lang`, y T1–T22 siguen verdes.
- **HX-A3** `getArchitecture`: API válida → datos + respaldo; vacío válido → vacío + respaldo vacío + aviso; fallo con respaldo → respaldo + aviso; sin respaldo → build falla; respaldo corrupto se ignora; una petición por idioma.
- **HX-A4** `buildHexModel` descarta puertos sin adaptadores y adaptadores sin nombre, conserva el orden, recorta texto, devuelve `null` sin puertos, y elige `radial` (≤6) o `list` (>6). `SLOTS` cumple §2.5.
- **HX-A5** Plano (geometría): caja cuadrada `max-width 540`, núcleo 30 %, nodos 20 % en las posiciones del diseño, línea `flow` del nodo seleccionado al núcleo, leyenda y panel con las métricas de §2.10.1.
- **HX-A6** Interacción: el primer puerto empieza seleccionado; seleccionar otro cambia nodo, línea, índice y panel; el núcleo no cambia nunca; con ≥2 adaptadores, un radio cambia solo el adaptador de ese puerto.
- **HX-A7** `status` con etiqueta del diccionario + forma SVG distinta; `note` solo si existe.
- **HX-A8** A11y: nodos `button aria-pressed` en `role="group"` con `aria-label`; panel con `aria-live="polite"`; ≥44/48 px; foco visible por inversión; sin `onKeyDown` ni `tabindex` positivo; `<noscript>` con todos los adaptadores; ids únicos aunque la API repita ids.
- **HX-A9** Sin puertos (o sin adaptadores) → no hay plano ni leyenda ni panel y el hero queda a una columna.
- **HX-A10** `prefers-reduced-motion` anula `flow`, escala de hover y transiciones del módulo; a ≤640 px los nodos mantienen proporción; nombres largos se muestran completos (`overflow-wrap:anywhere`).
- **HX-A11** Build: las 4 páginas contienen el plano con los puertos de Ada en su idioma y el `<noscript>`; `ports:[]` pasa y no deja rastro; el respaldo de `/architecture` es obligatorio si la API cae.
- **HX-A12** La sonda de paridad pasa para `plano`, `core`, `node`, `legend`, `panel`, y `hero` a dos columnas, en 2 modos × 2 viewports, con `design-api` (6 puertos de 1 adaptador).

**Tests**

*Generación del esquema* (`lib/api/schema.test.ts`, `scripts/generate-api.test.ts`)
- **HX-T1** — **Dado** `schema.d.ts` regenerado **entonces** contiene los 5 paths y los esquemas `Architecture`, `ArchitecturePort`, `PortAdapter`, `Service`, `Project`. *(HX-A1)*
- **HX-T2** — **Dado** `openapi-mini.json` con `@example` de una y varias líneas **cuando** corre `generate-api` **entonces** el resultado no tiene `@example` ni restos de continuación (T71 sigue verde). *(HX-A1)*
- **HX-T3** — **Dado** `openapi-mini-incomplete.json` (sin `/architecture`) **entonces** sale con código ≠0 nombrando el path y deja `schema.d.ts` intacto. *(HX-A1)*
- **HX-T4** — **Dado** `--dry-run` con argumento CLI, con `OPENAPI_SOURCE` y sin ninguno **entonces** resuelve CLI > env > URL pública. *(HX-A1)*
- **HX-T5** — **Dado** `package.json` **entonces** `generate:api` invoca `scripts/generate-api.mjs`, que usa `strip-examples` (T72 ajustado). *(HX-A1)*

*Transporte, parsers y loaders* (`lib/problem.test.ts`, `lib/api/validate-content.test.ts`, `lib/api/content.test.ts`, `lib/api/request.test.ts`)
- **HX-T6** — **Dado** objetos con y sin `title`, `detail`, `status`, `code` **entonces** solo los completos dan problema; el resto `null`. *(HX-A2)*
- **HX-T7** — **Dado** el transporte genérico **entonces** añade `?lang=<es|en>` y reintenta solo errores de transporte y 5xx (nunca 4xx). *(HX-A2)*
- **HX-T8** — **Dado** la regresión de `fetchResume` **entonces** pasan T1–T22 sin cambios. *(HX-A2)*
- **HX-T9** — **Dado** una arquitectura válida **entonces** parsea núcleo, puertos y adaptadores en orden. *(HX-A3)*
- **HX-T10** — **Dado** `status:'x'`, núcleo sin `name` o puerto sin `adapters` **entonces** respuesta inválida. *(HX-A3)*
- **HX-T11** — **Dado** `ports: []` **entonces** respuesta válida vacía. *(HX-A3)*
- **HX-T12** — **Dado** `null`, un array donde va objeto o un objeto donde va array **entonces** respuesta inválida. *(HX-A3)*
- **HX-T13** — **Dado** API sana **cuando** `getArchitecture('es')` **entonces** `source:'api'` y `architecture-es.json` escrito. *(HX-A3)*
- **HX-T14** — **Dado** API caída y respaldo válido **entonces** datos con `source:'cache'` y un `console.warn`. *(HX-A3)*
- **HX-T15** — **Dado** API caída sin respaldo **entonces** lanza un error que nombra recurso, idioma y archivo. *(HX-A3)*
- **HX-T16** — **Dado** forma inválida o `404` con respaldo **entonces** usa el respaldo; sin respaldo falla; el 404 no se reintenta. *(HX-A3)*
- **HX-T17** — **Dado** `ports: []` en `200` **entonces** vacío con `source:'api'`, respaldo vacío escrito y aviso «section omitted». *(HX-A3)*
- **HX-T18** — **Dado** un respaldo corrupto o de forma inválida **entonces** se ignora. *(HX-A3)*
- **HX-T19** — **Dado** dos llamadas a `getArchitecture('es')` **entonces** una sola petición. *(HX-A3)*
- **HX-T20** — **Dado** los respaldos de recurso e idioma **entonces** nombres distintos, y `resume-<lang>.json` conserva nombre y formato. *(HX-A3)*

*Modelo* (`lib/architecture/model.test.ts`)
- **HX-T21** — **Dado** puertos con `adapters: []` y adaptadores sin nombre **entonces** se descartan, se recorta el texto y se conserva el orden; sin puertos → `null`. *(HX-A4)*
- **HX-T22** — **Dado** 1 a 6 puertos **entonces** `layout:'radial'`; con 7, `layout:'list'` con los 7 presentes. *(HX-A4)*
- **HX-T23** — **Dado** `SLOTS` **entonces** para N=1..6 son N posiciones distintas y válidas (0–5), idénticas a la tabla de §2.5. *(HX-A4)*

*Componente* (`components/hex-plane.test.tsx`, `hex-plane-section.test.tsx`, `hex-plane.module.test.ts`)
- **HX-T24** — **Dado** 3 puertos **entonces** hay un núcleo con `core/` y nombre, 3 `button` con `aria-pressed` en `role="group"` con `aria-label`, el 1.º `true`, y el panel «01 / 03». *(HX-A5, HX-A6, HX-A8)*
- **HX-T25** — **Dado** `slots` de 3 puertos **entonces** los nodos se sitúan en las posiciones `[0,2,4]` (`left/top` %) con `translate(-50%,-50%)`. *(HX-A5)*
- **HX-T26** — **Dado** la selección del puerto 2 (`click`) **entonces** ese nodo `aria-pressed=true` y el resto `false`, el panel muestra su nombre/descripción y el índice «02 / 03», y la línea `flow` apunta a su posición. *(HX-A6)*
- **HX-T27** — **Dado** cualquier selección **entonces** el nodo del núcleo es el mismo elemento con el mismo texto y no está dentro de ningún `fieldset` ni botón. *(HX-A6)*
- **HX-T28** — **Dado** un puerto con ≥2 adaptadores **cuando** se selecciona el segundo radio **entonces** solo cambia el detalle de ese puerto; los demás siguen en su primero. *(HX-A6)*
- **HX-T29** — **Dado** un puerto con 1 adaptador **entonces** muestra su nombre y estado sin grupo de radios. *(HX-A6)*
- **HX-T30** — **Dado** adaptadores `in-this-api`, `production` y `experiment` **entonces** cada uno muestra su etiqueta del diccionario y una forma SVG `aria-hidden` distinta. *(HX-A7)*
- **HX-T31** — **Dado** un adaptador con y sin `note` **entonces** la nota aparece solo si existe. *(HX-A7)*
- **HX-T32** — **Dado** el panel **entonces** es `aria-live="polite"` y su contenido cambia al seleccionar. *(HX-A6, HX-A8)*
- **HX-T33** — **Dado** el render en servidor **entonces** cada puerto lleva un `<noscript>` con todos sus adaptadores, estado en texto y nota. *(HX-A8)*
- **HX-T34** — **Dado** el componente **entonces** no define `onKeyDown` ni `tabindex` positivo. *(HX-A8)*
- **HX-T35** — **Dado** dos puertos con el mismo `id` y adaptadores con el mismo `id` **entonces** los ids del DOM son únicos y `for`/`aria-describedby` apuntan al elemento correcto. *(HX-A8)*
- **HX-T36** — **Dado** `ports: []` o puertos sin adaptadores **entonces** la sección devuelve `null` (ni plano, ni leyenda, ni panel) y el hero recibe la variante de una columna. *(HX-A9)*
- **HX-T37** — **Dado** `layout:'list'` y `'radial'` **entonces** `data-layout` correspondiente y el DOM conserva el orden de la API. *(HX-A4, HX-A5)*
- **HX-T38** — **Dado** `hex-plane.module.css` **entonces** `min-height` de nodos ≥48 px, chips ≥44 px, texto de nodo `clamp(12px,1.25vw,15px)`, `aspect-ratio` .866/1, `focus-visible` con inversión (sin `outline` sobre `clip-path`), `@media (prefers-reduced-motion: reduce)` anulando `flow`/hover/transiciones, `overflow-wrap:anywhere`, `@media (scripting: none)` ocultando el selector de radios. *(HX-A5, HX-A8, HX-A10)*
- **HX-T39** — **Dado** un nombre de adaptador muy largo **entonces** se muestra completo, sin truncar en JS. *(HX-A10)*
- **HX-T40** — **Dado** EN **entonces** `core/`, etiquetas de estado, leyenda y textos fijos salen del diccionario EN, sin mezclar español. *(HX-A7)*

*Build* (`tests/build/build.test.ts`)
- **HX-T41** — **Dado** API sana **cuando** se construye **entonces** las 4 páginas contienen el plano con los puertos de Ada en su idioma y el `<noscript>`. *(HX-A11)*
- **HX-T42** — **Dado** API con `ports: []` **entonces** el build pasa y ninguna página contiene el plano ni su leyenda. *(HX-A9, HX-A11)*
- **HX-T43** — **Dado** API caída con respaldo de `/architecture` **entonces** las páginas se generan con aviso; sin él, el build falla. *(HX-A3, HX-A11)*

*Paridad (protocolo)*
- **HX-T44** — **Dado** la sonda contra la web con `design-api` **cuando** se ejecuta en Perfil y Servicios a 1440 y 390, y se seleccionan nodos 1, 3 y 6 **entonces** `plano`, `core`, `node`, `legend`, `panel` y `hero` están dentro de tolerancia, la línea `flow` termina en el centro del núcleo y el reviewer adjunta capturas. *(HX-A12)*

---

## 8. Slug 3 — `web-redesign-contenido` (prefijo `CO`)

**Archivos nuevos:**
- `lib/contact/{types,validate,client,index}.ts`.
- `components/{service-cards,engagement-aside,engagement-provider,process,projects,project-featured,project-card,contact-form,contact-section}.tsx` (+CSS).
- `lib/projects/images.ts`.
- `tests/fixtures/content.ts` ampliado: servicios, proyectos, `LEAKED_CLIENT='CLIENTE-SENTINELA-ANONIMO'`, `withLeakedClient`.
- `fake-api.ts` ampliado.

**Tocados:**
- `lib/api/{validate-content,content,cache,types,index}.ts`: parsers y loaders de `services` y `projects`.
- `components/{home-view,hero,site-header,contact}.tsx`, `page.tsx`, diccionario.
- `tests/source.test.ts` (T68 acotada).
- Docs (leader): `CLAUDE.md`, `AGENTS.md`, `CHECKPOINTS.md` (C4), `docs/web-standards.md`.

**Reglas de `lib/api` para estos dos recursos** (como arquitectura en HX):
- `anonymous` → el parser **descarta `client`** aunque la API lo envíe (no llega a la caché ni al HTML).
- `price.from` es un número finito ≥0 y `currency` cumple `/^[A-Z]{3}$/`.
- `relation` y `disclosure` son enums estrictos.
- Opcionales ausentes → `null` o `[]`.
- Se conserva el orden de la API.
- Total por build: 8 peticiones GET (4 recursos × 2 idiomas), contando las del PDF compartidas por memo.

**Contacto (cliente).**
- `lib/contact/client.ts` es el **único archivo fuera de `lib/api` con `fetch(`**. No lee entorno ni importa `node:*`.
- La URL llega por prop desde el Server Component.
- Petición: `POST ${apiUrl}/api/v1/contact/messages?lang=<lang>`.
  - Única cabecera propia `Content-Type: application/json` (sin `Accept`).
  - `mode:'cors'`, `credentials:'omit'`, `cache:'no-store'`, timeout 15 s con `AbortController`.
  - Cuerpo con exactamente `name`, `email`, `message` (recortados) y `website`.
- Nunca lanza. Devuelve una unión discriminada:

  | Resultado | Cuándo |
  |---|---|
  | `sent` | exactamente `201` |
  | `invalid{field?,title,detail,code}` | `400 CONTACT_INVALID`; `field` se extrae del `detail` con `/[«"]([a-z]+)[»"]/` solo si es `name`/`email`/`message` |
  | `rate-limited` | `429 CONTACT_RATE_LIMITED` |
  | `problem{…}` | otro problem+json válido |
  | `http-error{status}` | respuesta no OK sin problem válido, o un 2xx ≠201 |
  | `network` | `fetch` lanzó `TypeError` (red o CORS) |
  | `timeout` / `aborted` | plazo agotado / abortado por el llamante |

- Validación en cliente (espejo del servidor):
  - `NAME_MAX=100`, `EMAIL_MAX=254`, `MESSAGE_MIN=10`, `MESSAGE_MAX=2000`; se recorta antes de contar y se cuenta con `.length`.
  - Regex de email con espacio ASCII `^[^@ \t\n\x0B\f\r]+@[^@ \t\n\x0B\f\r]+\.[^@ \t\n\x0B\f\r]+$`.
  - Devuelve **todos** los errores a la vez, con código por campo.
- Formulario (`'use client'`):
  - `<form noValidate method="post">` con etiquetas visibles y `autocomplete="name"`/`"email"`.
  - Contador `n/máx` asociado por `aria-describedby`, fuera de región viva.
  - Errores por campo con `aria-invalid` + `aria-describedby`, y foco al primer campo inválido.
  - Regiones persistentes `role="status"` y `role="alert"` desde el HTML estático.
  - Botón `aria-disabled` con «Enviando…» y envío único.
  - Éxito: campos limpios, mensaje en `status` y foco allí.
  - Error: se conservan los valores; `field` conocido → ese campo; si no, el foco va a `alert`. Todos los errores incluyen el `mailto:`.
  - Honeypot en contenedor fuera de pantalla (`position:absolute;left:-10000px`), `aria-hidden`, `tabindex=-1`, `autocomplete=off`, `name`/`id` neutros `contact-extra`, enviado como `website`.
  - Sin JS: `fieldset disabled` + `<noscript>` con aviso y email.
  - Sin `localStorage`/`sessionStorage`/IndexedDB/cookies ni `console.*`.

**Criterios**
- **CO-A1** Parsers y loaders de servicios y proyectos cumplen la regla común de HX-A3 (válido, vacío válido, caída con/sin respaldo, corrupto, una petición por recurso e idioma) y los enums estrictos y límites de precio.
- **CO-A2** Privacidad de proyectos: el `client` de un `anonymous` no sale del parser (ni a la caché ni al HTML) y tampoco lo pinta el componente aunque llegue.
- **CO-A3** Servicios: tarjetas seleccionables (`button aria-pressed`, código `S-0n`, marca «incluido»/«+ añadir», precio formateado, «a consultar» si `null`, `+ impuestos`); estado inicial = primero marcado; aside «Tu encargo» refleja la selección; lista vacía → sin sección ni enlace ni aside.
- **CO-A4** Proceso: `ol` de 4 pasos del diccionario (número Barlow 56 px, título, texto); sin copy aprobado no se publica.
- **CO-A5** Proyectos: destacado = el primero; tarjetas para el resto; insignia, rol, hechos, botones, panel de stack y captura opcional según §2.13; anónimo solo con `clientLabel`; sin placeholders; lista vacía → sin sección ni enlace.
- **CO-A6** Selección → formulario: la línea `selección →` refleja los servicios marcados; el envío compone `message = prefijo + \n\n + texto`; el texto del usuario ≥10 y el total ≤2000; contador con el máximo efectivo; solo existe en Servicios.
- **CO-A7** Cliente de contacto cumple el contrato de arriba, nunca lanza y es el único `fetch` fuera de `lib/api` (T68 acotada). `lib/contact` no usa `node:*`, `process.env`, `console.*` ni almacenamiento. Los archivos `'use client'` no importan `@/lib/api` salvo `import type`.
- **CO-A8** Formulario: validación espejo, honeypot, foco, regiones vivas, estados y mensajes ES/EN, y alternativa `mailto` en todo error. Sin JS queda deshabilitado con aviso.
- **CO-A9** Estilos v2: campos de la tabla §2.10.1 (`contact`, `service-card`, `aside`, `process`, `featured`, `card`), `--line-input` en obra, ≥44/48/52 px y `reduced-motion`.
- **CO-A10** Build completo: servicios y proyectos de Ada en su idioma sin mezclar; el servicio «a consultar» sale como tal; el HTML tiene `form`, `fieldset disabled`, `<noscript>`, honeypot oculto y `CV_API_URL` solo como destino del formulario; centinela anónimo ausente de `out/` y del directorio de respaldo; exactamente los GET esperados; con todo vacío el build pasa sin secciones; API caída con respaldo de los recursos pasa con avisos y sin el de uno falla nombrándolo; ningún marcador en el HTML; todo `<img src>` existe.
- **CO-A11** Las secciones se numeran por orden renderizado (`01 / servicios`, `02 / proceso`, `03 / proyectos`, `04 / contacto` en Servicios; en Perfil `… 03 / proyectos`, `04 / contacto`) y las ausentes renumeran.
- **CO-A12** La sonda de paridad pasa para `service-card`, `aside`, `process`, `featured`, `card` y `contact` en los 4 casos con `design-api`.

**Tests**

*Parsers y loaders* (`lib/api/validate-content.test.ts`, `lib/api/content.test.ts`)
- **CO-T1** — **Dado** servicios válidos **entonces** se parsean conservando el orden. *(CO-A1)*
- **CO-T2** — **Dado** `price` `null`, `{from:0}`, `{from:1500.5}`, `{from:-1}`, `{from:'1'}`, `currency:'eur'` y `'EURO'` **entonces** los 3 primeros válidos y el resto respuesta inválida. *(CO-A1)*
- **CO-T3** — **Dado** proyectos válidos **entonces** se parsean con todos sus campos y el orden de la API. *(CO-A1)*
- **CO-T4** — **Dado** `relation:'x'` o `disclosure:'x'` **entonces** respuesta inválida. *(CO-A1)*
- **CO-T5** — **Dado** un `anonymous` con `client:'CLIENTE-SENTINELA-ANONIMO'` **entonces** el resultado no tiene `client`. *(CO-A2)*
- **CO-T6** — **Dado** un `public` con `client` **entonces** se conserva; con `client:null`, `null`. *(CO-A2, CO-A5)*
- **CO-T7** — **Dado** un proyecto sin `role`, `period`, `clientLabel`, `highlights` ni `links` **entonces** se normalizan a `null`/`[]`. *(CO-A1)*
- **CO-T8** — **Dado** `[]` y estructuras erróneas (`null`, objeto en vez de lista) **entonces** `[]` válido y el resto respuesta inválida. *(CO-A1)*
- **CO-T9** — **Dado** API sana **cuando** `getServices`/`getProjects` **entonces** datos con `source:'api'` y respaldos `services-es.json`/`projects-es.json`. *(CO-A1)*
- **CO-T10** — **Dado** API caída con respaldo / sin respaldo / forma inválida / 404 / `200 []` / respaldo corrupto **entonces** se comporta como la regla común (respaldo+aviso, falla nombrando recurso, vacío válido guardado, corrupto ignorado). *(CO-A1)*
- **CO-T11** — **Dado** una API que envía `client` en un anónimo **entonces** el archivo de respaldo no contiene el centinela. *(CO-A2)*
- **CO-T12** — **Dado** dos llamadas a `getProjects('es')` **entonces** una sola petición. *(CO-A1)*

*Servicios y proceso* (`service-cards.test.tsx`, `engagement-aside.test.tsx`, `process.test.tsx`, `lib/i18n/format.test.ts`)
- **CO-T13** — **Dado** 2 servicios **entonces** 2 `button aria-pressed` con un `span` de título (sin `h3`: un heading dentro de `button` es HTML inválido; enmienda del leader tras review), resumen, precio y códigos `S-01`/`S-02`; el 1.º marcado («incluido»), el 2.º «+ añadir». *(CO-A3)*
- **CO-T14** — **Dado** `price {from:1500, currency:'EUR'}` **entonces** ES «desde 1500 € + impuestos» y EN «from €1,500 + taxes». *(CO-A3)*
- **CO-T15** — **Dado** `price:null` **entonces** «a consultar» / «on request» sin sufijo; **y** `{from:0}` muestra «desde 0 € + impuestos». *(CO-A3)*
- **CO-T16** — **Dado** que se pulsa un servicio marcado **entonces** queda desmarcado y desaparece del aside; pulsarlo de nuevo lo devuelve. *(CO-A3)*
- **CO-T17** — **Dado** ninguna selección **entonces** el aside muestra el texto «aún no has marcado…» y no una lista vacía. *(CO-A3)*
- **CO-T18** — **Dado** lista de servicios vacía **entonces** no hay sección, enlace de nav ni aside. *(CO-A3)*
- **CO-T19** — **Dado** el diccionario con 4 pasos **entonces** un `ol` de 4 `li` numerados «01–04» con título y texto. *(CO-A4)*
- **CO-T20** — **Dado** un diccionario sin `process` **entonces** no hay sección; y ES y EN tienen `process` ambos o ninguno, con 4 pasos sin cadenas vacías. *(CO-A4)*
- **CO-T21** — **Dado** el estilo de tarjeta marcada **entonces** el CSS usa `border:2px solid var(--accent)` y `box-shadow:8px 8px 0 var(--accent)`, y la no marcada `border:2px solid var(--line2)`. *(CO-A9)*

*Proyectos* (`projects.test.tsx`, `lib/projects/images.test.ts`)
- **CO-T22** — **Dado** 3 proyectos **entonces** el 1.º se pinta como destacado (h3 gigante) y los otros 2 como tarjetas. *(CO-A5)*
- **CO-T23** — **Dado** el destacado público **entonces** insignia, `role`, hechos de `highlights`, botones de `links` (primero primario) y cliente. *(CO-A5)*
- **CO-T24** — **Dado** `period.current` **entonces** insignia «EN PRODUCCIÓN»; con periodo cerrado, el periodo «2019 — 2020»; sin periodo, sin insignia. *(CO-A5)*
- **CO-T25** — **Dado** un anónimo **entonces** solo `clientLabel`, nunca el nombre real. *(CO-A2, CO-A5)*
- **CO-T26** — **Dado** props con `disclosure:'anonymous'` **y** `client` informado **entonces** el componente tampoco lo muestra. *(CO-A2)*
- **CO-T27** — **Dado** un público con `client:null` **entonces** solo `clientLabel`, sin etiqueta vacía. *(CO-A5)*
- **CO-T28** — **Dado** enlaces `https://…` y `javascript:…` **entonces** el primero con `target="_blank" rel="noopener noreferrer"` y el segundo no genera enlace. *(CO-A5)*
- **CO-T29** — **Dado** `role`, `highlights`, `links`, `stack` ausentes **entonces** no quedan etiquetas, listas ni botones vacíos, y el destacado sin `stack` ni captura queda a una columna. *(CO-A5)*
- **CO-T30** — **Dado** un solo proyecto **entonces** solo el destacado, sin rejilla de tarjetas. *(CO-A5)*
- **CO-T31** — **Dado** lista vacía **entonces** sin sección ni enlace; con 1 o 3 proyectos el título de sección es el mismo. *(CO-A5)*
- **CO-T32** — **Dado** un `own`+`public` con `public/projects/<id>.webp` **entonces** `<img>` con `alt`, `width`, `height` y `loading="lazy"` (destacado y tarjeta). *(CO-A5)*
- **CO-T33** — **Dado** un `employer` o `anonymous` con ese archivo presente **entonces** nunca se muestra imagen. *(CO-A2, CO-A5)*
- **CO-T34** — **Dado** que el archivo no existe **entonces** la tarjeta usa el bloque `.gridbg` con el cliente/relación y ningún `<img>`; no aparece ningún texto «captura». *(CO-A5)*

*Selección → formulario* (`contact-form.test.tsx`, `engagement-provider.test.tsx`)
- **CO-T35** — **Dado** 2 servicios marcados **entonces** la línea del formulario dice `selección → A + B`; sin ninguno, «sin bloques marcados»; en Perfil no hay línea de selección. *(CO-A6)*
- **CO-T36** — **Dado** la selección {A,B} y el texto «Quiero una web de ejemplo» **cuando** se envía **entonces** el cuerpo lleva `message` = `Servicios de interés: A + B\n\nQuiero una web de ejemplo` (EN `Services of interest: …`). *(CO-A6)*
- **CO-T37** — **Dado** sin selección **entonces** el `message` enviado es solo el texto. *(CO-A6)*
- **CO-T38** — **Dado** texto de usuario de 9 caracteres con selección **entonces** error `too-short` (el prefijo no cuenta para el mínimo). *(CO-A6)*
- **CO-T39** — **Dado** prefijo de 100 caracteres y texto de 1950 **entonces** error `too-long` y el contador muestra el máximo efectivo (1900). *(CO-A6)*
- **CO-T40** — **Dado** marcar/desmarcar servicios **entonces** el textarea conserva lo escrito. *(CO-A6)*

*Validación y cliente de contacto* (`lib/contact/validate.test.ts`, `lib/contact/client.test.ts`)
- **CO-T41** — **Dado** nombre vacío, solo espacios, de 100 y de 101 caracteres tras recortar **entonces** `required`, `required`, válido, `too-long`. *(CO-A8)*
- **CO-T42** — **Dado** `ada@example.test` **entonces** válido; `ada`, `ada@`, `@x.y`, `a b@x.y`, `ada@x`, `a@@x.y` **entonces** `invalid-format`; de 254 y 255 caracteres, válido y `too-long`. *(CO-A8)*
- **CO-T43** — **Dado** mensajes de 9, 10, 2000 y 2001 caracteres **entonces** `too-short`, válido, válido, `too-long`; solo espacios, `too-short`. *(CO-A8)*
- **CO-T44** — **Dado** emojis (2 unidades UTF-16) y relleno de espacios **entonces** se recorta y se cuenta con `.length` como el servidor. *(CO-A8)*
- **CO-T45** — **Dado** los tres campos inválidos **entonces** devuelve los tres errores a la vez. *(CO-A8)*
- **CO-T46** — **Dado** un servidor local **cuando** se envía **entonces** recibe `POST /api/v1/contact/messages?lang=es` con solo `Content-Type: application/json` y un cuerpo con exactamente `name`, `email`, `message`, `website`. *(CO-A7)*
- **CO-T47** — **Dado** `fetch` simulado **entonces** se llama con `credentials:'omit'`, `cache:'no-store'`, `mode:'cors'`. *(CO-A7)*
- **CO-T48** — **Dado** `201` sin cuerpo **entonces** `sent`; `200` o `204` **entonces** `http-error`. *(CO-A7)*
- **CO-T49** — **Dado** `400` `CONTACT_INVALID` con `detail` ES `El campo «email» no es válido.` y EN `The "email" field is not valid.` **entonces** `invalid` con `field:'email'`; con `detail` sin campo reconocible, `field` indefinido. *(CO-A7)*
- **CO-T50** — **Dado** `429` `CONTACT_RATE_LIMITED` **entonces** `rate-limited`. *(CO-A7)*
- **CO-T51** — **Dado** `400 BAD_REQUEST` o `500 UNEXPECTED` en problem+json **entonces** `problem` con su código. *(CO-A7)*
- **CO-T52** — **Dado** `502` con HTML, `413` sin cuerpo o `403` sin cuerpo **entonces** `http-error` con el estado. *(CO-A7)*
- **CO-T53** — **Dado** un puerto cerrado **entonces** `network` sin lanzar. *(CO-A7)*
- **CO-T54** — **Dado** un servidor que no responde y `timeoutMs` pequeño **entonces** `timeout`; con `AbortSignal` abortada por el llamante, `aborted`. *(CO-A7)*

*Formulario* (`components/contact-form.test.tsx`, `fetch` simulado)
- **CO-T55** — **Dado** el formulario **entonces** `form noValidate method="post"`, tres campos con etiqueta visible y `autocomplete` `name`/`email`, y botón «Enviar». *(CO-A8)*
- **CO-T56** — **Dado** el honeypot **entonces** contenedor `aria-hidden="true"` fuera de pantalla, `tabindex="-1"`, `autocomplete="off"`, `name`/`id` sin «website», enviado como `website:''`. *(CO-A8)*
- **CO-T57** — **Dado** el render en servidor **entonces** `fieldset disabled` + `<noscript>` con el aviso; tras montar se habilita. *(CO-A8)*
- **CO-T58** — **Dado** envío con campos vacíos **entonces** no se llama a `fetch`, cada campo inválido tiene `aria-invalid="true"` y mensaje por `aria-describedby`, y el foco va al primero. *(CO-A8)*
- **CO-T59** — **Dado** envío válido pulsado dos veces **entonces** una sola llamada, botón `aria-disabled` con «Enviando…» y foco conservado. *(CO-A8)*
- **CO-T60** — **Dado** un `201` **entonces** campos vacíos, `role="status"` con el éxito y foco allí. *(CO-A8)*
- **CO-T61** — **Dado** `400` con `field:'email'` **entonces** ese campo `aria-invalid`, foco, y el `detail` de la API. *(CO-A8)*
- **CO-T62** — **Dado** `429` **entonces** mensaje «demasiados mensajes» en `role="alert"` con foco, valores conservados, formulario no bloqueado. *(CO-A8)*
- **CO-T63** — **Dado** `network` con `navigator.onLine` `true` y `false` **entonces** mensaje de red/bloqueo y de sin conexión respectivamente. *(CO-A8)*
- **CO-T64** — **Dado** `timeout` o `http-error` **entonces** mensaje propio y botón activo para reenviar con los mismos valores. *(CO-A8)*
- **CO-T65** — **Dado** cualquier error de API o red **entonces** el mensaje incluye el `mailto:` con el email de la API. *(CO-A8)*
- **CO-T66** — **Dado** que se escribe **entonces** el contador se actualiza y no está en región viva. *(CO-A8)*
- **CO-T67** — **Dado** cualquier flujo **entonces** no se llama a `localStorage`, `sessionStorage`, `indexedDB` ni se escribe `document.cookie`. *(CO-A8)*
- **CO-T68** — **Dado** EN **entonces** etiquetas, errores y estados salen del diccionario EN y la llamada lleva `?lang=en`. *(CO-A8)*
- **CO-T69** — **Dado** el render inicial **entonces** `role="status"` y `role="alert"` ya existen y están vacías. *(CO-A8)*

*Reglas de fuente y estilos* (`tests/source.test.ts`, `components/*.module.test.ts`)
- **CO-T70** — **Dado** `lib/api/**` y `lib/contact/client.ts` **entonces** son los únicos con `fetch(`; `process.env` solo en `lib/api` (T68 reformulado). *(CO-A7)*
- **CO-T71** — **Dado** `lib/contact/**` **entonces** sin `node:*`, `process.env`, `console.*` ni APIs de almacenamiento. *(CO-A7)*
- **CO-T72** — **Dado** los `'use client'` **entonces** no importan `@/lib/api` salvo `import type`, ni `node:*`. *(CO-A7)*
- **CO-T73** — **Dado** los módulos de contacto, servicios, proceso y proyectos **entonces** campos `min-height 48`, botón y CTAs `min-height 52`, `--line-input` en `[data-mode="services"] input,textarea`, `reduced-motion` y breakpoint ≤640 px. *(CO-A9)*

*Build completo* (`tests/build/build.test.ts`)
- **CO-T74** — **Dado** API sana **cuando** se construye **entonces** cada página (según modo) muestra servicios y proyectos de Ada en su idioma sin mezclar, y el «a consultar» sale como tal. *(CO-A10)*
- **CO-T75** — **Dado** el HTML **entonces** hay `form`, `fieldset disabled`, `<noscript>`, honeypot oculto, y la URL de `CV_API_URL` solo como destino del formulario. *(CO-A10)*
- **CO-T76** — **Dado** una API que envía el centinela como `client` de un anónimo **entonces** no aparece en `out/` ni en el directorio de respaldo. *(CO-A2, CO-A10)*
- **CO-T77** — **Dado** el build completo **entonces** el registro de peticiones tiene los GET esperados (recursos × idiomas; cada URL ≥1 vez y ninguna ruta no prevista). *(CO-A1, CO-A10)*
- **CO-T78** — **Dado** `[]` en servicios y proyectos y `ports: []` **entonces** el build pasa, sin esas secciones ni sus enlaces, con numeración renumerada. *(CO-A10, CO-A11)*
- **CO-T79** — **Dado** API caída con respaldo de todos los recursos **entonces** el build pasa con avisos; sin el respaldo de uno, falla nombrándolo. *(CO-A10)*
- **CO-T80** — **Dado** `out/` **entonces** todo `<img src>` existe, no hay marcadores (`[…]`, «TU PRECIO», «AÑOS», «OTRO PROYECTO», «Astro», «CAPTURA») y se mantiene la ausencia de teléfono/documento/fecha de nacimiento. *(CO-A10)*
- **CO-T81** — **Dado** las páginas completas **entonces** eyebrows `01 / servicios`, `02 / proceso`, `03 / proyectos`, `04 / contacto` en Servicios y `… 03 / proyectos`, `04 / contacto` en Perfil. *(CO-A11)*

*Paridad (protocolo)*
- **CO-T82** — **Dado** la sonda con `design-api` en Servicios y Perfil, a 1440 y 390, con las variantes de estado del checklist (puntos 5–7) **entonces** `service-card`, `aside`, `process`, `featured`, `card` y `contact` están dentro de tolerancia, y el envío con selección muestra el prefijo en la petición (inspeccionada con `list_network_requests`). *(CO-A12)*

---

## 9. Slug 4 — `web-redesign-pdf` (prefijo `PD`)

**Archivos nuevos:**
- `lib/pdf/{files,theme,fonts,build-cv-pdf}.ts` y `lib/pdf/cv-document.tsx` (componente del documento, sin lógica de datos).
- `lib/pdf/response.ts` (`cvPdfResponse(lang)`).
- `app/cv-julio-flores-es.pdf/route.ts` y `app/cv-julio-flores-en.pdf/route.ts`.
- (el botón reutiliza `Cta`; `download-cv.tsx` retirado en la ronda 2).

**Tocados:**
- `package.json`: dependencia `@react-pdf/renderer@4.9.0` (exacta) y las 3 `@fontsource/*@5.3.0` como **dependencias** de build, no solo dev.
- `components/architecture-layers.tsx` (botón), diccionario (clave `pdf` y etiqueta del botón), `tests/fixtures/resume.ts`.
- `docs/web-standards.md`: sección PDF.

**Criterios**
- **PD-A1** El build genera `out/cv-julio-flores-es.pdf` y `out/cv-julio-flores-en.pdf`: PDF válidos (`%PDF-`), con texto extraíble, fuentes embebidas y `language` del idioma.
- **PD-A2** Contenido ATS: una columna A4, orden cabecera · resumen · experiencia · skills · formación · idiomas, `highlights` como viñetas, secciones vacías omitidas, cabeceras localizadas.
- **PD-A3** Privacidad: solo email + LinkedIn + GitHub; ningún teléfono, documento ni fecha de nacimiento ni en texto ni en metadatos; redes filtradas por `lib/contact-links.ts`.
- **PD-A4** Mismos datos que la web: sale de `getResume(lang)` (sin fetch nuevo) y respeta sus reglas; si falta la fuente, el build falla.
- **PD-A5** Fallo del render → `getCvPdf` devuelve `null` con aviso, el build de la web pasa y el botón se omite.
- **PD-A6** Botón «Descargar CV (PDF)» solo en Perfil, con `href` a la constante de `files.ts`, `download` y objetivo ≥44 px (variante contorno, 48 px del diseño); en Servicios no existe.
- **PD-A7** Fuentes: el PDF usa los `.woff` de `@fontsource/*@5.3.0` (sin copias) y registra solamente Barlow Condensed 700 e IBM Plex Sans 400/600 (sin IBM Plex Mono: el `.woff` de fontsource tiene el glifo de espacio roto; decisión del humano/leader; contacto y enlaces en Plex Sans). Colores de `lib/pdf/theme.ts` = los de `globals.css`.
- **PD-A8** Compatible con Cloudflare Pages: sin binarios nativos ni Chromium; el build sigue siendo `npm run build`; los PDF no superan 1 MiB con el fixture.
- **PD-A9** Los PDF no están en el sitemap, no rompen `robots` y los demás tests de `out/` siguen verdes.

**Tests**

*Contenido* (`lib/pdf/cv-document.test.tsx` con render real a buffer y extracción de texto, node)
- **PD-T1** — **Dado** el fixture «Ada Ejemplo» ES **cuando** se genera el PDF **entonces** el buffer empieza por `%PDF-`, tiene 1 o más páginas y el texto extraído contiene «Ada Ejemplo», el `label`, el `summary` y los 3 puestos. *(PD-A1, PD-A2)*
- **PD-T2** — **Dado** el mismo en EN **entonces** las cabeceras de sección están en inglés y el texto del fixture EN. *(PD-A2)*
- **PD-T3** — **Dado** `highlights` y `phases` **entonces** aparecen como viñetas/líneas bajo su puesto, y el orden de secciones es el de PD-A2. *(PD-A2)*
- **PD-T4** — **Dado** `education`, `skills`, `languages` y `impact` vacíos **entonces** su sección no aparece (ni cabecera vacía). *(PD-A2)*
- **PD-T5** — **Dado** campos opcionales ausentes (`summary`, `city`, `tagline`) **entonces** no hay líneas vacías ni «undefined». *(PD-A2)*
- **PD-T6** — **Dado** muchos puestos **entonces** el PDF pasa de 1 página y ningún puesto se parte por la mitad (cada uno en una sola página). *(PD-A2)*
- **PD-T7** — **Dado** el PDF **entonces** la lectura del texto sigue un orden lineal (cabecera antes que experiencia antes que formación), apto para ATS. *(PD-A2)*

*Privacidad* (`lib/pdf/privacy.test.ts`)
- **PD-T8** — **Dado** un resume con teléfono, documento y fecha de nacimiento centinela inyectados **antes** del parser **entonces** el texto del PDF y sus metadatos no los contienen. *(PD-A3)*
- **PD-T9** — **Dado** `contact.profiles` con LinkedIn, GitHub, Twitter y una URL `javascript:` **entonces** el PDF imprime email, LinkedIn y GitHub (URL visible y enlace) y ninguna otra. *(PD-A3)*
- **PD-T10** — **Dado** el PDF **entonces** los metadatos son `title` «Ada Ejemplo — CV», `author` «Ada Ejemplo» y `language`; sin `creator` con ruta local. *(PD-A3)*

*Fuentes y tema* (`lib/pdf/fonts.test.ts`, `lib/pdf/theme.test.ts`)
- **PD-T11** — **Dado** `fonts.ts` **entonces** solo hay tres fuentes (Barlow 700, Plex Sans 400/600; sin mono) y las rutas apuntan a `node_modules/@fontsource/*/files/*.woff` existentes y no hay copias de `.woff` en el repo. *(PD-A7)*
- **PD-T12** — **Dado** el PDF generado **entonces** las fuentes embebidas son solo Barlow Condensed Bold e IBM Plex Sans, sin Plex Mono (verificado por extracción de nombres de fuente del buffer). *(PD-A1, PD-A7)*
- **PD-T13** — **Dado** `theme.ts` **entonces** `ink`, `accent`, `muted` y `bg` coinciden con `--ink`/`--accent-obra`/`--muted`/`--surface` de obra en `globals.css`. *(PD-A7)*

*Fallo y datos* (`lib/pdf/build-cv-pdf.test.ts`)
- **PD-T14** — **Dado** un renderer que lanza **cuando** se llama `getCvPdf('es')` **entonces** devuelve `null`, emite un `console.warn` con idioma y motivo, y no lanza. *(PD-A5)*
- **PD-T15** — **Dado** un renderer correcto **cuando** se llama dos veces **entonces** renderiza una vez (memo por idioma). *(PD-A4)*
- **PD-T16** — **Dado** `getResume` que falla sin respaldo **entonces** `getCvPdf` propaga ese error (falta la fuente de datos). *(PD-A4)*
- **PD-T17** — **Dado** `cvPdfResponse` con PDF **entonces** `Content-Type: application/pdf` y cuerpo `%PDF-`; con `null`, estado 404 `text/plain`. *(PD-A5)*

*Botón* (`components/home-view-pdf.test.tsx`; T21 en `components/ui/ui.test.tsx`; el botón es `Cta` con `download` y `size="sm"`, ya no existe `download-cv.tsx`)
- **PD-T18** — **Dado** Perfil ES con PDF disponible **entonces** un enlace «Descargar CV (PDF)» con `href="/cv-julio-flores-es.pdf"` y `download`; EN → «Download CV (PDF)» y `-en.pdf`. *(PD-A6)*
- **PD-T19** — **Dado** `pdf: null` **entonces** el botón no se renderiza y la sección «02 / arquitectura» queda intacta. *(PD-A5, PD-A6)*
- **PD-T20** — **Dado** la vista de Servicios **entonces** no existe el botón. *(PD-A6)*
- **PD-T21** — **Dado** el `Cta` del botón (outline, `download`, `size="sm"`) **entonces** `min-height` 48 px (≥44) y el `Cta` por defecto sigue en 52 px. *(PD-A6)*

*Build* (`tests/build/build.test.ts`, API falsa «Ada Ejemplo»)
- **PD-T22** — **Dado** API sana **cuando** se construye **entonces** `out/` contiene ambos PDF; `file`/cabecera `%PDF-`, tamaño <1 MiB y texto extraíble con «Ada Ejemplo» en ES y EN. *(PD-A1, PD-A8)*
- **PD-T23** — **Dado** las páginas de Perfil **entonces** enlazan a los PDF; las de Servicios no. *(PD-A6)*
- **PD-T24** — **Dado** una API falsa con teléfono, documento y fecha de nacimiento centinela **entonces** ni los PDF ni el HTML los contienen. *(PD-A3)*
- **PD-T25** — **Dado** API caída con respaldo de `/resume` **entonces** el build pasa y los PDF salen del respaldo; sin respaldo, el build falla. *(PD-A4)*
- **PD-T26** — **Dado** `sitemap.xml` y `robots.txt` **entonces** no listan los PDF y los demás tests de `out/` siguen verdes. *(PD-A9)*
- **PD-T27** — **Dado** `package.json` **entonces** `@react-pdf/renderer` está fijada a `4.9.0` y las `@fontsource/*` a `5.3.0` en `dependencies`. *(PD-A8)*
- **PD-T28** — **Dado** el PDF real de varias páginas (y el de una) **entonces** cada página contiene su número `n/total` (extracción con `pdfjs`). *(PD-A2; añadido en la revisión, R1)*

---

## 10. Slug 5 — `web-redesign-paridad` (prefijo `PA`)

**Naturaleza:** verificación final obligatoria + correcciones. Solo se tocan archivos de `app/`, `components/` y `lib/` para corregir defectos detectados. Sin funcionalidad nueva.

**Archivos:** `progress/web-redesign-paridad/review.md` (informe), `design/artifact-v2/.shots/` (capturas, ignoradas por git), ajustes de CSS/componentes. Pasos de ejecución:
1. Levantar `design-api` y construir con `CV_API_URL` apuntándole.
2. Servir `out/` y el render de referencia (`serve.mjs`).
3. Ejecutar sonda y diff en las 4 combinaciones.
4. Corregir.
5. Repetir hasta cumplir.

**Criterios**
- **PA-A1** Para {perfil, servicios} × {1440×900, 390×844} la sonda cumple todas las claves del §2.10.1 dentro de §2.10.2, y el informe adjunta el JSON.
- **PA-A2** `diff.mjs` informa ≤3 % de píxeles distintos por banda de 400 px (salvo bandas con desviación declarada, que el informe justifica una a una).
- **PA-A3** Checklist §2.10.3 puntos 1–8 completado y adjuntado, incluidas las interacciones (nodos 1/3/6, servicios, contacto con error/éxito/429 contra la API local, `prefers-reduced-motion` emulado).
- **PA-A4** Sin desbordamiento horizontal a 390 px en ninguna página; `scrollWidth ≤ innerWidth`.
- **PA-A5** Lighthouse (`lighthouse_audit`) sin fallos de accesibilidad en las 4 páginas a escritorio y móvil, y sin errores de consola.
- **PA-A6** Todas las desviaciones D1–D9 están listadas en el informe con su motivo y no hay otras.
- **PA-A7** El humano confirma por escrito el punto 9 (fondo hexagonal, tipografía y color percibido contra el artifact en claude.ai). **No se cierra sin esta confirmación.**
- **PA-A8** `lint`, `typecheck`, `test` y `build` en verde con la API real o la de diseño; y el build con API caída + respaldo sigue pasando.

**Tests**
- **PA-T1** — **Dado** la web construida con `design-api` y la referencia **cuando** se ejecuta la sonda en perfil a 1440 **entonces** todas las claves están dentro de tolerancia (JSON adjunto). *(PA-A1)*
- **PA-T2** — **Dado** perfil a 390 **entonces** ídem y además el h1 mide 56 px, el plano 342×342 y el núcleo 102.6 px de ancho. *(PA-A1)*
- **PA-T3** — **Dado** servicios a 1440 **entonces** ídem con `--bg #F4F3EC`, `--ink #12382A`, acento `#2FC98A` computados en `body`. *(PA-A1)*
- **PA-T4** — **Dado** servicios a 390 **entonces** ídem. *(PA-A1)*
- **PA-T5** — **Dado** las 4 combinaciones **cuando** corre `diff.mjs` **entonces** cada banda ≤3 % o está justificada en el informe. *(PA-A2)*
- **PA-T6** — **Dado** el checklist §2.10.3 puntos 1–8 **entonces** cada punto queda marcado con captura o valor medido por modo y viewport. *(PA-A3)*
- **PA-T7** — **Dado** cada página a 390 px **entonces** `document.documentElement.scrollWidth <= window.innerWidth`. *(PA-A4)*
- **PA-T8** — **Dado** Lighthouse en las 4 páginas (escritorio y móvil) **entonces** accesibilidad sin fallos y `list_console_messages` sin errores. *(PA-A5)*
- **PA-T9** — **Dado** el informe **entonces** lista exactamente D1–D9 y cualquier otra diferencia marcada como defecto corregido. *(PA-A6)*
- **PA-T10** — **Dado** el artifact v2 abierto en claude.ai junto a la web local **cuando** el humano compara el fondo hexagonal, la tipografía y el color en ambos modos **entonces** confirma por escrito que «se ve igual». *(PA-A7)*
- **PA-T11** — **Dado** la suite completa **entonces** `npm run lint`, `typecheck`, `test` y `build` pasan, y la simulación de API caída con respaldo también. *(PA-A8)*

---

## 11. Cobertura (criterio → tests)

- **RF:** A1 T1–T4 · A2 T4 · A3 T5 · A4 T6–T7 · A5 T8–T9 · A6 T10 · A7 T11.
- **BA:** A1 T1–T2, T44 · A2 T3–T7, T45–T46 · A3 T8–T11, T19, T45 · A4 T12–T14, T49 · A5 T15, T51 · A6 T18, T20–T23, T49 · A7 T24–T26, T43 · A8 T26–T29 · A9 T22, T30–T35, T47 · A10 T36–T38 · A11 T39–T40 · A12 T41 · A13 T16 · A14 T17, T52 · A15 T7, T42, T48–T49 · A16 T50 · A17 T52.
- **HX:** A1 T1–T5 · A2 T6–T8 · A3 T9–T20, T43 · A4 T21–T23, T37 · A5 T24–T25, T37–T38 · A6 T24, T26–T29, T32 · A7 T30–T31, T40 · A8 T24, T32–T35, T38 · A9 T36, T42 · A10 T38–T39 · A11 T41–T43 · A12 T44.
- **CO:** A1 T1–T4, T7–T12, T77 · A2 T5–T6, T11, T25–T26, T33, T76 · A3 T13–T18 · A4 T19–T20 · A5 T22–T34 · A6 T35–T40 · A7 T46–T54, T70–T72 · A8 T41–T45, T55–T69 · A9 T21, T73 · A10 T74–T80 · A11 T81 · A12 T82.
- **PD:** A1 T1, T12, T22 · A2 T1–T7 · A3 T8–T10, T24 · A4 T15–T16, T25 · A5 T14, T17, T19 · A6 T18–T21, T23 · A7 T11–T13 · A8 T22, T27 · A9 T26.
- **PA:** A1 T1–T4 · A2 T5 · A3 T6 · A4 T7 · A5 T8 · A6 T9 · A7 T10 · A8 T11.

Todo criterio tiene al menos un test. Los tests marcados «(protocolo)» (BA-T52, HX-T44, CO-T82 y PA-T1–T10) se ejecutan con Chrome DevTools y dejan evidencia en el `review.md` de su slug; el resto corre en `npm test`.

## 12. Consideraciones de privacidad, SEO y accesibilidad

- **Privacidad:**
  - Solo email, LinkedIn y GitHub en web **y PDF**. El parser de `/resume` descarta lo desconocido; los centinelas se comprueban en `out/` (BA-T48, CO-T80) y en el PDF (PD-T8, PD-T24).
  - **Cliente anónimo:** protegido en el parser, la caché y el componente (tres capas: CO-T5, CO-T11, CO-T26, CO-T76).
  - El formulario no guarda nada; los errores no reproducen el contenido escrito.
  - El prefijo de servicios solo contiene títulos de la API.
  - La herramienta de paridad (`scripts/parity`) y sus datos no se publican (no están en `public/`).
- **SEO:**
  - 4 canonicals, hreflang por página, sitemap de 4, JSON-LD `Person` en las 4.
  - El HTML estático incluye los puertos y adaptadores aunque sin JS el selector no funcione.
  - Los PDF no se indexan por sitemap.
- **Accesibilidad:**
  - Un `h1`; toggle con `aria-current`; nodos y servicios `aria-pressed`; adaptadores con `fieldset/legend` y radios nativos.
  - Regiones vivas (`status`, `alert`, panel); texto + forma para `status`; objetivos ≥44 px; foco visible (inversión en hex); `prefers-reduced-motion`; `aria-invalid`/`aria-describedby`; foco gestionado al enviar.
  - Honeypot `aria-hidden` con `tabindex=-1`; `<noscript>` y `@media (scripting: none)` sin JS.
  - Desviaciones D1 y `--line-input` justificadas en §2.9.

## 13. Consideraciones de datos y resiliencia

- Los datos de contenido entran solo por `lib/api` en el build. Excepción en runtime: `lib/contact/client.ts`, solo tras pulsar «Enviar». El PDF usa `getResume` (cero fetch nuevos).
- Un `200` válido vacío manda; un fallo sin respaldo rompe el build; el respaldo guarda también lo vacío; un respaldo corrupto se ignora; un enum nuevo de la API rompe el build pronto.
- El fallo del render del PDF no rompe la web (aviso + botón omitido); la falta de datos sí rompe el build, como las páginas.
- La web no puede verificar el idioma de las respuestas nuevas (no hay campo `language`); depende de `?lang` y del test con API falsa.
- Despliegue: con la API vieja el build falla (404). Orden: desplegar API → confirmar CORS → desplegar web.
- Plano: 0 puertos → sin plano y hero a una columna; >6 → lista; nada se trunca. Servicios y proyectos con opcionales ausentes degradan sin marcadores vacíos.
- Formulario: red, CORS, timeout y errores HTTP tienen mensaje y salida por email; el botón nunca queda bloqueado.

## 14. Alternativas descartadas

1. **PDF con Puppeteer/Playwright (HTML→PDF):** necesita Chromium en el build de Cloudflare Pages (pesado, frágil, tiempos), y el PDF no usaría componentes propios. Descartada.
2. **`pdfmake` 0.3.14:** imperativo con VFS de fuentes propio, sin reutilizar JSX ni tipos del proyecto. Funcionaría, pero `react-pdf` encaja mejor y está verificado.
3. **`pdf-lib` 1.17.1:** de bajo nivel, sin maquetación ni saltos de página.
4. **PDF estático commiteado:** copiaría contenido del CV al repo, contra la regla; y quedaría desactualizado respecto a la API.
5. **PDF por script externo en `public/` (`prebuild`/`postbuild`):** duplicaría la lógica de carga de datos o exigiría ejecutar TS fuera de Next (nueva dependencia `tsx`, alias `@/`). El Route Handler reutiliza los loaders sin código extra.
6. **Fallo del PDF = fallo del build:** más simple, pero contradice la decisión del humano; se mantiene el aviso + botón omitido, a costa de un archivo basura sin enlazar en el caso de fallo.
7. **Generar `globals.css` desde `lib/design/tokens.ts`:** una sola fuente real, pero añade un paso de build y oculta el CSS; se prefiere CSS como fuente y test de coincidencia para el PDF.
8. **Copiar los blobs del artifact:** inaccesibles; se recrea el fondo en SVG propio.
9. **Servir el `.dc.html` con `support.js` ficticio:** frágil; el render estático por evaluación de la clase `Component` es determinista y mide con los mismos archivos de fuente.
10. **Plano con nodos de servicios en obra (como el diseño):** contradice la decisión de las rondas 2–4 (el plano es la arquitectura real); los servicios viven en su sección (D3).
11. **Radios nativos para los nodos del plano:** mejor teclado de serie, pero el brief de la ronda 4 pide botones reales; se usan `button aria-pressed` para los puertos (como el diseño) y radios para los adaptadores.
12. **Una sola página con estado de modo:** descartada desde la ronda 1; vigente.
13. **Preseleccionar ningún servicio:** más honesto, pero rompe la paridad con el estado por defecto del diseño; se mantiene el primero marcado, visible y desmarcable.
14. **Truncar a 6 puertos:** perdería información; se usa layout `list`.
15. **Regenerar el schema contra la URL pública / commitear un `openapi.json`:** la API pública aún no tiene los endpoints (404), y un snapshot arrastraría `@example` con datos reales.

## 15. Riesgos residuales (decididos; para conocimiento del humano)

- **R-PD (archivo basura):** si el render del PDF falla, queda en `out/` un archivo de texto en la ruta del PDF, sin enlace y fuera del sitemap. Inofensivo pero visible si alguien teclea la URL.
- **R-A11Y (obra):** el nodo no seleccionado (blanco sobre crema, 1.09:1) no tiene borde propio (el `clip-path` lo impediría); el estado se transmite por texto y `aria-pressed`. Si un auditor exige 3:1, el cambio mínimo sería dibujar el contorno con un SVG detrás del nodo.
- **Copy provisional:** los textos ES del artifact (incluida «precio cerrado» y las 3 capas A–A′ con tecnologías) y las traducciones EN quedan en diccionarios hasta que el humano los sustituya; la web no los verifica.
- **Fondo hexagonal:** se mide contra el render de referencia (mismo SVG en ambos lados), no contra el blob original; la confirmación final del patrón/opacidad es humana (PA-A7).
- **Verificaciones locales pendientes (R12):** el implementer debe ejecutar contra la API local `quarkus:dev` (Docker), `generate:api`, el `POST` con `Accept */*` y el preflight; no se ejecutaron aquí.
- **Cobertura de builds:** 5 construcciones reales (sana, vacía, con respaldo, sin respaldo, con PDF), del orden de minutos cada una.
- **Hueco de backend:** campo opcional «diagrama» por proyecto (entrada/núcleo/salida) para el «plano del sistema» real; fuera de alcance, otra tarea en el repo `cv`.
- **Node local:** esta máquina corre Node 20.20.2 pero el repo pide `>=22.12` (`.nvmrc` 22); el implementer debe usar Node 22 para las pruebas de build.
## 16. Desviaciones adicionales aceptadas tras la paridad (leader, 2026-11-11)

A propuesta del reviewer de `web-redesign-paridad` (E1–E4), se registran para que PA-A6 sea exacto:
- **D10:** contador `n/2000` bajo el textarea del formulario (accesibilidad; el diseño no lo trae).
- **D11:** el enlace del email en el bloque de contacto (alternativa `mailto`, exigida por CO-A8).
- **D12:** CTA primario del hero de Perfil a `#contact` en lugar de «Ver trayectoria» (BA-T24).
- **D13:** leyenda del plano dibujada con formas SVG/CSS en lugar de glifos de texto (`──`, `■`, no están en el subset latin).
