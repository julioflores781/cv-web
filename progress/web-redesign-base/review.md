CHANGES REQUESTED

1. (alto, BA-A6/§2.10.3-2) Anclas tapadas por la cabecera en móvil: `--header-h: 73px` (`app/globals.css:40`, usado en `components/hero.module.css:3` y `components/ui/ui.module.css:5`) es fijo, pero a 390 px la cabecera sticky mide 187 px (logo, enlaces/idioma y toggle en 3 filas; igual en la referencia). Medido: `#contact` queda en `top=72.8px` con la cabecera en 187 px, es decir ~114 px de la sección (eyebrow + h2) quedan ocultos tras saltar a un ancla. Corregir: medir la altura real (variable por breakpoint ≤640 o `scroll-margin-top` calculado) y añadir un test.
2. (medio, C1 «sin código muerto») `isLang` (`lib/i18n/config.ts:7`) no se usa en código de producción; solo lo importa `lib/i18n/i18n.test.ts`. Eliminarlo (y ajustar el test) o usarlo en `routes.ts`.
3. (bajo, exactitud de impl.md) La desviación 7 dice «sin media query ≤640 en cajetín/capas», pero `components/architecture-layers.module.css:83` sí tiene `@media (max-width:640px)`. Solo el cajetín no la tiene. Corregir el texto de impl.md.
4. (bajo, protocolo) La sonda/`spec.mjs` exige `fontFamily` exacta («Barlow Condensed»…) pero la web emite `head|text|mono`. Hoy se mapea a mano en el protocolo; añadir el alias en `spec.mjs`/`probe` (herramienta, no producto) para que BA-T52 sea reproducible sin interpretación. Misma limitación: `toggle-button` mide el primer botón (en Servicios el inactivo) y falla igual en la referencia (2 diffs idénticos en ref y web: no es defecto de la web).

## Veredicto sobre las desviaciones del implementer
1. Alias `--face-*` / familia `head|text|mono`: ACEPTABLE (mismos 7 woff2; BA-T12 y BA-T14 son incompatibles con un único nombre). Ver punto 4.
2. CTA primario a `#contact`: ACEPTABLE (BA-T24 es explícito y prevalece sobre la redacción de BA-A7; la sonda `cta` pasa).
3. Copy de capas sin Prisma/TypeORM/Auth0/WebSocket/Docker ni «Java 17+/TypeScript»: ACEPTABLE (datos no verificables; el contenido real llega de la API; el stack sí los muestra desde `skills`).
4. Sin media query en cajetín: ACEPTABLE (la rejilla `auto-fit minmax(min(200px,100%),1fr)` es 1 columna a 390 y es la del spec; la referencia se ve igual). Capas sí la tienen (punto 3).
5. Resto (contacto sin formulario, formación en timeline, logo, idioma, impacto en `--ink`): coherentes con el plan/D2/D7; sin objeción.

## Ejecución (Node 22.x)
`npm run lint` OK (0 avisos) · `npm run typecheck` OK · `npm test` 32 archivos / 127 tests OK · `npm run build` OK (con API real/respaldo, y con `design-api`). Warning de consola solo: preload de CSS no usado a los pocos segundos (comportamiento de Next, sin errores). Sin git de escritura (`git status` solo lectura).

## Trazabilidad Tn ↔ it()
BA-T1…T51: todos tienen un `it()` con su etiqueta `BA-Tn` en los archivos del mapa de impl.md (verificado con grep, ninguno huérfano); BA-T52 es protocolo (abajo). Muestreo de contenido real: T16 (un único bloque reduced-motion `*{animation:none;transition:none}` y módulos sin el suyo, outline en `:focus-visible`), T17 (≤640 en hero, impacto y ui; sin anchos fijos >320 sin max-width), T18 (≥44), T21, T22 (todas las combinaciones de secciones presentes/ausentes), T37 (numeración sin huecos, 3 casos), T38 (único `.inner` con 1280/96px 24px): hacen lo que dice la descripción. Cobertura extra legítima (routeSlug, initials, BA-A9, etc.).
## Criterios ↔ tests
A1–A17 mapeados (impl.md «Criterio → tests») y confirmados contra los `it()`; A14 y A17 por protocolo + T17. Sin criterio sin cobertura.

## Privacidad
`grep` de teléfono/documento/nacimiento en `out/*.html` sin coincidencias; fixtures ficticios (Ada Ejemplo); BA-T48 con centinelas en `tests/build`. Datos solo vía `lib/api` (sin `fetch` en componentes; único `console.warn` en `lib/api/get-resume.ts:27`, aviso intencional del respaldo).

## Código duplicado / muerto / tokens
- Hex/rgb fuera de `app/globals.css` en `.css` de `app/` y `components/`: ninguno. Tokens únicos en `globals.css`.
- Componentes `ui/` únicos (`SectionShell`, `SectionHead`, `Eyebrow`, `Cta`, `HexMark`); los 19 módulos CSS referenciados y sin clases sin usar; `.hex` global compartido.
- Muerto: solo `isLang` (punto 2). TS estricto: sin `any`/`@ts-ignore`/`as unknown` en código de producción.

## BA-T52 — paridad visual (Chrome DevTools, hecha por el reviewer)
Servidos: `design-api` :4020 → build → `out/` en :4030; referencia en :4010 (`perfil.html`, `servicios.html`). 1440×900 y 390×844 mobile, DPR 1.
- Sonda contra `spec.mjs` (`expectedAt`, tolerancias §2.10.2), claves construidas: **Perfil 1440: 130 comprobaciones, 0 diferencias; Perfil 390: 130, 0; Servicios 1440: 93, 0 reales; Servicios 390: 93, 0 reales** (única discrepancia: `toggle-button` color/fondo, idéntica en la referencia: artefacto de la sonda, no de la web). La referencia pasa sus 201/205 comprobaciones con el mismo script (solo esas 2). Únicas diferencias de `fontFamily`: el alias.
- Claves no construidas en este slice (esperado: HX/CO): `plano, core, node, legend, panel*, featured*, card*, contact-form*, service-card*, aside*, process*`, y en Servicios `section/section-alt/h2/cta-secondary`.
- `npm run parity:diff` por bandas de 400 px: FALLA en las 4 combinaciones (banda 0: 19.5 % Perfil 1440, 12.1 % Perfil 390, 17.6 % Servicios 1440, 13.6 % Servicios 390; alturas web 2942/4533/1511/2113 vs ref 4533/8096/4645/8844). No es un defecto de este slice: la referencia incluye plano, proyectos, formulario y servicios (HX/CO) y el hero a dos columnas, y la web aplica D4 (una columna, h1 a todo el ancho). No son comparables píxel a píxel hasta HX/CO; se deja para PA. Capturas y diffs en `design/artifact-v2/.shots/rv-{ref,web}-{perfil,servicios}-{1440,390}.png`, `rv-diff-*.png`, JSON `rv-*.json` y sondas en `.shots/probes/`.
- Revisión visual: orden de secciones y numeración (01/02/03 en Perfil; 01 contacto en Servicios), cajetín (incluida la apilación a 390, igual que la referencia), impacto, timeline, capas A–A′ y stack: coherentes con el diseño. Hex de fondo visible y en el modo correcto; confirmación humana PA-A7 sigue pendiente.
- Sin desbordamiento horizontal a 390 (`scrollWidth 390 = innerWidth`, Perfil y Servicios).
- Foco por teclado: skip link → logo → «contacto»…; `:focus-visible` con outline 2px, `currentColor`, offset 3px visible; destinos ≥44×44 (EN, ES, toggle, logo, CTAs 52).
- `prefers-reduced-motion: reduce` emulado: 0 elementos con `transition`/`animation` > 0.
- Un `h1`, landmarks header/nav/main/footer. Consola: sin errores.

## Skills consultadas
Se aplicaron los criterios de cada una al diff sin lanzar la herramienta `Skill`; hallazgos:
- `simplify`: `lib/i18n/config.ts:7` (`isLang` muerto).
- `next-best-practices`: sin hallazgos (SSG con `generateStaticParams`, metadata por ruta, `next/font/local`).
- `strict-typing`: sin hallazgos.
- `seo-audit`: sin hallazgos (canonical, hreflang recíprocos, sitemap de 4 URLs verificados por BA-T3…T6/T46 y en `out/`).
- `ui-ux-pro-max`: `app/globals.css:40` (scroll-margin con cabecera móvil de 187 px).

## Checkpoints
C1 parcial (muerto `isLang`) · C2 OK · C3 OK · C4 OK (T50 con respaldo/sin respaldo en verde) · C5 parcial (anclas en móvil; contraste/foco/reduced-motion/h1/SEO OK) · C6 OK · C7 no aplica aún.

## Observaciones fuera de alcance
- Aviso de preload de CSS no usado (Next 16, servidor estático Python).
- La cabecera ocupa 187 px sticky a 390 (también en la referencia): decisión de diseño; considerar revisarla en PA.
- Pendiente humano: PA-A7 (fondo hexagonal frente al artifact en claude.ai).

## Segunda pasada
APPROVED. Verificado en código y en Chrome DevTools (build servido de `out/`):
1. Anclas: `components/header-offset.tsx` (ResizeObserver, limpia al desmontar) montado en `site-header.tsx`; `hero.module.css:3` y `ui.module.css:5` usan `var(--header-h)`. 390 px: cabecera 187, `--header-h` 187px, `#contact` en top 187.5. 1440 px: cabecera 75, `--header-h` 75px, scroll-margin 75px. Test BA-T53 presente y verde.
2. `isLang`: sin referencias en `app`, `components`, `lib`, `tests`, `scripts`.
3. impl.md: desviación 7 correcta (solo cajetín sin media query; `architecture-layers.module.css:83` la tiene; `cajetin.module.css` sin `@media`).
4. Alias de fuente: normalización `head|text|mono` a Barlow Condensed / IBM Plex Sans / IBM Plex Mono en `scripts/parity/probe.mjs:41-44` (lado web). Sin duplicación ni regresiones nuevas.
Node 22: lint 0 avisos, typecheck OK, test 33 archivos / 128 tests OK, build OK.
Nota menor (no bloqueante): el alias vive en `probe.mjs`, no en `spec.mjs`; cumple el objetivo de reproducibilidad.
