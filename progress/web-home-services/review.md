# Review — web-home-services (ronda 1, 2026-11-24)

Hijo 2/2 de `web-presence`. Fuentes: `progress/web-presence/brief.md` (parte B), `progress/web-presence/analysis.md` («Validación de Julio»,
§0, §1, §3 y §4) e `impl.md`. Diff revisado: la copia de trabajo sin commitear en `feature/nas-autodeploy` (= `develop`, `7b16090`) más
`progress/web-home-services/impl.md`. Quedan fuera:
- `deploy/docker-compose.yml`, el cambio de Watchtower de Julio;
- el bloque `<!-- BEGIN/END:nextjs-agent-rules -->` de `AGENTS.md`, que escribe `next dev`;
- `progress/current.md` y `progress/history.md`, del leader.

La fila `app/` de `AGENTS.md` sí se revisó.

## Veredicto
**APPROVED**

El comportamiento cumple el plan entero, con las decisiones vinculantes de Julio:
- **HS-D1:** no hay enlace nuevo en la cabecera, el segmento se llama «Perfil / CV» / «Profile / CV» y HS-T11 está retirado.
- **HS-D2:** el orden es Servicios · Perfil / CV.

Están verdes lint, typecheck, los 729 tests y el build. No hay ningún smell accionable sobre el diff. Hay una observación para la validación
visual de Julio (HS-D7, punto 1 de «Observaciones»): a 740–780 px (ES) la cabecera gana una fila. No es un cambio requerido, porque arreglarlo
exige tocar el CSS que el plan aprobado deja fuera.

## Verificación ejecutada (Node 22.23.1 vía nvm)
| Comando / comprobación | Resultado |
|---|---|
| `npm run lint` | exit 0, sin avisos |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0: **156 archivos, 729 tests, todos en verde** (25 s; incluye el `next build` del global setup y los tests de runtime) |
| `npm run build` (sin `CV_API_URL` ni `SITE_URL`) | exit 0. Salen `ƒ /[[...slug]]`, `ƒ /sitemap.xml`, `ƒ /robots.txt`, `ƒ /api/*` y `ƒ /cv-julio-flores-{es,en}.pdf`. En `.next/routes-manifest.json` están las dos reglas nuevas, `/servicios/` → `/` y `/en/services/` → `/en/` (`statusCode: 308`), detrás de las dos internas de `trailingSlash`, como prevé §0.3 |
| `git diff --stat` de lo que §3.4 marca como «no se toca» | vacío. Lista: `proxy.ts`, `scripts/`, `app/not-found.tsx`, `lib/pdf`, `lib/seo/{metadata,json-ld}.ts`, `app/sitemap.ts`, `app/robots.ts`, `app/[[...slug]]`, `language-switch.tsx`, `mode-toggle.module.css`, `home-view.tsx`, `globals.css` e `instrumentation.test.ts` |
| `git status` tras las verificaciones | igual que antes: el reviewer no tocó nada |

### Comprobaciones pedidas por el leader (contra el `next dev` del puerto 3100, que siguió en pie)

**Redirecciones** (`curl -sI`):

| Petición | Estado | `Location` | `Refresh` |
|---|---|---|---|
| `/servicios/` | 308 | `/` | `0;url=/` |
| `/en/services/` | 308 | `/en/` | `0;url=/en/` |
| `/servicios` | 308 | `/servicios/` | |
| `/en/services` | 308 | `/en/services/` | |
| `/servicios/?utm_source=x` | 308 | `/?utm_source=x` | |
| `/en/services/?a=1&b=2` | 308 | `/en/?a=1&b=2` | |
| `/SERVICIOS/` | 308 | `/` | |

- Las `Location` son relativas y conservan la query. `/servicios` llega en dos saltos, como prevé HS-D4.
- En el standalone de los tests lo prueban HS-T17 y HS-T18, y también que la API no recibe ninguna petición.

**Las 4 páginas:**
- `/`, `/perfil/`, `/en/` y `/en/profile/` dan 200.
- `/en/perfil/`, `/profile/`, `/fr/` y `/perfil/x/` dan 404.

**Cabecera** (HTML de las 4 páginas, con jsdom):

| Página | Logo | Interruptor (en orden) | `aria-current` |
|---|---|---|---|
| `/` | `#inicio` | `Servicios→/` · `Perfil / CV→/perfil/` | Servicios |
| `/perfil/` | `/` | `Servicios→/` · `Perfil / CV→/perfil/` | Perfil / CV |
| `/en/` | `#inicio` | `Services→/en/` · `Profile / CV→/en/profile/` | Services |
| `/en/profile/` | `/en/` | `Services→/en/` · `Profile / CV→/en/profile/` | Profile / CV |

- En la cabecera, el único enlace al Perfil del idioma de la página es el segmento.
- En los Perfiles hay además el enlace de idioma al Perfil del otro idioma (`hreflang` del otro idioma). Es correcto (nota 6 de `impl.md`).

**Cajetín:** `01 / 02 · Servicios`, `02 / 02 · Perfil`, `01 / 02 · Services` y `02 / 02 · Profile`.

**Canonical, hreflang y `og:url`:** cada página lleva su propia canonical, y `og:url` es igual a la canonical.

| Pareja | es | en | x-default |
|---|---|---|---|
| Servicios | `/` | `/en/` | `/` |
| Perfil | `/perfil/` | `/en/profile/` | `/perfil/` |

**JSON-LD:**
- Hay un `Person` en el HTML del servidor (no se inyecta por JS) en las 4 páginas.
- `url` = `/perfil/` en `/` y `/perfil/`, y `/en/profile/` en `/en/` y `/en/profile/` (`lib/seo/json-ld.ts:29`).

**PDF:**
- `/perfil/` enlaza `cv-julio-flores-es.pdf` y `/en/profile/` enlaza `cv-julio-flores-en.pdf`.
- `/` y `/en/` no enlazan ningún PDF (`app/[[...slug]]/page.tsx:38`; HS-T22).

**Sitemap y robots:**
- `sitemap.xml` tiene exactamente las 4 `<loc>` nuevas, cada una con los 3 `xhtml:link` de su pareja; no aparece ninguna URL vieja.
- `robots.txt` no cambia.

**Smoke del CI:** las tres líneas nuevas (`.github/workflows/ci.yml:118-120`) se ejecutaron en `bash -e` contra el puerto 3100.
- `/perfil/` tiene `<h1`.
- `%{redirect_url}` resuelve la `Location` relativa a `http://localhost:3100/` y a `…/en/`, así que en la CI valdrá `http://localhost:3000/…`.
- Con el servidor caído, la sustitución da `000 ` y se llega a la rama `fail`.
- El shell es correcto y coherente con las líneas vecinas (`-sS` sin `-f`, para leer el 308).
- El paso va antes de «Publish to Docker Hub», así que si fallan las 308 no se publica nada.
- Coincide literalmente con HS-T28.

**Tests que leen las URLs viejas.** Con `grep -rnE "/servicios|/en/services"` sobre `tests app components lib scripts`, la raíz y `.github`,
ningún test lee una página por `/servicios/` o `/en/services/`, salvo los de las redirecciones:
- `pages.test.ts`: HS-T17, HS-T18, el 404 de `/en/servicios/` en HS-T19 y los cuerpos de las 308 en HS-T25;
- `resilience.test.ts`: HS-T24;
- `runtime-pages.ts`: `OLD_SERVICES`.

Las demás coincidencias no leen ninguna página:
- textos esperados: `deploy-files.test.ts`, `source.test.ts` y `next.config.test.ts`;
- `proxy.test.ts:35`: el matcher **no** cubre `/servicios/`;
- `instrumentation.test.ts`: es una ruta de ejemplo para sanear logs (§0.6).

**Revisión visual (HS-D7).** Chrome DevTools MCP no estaba disponible: su perfil lo tenía bloqueado otra instancia. Se usó un Chrome headless
propio (perfil en el scratchpad, cerrado al terminar) por CDP, contra el `next dev`.
- **1440:** cabecera de una fila (75 px). Segmentos de 112 y 128 px (ES) y de 103 y 137 px (EN), de 44 px de alto y sin partir el texto.
- **390 y 360:** «Perfil / CV» / «Profile / CV» cabe en una línea dentro del segmento (128/137 × 44 px), sin scroll horizontal (`scrollWidth` = viewport).
  La cabecera mide 203 px (3 filas), lo mismo que con el texto viejo «Perfil»/«Profile». Se midió cambiando el texto en el DOM: a 360 no salta ninguna línea de más.
- **Barrido de 300 a 1000 px** (cada 2 px), con el texto nuevo frente al viejo: ver la observación 1.

## Juicio sobre las «Desviaciones y notas» de `impl.md`
1. **`components/home-view.test.tsx` (líneas 107 y 190).** Es un cambio **correcto y necesario**, y no pierde cobertura.
   - Antes, el logo de Servicios era `/` y no entraba en `a[href^="#"]`. Con HS-A3 pasa a ser `#inicio`, dentro del mismo `nav`, y las dos aserciones fallaban.
   - §4.2 no lo previó. La intención de las aserciones, «el nav conserva proyectos y contacto», es justo lo que mide el selector nuevo
     `[data-probe="navlinks"]` (los enlaces de sección de `site-header.tsx`).
   - Lo único implícito que se pierde, «no hay otra ancla `#` en el nav», lo cubren otros tests:
     - HS-T8 y HS-T21, el logo exacto;
     - BA-T22 y T46, todas las anclas del nav existen (`#inicio` existe en Servicios, HS-T21).
   - No es un cambio de diseño, así que no había que bloquear.
2. **`components/mode-toggle.tsx`.** Solo cambia el JSDoc, para que no quede desfasado con el orden nuevo. Correcto.
3. **Tests fusionados.** Es un cambio **sólido, sin pérdida de cobertura**. Lo comprobé aserción por aserción contra `git show HEAD:` de cada archivo:

   | Nuevo | Viejo | Qué se conserva |
   |---|---|---|
   | HS-T12 | BA-T27, BA-T28, BA-T29 | Todas sus aserciones; añade el Perfil EN y que las demás celdas son iguales |
   | HS-T13 | BA-T4, BA-T5, T29, T31, T87 | Todas sus aserciones; el title de Servicios pasa de `toContain` a la igualdad exacta con `interpolate`, y la description, de `toBeTruthy` a la de servicios |
   | HS-T14 | T87, BA-T7 (T33) | Todo; añade la privacidad en ES y EN |
   | HS-T15 | BA-T6, T87 | Todo, con `toEqual` en vez de `toMatchObject`, así que también fija el `x-default` |
   | HS-T16 | T27 | Todo |
   | HS-T19 | T28 | Todo; el 308 de `/servicios` → `/servicios/` pasa a HS-T18 |
   | HS-T20 | T29 | Todo |
   | HS-T25 | T31, T36 | Todo, incluido el control positivo del RSC de T36; suma las 308 |
   | HS-T26 | T50, T34 | Todo; T34 sigue cubriendo una página de Servicios y otra de Perfil |
   | HS-T24 | T35, T40 | Todo; el 200 → 500 de T40 se hace sobre `/` tras el cambio de servicio |

   La cuenta cuadra con 732 → 729. Por archivo:

   | Archivo | Cambio | Resultado |
   |---|---|---|
   | `next.config` | +1 | +1 |
   | `site-header` | +2 | +3 |
   | `cajetin` | −2 | +1 |
   | `metadata` | −4 | −3 |
   | `json-ld` | −1 | −4 |
   | `sitemap` | −1 | −5 |
   | `pages` | +1 | −4 |
   | `resilience` | −1 | −5 |
   | `deploy-files` | +1 | −4 |
   | `source` | +1 | **−3** |

   El plan define cada uno de esos Tn como **un** test, y el implementer debe escribirlos «uno a uno», así que la granularidad es la del plan.
   El coste, menor, está en la observación 2.
4. **T240 sin su línea de `redirects`, asumida por HS-T5.** Correcto.
5. **BA-T7 (T34) y (T35) se quedan.** Correcto: no dependen de rutas.
6. **HS-T9 y HS-T21, «ningún otro enlace al Perfil» por idioma.** Es la lectura correcta. La literal del plan, «el único
   `a[href="/perfil/"]` o `a[href="/en/profile/"]` es el segmento», es imposible en los Perfiles, porque el selector de idioma (HS-T10) enlaza
   el Perfil del otro idioma. HS-T9 además fija que esa otra URL es exactamente el enlace de idioma (`hreflang` del otro idioma) y solo en el Perfil.
7. **Idioma de los docs.** Las líneas nuevas siguen el español de `AGENTS.md`, `CLAUDE.md` y `docs/web-standards.md`. Es coherente con el resto de esos archivos.

## Trazabilidad Tn ↔ it()
Hay un `it()` por id, con el id en el nombre. Los reescritos citan el viejo entre paréntesis y ya no queda ningún `it()` con un id sustituido.
El `T27` y el `T28` de `lib/i18n/i18n.test.ts:84,89` son de otro plan.

| Tn | `it()` | ¿Hace lo que dice el plan? |
|---|---|---|
| HS-T1 (BA-T1) | `lib/i18n/routes.test.ts:6` | Sí: `[]`/`undefined` → (es, services), `[perfil]` → (es, profile), `[en]` → (en, services), `[en, profile]` → (en, profile) |
| HS-T2 (BA-T2) | `lib/i18n/routes.test.ts:14` | Sí: los 10 casos del plan, idénticos, dan `null` y además se comprueba que no lanzan |
| HS-T3 (BA-T3) | `lib/i18n/routes.test.ts:22` | Sí: las 4 `routePath` y los dos `alternatesFor` exactos |
| HS-T4 | `lib/i18n/routes.test.ts:31` | Sí: 4 rutas, `routeSlug` inverso de `resolveRoute`, `PAGES = ['services','profile']` |
| HS-T5 (T23, T240) | `next.config.test.ts:6` | Sí: exactamente las dos reglas, sin `statusCode`/`has`/`missing`/`basePath`/`locale`; `standalone`, `trailingSlash`, imágenes sin optimizar y `headers()` solo `/admin/:path*` |
| HS-T6 | `next.config.test.ts:22` | Sí: barra final en los dos lados, `resolveRoute(source)` es `null` y `destination` es Servicios del idioma |
| HS-T7 (BA-T20) | `components/site-header.test.tsx:34` | Sí: el orden y los `href` en ES; en EN, los textos, los `href` y `aria-current` en el Perfil |
| HS-T8 (BA-T21, logo) | `components/site-header.test.tsx:55` | Sí: `#inicio`, `#inicio`, `/` y `/en/` |
| HS-T9 | `components/site-header.test.tsx:69` | Sí, en las 4 páginas a través de `HomeView`. Por idioma (nota 6) |
| HS-T10 (BA-T21, idioma) | `components/site-header.test.tsx:91` | Sí: ES Servicios: EN → `/en/` `hreflang="en"`; EN Perfil: ES → `/perfil/` `hreflang="es"` |
| HS-T11 | — | Retirado (HS-D1). Lo cubre BA-T18 (`app/globals.test.ts:133`, `.segment` ≥44 px), en verde. Medido: el segmento tiene 44 px de alto |
| HS-T12 (BA-T27…T29) | `components/cajetin.test.tsx:20` | Sí (ver la tabla del juicio, punto 3) |
| HS-T13 | `lib/seo/metadata.test.ts:16` | Sí: los tres bloques del plan y las 5 URLs por página con `floreslab.dev` por defecto |
| HS-T14 | `lib/seo/json-ld.test.ts:10` | Sí: `Person.url` es el Perfil del idioma, por defecto y con `SITE`; sin email, `telephone`, `birthDate` ni `taxID` en ES y EN |
| HS-T15 | `app/sitemap.test.ts:7` | Sí: exactamente las 4 URLs, sin `servicios`/`services`, cada una con su pareja y `x-default` |
| HS-T16 (T27) | `tests/runtime/pages.test.ts:34` | Sí: fija también la tabla `PAGES` |
| HS-T17 | `tests/runtime/pages.test.ts:48` | Sí: `Location` exacta (`/`, `/en/`, `/?utm_source=ejemplo`), sin `http` ni los hosts del servidor, de la API o `cv-api`; la API no recibe nada |
| HS-T18 | `tests/runtime/pages.test.ts:61` | Sí: dos saltos 308 y un 200 al final |
| HS-T19 (T28) | `tests/runtime/pages.test.ts:75` | Sí: los 6 404 del plan, `/perfil` y `/en/profile` → 308 con barra, sin llamadas a la API |
| HS-T20 (T29) | `tests/runtime/pages.test.ts:86` | Sí: el title de Servicios exacto en `/` y `/en/`, hreflang de su pareja, `og:url` = canonical, `Person.url` = Perfil del idioma y h1 de `/` ≠ `/perfil/` |
| HS-T21 | `tests/runtime/pages.test.ts:124` | Sí: logo, `#inicio` existe, orden y textos del interruptor, `aria-current`, único enlace al Perfil y hoja del cajetín |
| HS-T22 (T59) | `tests/runtime/pdf.test.ts:75` | Sí: el mapa exacto de PDF por página; ni sitemap ni robots nombran un PDF |
| HS-T23 (T88) | `tests/runtime/domain.test.ts:42` | Sí: canonical `SITE/`, JSON-LD `SITE/perfil/`, 4 `<loc>`, 12 `xhtml:link` y sin `floreslab.dev` |
| HS-T24 (T35, T40) | `tests/runtime/resilience.test.ts:41` | Sí: el cambio se ve, 2 lecturas por recurso y un 503 da 500 sin Ada. Con la API caída desde el inicio, `/perfil/` da 500 sin internals y `/servicios/` da 308 a `/` |
| HS-T25 (T31, T36) | `tests/runtime/pages.test.ts:172` | Sí: centinelas, etiquetas y hosts de la API en HTML, RSC y chunks de las 4 rutas, y en los cuerpos y las cabeceras `Location`/`Refresh` de las 4 respuestas 308 |
| HS-T26 (T50, T34) | `tests/runtime/pages.test.ts:371` | Sí: `empty.services` solo en `/` y `/en/`; una lectura por recurso en `/` y `/en/profile/` |
| HS-T27 | CI (no es vitest) | El texto lo vigila HS-T28 y el reviewer ejecutó las tres líneas contra el dev server (arriba). La ejecución real queda **pendiente del primer push a `main`** |
| HS-T28 | `tests/deploy/deploy-files.test.ts:244` | Sí: las tres líneas literales, y las únicas variables `-e` siguen siendo `CV_API_URL` y `SITE_URL` |
| HS-T29 | `tests/source.test.ts:108` | Sí: `/perfil/` en los tres docs; `/en/profile/` y la frase de las 308 en `AGENTS.md` y `web-standards.md`; la fila `app/` ya no dice «`/` y `/servicios/` en español» |

**Ajuste sin id nuevo:**
- `admin-content.test.ts` (T339, título y lecturas, y el 409), `admin-e2e.test.ts`, `admin-history.test.ts` y `admin-images.test.ts` leen
  Servicios en `/` y `/en/`.
- Las lecturas de proyectos que ya iban a `/` o `/en/` no cambian.
- `admin-gate` y `admin-regression` pasan solos a las rutas nuevas vía `PAGES`.

## Trazabilidad criterios ↔ tests
| Criterio | Tests (verificados) |
|---|---|
| HS-A1 Rutas | HS-T1, HS-T2, HS-T3, HS-T4, HS-T16, HS-T19 |
| HS-A2 Redirecciones | HS-T2, HS-T5, HS-T6, HS-T17, HS-T18, HS-T24 (más el manifiesto del build y `curl` en dev) |
| HS-A3 Logo | HS-T8, HS-T21 |
| HS-A4 Segmento «Perfil / CV» | HS-T7, HS-T9, HS-T21; 44 px por BA-T18 (HS-T11 retirado) |
| HS-A5 Interruptor e idioma | HS-T4, HS-T7, HS-T10, HS-T21 |
| HS-A6 Cajetín | HS-T12, HS-T21 |
| HS-A7 SEO | HS-T3, HS-T13, HS-T14, HS-T15, HS-T20, HS-T23 (robots sin cambio: `app/robots.test.ts` y T91, en verde) |
| HS-A8 PDF | HS-T22 (rutas de los PDF sin cambio: T57, T58, T62 y T66, en verde) |
| HS-A9 Docs, tests y CI | HS-T27 (CI), HS-T28, HS-T29, el ajuste de los tests de admin y el grep de arriba |
| HS-A10 Resiliencia y privacidad | HS-T14, HS-T24, HS-T25, HS-T26 (más T37–T39 sobre `/`, en verde) |

Todos los criterios tienen al menos un test.

## Privacidad
- No entra ningún dato nuevo: el diff solo mueve URLs y cambia dos textos de diccionario.
- Las 308 las responde el router antes de renderizar. Cuerpo, `Location` y `Refresh` no llevan el host del servidor, el de la API ni `cv-api` (HS-T17, HS-T25).
- Los centinelas de teléfono, nacimiento y documento no aparecen en HTML, RSC, chunks ni respuestas 308 (HS-T25). El JSON-LD sigue sin email, `telephone`, `birthDate` ni `taxID` (HS-T14).
- Las líneas añadidas solo nombran esos campos en aserciones negativas.
- Los tests usan solo los fixtures «Ada Ejemplo». No hay datos reales del CV en el diff, en `impl.md` ni en esta review: las comprobaciones contra la API real solo midieron estructura, longitudes y `href`.

## Skills consultadas
- **simplify** (reutilización, simplificación, eficiencia y altitud, sin aplicar arreglos: el reviewer no edita): **sin hallazgos**.
  - *Reutilización:*
    - `components/site-header.test.tsx:10` (`ROUTES`) enumera a mano lo mismo que `allRoutes()`. Se descarta: un test que lista sus propias
      entradas es una elección defendible, y coincide con los bucles de `home-view.test.tsx`.
    - `tests/runtime/pages.test.ts:128-129` repite `PAGES.find(...)`. Son tres usos en tests, con el mismo patrón que `:355`, que ya existía.
  - *Simplificación:*
    - `lib/i18n/routes.ts:17,24-25,32`: un único slug (`PROFILE_SLUG`) y dos ramas.
    - `components/site-header.tsx:25`: una condición invertida.
    - `next.config.ts:15-20`: dos reglas literales.
    - No queda código muerto: `SERVICES_SLUG` desaparece sin restos.
  - *Eficiencia:*
    - Las páginas hacen las mismas 4 lecturas con memo por petición (HS-T26).
    - Las 308 no tocan la API (HS-T17).
    - Los tests no arrancan servidores de más: HS-T24 arranca 2, igual que T35 y T40 por separado, y HS-T26 arranca 2, igual que T50 y T34.
  - *Altitud:*
    - El cambio va en la tabla única de rutas, no en parches por componente. `metadata`, `json-ld`, `sitemap`, `mode-toggle` y `language-switch` lo heredan sin tocarse.
    - El ajuste de `home-view.test.tsx:107,190` mide el contrato (enlaces de sección) en vez de un selector frágil.
- **next-best-practices**: **sin hallazgos**.
  - Usa la redirección permanente nativa (`redirects()` con `permanent: true` → 308), la recomendada para migrar URLs.
    Va en la configuración, no en `permanentRedirect()` dentro de la página, que leería la API antes (§3.9).
  - El orden (redirects antes del sistema de archivos, la barra final y la comparación estricta) está documentado en `next.config.ts:12-14` y comprobado en el manifiesto.
  - No cambian RSC, `'use client'` ni las APIs async. Las páginas siguen `force-dynamic` (`ƒ`). El proxy no interviene.
- **strict-typing**: **sin hallazgos**.
  - Sin `any`, `unknown` ni `@ts-*` en el diff.
  - `PROFILE_SLUG: Record<Lang, string>` y `PAGES … as const` mantienen `PageId` exacto.
  - Los `as HTMLElement`/`as Element`/`as (typeof PAGES)[number]` de `site-header.test.tsx:73` y `pages.test.ts:128-130` son estrechamientos
    de no nulo en tests. Es la convención del repo: más de 130 usos previos, por ejemplo `pages.test.ts:355`.
- **seo-audit** (se tocaron rutas, canonical, hreflang, sitemap y JSON-LD): **sin hallazgos**.
  - Rastreo: `robots.txt` intacto. El sitemap solo tiene URLs canónicas e indexables, las 4, con alternates; las viejas no.
  - Indexación y canónica:
    - canonical propia en las 4 páginas;
    - hreflang recíproco por pareja, con `x-default` español;
    - barra final consistente;
    - redirección permanente 308, que Google trata como 301 (§3.2): consolida las señales de `/servicios/` en `/`;
    - la cadena de dos saltos sin barra está aceptada (HS-D4).
  - On-page: un h1 por página. Los titles son únicos (HS-T20: 4 distintos); el de `/` es el de Servicios (47 caracteres; `/en/`, 42).
    Las descriptions miden ≤160 (Perfil, 160; Servicios, 113 y 110).
  - JSON-LD `Person` en el HTML del servidor (no por JS), con `url` → Perfil.
  - El enlace interno de Servicios al Perfil tiene un texto descriptivo («Perfil / CV»).
- **ui-ux-pro-max** (cabecera e interruptor):
  - **Sin hallazgos que obliguen a cambiar**:
    - objetivos de 44 px;
    - estado activo visible y anunciado (`aria-current`);
    - navegación idéntica en las 4 páginas;
    - el nombre accesible coincide con el texto visible (WCAG 2.5.3);
    - sin scroll horizontal de 300 a 1440;
    - el texto no se parte dentro del segmento ni a 320 px.
  - La fila extra de la cabecera a 740–780 px (ES) y 724–764 px (EN) va a «Observaciones» (punto 1), porque es una consecuencia del texto
    aprobado y del CSS que el plan deja fuera.
- **testing-strategy** (la mayor parte del diff son tests): **sin hallazgos que obliguen a cambiar**.
  - La pirámide está bien repartida:
    - unit: tabla de rutas, configuración, metadata y sitemap;
    - componente: cabecera y cajetín;
    - runtime sobre el standalone real: 308, 404, SEO, privacidad y resiliencia;
    - smoke de la imagen en CI.
  - Los tests prueban comportamiento real, con controles positivos (RSC con el nombre, 200 al final de los saltos) y fixtures ficticios.
  - El coste de agrupar escenarios en un solo `it()` va en «Observaciones» (punto 2).

## Checkpoints
- **C1 Calidad ejecutable:**
  - [x] lint, typecheck y test en verde.
  - [x] build sin API, con páginas, `sitemap.xml` y `robots.txt` en `ƒ`.
  - [x] sin `console.*`, TODO, `.only` ni `.skip` en el diff, y sin código muerto.
- **C2 Cobertura y trazabilidad:**
  - [x] cada HS-A tiene sus tests, y cada HS-Tn su `it()`, salvo HS-T11 (retirado, cubierto por BA-T18) y HS-T27 (CI; texto vigilado por HS-T28, pendiente del primer push a `main`).
  - [x] comportamiento real y fixtures ficticios.
- **C3 Privacidad y contenido:**
  - [x] sin teléfono, documento ni fecha de nacimiento en las páginas ni en las 308 (HS-T25).
  - [x] sin datos reales del CV en el diff.
- **C4 Datos y resiliencia:**
  - [x] los datos solo entran por `lib/api`: no hay ningún `fetch` nuevo.
  - [x] API caída → 500 y 308 que siguen funcionando (HS-T24); estados vacíos en las rutas nuevas (HS-T26); `/api/health` sin cambio.
- **C5 Diseño, accesibilidad y SEO:**
  - [x] no cambia el CSS: solo tokens existentes. Se aparta de la referencia en el orden del interruptor y de las hojas, por decisión de Julio (HS-D2). La validación visual final es de Julio (HS-D5/HS-D7; ver la observación 1).
  - [x] foco y 44 px sin cambios, un h1 y landmarks (HS-T20).
  - [x] `title`, `description`, OG, hreflang ES/EN con `x-default` y JSON-LD `Person` en cada idioma (HS-T13, HS-T20, HS-T23).
- **C6 Estado del arnés:**
  - [x] una sola tarea en curso, descrita en `progress/current.md`.
  - [x] informes en `progress/web-home-services/` (`impl.md` y `review.md`); el plan está en el padre, `progress/web-presence/analysis.md`.
- **C7 Cierre:**
  - [ ] pendiente. Lo hace el `closer` tras el «cerrá web-home-services» de Julio; no le toca al reviewer.
  - Recordatorios para el closer:
    - `deploy/docker-compose.yml` no entra en el commit del slug;
    - de `AGENTS.md` solo entra la fila `app/` (el bloque `nextjs-agent-rules` lo decide el leader);
    - según HS-D5, el PR `develop → main` publica las 308 permanentes vía Watchtower: validar en local antes.

## Cambios requeridos
Ninguno.

## Observaciones fuera de alcance
1. **HS-D7, la cabecera gana una fila en dos franjas de ancho.** Para Julio, en la validación local.
   Se midió con Chrome headless contra el dev server, cambiando en el DOM «Perfil / CV» por «Perfil» y comparando la altura de la cabecera:

   | Páginas | Franja | Antes → ahora |
   |---|---|---|
   | ES (`/`, `/perfil/`) | 740–780 px | 1 → 2 filas (75 → 135 px) |
   | ES (`/`, `/perfil/`) | 552–592 px | 2 → 3 filas (135 → 203 px) |
   | EN (`/en/`, `/en/profile/`) | 724–764 px | 1 → 2 filas (75 → 135 px) |
   | EN (`/en/`, `/en/profile/`) | 536–576 px | 2 → 3 filas (135 → 203 px) |

   - A 768 px en español (tableta vertical) la cabecera `sticky` ocupa 60 px más al hacer scroll.
   - No hay solape, scroll horizontal ni anclas tapadas: `HeaderOffset` recalcula `--header-h` y `scroll-margin-top` lo usa.
   - A 360, 390 y 1440 px no cambia nada.
   - No es un cambio requerido. El texto es decisión de Julio (HS-D1), §3.4 deja `mode-toggle.module.css` fuera y el plan solo pedía revisar
     360 px. Corregirlo, por ejemplo con menos `gap`/`padding` en esa franja, sería un cambio de diseño que Julio tendría que aprobar.
2. **Granularidad de los tests fusionados.** No cambia la cobertura, pero un `it()` que agrupa escenarios independientes corta en la primera
   aserción que falla y oculta las demás:
   - HS-T24 y HS-T26 arrancan dos servidores cada uno; HS-T26 tiene ahora un timeout de 150 s.
   - Para planes futuros, el analyst puede dar un Tn por escenario, o permitir varios `it()` por Tn con el id viejo entre paréntesis, como ya hacía BA-T7 (T33)/(T34)/(T35).
   - Está aceptado aquí porque el plan define cada uno como un solo test.
3. **HS-T27** solo se ejecuta en el job `docker`, en push a `main`. La primera ejecución real es la del PR `develop → main`. El reviewer
   comprobó la semántica de las tres líneas contra el dev server, pero no la imagen.
4. **Documentación del smoke.** `docs/web-standards.md:74` describe el smoke del CI de forma no exhaustiva («incluye …» las dos de `/admin`),
   y no nombra `/perfil/` ni las 308. HS-A9 no lo exige; si se quiere, se añade en una próxima pasada de docs.
5. **HS-D6, ya existente.** La 404 sigue con `lang="es"` y los tokens del Perfil, y su enlace a `/` lleva ahora a Servicios. Fuera de alcance según el plan.
6. **Herramientas.** Chrome DevTools MCP no pudo arrancar porque otra instancia tenía bloqueado su perfil. La revisión visual se hizo con un
   Chrome headless propio por CDP, con el perfil en el scratchpad, y se cerró al terminar.
