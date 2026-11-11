# web-redesign-pdf — implementación

## Mapa Tn → test
- PD-T1..T7 → `lib/pdf/cv-document.test.tsx` (render real + extracción con `pdfjs-dist`, helper `tests/helpers/pdf.ts`).
- PD-T8..T10 → `lib/pdf/privacy.test.ts` · PD-T11, T12 → `lib/pdf/fonts.test.ts` · PD-T13 → `lib/pdf/theme.test.ts`.
- PD-T14..T17 → `lib/pdf/build-cv-pdf.test.ts` (T17 usa `response.ts`).
- PD-T18..T20 → `components/home-view-pdf.test.tsx` · PD-T21 → `components/ui/ui.test.tsx` (el botón es `Cta`).
- PD-T28 (nuevo, R1: nº de página en el PDF real con pdfjs, multipágina y 1 página) → `lib/pdf/cv-document.test.tsx`.
- PD-T22, T23, T24, T26, T27 → `tests/build/build.test.ts` (healthy); PD-T25 → mismo archivo, bloque «API down» (PDF desde el respaldo); sin respaldo falla el build (test BA-T50 existente).

## Criterio → tests
A1: T1, T12, T22 · A2: T1–T7, T28 · A3: T8–T10, T24 · A4: T15, T16, T25 · A5: T14, T17, T19 · A6: T18–T21, T23 · A7: T11–T13 · A8: T22, T27 · A9: T26.

## Archivos
Nuevos: `lib/pdf/{files,fonts,theme,cv-document,build-cv-pdf,response}.ts(x)`, `app/cv-julio-flores-{es,en}.pdf/route.ts`, `tests/helpers/pdf.ts`. Tocados: `package.json`, `lib/i18n/dictionaries.ts` (clave `pdf`), `components/ui/cta.tsx` + `ui.module.css` (props `download`, `size='sm'` → `.ctaSm` 48 px), `components/home-view.tsx` (prop `pdfHref`, `<Cta variant="outline" compact download size="sm">` hijo de `SectionHead`), `app/[[...slug]]/page.tsx`, `tests/fixtures/resume.ts` (`manyJobsResume`), `tests/build/build.test.ts`, `docs/web-standards.md`.

## Desviaciones / notas
1. **Devdep nueva `pdfjs-dist@6.5.438`** (exacta) solo para extraer texto/metadatos en tests (no hay otra lib; `pdftotext` no es portable a CI).
2. **Sin IBM Plex Mono en el PDF** (decisión humano/leader; antes registrada por PD-A7): su `.woff` tiene el glifo de espacio roto. `PDF_FAMILIES`/`PDF_FONT_FILES` solo tienen Barlow Condensed 700 e IBM Plex Sans 400/600; contacto, enlaces y nº de página en Plex Sans. PD-A7/PD-T11/PD-T12 enmendados en `progress/web-redesign/analysis.md` y en los tests (T12 exige que no haya «Mono» embebida); gotcha actualizado en `docs/web-standards.md`.
3. **Botón = `Cta`** (R2): `download-cv.*` borrado. `Cta` gana `download` y `size='sm'` (min-height 48; el 52 por defecto no cambia). Se pierde el `margin-top: 8px` del CSS antiguo.
4. `impact` no se imprime en el PDF (no está en el orden de PD-A2); T4 comprueba que su vacío no deja nada.
5. Las 3 `@fontsource/*` pasaron de devDependencies a dependencies.
6. Observación previa (no tocada): si `CV_CACHE_DIR` no existe, el aviso dice «API unavailable» aunque sea fallo al escribir la caché.

## Ronda 2 (review R1/R2)
- **R1 causa**: un `lineHeight` en el `Page` hace que react-pdf descarte los textos con `render` (reproducido con un documento mínimo; con `fontFamily`, padding, color o fondo sí salen). No es la fuente mono ni `fixed`/`absolute`. Arreglo: sin `lineHeight` en la página (métricas propias de Plex Sans); pie `Text fixed render` con `position:absolute`. El PDF pasa a 2 páginas con «1/2» y «2/2» visibles (`pdftotext`) y, como efecto de medir de otro modo, el encabezado «Habilidades» quedaba huérfano al pie de la pág. 1: `Section` agrupa cabecera + primera entrada en un `View wrap={false}`.
- Test PD-T28 sobre el PDF real (pdfjs): cada página lleva su `n/total` (14 puestos, varias páginas) y `1/1` en el de una página.
- Prettier ejecutado con `--single-quote --print-width 160` sobre `cv-document.tsx` (reformateó los estilos a varias líneas).

## Verificación real
lint, typecheck, `npm test` (59 archivos / 290+ tests) y build verdes. `out/cv-julio-flores-{es,en}.pdf` 2 págs., `pdffonts`: solo Barlow Condensed Bold, Plex Sans Regular/SemiBold (sin mono); `pdftotext -layout` muestra «1/2» y «2/2», sin U+FFFD; `pdftoppm` revisado (sin tofu, sin cabeceras huérfanas); metadatos Title/Author/Creator=cv-web. Renderizado con `pdftoppm` y revisado: legible y sobrio. Chrome 1440 (build servido): `a[download]` único, 192.7×48, padding 24, borde 1px, href ES; hero «Escríbeme»/«Ver trayectoria» 52 px/28 px y los Cta de proyectos 52/24 sin cambios; sin scroll horizontal; `/servicios/` sin `download` (grep del HTML). lint, typecheck, 59 archivos / 291 tests y build verdes (Node 22).
