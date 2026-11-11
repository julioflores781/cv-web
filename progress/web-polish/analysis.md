# Analysis — web-polish (plan mínimo, escrito por el leader)

## Objetivo
Añadir un favicon y ampliar el objetivo táctil del conmutador de idioma a ≥44×44 px, sin cambiar el aspecto del resto.

## Archivos a tocar
- `app/icon.svg` (nuevo): favicon SVG con el prompt `$_` en `--accent` (#39d98a) sobre `--bg` (#0b0f14), esquinas redondeadas. Next.js lo enlaza solo (`<link rel="icon">`) con `output: 'export'`.
- `components/site-header.module.css`: el enlace de idioma pasa a `min-width: 44px; min-height: 44px` con centrado, sin descolocar el menú.
- Tests: `components/site-header.test.tsx` o `app/globals.test.ts` (según convenga) y `tests/build/build.test.ts`.

## Criterios de aceptación
- **P-A1** El build genera una etiqueta `<link rel="icon">` en `/` y en `/en/`, y el archivo del icono existe en `out/`.
- **P-A2** El icono usa solo colores de los tokens (`#39d98a`, `#0b0f14`) y no contiene scripts.
- **P-A3** El CSS del conmutador de idioma declara `min-width` y `min-height` ≥ 44px.
- **P-A4** Los tests existentes (T1…T74) siguen en verde; lint, typecheck y build en verde; sin datos privados en `out/` (T62).

## Plan de tests
- `P1` — **Dado** el build de `out/` **cuando** se leen `index.html` y `en/index.html` **entonces** ambos contienen `<link rel="icon"` apuntando a un archivo que existe en `out/`. *(P-A1, build)*
- `P2` — **Dado** el archivo SVG del icono **cuando** se inspecciona **entonces** solo usa los colores de los tokens y no tiene `<script`. *(P-A2, unit)*
- `P3` — **Dado** `site-header.module.css` **cuando** se inspecciona la regla del enlace de idioma **entonces** declara min-width y min-height de al menos 44px. *(P-A3, unit)*

## Consideraciones
Privacidad: el icono no lleva datos. Accesibilidad: el área ampliada no debe romper el foco visible ni `aria-current`. Alternativa descartada: añadir `favicon.ico` binario (el SVG basta y es reproducible).

## Riesgos / dudas
Ninguna que bloquee. Si el min-width cambia visualmente la posición del conmutador, ajustar solo con padding y margen negativo.
