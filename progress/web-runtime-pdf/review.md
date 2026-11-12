# web-runtime-pdf — review (ronda 1)

## Veredicto final: APPROVED (ronda 2)

Ronda 2: ambas correcciones verificadas en código (`lib/pdf/build-cv-pdf.ts:49-50,59` calcula `contentHash` una vez y `cacheKey(lang, hash)` en `cache-key.ts`; `lib/pdf/response.ts:18,23` con `request: Request` obligatorio y sin `?.`). Node 22: lint, typecheck, build verdes; `npm test` x2: 69 archivos, 312 tests verdes. "Cambios requeridos" queda vacío; sin hallazgos nuevos.

## Ronda 1 (histórico): CHANGES_REQUESTED

Funcionalmente todo correcto (verificado en real); un único smell accionable (duplicación) fuerza el rechazo según la regla «sin nits».

## Verificación (Node 22.23.1)
- `npm run lint`, `npm run typecheck`, `npm run build`: verdes. Build: `/cv-julio-flores-{es,en}.pdf` salen como `ƒ` (dinámicas).
- `npm test` x2: 69 archivos, 312 tests, verdes las dos veces.
- Standalone real con API falsa (sentinelas de teléfono/DNI/nacimiento) y curl:
  - es/en: 200, `%PDF-`, `application/pdf`, `Cache-Control: no-cache`, `Content-Disposition: inline; filename="cv-julio-flores-<lang>.pdf"`, `ETag` = sha256 entre comillas (distinto por idioma).
  - `If-None-Match` igual -> 304 sin cuerpo (con ETag y no-cache); distinto -> 200.
  - Cambio de resumen en la API -> misma URL con `If-None-Match` viejo da 200, ETag nuevo y texto nuevo.
  - API caída (503) -> 500 en es (con PDF en memoria) y en en; al volver la API, 200. Cuerpo del 500 vacío (no filtra la URL).
  - Privacidad: 0 apariciones de «SENTINEL» en los bytes; texto con solo email/LinkedIn/GitHub; metadatos: Title «Ada Ejemplo — CV», Author «Ada Ejemplo», Creator/Producer `cv-web`.
  - Visual (`pdftoppm` -> PNG, leído): A4, 1 página, cabecera «ADA EJEMPLO» en Barlow Condensed Bold verde, subtítulo, línea de contacto, secciones con regla, fechas a la derecha, pie «1/1». `pdffonts`: BarlowCondensed-Bold, IBMPlexSans-SemiBold/Regular incrustadas. Mantiene el aspecto.
- `.woff` en el standalone: 208 archivos (5,8 MB) en `.next/standalone/node_modules/@fontsource`, incluidos los 3 que usa `lib/pdf/fonts.ts`.

## Trazabilidad Tn <-> it()
| Tn | it() | Resultado |
|----|------|-----------|
| T57 | `tests/runtime/pdf.test.ts` «T57…» (200, application/pdf, %PDF-, <1 MiB, «ADA EJEMPLO», label propio y no el del otro idioma, `.woff` >=3 en standalone) | OK |
| T58 | `tests/runtime/pdf.test.ts` «T58…» (texto, title/author/creator y bytes latin1 sin centinelas, es y en) | OK |
| T59 | `tests/runtime/pdf.test.ts` «T59…» (solo perfil enlaza su PDF; sitemap/robots sin .pdf) | OK |
| T60 | `lib/pdf/cache-key.test.ts` «T60…» (orden de claves, campo cambiado, anidado, idioma) | OK |
| T61 | `lib/pdf/build-cv-pdf.test.ts` «T61…» (1 render; otro idioma renderiza) | OK |
| T62 | `tests/runtime/pdf.test.ts` «T62…» (texto nuevo, ETag distinto, 304 intermedio) | OK |
| T63 | `build-cv-pdf.test.ts` «T63…» (tope 4, LRU con «touch») | OK |
| T64 | `build-cv-pdf.test.ts` «T64…» (promesa pendiente compartida, 1 invocación) | OK |
| T65 | `build-cv-pdf.test.ts` «T65…» (null + warn, no guardado, re-render) + `response.test.ts` «T65…» (404 text/plain + warn) | OK, ver observación 1 |
| T66 | `tests/runtime/pdf.test.ts` «T66…» (PDF en memoria, API 503 -> >=500, sin URL en cuerpo) | OK |
| T67 | `lib/pdf/response.test.ts` «T67…» (cabeceras, 304 sin cuerpo, `W/`, valor distinto 200) | OK |
| T68 | `tests/source.test.ts` «T68…» (sin unstable_cache/next/cache; `MAX_CACHED_PDFS = n`) | OK |
| T69 | `cv-document`, `fonts`, `theme`, `privacy` tests, sin cambios y verdes | OK |

Extras anotados en impl.md: PD-T14, PD-T16 (legítimos, cubren warn y propagación de error con PDF en memoria).

## Trazabilidad criterios <-> tests
A6: T57–T68 cubiertos. A2 (parte PDF): T62, T66. A8: T58. A14/A15: T68, T69. Sin criterios huérfanos.

## Revisión del diseño pedido
- Clave por contenido (lang + sha256 de JSON con claves ordenadas): `lib/pdf/cache-key.ts:5-24`. `getResume` en cada petición, error propaga: `lib/pdf/build-cv-pdf.ts:48`. OK.
- Mapa LRU acotado a 4 con `Promise<Buffer>` (dedupe), fallo borrado y un único warn: `build-cv-pdf.ts:20-37`. OK.
- ETag/304/no-cache/Content-Disposition/404 text/plain: `lib/pdf/response.ts:18-34`. OK.
- Sin `unstable_cache`/`next/cache`; rutas `force-dynamic`. OK. `outputFileTracingIncludes` reutilizado, no duplicado (`next.config.ts`). OK.

## Privacidad
Sin hallazgos: PDF sin teléfono/documento/nacimiento en texto, metadatos ni bytes (curl real + T58); solo email, LinkedIn, GitHub.

## Skills consultadas
- `simplify`: hallazgo `lib/pdf/build-cv-pdf.ts:49` y `:59` (ver Cambios requeridos 1); `lib/pdf/response.ts:18,23` (Cambios requeridos 2).
- `next-best-practices`: sin hallazgos (route handlers `force-dynamic`, `Request` por parámetro, sin `next/cache`, `Response` con `Uint8Array`).
- `strict-typing`: sin hallazgos (sin `any`; el único `as string` en `build-cv-pdf.ts:30` es sobre `Map.keys().next().value` con tamaño > 4 garantizado, aceptable).
- `seo-audit` y `ui-ux-pro-max`: no aplican (no se tocó metadata ni UI; los PDF siguen fuera del sitemap, T59).
- `testing-strategy`: sin hallazgos (los tests verifican comportamiento real, runtime con standalone).

## Checkpoints
C1 lint/typecheck/test/build verdes, sin console.log (el único `console.warn` es el requerido); el punto «código muerto» queda pendiente por el cambio 2. C2 OK. C3 OK. C4 OK (API caída -> 5xx, nunca PDF distinto). C5 aspecto del PDF intacto; no se tocó UI. C6 informes en `progress/web-runtime-pdf/`. C7 no aplica todavía (cierre al final del plan).

## Cambios requeridos (ronda 1, resueltos en ronda 2; vigentes: ninguno)
1. **Hash calculado dos veces por petición.** `lib/pdf/build-cv-pdf.ts:49` (`cacheKey(lang, resume)`) y `:59` (`contentHash(resume)`) serializan y hashean el mismo `resume`; `cacheKey` ya llama internamente a `contentHash` (`cache-key.ts:21-23`). Calcular el hash una vez en `getCvPdf` y derivar la clave de él (por ejemplo `cacheKey(lang, hash)` o `${lang}:${hash}`), ajustando T60 si cambia la firma, para que cada petición haga un solo `stableStringify` + sha256.
2. **Parámetro opcional sin uso real.** `lib/pdf/response.ts:18,23`: `request?: Request` y `request?.headers…`; las dos rutas (`app/cv-julio-flores-{es,en}.pdf/route.ts:5`) y todos los tests pasan siempre la `Request`. Hacerlo obligatorio y quitar el `?.`/`?? null`.

## Observaciones fuera de alcance
1. T65 «runtime»: el plan pedía unit + runtime; el runtime se cubre con la unidad de `cvPdfResponse` porque no se puede forzar un fallo de render en el standalone con un resume válido. Justificado en impl.md; aceptado.
2. `outputFileTracingIncludes` usa `./node_modules/@fontsource/**/*.woff`: el standalone arrastra 208 `.woff` (5,8 MB) cuando solo se usan 3. Viene de `web-runtime-datos` y el plan lo da por bueno; se podría acotar a los 3 archivos más adelante.
3. `app/[[...slug]]/page.tsx:39` espera el render completo del PDF en cada visita al perfil con contenido nuevo (decisión del plan, §2.3: «el primer render lo paga la primera visita»); además `page.tsx` y la ruta del PDF consultan `getResume` por separado. Diseño aprobado.
