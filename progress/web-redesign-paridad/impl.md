# Impl — web-redesign-paridad (PA)

Node 22.23.1. `npm run lint`, `npm run typecheck` y `npm test` (60 archivos, 306 tests) verdes; `npm test` corrido 3 veces seguidas completas: 306/306 las tres. Build con `design-api` (puerto 4020) OK; build con la API caída y respaldo guardado: exit 0 (10 avisos «API unavailable … saved fallback copy»). Sin git de escritura. Evidencia en `design/artifact-v2/.shots/` (prefijo `pa-`; nada existente se tocó).

## 1. Test intermitente HX-T43: causa raíz (dos carreras, ambas corregidas)
1. **Causa principal (`lib/api/cache.ts`)**: `writeJson` nombraba el temporal `<archivo>.<pid>.<Date.now()>.tmp`. Dos escrituras del mismo recurso en el mismo proceso y milisegundo compartían nombre; la segunda `rename` fallaba con `ENOENT`, el `try` de `load` lo tomaba como «API caída» y el build caía al respaldo (o fallaba con «unavailable» si no había). Reproducido de forma determinista con 50 `writeJson` concurrentes (falla con `Date.now()`, pasa con `randomUUID()`). Test extra: `lib/api/cache.test.ts` «concurrent writes…».
2. **Causa secundaria (el propio test HX-T43)**: su servidor respondía 404 a architecture, services y projects. La página carga los 4 recursos con `Promise.all` y el build informa el primero que rechaza, así que el regex `Architecture (es|en) unavailable` dependía del orden. Ahora el servidor solo omite architecture (`tests/build/build.test.ts`).

## 2. Defectos de paridad corregidos (todos con test)
| # | Defecto | Corrección | Test |
|---|---|---|---|
| P1 | Contenedores 1280 en `border-box` (contenido 1232 en vez de 1280; x=104 en vez de 80). `Main.dc.html` no tiene `box-sizing` global (solo `body{margin:0}`) y marca `border-box` a mano solo en 4 elementos: el diseño es content-box 1328 (1280 + 24 por lado). Se igualó la web | `box-sizing:content-box` en nav, hero, cajetín, franja, shell de sección y pie | `components/containers.module.test.ts` |
| P2 | CTA secundario y campos de formulario 2 px más bajos (min-height + borde: 54 / 50) | content-box en `.ctaOutline` y `.field` | ídem |
| P3 | Aside «Tu encargo» 445 px (diseño 482.7): su `flex-basis:300` + padding 28 es content-box | `box-sizing:content-box` en `.aside` | ídem |
| P4 | Columnas de trayectoria y de capas A–A′: el diseño suma padding/borde a la base 520 (549 y 570) | `SectionBody frame="ruled"|"boxed"` | ídem |
| P5 | Servicios sin «Ver proyectos» en el hero (§6 línea 510 lo pide) | `hasProjects` + `dict.hero.services.projectsCta` | `components/hero.test.tsx` «extra (PA)» |
| P6 | Cabecera a 390 con `gap 8px 16px` (203 vs 187 px) | quitado el `@media (max-width:640px)`; ahora 203 = diseño | medido (sonda, anclas) |
| P7 | **Respuestas de la API cacheadas por Next** (`.next/cache/fetch-cache`, que Cloudflare persiste): un rebuild publicaba contenido viejo (comprobado: la API daba 3 proyectos, el build 2). `cache:'no-store'` no sirve (el export cae al respaldo). La petición pasa a `node:http(s)` | `lib/api/request.ts` | `request.test.ts` «do not go through the global fetch» |
| P8 | Error de conexión rechazada con mensaje vacío (`AggregateError`) | `describeError` | `request.test.ts` «refused connection» |
| P9 | Aviso de consola «preloaded … not used» en todas las páginas (CSS module de `not-found`) | estilo en línea en `app/not-found.tsx`; borrado `not-found.module.css` | `tests/source.test.ts` «extra (PA)» |
| P10 | Spec: `toggle-button` medía el botón inactivo en Servicios | selector del segmento activo (`aria-pressed=true` / `aria-current=page`) | `scripts/parity/spec.test.ts` (RF-T8 admite calificador) |
| P11 | `design-data.json` solo daba 1 tarjeta (el diseño tiene 2) | 3 proyectos (destacado + 2) | `design-api.test.ts` sigue verde |

## 3. Métricas (PA-A1; PA-T1–T4)
Sonda `evaluate_script` (`scripts/parity/probe.mjs`, 402 / 410 comprobaciones por página, ref y web contra `spec.mjs`): **0 fallos en las 4 combinaciones**. h1 120.96 / 56 px, h2 64 / 40, plano 540×540 / 342×342, núcleo 162 / 102.6 px, `--bg`/`--ink`/acento exactos en Servicios. JSON: `pa-{ref,web}-{perfil,servicios}-{1440,390}.json` (+ `-sections.json`); scripts en `.shots/probes/pa-*.js`.

Diferencia de cajas ref→web restante (> 2 px) solo en elementos afectados por D2/D6/D7/D8 y por copy (CTA de Perfil «Escríbeme/Ver trayectoria», etiquetas del núcleo, h2).

## 4. Diff por bandas de 400 px (PA-A2; PA-T5)
El diff de página entera no es comparable (D6/D7/D8 desplazan todo). Se alinea **por sección** (`pa-diff-<modo>-<ancho>.png`, bandas de 400 px dentro de cada sección; `pa-summary.txt`). Altura de sección (ref → web) y % por banda:

| Combinación / sección | alto ref→web | bandas % | Motivo si > 3 % |
|---|---|---|---|
| Perfil 1440 cabecera | 75→75 | 0.5 | |
| Perfil 1440 hero | 1054→1054 | 4.6 5.5 1.3 | D6 (plano 31.6 px más arriba: el panel crece 63 px y la columna se centra), D2, copy. **Plano alineado: 0.14 %** (`pa-diff-perfil-1440-plane.png`) |
| Perfil 1440 trayectoria | 557→542 | 5.4 3.6 | D5 (h2), placeholders `[AÑOS]` del diseño no publicados, D7 formación |
| Perfil 1440 arquitectura | 575→845 | 7.1 7 4.2 | D7 stack (+270); copy de capas (la del diseño trae tecnologías no verificables) |
| Perfil 1440 proyectos | 1528→1528 | 4.3 3.7 1.4 2.9 | D8 (sin «plano del sistema»), copy |
| Perfil 1440 contacto | 665→690 | 0.9 8.2 | E1/E2 (contador y email) |
| Perfil 1440 pie | 78→78 | 2.1 | |
| Servicios 1440 cabecera/servicios/proceso/proyectos/pie | 75=75 · 815=815 · 522=522 · 1528=1528 · 78=78 | 0.5 · 1.0 1.3 13.3* · 0.4 1.0 · 5.0 4.2 1.4 2.3 · 1.0 | *banda de 15 px; proyectos: D8 y copy |
| Servicios 1440 hero | 951→1015 | 11.6 11.2 3.7 | D6 (+64), copy del núcleo/plano; plano alineado 1.07 % |
| Servicios 1440 contacto | 676→690 | 0.8 8.1 | E1/E2 |
| Perfil 390 | cab 203=203 · hero 1676→1739 · trayectoria 944→605 · arq. 1181→1489 · proyectos 2982→2539 · contacto 980→979 · pie 131→111 | 0.2 · ≤4.0 · 7.4 · 11.3 · 16.4 · 3.4 · 15.5 | hero D6 (+63); trayectoria: placeholders; arq. D7; proyectos D8 (−443); pie: copy más corta («Hecho con Astro…» vs «Hecho con Next.js…») |
| Servicios 390 | cab 203=203 · hero 1732→1795 · servicios 1734=1734 · proceso 976=976 · proyectos 2982→2539 · contacto 1086→1111 | 0.1 · ≤4.4 · ≤3.6 · ≤1.6 · ≤16.4 · 12.9 | D6, D8, E1/E2, pie |

Las secciones de Servicios que no tienen desviación (servicios, proceso) quedan en 0.3–3.6 %. El resto de bandas > 3 % se debe a copy distinto (la web publica datos de la API, no los del diseño) o a D2/D6/D7/D8.

## 5. Aside 429 vs 483 y hero 31 px (investigados)
- Aside: causa P3 (content-box del diseño). Ahora 482 px, `dw 0` contra la referencia; tarjetas 378 px, `dw 0`.
- Hero: el panel mide 63 px más por D6; como la columna derecha se centra, el plano sube 31.6 px en Perfil (en Servicios la izquierda es más alta y no se desplaza). Con el plano alineado la diferencia es 0.14 % (Perfil) y 1.07 % (Servicios, etiquetas distintas).

## 6. Desviaciones restantes
D1 nodos ≥ 12 px (a 390: 12 vs 11) · D2 enlace ES/EN (−112 px en `navlinks`) · D3 mismo plano en ambos modos (datos de la API) · D4 sin puertos, hero de 1 columna (no ejercitada aquí) · D5 h2 sin «Ocho años» · D6 fila extra en el panel (+63 px) y `--line-input` en obra · D7 franja de impacto (+149 px), stack (+270 px), formación · D8 proyectos sin captura ni «plano del sistema» (−443 px a 390) · D9 iniciales de `profile.name`.

**Diferencias que no están en D1–D9 y que dejo para decisión humana** (extensiones aprobadas en el plan, no defectos de implementación): E1 contador `n/2000` bajo el mensaje (CO-A6/A8, +21 px); E2 enlace `mailto:` en el contacto (BA-A11); E3 hero de Perfil con «Ver trayectoria» en lugar del secundario del diseño (BA-T24); E4 leyenda del plano con muestras dibujadas en vez de los caracteres `— - ■`. Observación: al elegir un nodo cuyo texto ocupa dos líneas el panel crece y el plano se desplaza 12 px (el diseño centra igual la columna); no se tocó.

## 7. Checklist §2.10.3 (PA-A3; PA-T6)
| Punto | Resultado |
|---|---|
| 1 orden/numeración | Perfil 01 trayectoria · 02 arquitectura · 03 proyectos · 04 contacto; Servicios 01 servicios · 02 proceso · 03 proyectos · 04 contacto (`pa-*-full` capturas) |
| 2 cabecera sticky / anclas | `scroll-margin` = alto de cabecera: destino a 75 px (1440) y 203 px (390), igual a la cabecera; «contacto» queda a 132 por fin de página |
| 3 hero / plano | alineados (secciones 3–5); a 390 el plano es 342×342 y el núcleo 102.6 px |
| 4 plano nodos 1/3/6 | clic y teclado (Enter, Space): `01/06 Quarkus`, `03/06 Auth0`, `06/06 Docker`, `aria-pressed` correcto, nodo seleccionado `rgb(198,242,78)`, línea `flow` presente, **núcleo inmóvil** (dx 210, dy 176.5 / 112 a 390 constantes); `pa-web-perfil-1440-node6-kbd.png` |
| 5 servicios | S-01…S-04: borde 2 px acento + sombra 8 px 8 px + «incluido», aside y línea `selección →` se actualizan; envío con 3 marcados: cuerpo `Servicios de interés: APIs y backend + Autenticación segura + IA y modernización\n\n<texto>`, contador 0/1918 |
| 6 proyectos | destacado y 2 tarjetas 628×493 como el diseño (sección 4) |
| 7 contacto | vacío → 3 errores y foco al primero; email mal → «Revisa el email…»; éxito → `status` «Mensaje enviado…» y campos vaciados; 429 → «Has enviado demasiados mensajes…» con datos conservados y email de salida (`pa-web-perfil-1440-contact-429.png`). Servidor: **API falsa local** (`/private/tmp/...` en la sesión; no hay Docker, sin `quarkus:dev`), con `application/problem+json`, no la API real. El POST lleva `name,email,message,website` |
| 8 foco / movimiento | 29 controles enfocables en Servicios: 23 con outline 2 px, 6 nodos con inversión de color; `prefers-reduced-motion: reduce`: `flow` `none`, transición del nodo `0s`, 0 animaciones; sin reducción: `flow` activo, transición 0.2 s |
| PA-A4 / PA-T7 sin desbordamiento a 390 | `scrollWidth 390 = innerWidth 390` en Perfil y Servicios; sin controles < 44 px |
| 9 humano | **NO declarado**. Pendiente: abrir el artifact en claude.ai junto a la web y comparar fondo hexagonal, tipografía y color. Preparado: `pa-sbs-perfil-1440-top.png` y `pa-sbs-servicios-1440-top.png` (referencia a la izquierda, web a la derecha; ambas usan el SVG propio, no el blob original). Riesgo: si claude.ai aplicara un reset `border-box` global que no vemos en el `.dc.html`, P1–P4 irían al revés |

## 8. Lighthouse y consola (PA-A5; PA-T8)
`lighthouse_audit` navegación, escritorio y móvil, en `/`, `/servicios/`, `/en/`, `/en/services/`: Accesibilidad 100, Buenas prácticas 100, SEO 100, 58 aprobadas / 0 fallos en las 8 (`.shots/lighthouse/<página>-<dispositivo>/report.{json,html}`). `list_console_messages`: sin mensajes en las 4 páginas tras P9.

## 9. Tests extra fuera del plan
`cache.test.ts` (escrituras concurrentes), `containers.module.test.ts`, `hero.test.tsx` (Ver proyectos), `request.test.ts` (sin `fetch` global; ECONNREFUSED), `source.test.ts` (not-found sin CSS module). Mapa del plan: PA-T1–T4 sonda (sección 3) · PA-T5 diff (4) · PA-T6 checklist (7) · PA-T7 (7) · PA-T8 (8) · PA-T9 (6) · PA-T10 pendiente humano · PA-T11 (cabecera).
