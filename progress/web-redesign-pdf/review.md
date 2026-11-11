CHANGES REQUESTED

# Review web-redesign-pdf (ronda 1)

Veredicto: CHANGES_REQUESTED. Lista priorizada:
1. (Alta) El número de página del pie NO se imprime en los PDF reales. Ver "Cambios requeridos" R1.
2. (Media) `DownloadCv` duplica `Cta` (outline + compact ya existen). Ver R2.
3. (Media) Falta cubrir la afirmación de impl.md sobre el nº de página (ningún test lo comprueba; por eso R1 pasó). Ver R1.

## Ejecución (Node 22)
- `npm run lint`: verde. `npm run typecheck`: verde. `npm test`: 59 archivos / 290 tests verdes. `npm run build`: verde (con API caída usa el respaldo y avisa; PDF `/cv-julio-flores-{es,en}.pdf` en la tabla de rutas estáticas).
- `out/cv-julio-flores-{es,en}.pdf`: 26 kB cada uno, 2 páginas A4, Title/Author «Julio Flores», Creator/Producer `cv-web`, fuentes embebidas (Barlow Condensed Bold, Plex Sans Regular/SemiBold, Plex Mono Regular, todas `emb yes sub yes`). `sitemap.xml` y `robots.txt` no mencionan los PDF. Ni teléfono, documento ni fecha en el texto (único match de /tel/ = «satelital»). Enlaces: solo email, LinkedIn y GitHub.

## Inspección visual del PDF (pdftoppm 80 dpi, ES, CV real de 2 páginas)
- Legible y profesional: cabecera Barlow en mayúsculas, regla esmeralda, secciones con subrayado fino, jerarquía puesto/periodo/empresa clara, viñetas correctas, tipografía sobria. Texto en una columna, sin tablas ni iconos, orden lineal en `pdftotext` (cabecera → resumen → experiencia → habilidades → formación → idiomas): ATS-friendly.
- Multipágina correcta: el puesto «Analista de contabilidad» pasa entero a la página 2 (`wrap={false}`), sin cortes a mitad de puesto; las secciones siguientes fluyen. Sin huérfanos de cabecera.
- Defecto: no hay `1/2` / `2/2` en ninguna página (ni en `pdftotext`, ni en `-bbox`, ni a ojo). Ver R1.
- Nit visual: la línea de contacto parte en dos filas (GitHub baja a una segunda línea) con email + LinkedIn largos; en EN `pdftotext` los separa en líneas distintas. Aceptable, no bloquea.

## Chrome DevTools (build servido desde out/)
- 1440 px: «Descargar CV (PDF)» en la columna izquierda de «02 / arquitectura», 192.7×48 px, padding 24, borde 1 px `--line`, `href="/cv-julio-flores-es.pdf"`, atributo `download`; `HEAD` del enlace devuelve 200 `application/pdf`; sin scroll horizontal.
- 390 px (emulate mobile, dpr 2): botón 192.7×48 en x=24..217, una columna, scrollWidth 390 = innerWidth (sin desbordamiento), objetivo ≥44 px.
- `/servicios/` y `/en/services/`: no existe `a[download]` (también confirmado por grep de `out/`); `index.html` y `en/index.html` enlazan cada uno su idioma.

## Trazabilidad Tn ↔ it()
| Tn | it() | Veredicto |
|---|---|---|
| PD-T1 | cv-document.test.tsx «PD-T1» (%PDF-, páginas, nombre, label, summary, 3 puestos, language) | ok |
| PD-T2 | «PD-T2» (cabeceras EN, texto EN, sin cabecera ES) | ok |
| PD-T3 | «PD-T3» (viñetas phases/highlights, orden de secciones) | ok |
| PD-T4 | «PD-T4» (vacíos no dejan cabecera; `impact:[]`) | ok |
| PD-T5 | «PD-T5» (minimalResume, sin undefined/null/líneas vacías) | ok |
| PD-T6 | «PD-T6» (14 puestos, >1 página, cada puesto en una sola página incl. su último highlight) | ok |
| PD-T7 | «PD-T7» (orden lineal de texto) | ok |
| PD-T8 | privacy.test.ts «PD-T8» (centinelas vía `parseResume` + bytes crudos) | ok |
| PD-T9 | «PD-T9» (LinkedIn/GitHub; Twitter y `javascript:` fuera; anotaciones de enlace exactas) | ok |
| PD-T10 | «PD-T10» (title/author/language; creator sin ruta) | ok |
| PD-T11 | fonts.test.ts «PD-T11» (rutas @fontsource existentes, sin `.woff` en el repo) | ok |
| PD-T12 | «PD-T12» (BarlowCondensed-Bold e IBMPlexSans embebidas) | ok |
| PD-T13 | theme.test.ts «PD-T13» (ink/muted/bg/accent vs globals.css) | ok |
| PD-T14 | build-cv-pdf.test.ts «PD-T14» (null + 1 warn con idioma y motivo) | ok |
| PD-T15 | «PD-T15» (memo por idioma) | ok |
| PD-T16 | «PD-T16» (propaga el error de getResume) | ok |
| PD-T17 | «PD-T17» (application/pdf; 404 text/plain con null) | ok |
| PD-T18..T21 | download-cv.test.tsx «PD-T18..T21» | ok (T21 mide el CSS propio; ver R2) |
| PD-T22 | build.test.ts «PD-T22» (<1 MiB, texto ES y EN, language) | ok |
| PD-T23 | «PD-T23» (`a[download]` solo en perfil, href por idioma) | ok |
| PD-T24 | «PD-T24» (centinelas en texto, metadatos y bytes crudos de los PDF y del HTML) | ok |
| PD-T25 | bloque «API down», comentario `PD-T25` dentro de BA-T50 (PDF desde el respaldo; sin respaldo falla por BA-T50/CO-T79) | ok (el id vive en un comentario, no en el título del it(); nit de trazabilidad) |
| PD-T26 | «PD-T26» (sitemap y robots sin PDF) | ok |
| PD-T27 | «PD-T27» (4.9.0 exacta y @fontsource 5.3.0 en dependencies) | ok |

## Trazabilidad criterios ↔ tests
A1: T1, T12, T22 · A2: T1–T7 · A3: T8–T10, T24 · A4: T15, T16, T25 · A5: T14, T17, T19 · A6: T18–T21, T23 · A7: T11–T13 · A8: T22, T27 · A9: T26. Todos los criterios tienen test; el hueco no está en el plan sino en lo no listado (nº de página, R1).

## Duplicación / reglas del arnés
- `getResume`: único origen (`build-cv-pdf.ts`), sin fetch nuevo. `publicProfiles` compartido con el contacto web. Fuentes: rutas a `node_modules/@fontsource`, sin copias `.woff` (PD-T11). Theme sincronizado con globals.css por test.
- T68/CO-T72: `process.cwd`/`node:path` nuevos solo en `lib/pdf/fonts.ts`; ni `lib/api` ni código `'use client'` los usan (los `node:fs` de `lib/api/cache.ts` y `lib/projects/images.ts` son previos). No hay `process.env` nuevo ni `fetch(` nuevo. `lib/pdf` solo se importa desde route handlers y la página servidor. Sin test que impida `lib/pdf` en cliente más allá de CO-T72 (suficiente).
- Política de fallo: render falla → `null` + `console.warn`, botón omitido; datos faltan → build falla. Cumple PD-A4/A5.
- TS estricto: typecheck verde, sin `any`.
- Sin escritura git (el repo sigue sin commits de la tarea; `git status` solo muestra untracked del trabajo).
- Privacidad: solo email/LinkedIn/GitHub; centinelas verificados en texto, metadatos y bytes.

## Privacidad
Sin hallazgos. Metadatos: Title/Author con el nombre, Creator/Producer `cv-web` (sin rutas locales).

## Skills consultadas
- `simplify`: hallazgo en `components/download-cv.module.css:1-10` y `components/download-cv.tsx` (duplica `.cta/.ctaOutline/.ctaCompact` de `components/ui/ui.module.css:78-101` y de `components/ui/cta.tsx`). R2.
- `next-best-practices`: sin hallazgos (route handlers con `dynamic='force-static'`, sin `[file]` que choque con el catch-all, PDF por `Response`, sin `process.env` fuera de `lib/api`). Nota: `app/cv-julio-flores-*.pdf/route.ts` correcto.
- `strict-typing`: sin hallazgos (sin `any`/`unknown` fuera de `readPdf`, que acota con guardas en `tests/helpers/pdf.ts:35-36`; `as Resume` en tests de privacidad es el único cast, aceptable).
- `seo-audit`: sin hallazgos (los PDF no entran en el sitemap ni en robots; no se tocó metadata de páginas).
- `ui-ux-pro-max` (UI tocada: botón): objetivo táctil 48 px, foco por defecto del navegador (sin `outline:none`), contraste del texto claro sobre fondo oscuro suficiente; sin hallazgos de UX más allá de R2. Falta estilo `:focus-visible` explícito solo si el resto de botones lo definen (hover/focus lo hereda de globals; sin cambios requeridos).
- `testing-strategy`: hallazgo `lib/pdf/cv-document.test.tsx` (sin test de nº de página; PD-T1..T7 no lo cubren). R1.

## Checkpoints C1–C7
- C1: lint, typecheck, test, build verdes; build con API caída + respaldo verde (BA-T50 / PD-T25). Sin `console.log` (T69 verde). Estado: ok.
- C2: todos los Tn con `it()` real; fixtures «Ada Ejemplo». Pero impl.md declara un comportamiento (nº de página) sin test y roto: pendiente (R1).
- C3: ok (sin teléfono/documento/fecha; sin datos reales en fixtures). Nota: `out/` contiene el CV real construido con la caché local; no es repo.
- C4: ok (datos solo por `getResume`; sin respaldo → falla).
- C5: ok en lo tocado (botón 48 px, un solo h1 intacto, sin cambio de metadata).
- C6/C7: no evaluados por el revisor (los hace leader/closer; impl.md existe en `progress/web-redesign-pdf/`).

## Evaluación de las desviaciones
1. **devDep `pdfjs-dist@6.5.438`**: ACEPTADA. Solo en tests, versión exacta, build `legacy` para Node; `pdftotext` no es portable. Sin objeciones.
2. **Plex Mono limitado por el glifo de espacio roto**: funcional pero frágil. Recomendación (no bloqueante, requiere OK humano porque PD-A7 pide registrar mono): NO usar mono en el PDF. Razones: el mono no aporta nada a ATS ni a la lectura impresa; elimina la 4.ª fuente embebida, la regla «solo cadenas sin espacios» que un próximo editor romperá sin darse cuenta (crash de fontkit al medir) y el gotcha en `docs/web-standards.md`. Contacto y nº de página en Plex Sans 8.5/8 pt. Si el humano prefiere mono por identidad visual, mantener, pero añadir un test que falle con un mensaje claro si un `Text` mono contiene espacios.
3. **CSS propio del botón 48/24**: ver R2. Sí duplica `Cta`: `Cta` ya trae `variant="outline"` y `compact` (24 px). Lo único que difiere es `min-height: 48px` (vs 52) y el atributo `download`.
4. **`impact` no impreso**: DECISIÓN: aceptable, mantener fuera. Son cifras de banda de marketing («+9 años», «+20 servicios») sin contexto autosuficiente; los datos relevantes ya están en `summary`, `highlights` y periodos, que sí salen. En un CV ATS de dos páginas, métricas sueltas sin verbo ni contexto aportan poco y se parsean mal. Es decisión del plan (PD-A2); si el humano quiere una línea «Impacto» tras el resumen, es un cambio de PD-A2, no un defecto de este diff.
5. **@fontsource a `dependencies`**: ACEPTADA, exigida por PD-A7/PD-T27 (el build en Cloudflare las lee con `process.cwd()`).

## Cambios requeridos
- **R1 (bloqueante)** `lib/pdf/cv-document.tsx` (último `Text` del `Page`, `style={styles.footer} fixed render={...}`): en los PDF reales de `out/` no aparece «1/2»; `pdftotext` y `-bbox` no devuelven texto bajo y≈800 en ninguna página. impl.md afirma «nº de página `1/2`». Corregir (o retirar el pie y la afirmación) y añadir un test (en cv-document.test.tsx) que, con el fixture `manyJobsResume`, compruebe que cada página contiene su `n/total`. Probable causa a investigar: `render` + `fixed` + `position:'absolute'` con la fuente mono; si se adopta la recomendación de quitar mono (desviación 2), probar primero con Plex Sans.
- **R2** `components/download-cv.tsx` + `components/download-cv.module.css`: eliminar la duplicación. Propuesta más limpia: ampliar `Cta` (`components/ui/cta.tsx`) con `download?: boolean` y una variante de altura (p. ej. `size="sm"` → clase `ctaSm { min-height: 48px }` en `ui.module.css`), y que `DownloadCv` sea `<Cta href variant="outline" compact download size="sm" probe="download-cv">` (o se use `Cta` directamente en `home-view.tsx` y se borre `download-cv.*`). Ajustar PD-T21 para medir la clase de `Cta`. Mientras `ui.test.tsx` cubra los `Cta` actuales, el cambio no altera la paridad del resto (52 px). Nota: el CSS propio tampoco pone `background: var(--bg)` ni `justify-content:center` como `.cta`; otra razón para reutilizar.

## Observaciones fuera de alcance
- `wrap={false}` en cada puesto: un único puesto más largo que una página quedaría recortado/desbordado por react-pdf. Con CVs reales no ocurre (el más largo ocupa ~⅓ de página); si preocupa, `wrap` solo cuando el puesto exceda cierto número de viñetas.
- El aviso «API unavailable» cuando `CV_CACHE_DIR` no existe y falla la escritura de la caché (ya anotado en impl.md, previo).
- Test PD-T25 identificado solo por comentario dentro de BA-T50; nit de trazabilidad.
- `out/` y la caché de la sesión contienen el CV real del autor (no versionado); no es un hallazgo del diff.

# Segunda pasada (ronda 2)

Veredicto: APPROVED. Cambios requeridos: ninguno.

## Ejecución (Node 22)
- lint y typecheck verdes; `npm test`: 59 archivos / 291 tests verdes; `npm run build` verde.
- Nota: en la primera corrida completa falló una vez `HX-T43` (build.test.ts: el build falla nombrando «Services (en)» en vez de «Architecture»; carrera del prerender paralelo de `/` y `/en`). Aislado pasa 3/3 y la suite completa repetida pasó 291/291. Preexistente, fuera del diff (ver Observaciones).

## Verificación
- R1: `cv-document.tsx` sin `lineHeight` en `Page`; pie `Text fixed render` con `position:absolute`. PD-T28 (`cv-document.test.tsx:84`) extrae con pdfjs el texto de cada página real y exige `n/total` (14 puestos multipágina y `1/1` en el de una página): válido, falla si el número no se imprime. PDF real: `pdftotext` muestra «1/2» y «2/2»; render a ojo: pie «1/2»/«2/2» abajo a la izquierda, sin solapes.
- R2: `Cta` gana `download` y `size='sm'` (`.ctaSm` 48 px); `download-cv.*` no existe y no hay referencias (solo `data-probe="download-cv"`). T18–T20 (`home-view-pdf.test.tsx`) conservan href por idioma, `download`, sección arquitectura intacta, ausencia sin PDF y en servicios; T21 (`ui.test.tsx:42`) comprueba `download`, outline, `.ctaSm` 48 (>=44), `.cta` sigue en 52. Hero (`hero.tsx`) usa `Cta` sin `size`: sin regresión.
- Plex Mono: `grep -i mono|plex lib/pdf` solo da `fonts.ts` (Plex Sans) y `fonts.test.ts` (aserción `not.toMatch(/Mono/)`). `pdffonts`: Barlow Condensed Bold, Plex Sans SemiBold/Regular, todas embebidas. analysis.md (`progress/web-redesign/analysis.md` PD-A7 l.911, PD-T11 l.932, PD-T12 l.933) enmendados de forma coherente.
- `Section` (`cv-document.tsx`): cabecera + primera entrada en `View wrap={false}`; resto fluye. En el PDF real «Habilidades» abre la página 2 con su contenido; sin cabeceras huérfanas. Simplify/strict-typing: sin hallazgos (componente pequeño, tipado completo, sin `any`).
- Visual ES (pdftoppm): 2 páginas, legible, sin tofu, espacios correctos, pie con paginado. Privacidad: sin teléfono/documento/fecha.

## Skills consultadas
simplify: sin hallazgos · strict-typing: sin hallazgos (`cv-document.tsx:90` Section tipada) · next-best-practices: sin hallazgos · ui-ux-pro-max: sin hallazgos (`Cta` 48 px >=44) · testing-strategy: sin hallazgos (T28/T21 con aserciones reales).

## Observaciones fuera de alcance
- `HX-T43` es intermitente bajo la suite completa por el orden del primer error en el prerender paralelo; conviene relajar el regex o fijar el orden en otra tarea.
