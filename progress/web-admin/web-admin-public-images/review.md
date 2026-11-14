# review — web-admin-public-images (slug 9/10)

**Veredicto final: APPROVED** (ronda 2). La ronda 1 (CHANGES_REQUESTED) queda debajo como histórico.

## Ronda 2

Verificación (Node 22.23.1): `npm run lint` ✔ · `npm run typecheck` ✔ · `npm test` ✔ (149 archivos, 683 tests) · `npm run build` ✔
(`/[[...slug]]`, `robots.txt`, `sitemap.xml` en `ƒ`). Sin regresiones.

**CR-1 — resuelto.**
- `tests/helpers/runtime-pages.ts` › `getRsc`: envía `RSC: 1`, sigue el 307 (`redirect` por defecto) y lanza si no hay `200` + `text/x-component` + cuerpo no vacío.
- `tests/runtime/pages.test.ts`: T31 (l.119-121), T36 (l.225-226) y T416/T417 (l.262-264) usan `getRsc` con control positivo previo
  (nombre del currículum en T31/T36; URL de la portada del idioma en T416) antes de las aserciones de ausencia.
- **Mutación temporal** (revertida): parser sin filtro de `images` + `canShowImage` siempre true, y el bucle de fugas del T416 limitado a
  `[rsc]` (con las aserciones DOM previas anuladas para llegar a él). Resultado: el T416 **falla en el RSC** —
  `expected '1:"$Sreact.fragment"…' not to contain '…/SENTINEL-EMPLOYER-IMAGE.webp'` — es decir, ahora lee el payload Flight real y detecta la fuga.
  Árbol restaurado: `git diff | shasum` idéntico al previo; build regenerado y `pages.test.ts` 13/13 en verde.

**https obligatorio (decisión de Julio) — correcto.**
- `lib/projects/images.ts:19-20`: `protocol === 'https:'` además de absoluta y sin credenciales; sin fallback a la segunda imagen.
- `lib/projects/images.test.ts` › `T413 (CO-T34)`: `http://` y `HTTP://` → `undefined` con una segunda imagen https válida detrás (prueba el no-fallback);
  `HTTPS://…` se acepta normalizada a `https://…`. `components/projects.test.tsx` › `T414: … not absolute https …`: una portada `http:` no se pinta y la tarjeta conserva la malla.
- En vivo en el standalone (API de scratch): portada `http://…` → sin `<img>` en HTML ni URL en RSC; `HTTPS://…` → `<img src="https://…">` normalizada y presente en RSC.
- Plan enmendado: `analysis.md` §10 (l.352), AC24 (l.407) y T413 (l.691), anotados como decisión de Julio 2026-11-14; brief: párrafo «Cambio de decisión (2026-11-14)» (l.19).

Procesos: `next-server` y APIs de scratch detenidos; puertos 4391/4392 libres. `progress/current.md` no tocado.

**Cambios requeridos (ronda 2): ninguno.** Skills (ronda 2): `testing-strategy` — CR-1 resuelto con control positivo y mutación que lo demuestra;
`simplify`, `next-best-practices`, `strict-typing` — sin hallazgos en la corrección. Checkpoints C1–C6 ✔ (C2 ya cumplido); C7 pendiente de autorización humana.
La observación fuera de alcance sobre T31/T36 queda resuelta en esta ronda.

---

## Ronda 1 (histórico) — CHANGES_REQUESTED

Alcance: solo lo nuevo de este slug (sin commitear en `feature/web-admin-api-client`, encima de los slugs 1–8 aprobados).
Archivos del slug: `lib/api/types.ts`, `lib/api/validate-content.ts`, `lib/projects/images.ts`, `components/project-card.tsx`,
`components/project-featured.tsx` + `.module.css`, `components/projects.tsx`, `components/home-view.tsx`, `app/[[...slug]]/page.tsx`,
`tests/fixtures/content.ts` y sus tests (`validate-content.test.ts`, `images.test.ts`, `projects.test.tsx`, `home-view.test.tsx`,
`next.config.test.ts` T418, `tests/source.test.ts` T419, `tests/runtime/pages.test.ts` T416/T417).

## Verificación ejecutable (Node 22.23.1)
- `npm run lint` ✔ · `npm run typecheck` ✔ · `npm test` ✔ (149 archivos, 683 tests) · `npm run build` ✔ (`/[[...slug]]`, `robots.txt`, `sitemap.xml` en `ƒ`).
- Sonda propia en el standalone (`.next/standalone/server.js`) contra una API de scratch hostil (datos de `design-api.mjs`; el proyecto
  own+public con portada `OWNCOVER` + `key` interna + segunda imagen; los employer/anonymous con imágenes `LEAKIMG` + `key`):
  - HTML de `/`, `/servicios/`, `/en/`, `/en/services/`: un solo `<img>` con la portada, `width/height` 1280×720, `loading="lazy"`,
    `decoding="async"`, `style="aspect-ratio:1280 / 720"`; 0 apariciones de `LEAKIMG`, `INTERNALKEY`, la segunda imagen ni `"key"`.
  - Payload RSC de navegación (siguiendo el 307 a `?_rsc`, `text/x-component`, 200): mismo resultado, 0 fugas.
  - Procesos parados (`next-server` y la API de scratch); puertos 4391/4392 libres.

## Trazabilidad Tn ↔ it()
| Tn | it() | Comprobado |
|---|---|---|
| T410 | `validate-content.test.ts` › `T410: images absent or null …` | ausente y `null` → `[]` ✔ |
| T411 | `validate-content.test.ts` › `T411: valid images keep their order …` | orden, solo 4 campos (la `key` se descarta), `alt:''` válido; url no string/null, alt ausente/null, width 0/−3/∞, height 7.5/'720', `images` no lista o con `null` → `null` (500) ✔ |
| T412 | `validate-content.test.ts` › `T412: an employer or anonymous project …` | employer, anonymous y own+anonymous → `[]`, sin URL en el resultado ✔ |
| T413 | `images.test.ts` › `T413 (CO-T32/33/34)` + `extra: credentials` | solo own+public; `javascript:`, `data:`, relativa, sin esquema, `//host`, `ftp:`, `''` → `undefined` **sin caer a la segunda**; `http:` aceptada; credenciales rechazadas ✔ |
| T414 | `projects.test.tsx` › `CO-T32 / T414`, `T414: the alt …`, `T414: … no stack`, `T414: a cover whose url …`, `CO-T34 / T414` | src/alt/width/height/lazy/decoding exactos; alt por idioma y fallback al título (vacío y en blanco); malla sin portada ✔ |
| T415 | `home-view.test.tsx` › `T415: …` + migración de `projects.test.tsx` | sin prop `projectImages`/`images`; portada en ambas páginas ✔ |
| T416 | `pages.test.ts` › `T416 / T417: …` (+ `extra (T416 end to end …)`) | 4 páginas ES/EN, solo la portada en el destacado, 2 cards con malla, `images:[]` → malla, API caída → 500 ✔ |
| T417 | mismo it() | HTML ✔ — **la mitad RSC es vacía (ver CR-1)** |
| T418 | `next.config.test.ts` › `T418: …` | `images` es exactamente `{ unoptimized: true }` ✔ |
| T419 | `source.test.ts` › `T419: …` | sin `public/projects`, `resolveProjectImages` ni plantilla `${project.id}.webp` en `app|components|lib|tests`; la carpeta no existe. `grep` en todo el repo (sin `progress/`, `node_modules`, `.next`): limpio ✔ |

## Trazabilidad criterios ↔ tests
AC24 ← T410–T419 (+ extras). Sin regresión de la web pública sin imágenes: la suite previa pasa con `images: []`; al migrar no se debilitó
ninguna aserción (CO-T32 pasa de `alt` truthy / `width` presente a valores exactos; T44 y CO-T34 solo cambian la firma de `view`).
El antiguo T41 (`public/projects/<id>.webp` responde 200) desaparece con la convención; T416/T417 lo sustituyen.

## Forma de los datos (contra `cv`)
- `ApiModels.ProjectImageDto(url, alt, width, height)`; `url` = `R2_PUBLIC_URL` (sin barra final) + `/` + key (`R2FileStorageAdapter.publicUrl`);
  sin `R2_PUBLIC_URL` el GET público omite las imágenes. `ProjectImage` (dominio): `width/height > 0`, `alt ≤ 200`, `alt` no nulo (puede ser `''`).
  `Project` vacía `images` salvo `OWN`+`PUBLIC`. `lib/api/schema.d.ts`: `ProjectImage { url; alt; width; height }` int32. El parser coincide
  (enteros positivos, `alt` string admitiendo `''`, `key` nunca pasa).

## Privacidad
- Sin teléfono/documento/fecha de nacimiento. Doble barrera: el parser vacía `images` fuera de own+public y `coverOf` vuelve a comprobar `canShowImage`.
- La `key` interna no sale del parser (destructuring de 4 campos). Fixtures ficticios (`media.example.test`, «Captura ficticia N»).
- Probado en el standalone: ni la key ni URLs de employer/anonymous ni la segunda imagen en HTML ni en RSC.

## Desvíos evaluados
1. **Destacado 9:16/360 px → proporción propia con tope 640 px y `contain`**: coherente. El marco 9:16 era la convención de capturas de móvil
   de `public/projects`, que desaparece; con portadas apaisadas recortaba casi todo. Sin CLS: `width/height` + `aspect-ratio` reservan la caja,
   y con `max-height` la caja queda `100% × 640` antes y después de cargar. Matiz estético (no bloqueante): una portada vertical queda con
   bandas transparentes dentro del `border` (no hay `background`); aceptable.
2. **`style={{ aspectRatio }}` inline**: hoy no hay CSP en las páginas públicas (solo `frame-ancestors 'none'` en `/admin`), así que no choca.
   Si algún día se añade `style-src` sin `'unsafe-inline'`, este atributo `style` (y los estilos inline del propio Next) se bloquearían; es
   redundante con lo que el navegador ya deriva de `width/height` + `height:auto`, así que sería trivial quitarlo entonces. Aceptado.
3. **`decoding="async"`**: inocuo y correcto para imágenes bajo el pliegue. Aceptado. (Todas `lazy`: correcto, la sección queda lejos del primer viewport.)

## Web-standards / next.config / CSP
- `images.unoptimized` intacto, sin `remotePatterns`/`domains`/`loader` (T418); `<img>` plano con `eslint-disable` justificado.
- `img-src`: no hay CSP pública, así que nada que ampliar; el dominio de medios se carga sin configuración. Si se introdujera una CSP
  pública, `img-src 'self' <origen de medios>` exigiría conocer el origen en build/runtime (ver recomendación).
- Datos solo por `lib/api`; componentes puros; sin `console.*`; alt por idioma (la API lo da en el `lang` pedido).

## Decisión abierta: confianza en la URL de la API
Opciones y coste:
- **Aceptar tal cual** (cualquier http(s) sin credenciales): coste 0. La API es interna (`cv-api:8080`), y su contenido solo lo escribe Julio
  autenticado; un atacante que controle la API ya controla todo el texto de la web. El filtro actual ya corta `javascript:`/`data:`/relativas.
- **Exigir `https:`**: coste mínimo (una línea en `coverOf` + cambiar el caso `http:` de T413, enmienda del plan). Producción es `https://floreslab.dev`:
  una imagen `http:` sería contenido mixto (Chrome la autoactualiza a https o la bloquea), así que `http:` no aporta nada en producción y solo
  sirve para entornos locales, donde los fakes ya usan `https://media.example.test`.
- **Fijar el dominio (variable de build o constante)**: contradice la regla de "solo `CV_API_URL` y `SITE_URL`" (T422) y el diseño de la API
  (la URL se compone al servir para poder cambiar de dominio de medios sin editar contenido); cambiar el dominio obligaría a reconstruir la web.
- **CSP `img-src`**: es lo único que protege también contra HTML inyectado, pero exige una CSP pública completa (nonces para los scripts
  inline de Next, `style-src`, etc.) y además el dominio — proyecto de seguridad aparte, desproporcionado para este slug.

**Recomendación:** aceptar la confianza en la API **y exigir `https:`** en `coverOf` (defensa en profundidad barata, elimina contenido mixto),
sin fijar dominio ni CSP. Decisión del humano; no bloquea este veredicto.

## Skills consultadas
(Aplicadas como checklist de revisión sobre el diff.)
- `simplify`: `lib/projects/images.ts:19-20` parsea la URL dos veces (`safeHttpUrl` + `new URL`) — trivial, sin hallazgo accionable.
- `next-best-practices`: sin hallazgos (`<img>` plano coherente con `unoptimized`; sin prop de imágenes atravesando RSC; páginas `ƒ`).
- `strict-typing`: sin hallazgos (`positiveInt` como type guard, `ProjectImage` desde `Schemas`, `Pick<>` en `coverOf`; sin `any`).
- `ui-ux-pro-max`: `components/project-featured.module.css:118-124` — vertical con bandas sin fondo dentro del borde (cosmético, aceptado arriba); alt con fallback correcto.
- `testing-strategy`: **`tests/runtime/pages.test.ts:257`** — comprobación RSC vacía (CR-1).
- `seo-audit`: no aplica (no se tocó metadata).

## Checkpoints
- C1 ✔ (lint/typecheck/test/build verdes; build sin API y `ƒ`; sin `console.log` ni código muerto — `resolveProjectImages` y `node:fs` fuera).
- C2 ✗ — CR-1: una aserción del T417 no verifica nada.
- C3 ✔ · C4 ✔ (datos por `lib/api`; imagen rota → 500; API caída → 500; `images:[]` → malla).
- C5 ✔ (sin CLS, alt por idioma, sin token nuevo; verificación visual del implementer a 360/1280 px).
- C6 ✔ (informes en `progress/web-admin/web-admin-public-images/`; `progress/current.md` no tocado por este slug).
- C7: pendiente de autorización humana (no aplica al reviewer).

## Cambios requeridos
- **CR-1 (media) — `tests/runtime/pages.test.ts:257`: la verificación del payload RSC del T416/T417 es vacía.** `get(withImages, spec.path, { headers: { RSC: '1' } })`
  usa `redirect: 'manual'` y el standalone (Next 16) responde **307 → `/?_rsc`** con cuerpo vacío a una petición `RSC: 1` sin `_rsc`
  (comprobado con curl: 307, 0 bytes). Los `not.toContain` sobre `rsc` pasan siempre. Corregir: pedir el payload real (seguir la redirección
  o pedir directamente la `location`) y afirmar `status 200`, `content-type` `text/x-component` y un **control positivo** (que el RSC contiene
  `sampleImage(1, lang).url`) antes de las aserciones negativas. (La sonda manual muestra que hoy no hay fuga; el defecto es del test.)

## Observaciones fuera de alcance
- El mismo patrón vacío existe en **T31** (`pages.test.ts:119`) y **T36** (`pages.test.ts:222`), preexistentes: sus comprobaciones "RSC" tampoco
  leen nada. Recomendado arreglarlo con un helper común (p. ej. `getRsc`) — idealmente en este mismo cambio o en `web-admin-regresion`.
- La fake `toPublic` no filtra imágenes por relation/disclosure (la API real sí); el parser lo cubre (T412). Sin acción.
- Documentación (`web-standards.md`) no menciona aún las portadas desde `images[]`: queda para `web-admin-regresion` (T424/AC30), según el plan.
