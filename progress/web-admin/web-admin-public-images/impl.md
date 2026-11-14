# impl — web-admin-public-images (slug 9/10)

Estado: **done**. Sin commit, en `feature/web-admin-api-client`, encima de los slugs 1–8 sin commitear. Node 22.23.1.
Verificación: `npm run lint` ✔ · `npm run typecheck` ✔ · `npm test` ✔ (149 archivos, 683 tests) · `npm run build` ✔ (`/[[...slug]]`, `robots.txt`, `sitemap.xml` en `ƒ`).
(La sesión se cortó una vez por límite de uso antes de tocar archivos; se retomó desde cero sin trabajo a medias ni servidores vivos.)

## Qué se comprobó en la API (repo `cv`)
- `ApiModels.ProjectImageDto(url, alt, width, height)`: `url` = `R2_PUBLIC_URL` + `/` + key (`R2FileStorageAdapter.publicUrl`); la key **no** se expone en el GET público. `alt` ya viene en el idioma pedido. `width/height` `int` > 0 (`ProjectImage` del dominio).
- `Project` (dominio) vacía `images` si no es `own`+`public`; sin `R2_PUBLIC_URL` el GET público no devuelve imágenes. Orden: la primera es la portada.
- `lib/api/schema.d.ts` (regenerado en el slug 1) ya tiene `Project.images: ProjectImage[]` con esos 4 campos.

## Hecho
- `lib/api/types.ts`: `Project.images: ProjectImage[]` (siempre `[]` salvo `own`+`public`).
- `lib/api/validate-content.ts`: `parseProjectImage` (solo `url, alt, width, height`; enteros positivos; cualquier otro campo, p. ej. `key`, se descarta). `images` ausente/`null` → `[]`; forma inválida → payload inválido (500). Segunda barrera de privacidad: un proyecto que no es `own`+`public` sale con `images: []`.
- `lib/projects/images.ts`: desaparece `resolveProjectImages` (y la lectura de `public/projects` con `node:fs`); nuevo `coverOf(project)` = `images[0]` solo si `canShowImage` y la URL es http(s) absoluta sin credenciales (reutiliza `safeHttpUrl`); si la primera no es segura no hay portada (no cae a la siguiente).
- `ProjectCard`/`ProjectFeatured`: leen la portada del propio proyecto; `<img src alt width height loading="lazy" decoding="async">` con las dimensiones de la imagen; `alt` de la imagen y, si está vacío/en blanco, el título. Sin portada: el bloque de malla de siempre (tarjeta) / sin imagen (destacado).
- `Projects`, `HomeView` y `app/[[...slug]]/page.tsx`: fuera la prop `images`/`projectImages`.
- `tests/fixtures/content.ts`: `images: []` en los proyectos «Ada Ejemplo» + `MEDIA_ORIGIN` y `sampleImage(n, lang)` ficticios.

## Mapa Tn → test
| Tn | Test |
|---|---|
| T410 | `lib/api/validate-content.test.ts` › `T410: images absent or null …` |
| T411 | `lib/api/validate-content.test.ts` › `T411: valid images keep their order …; a broken image makes the whole payload invalid` |
| T412 | `lib/api/validate-content.test.ts` › `T412: an employer or anonymous project with images (a hostile API) loses them` |
| T413 | `lib/projects/images.test.ts` › `T413 (CO-T32)`, `T413 (CO-T33)`, `T413 (CO-T34)` |
| T414 | `components/projects.test.tsx` › `CO-T32 / T414`, `T414: the alt follows the language … falls back to the title`, `T414: a featured project with a cover but no stack …`, `T414: a cover whose url is not absolute http(s) …`, `CO-T34 / T414` |
| T415 | `components/home-view.test.tsx` › `T415: HomeView and Projects take no projectImages …` (+ los CO-T22…T44 de `projects.test.tsx` migrados sin `images`) |
| T416 | `tests/runtime/pages.test.ts` › `T416 / T417: an own + public project shows its cover …` (ES/EN, 4 páginas; empleador/anónimo sin `<img>` ni URL; `images:[]` → malla; API caída → 500) |
| T417 | mismo test: ni la `key` centinela ni `"key":` aparecen en HTML ni en el payload RSC |
| T418 | `next.config.test.ts` › `T418: … images stay unoptimized and no remotePatterns, domains nor loader` |
| T419 | `tests/source.test.ts` › `T419: no code reads the old public screenshot folder nor calls the old file resolver …` |

Tests extra fuera del plan:
- `lib/projects/images.test.ts` › `extra: a url with credentials is refused`.
- `tests/runtime/pages.test.ts` › `extra (T416 end to end, with web-admin-images)`: login en el panel → subida real por `/admin/api/images/` (multipart, webp ficticio 800×600) → `PUT /admin/api/content/projects/` con la key como portada → `/` y `/en/` muestran `<img>` con la URL pública del fake, `alt` por idioma y 800×600, sin `"key":`.
- `components/projects.test.tsx`: el destacado lleva `style="aspect-ratio: W / H"` (ver desvío 2).
- `CO-T33` se reescribió (antes: mapa de imágenes; ahora: proyectos con `images` en props).
- El antiguo `T41` (runtime, `public/projects/<id>.webp`) se sustituye por T416/T417.

## Criterio → tests
AC24: T410–T419 + extras. Sin regresión de la web pública: toda la suite previa de componentes/runtime pasa con `images: []` (sin imagen, la tarjeta y el destacado se renderizan igual que antes; `CO-T29`, `CO-T34`, `T44`, `T50`).

## Verificación visual (Chrome DevTools)
Standalone (copia en el scratchpad) contra una API de scratch = datos del diseño + portadas inyectadas (1280×720 en el destacado, 720×1280 en una tarjeta, imágenes «LEAK» en los anónimos) servidas por un servidor SVG local. Comprobado en `/` y `/en/` a 360 px (emulado, móvil) y `/` y `/en/services/` a 1280 px (plano y obra):
- Destacado: portada a todo el ancho de la columna con su proporción; tarjeta: 16:9 recortada igual que el bloque de malla (alturas alineadas con las tarjetas sin imagen). Anónimos: malla, ninguna URL «LEAK» en el HTML.
- Sin scroll horizontal a 360 px; la caja de cada `<img>` mide lo mismo antes y después de cargar (sin CLS). `alt` por idioma.
- Consola sin errores ni avisos (tras el desvío 2). Servidores parados al terminar (`next-server`, API y medios de scratch) y copia borrada.

## Desvíos
1. **CSS del destacado** (`project-featured.module.css` `.shot`): era un marco fijo 9:16 de 360 px (convención de capturas de móvil en `public/projects`). Con portadas de la API (típicamente apaisadas, p. ej. 1280×720) recortaba casi toda la imagen. Ahora: `width:100%`, proporción propia, `max-height:640px` y `object-fit:contain` (una vertical se encuadra sin recortar). La tarjeta mantiene su 16:9 con `cover`. Solo afecta a proyectos con imagen (hoy no hay ninguno).
2. **`style={{aspectRatio}}` en el `<img>` del destacado**: Chrome emitía el issue «Lazy-loaded images should have explicit dimensions» porque el CSS pone `height:auto`; la caja ya se reservaba bien, pero así el ratio queda explícito y la consola limpia.
3. **`decoding="async"`** añadido a las dos `<img>` (no estaba en el plan; inocuo).
4. **Todas las portadas `lazy`**: la sección de proyectos queda muy por debajo del primer viewport en las 4 páginas, así que no hay «portada crítica» que deba ir `eager` (el plan pide `lazy`).

## Riesgos / notas para el reviewer
- **Origen de las imágenes:** la web no conoce `R2_PUBLIC_URL` (sus únicas variables de runtime son `CV_API_URL` y `SITE_URL`; añadir otra contradice `CLAUDE.md` y T422). Por eso `coverOf` no fija un origen concreto: exige http(s) absoluta sin credenciales (descarta `javascript:`, `data:`, relativas, `//host`, `ftp:`) y confía en que la URL la compone la API desde su configuración. Si se quiere fijar el dominio de medios hace falta una decisión del humano (nueva variable o constante).
- ~~Se acepta `http:`~~ (superado en la ronda 2: solo `https:`).
- No hay CSP en las páginas públicas (solo `frame-ancestors` en `/admin`), así que no hay `img-src` que ampliar; `images.unoptimized` sigue y no hace falta `remotePatterns` (T418).
- La fake `toPublic` no filtra imágenes por `relation/disclosure` (la API real sí); el parser las descarta igual (T412 lo cubre con una API hostil).
- Documentación (`web-standards.md`, `AGENTS.md`) no se tocó: queda para `web-admin-regresion` (T424/AC30). `progress/current.md` no se editó.

## Ronda 2 (respuesta a `review.md`, CHANGES_REQUESTED)
Verificación: `npm run lint` ✔ · `npm run typecheck` ✔ · `npm test` ✔ (149 archivos, 683 tests) · `npm run build` ✔ (`ƒ`). Ningún `next-server` ni fake vivo al terminar.

**CR-1 — comprobaciones RSC vacías.** Con `redirect: 'manual'` el standalone devolvía el 307 a `?_rsc=…` con cuerpo vacío, así que las aserciones `not.toContain` sobre el «RSC» no comprobaban nada.
- Nuevo `getRsc(server, path)` en `tests/helpers/runtime-pages.ts`: envía `RSC: 1`, **sigue la redirección** y lanza si la respuesta no es `200` + `text/x-component` con cuerpo no vacío.
- `tests/runtime/pages.test.ts`:
  - **T31** y **T36**: usan `getRsc` y añaden un control positivo (el payload contiene el nombre del currículum de la página, `Ada Ejemplo`) antes de buscar centinelas/etiquetas privadas y la URL de la API. Siguen pasando, ahora sobre el payload real (los centinelas y `cv-api` no aparecen).
  - **T416/T417**: `getRsc` + control positivo (el payload contiene la URL de la portada del idioma) antes de los `not.toContain` (URLs de empleador/anónimo, `key` R2 centinela, segunda imagen, `"key":`). Pasa sobre el payload real.

**Decisión de Julio — solo `https:`.**
- `lib/projects/images.ts` (`coverOf`): exige `protocol === 'https:'` además de absoluta y sin credenciales; sin caer a la segunda imagen.
- `lib/projects/images.test.ts` › `T413 (CO-T34)`: `http://` y `HTTP://` dan `undefined` (con una segunda imagen https válida detrás, para probar que no hay fallback); `HTTPS://…` se acepta normalizada.
- `components/projects.test.tsx` › `T414: a cover whose url is not absolute https …`: añade una portada `http:` que no se renderiza (la tarjeta conserva su malla).
- Fixtures (`MEDIA_ORIGIN = https://media.example.test`) y el test extremo a extremo (fake con `mediaBase` https por defecto; comprueba que la URL empieza por `MEDIA_ORIGIN/`) ya usaban https: sin cambios.
- Plan enmendado: `progress/web-admin/analysis.md` §10, AC24 y §13.10 T413 (anotado como decisión de Julio, 2026-11-14). Brief: párrafo «Cambio de decisión (2026-11-14)» al final de `progress/web-admin/brief.md`.

