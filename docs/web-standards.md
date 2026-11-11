# Web Standards — cv-web

> Patrones y convenciones. `analyst`, `implementer` y `reviewer` la consultan.

## Stack
- **Next.js** (App Router) con `output: 'export'` (sitio 100 % estático), **React**, **TypeScript estricto**.
- Estilos: **CSS Modules + variables CSS** con los tokens de `design/preview.html` (propuesta B). Sin librería de UI.
- Tests: **Vitest** + Testing Library. Lint: ESLint (config de Next). Las versiones exactas las fija el analyst tras comprobarlas.

## Datos
- Una sola puerta de entrada: `lib/api`. Hace `fetch` a `${CV_API_URL}/api/v1/resume?lang=<es|en>` **solo en el build**.
- Los tipos salen del OpenAPI de la API (`/openapi.json`); no se escriben a mano.
- Resiliencia: en cada build correcto se guarda la respuesta en una caché (ruta que conserve Cloudflare Pages); si la API falla, se usa esa copia
  y se avisa; si no hay copia, el build **falla**. Nunca se publica una web sin datos.
- Los componentes reciben props tipadas; no hacen `fetch` ni leen `process.env`.

## i18n
Español en `/`, inglés en `/en`. Diccionarios en `lib/i18n`. Las dos rutas comparten componentes. `hreflang` y `lang` correctos.

## Diseño y accesibilidad
Tokens por variables CSS. Contraste AA, foco visible, `prefers-reduced-motion`, un solo `h1` por página, landmarks, HTML semántico,
mobile-first (probar a 360 px y a escritorio).

## SEO
`title`, `description`, Open Graph, `hreflang`, canonical y JSON-LD `Person` por idioma; `sitemap.xml` y `robots.txt`.

## Seguridad y privacidad
Sin teléfono, documento ni fecha de nacimiento. Sin secretos en el repo; `CV_API_URL` es pública. Enlaces externos con `rel="noopener noreferrer"`.

## Testing
Unitarios para `lib/`, de componente para UI (con fixtures ficticios «Ada Ejemplo») y una prueba que inspecciona el HTML generado
(privacidad, SEO, idiomas). Cada criterio de aceptación tiene al menos un test.

## PDF del CV
- `lib/pdf/` (`@react-pdf/renderer@4.9.0`, JS puro): `files.ts` (nombres/ruta, única fuente), `fonts.ts` (`.woff` de `@fontsource/*@5.3.0`, sin copias), `theme.ts` (= tokens «obra» de `globals.css`, con test), `cv-document.tsx` (A4, una columna, ATS), `build-cv-pdf.ts` (`getCvPdf`, memo por idioma), `response.ts`.
- Rutas estáticas `app/cv-julio-flores-{es,en}.pdf/route.ts`. Datos: `getResume` (si falta la fuente, el build falla). Si el render falla: `null` + `console.warn`, la web se construye y el botón se omite.
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
