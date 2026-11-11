# Analysis — web-home

> Informe del `analyst`. No pudo escribirlo en disco (la herramienta se lo rechazó a un subagente); lo guardó el `leader` sin cambios de fondo.

## 0. Lo verificado
- **Contrato** (`openapi.json`, OpenAPI 3.1, v1): `GET /api/v1/resume?lang=es|en` devuelve `Resume`. Los errores son `application/problem+json` (`type`, `title`, `status`, `detail`, `code`). La caché pública dura 5 min.
- **`Resume`**: obligatorios `language`, `profile`, `contact`, `impact[]`, `experience[]`, `skills[]`, `education`, `languages[]`.
  - `profile`: obligatorios solo `name` y `label`. Opcionales o `null`: `tagline`, `city`, `countryCode`, `summary`, `availability`.
  - `contact`: `email` y `profiles[] {network, url}`. `network` es texto libre. No hay teléfono ni fecha de nacimiento.
  - `impact[]`: `{value, text}`, ya formateado.
  - `experience[]`: obligatorios `id`, `company`, `position`, `period`, `phases[]`, `highlights[]`. Opcionales: `location`, `summary`. `period` es `{start:'YYYY-MM', end:string|null, current:boolean}`. Cada fase es `{title, client?}`.
  - `skills[]`: `{key, name, keywords[]}`. La respuesta real trae 6 grupos.
- **`?lang=xx` devuelve HTTP 200 con contenido en `es`.** El cliente debe comprobar que `response.language` coincide con el idioma pedido.
- **Versiones** (`npm view`, 2026-11-04):

| Paquete | Versión | Nota |
|---|---|---|
| next | 16.4.5 | node ≥20.9 |
| react | 19.3.1 | |
| vitest | 5.1.0 | node ^22.12 \|\| ^24 \|\| ≥26 |
| openapi-typescript | 7.13.0 | peer `typescript ^5.x` |
| typescript | 5.9.3 | `latest` es 7.0.2, pero el peer pide 5.x |
| eslint | 10.14.0 | |
| eslint-config-next | 16.4.5 | |
| @testing-library/react | 16.3.3 | |
| @testing-library/jest-dom | 7.0.1 | |
| jsdom | 30.1.3 | |
| @vitejs/plugin-react | 6.2.1 | |

- **Node local:** v20.20.2, que no sirve para Vitest 5 (ver R1).
- **Caché de Cloudflare Pages** (documentación oficial): para Next.js persiste `.next/cache`, más la caché global de npm. No hay forma documentada de cachear directorios propios. Exige el build system V2 o posterior. Se purga 7 días después de la última lectura. Cada proyecto tiene 10 GB.
- **Build estático en Pages:** preset "Next.js (Static HTML Export)", comando `npx next build`, directorio de salida `out`. La documentación no cubre la variable de Node ni `trailingSlash`.
- **Conclusión:** el respaldo debe guardarse en `.next/cache/cv-web/resume-<lang>.json`.

## 1. Objetivo
Crear el proyecto `cv-web` y su home estática: ES en `/` y EN en `/en`. Usa el diseño de la propuesta B (Terminal) y se alimenta en build de `/api/v1/resume`. Si la API cae, el build usa el respaldo en caché; si tampoco hay respaldo, el build falla. Incluye SEO básico, accesibilidad AA y responsive a 360 px y escritorio. No publica ningún dato privado.

## 2. Archivos a crear o tocar

**Raíz**
- `package.json`: scripts `dev`, `build`, `test` (`vitest run`), `lint`, `typecheck` (`tsc --noEmit`) y `generate:api`. `engines.node >=22.12`. Versiones exactas, con TypeScript 5.9.3.
- `.nvmrc` y `.node-version` con `22`.
- `next.config.ts`: `output:'export'`, `images.unoptimized`, `trailingSlash:true` (ver R5).
- `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, alias `@/*`.
- `eslint.config.mjs`: `eslint-config-next` y `no-console`.
- `vitest.config.ts`: react plugin, jsdom, `tests/setup.ts`.
- `.env.example`: `CV_API_URL`, `SITE_URL`, `CV_CACHE_DIR` (esta última solo para tests).
- `.gitignore`: añadir `out/`, `.next/`, `node_modules/` (ya presentes).

**`lib/api`** (única puerta de datos)
- `schema.d.ts`: generado por openapi-typescript y commiteado, porque solo contiene tipos.
- `types.ts`.
- `validate.ts`: guard `isResume` y proyección a los campos conocidos.
- `client.ts`: `fetchResume(lang)` con timeout de 10 s y 2 reintentos. Lanza `ResumeFetchError` si el estado no es 200, el JSON no es válido, falla la forma o `language` no coincide.
- `cache.ts`: lectura y escritura atómica (tmp y rename). Al leer revalida con `isResume`.
- `get-resume.ts`: llama a la API y, si va bien, guarda el respaldo. Si falla, lee el respaldo y emite `console.warn`. Si no hay respaldo, lanza `ResumeUnavailableError`. Memoiza por idioma.
- `config.ts`: único lugar que lee `process.env`.
- `index.ts`.

**`lib/i18n`**: `config.ts`; `dictionaries.ts` (ES y EN, mismas claves); `format.ts` (`formatPeriod`, por ejemplo "2017 — hoy").

**`lib/seo`**: `metadata.ts`; `json-ld.ts` (Person, escapando `<`).

**`components/`** (cada uno con su `.module.css`, sin fetch ni env): `site-header`, `hero`, `impact`, `experience`, `skills`, `contact`, `site-footer`, `json-ld`.

**`app/`**
- `globals.css`: tokens de B.
- `[[...lang]]/layout.tsx`: layout raíz que fija `html lang`.
- `[[...lang]]/page.tsx`: `generateStaticParams` con `[{lang:[]},{lang:['en']}]`, `dynamicParams=false` y `generateMetadata`.
- `sitemap.ts` y `robots.ts`, ambos con `force-static`.
- `not-found.tsx`.

**Tests:** `tests/setup.ts`, `tests/fixtures/resume.ts` (Ada Ejemplo, ES y EN, variantes mínima y de listas vacías), tests junto al código y `tests/build/*.test.ts`.

## 3. Criterios de aceptación
- **A1** lint, typecheck, test y build en verde.
- **A2** `out/index.html` con `lang="es"` y `out/en/index.html` con `lang="en"`.
- **A3** Un solo `h1` y los landmarks header, nav (con nombre), main y footer.
- **A4** La home muestra perfil, resumen, disponibilidad, cifras de impacto, experiencia, skills por grupo, email, LinkedIn y GitHub.
- **A5** No hay botón PDF, demo HL7 ni sección de arquitectura.
- **A6** Opcionales ausentes y listas vacías no rompen el render ni dejan elementos o títulos vacíos.
- **A7** Solo `lib/api` usa `fetch` y `process.env`.
- **A8** Con la API correcta se guarda un respaldo por idioma en `.next/cache/cv-web/`.
- **A9** Si la API cae, da 404, devuelve JSON inválido o un idioma distinto: con respaldo el build pasa y avisa, sin respaldo falla con un mensaje que nombra idioma y causa.
- **A10** Una respuesta inválida nunca se guarda ni se renderiza.
- **A11** El HTML no contiene teléfono, documento ni fecha de nacimiento, aunque la API los enviara.
- **A12** Cada página tiene `title`, `description`, `canonical`, hreflang es/en/x-default recíprocos, Open Graph y JSON-LD Person en su idioma.
- **A13** El sitemap lista `/` y `/en/` con alternates, y `robots.txt` permite todo y apunta al sitemap.
- **A14** Los tokens de B están en `:root` y no hay colores hardcodeados fuera de ellos.
- **A15** `prefers-reduced-motion` apaga el cursor, hay `:focus-visible` y los enlaces externos llevan `rel="noopener noreferrer"`.
- **A16** Contraste ≥ 4.5:1 en los pares de color usados.
- **A17** Sin scroll horizontal a 360 px. La experiencia pasa a una columna con 640 px o menos.
- **A18** Los diccionarios tienen las mismas claves y el conmutador enlaza a la otra ruta.
- **A19** Una ruta desconocida da 404.

## 4. Plan de tests
Los de build ejecutan `next build` real contra un servidor local con los fixtures de Ada Ejemplo (`CV_API_URL`, `CV_CACHE_DIR` temporal y `SITE_URL=https://cv.example.test`).

**Cliente** (`lib/api/client.test.ts`, unit)
- **T1** — **Dado** un 200 con `Resume` válido en `es` **cuando** se llama `fetchResume('es')` **entonces** devuelve el objeto y la URL fue `?lang=es`. *(A4, A7)*
- **T2** — **Dado** un 200 válido en `en` **cuando** se pide `en` **entonces** la query lleva `lang=en` y devuelve contenido en inglés. *(A4, A18)*
- **T3** — **Dado** un 404 `problem+json` (`RESUME_NOT_FOUND`) **cuando** se llama **entonces** lanza `ResumeFetchError` con `code` y estado. *(A9)*
- **T4** — **Dado** un 500 **cuando** se llama **entonces** reintenta y lanza `ResumeFetchError`. *(A9)*
- **T5** — **Dado** un 200 con cuerpo no JSON **cuando** se llama **entonces** lanza `ResumeFetchError`. *(A9, A10)*
- **T6** — **Dado** un 200 al que le falta un campo obligatorio **cuando** se llama **entonces** lanza error de validación. *(A10)*
- **T7** — **Dado** `lang=en` cuya respuesta trae `language:'es'` **cuando** se llama **entonces** lanza error por idioma incoherente. *(A9, A10)*
- **T8** — **Dado** un servidor que excede el timeout **cuando** se llama **entonces** aborta y lanza en tiempo acotado. *(A9)*
- **T9** — **Dado** un puerto cerrado **cuando** se llama **entonces** lanza `ResumeFetchError`. *(A9)*

**Validación** (`lib/api/validate.test.ts`, unit)
- **T10** — **Dado** el fixture completo **cuando** se pasa a `isResume` **entonces** `true`. *(A10)*
- **T11** — **Dado** el fixture mínimo (opcionales ausentes o `null`) **cuando** se valida **entonces** `true`. *(A6)*
- **T12** — **Dado** `null`, un array, un string o `profile.name` numérico **cuando** se valida **entonces** `false`. *(A10)*
- **T13** — **Dado** una respuesta con campos extra (`phone`, `birthDate`) **cuando** el cliente la procesa **entonces** el objeto devuelto los descarta. *(A11)*

**Caché y orquestador** (`lib/api/cache.test.ts`, `get-resume.test.ts`, unit con directorio temporal)
- **T14** — **Dado** la API correcta y la caché vacía **cuando** se llama `getResume('es')` **entonces** devuelve `source:'api'` y existe `resume-es.json`. *(A8)*
- **T15** — **Dado** la API caída y un respaldo válido **cuando** se llama **entonces** devuelve `source:'cache'` y un `console.warn` con idioma y causa. *(A9)*
- **T16** — **Dado** la API caída y sin respaldo **cuando** se llama **entonces** lanza `ResumeUnavailableError` con idioma y causa. *(A9)*
- **T17** — **Dado** la API caída y un respaldo corrupto **cuando** se llama **entonces** lo trata como inexistente y lanza como T16. *(A9, A10)*
- **T18** — **Dado** que la API devuelve datos inválidos y hay un respaldo previo **cuando** se llama **entonces** no sobrescribe el respaldo y usa el anterior. *(A10)*
- **T19** — **Dado** un respaldo solo en `es` y la API caída **cuando** se pide `en` **entonces** falla. *(A9)*
- **T20** — **Dado** una escritura interrumpida (existe el temporal, no el final) **cuando** se lee **entonces** no se toma el temporal como respaldo. *(A8, A10)*
- **T21** — **Dado** dos llamadas seguidas a `getResume('es')` **cuando** se ejecutan **entonces** hay una sola petición HTTP. *(A9)*
- **T22** — **Dado** `CV_CACHE_DIR` sin definir **cuando** se resuelve la ruta **entonces** es `.next/cache/cv-web`. *(A8)*

**i18n** (`lib/i18n/*.test.ts`, unit)
- **T23** — **Dado** los diccionarios ES y EN **cuando** se comparan **entonces** tienen las mismas claves y ninguna cadena vacía. *(A18)*
- **T24** — **Dado** `isLang` **cuando** se evalúa `es`, `en`, `fr`, `''` y `undefined` **entonces** solo los dos primeros son válidos. *(A19)*
- **T25** — **Dado** `langToPath` **cuando** se pide `es` y `en` **entonces** devuelve `/` y `/en/`. *(A2, A18)*
- **T26** — **Dado** `{start:'2017-10', end:null, current:true}` **cuando** se formatea en `es` y `en` **entonces** da "2017 — hoy" y "2017 — Present". *(A4)*
- **T27** — **Dado** `{start:'2014-03', end:'2016-11'}` **cuando** se formatea **entonces** da "2014 — 2016", y con el mismo año en start y end, un solo año. *(A4)*
- **T28** — **Dado** un `start` inesperado (`'2017'` o `''`) **cuando** se formatea **entonces** no lanza ni muestra "NaN" o "undefined". *(A6)*

**SEO** (`lib/seo/*.test.ts`, unit)
- **T29** — **Dado** el fixture ES **cuando** se llama `buildMetadata` **entonces** el título incluye nombre y label, la descripción tiene ≤160 caracteres y el canonical es `${SITE_URL}/`. *(A12)*
- **T30** — **Dado** el fixture EN **cuando** se llama **entonces** el canonical es `${SITE_URL}/en/` y el locale OG es `en_US` (ES: `es_ES`). *(A12)*
- **T31** — **Dado** cualquier idioma **cuando** se construyen los alternates **entonces** incluyen `es`, `en` y `x-default`. *(A12)*
- **T32** — **Dado** el fixture mínimo (sin `summary` ni `tagline`) **cuando** se construye la metadata **entonces** la descripción cae a un texto derivado del label y no queda vacía. *(A6, A12)*
- **T33** — **Dado** el fixture **cuando** se llama `buildPersonJsonLd` **entonces** trae `@type:'Person'`, `name`, `jobTitle`, `url`, `sameAs` e `inLanguage`. *(A12)*
- **T34** — **Dado** un nombre con `</script>` **cuando** se serializa **entonces** la salida no contiene ese literal. *(A12)*
- **T35** — **Dado** el JSON-LD **cuando** se inspeccionan sus claves **entonces** no hay `telephone`, `birthDate` ni `taxID`, y no incluye el email. *(A11)*

**Componentes** (`components/*.test.tsx`, Testing Library)
- **T36** — **Dado** `Hero` con el fixture **cuando** se renderiza **entonces** hay un `h1` con `$ julio --backend --hl7 --fhir`, el cursor es `aria-hidden` y se ven resumen, label y disponibilidad. *(A3, A4)*
- **T37** — **Dado** `Hero` sin `summary`, `tagline` ni `availability` **cuando** se renderiza **entonces** no hay párrafo ni estado vacíos y el `h1` sigue. *(A6)*
- **T38** — **Dado** `Hero` **cuando** se inspeccionan sus enlaces **entonces** el principal es `mailto:` y no hay enlace con "PDF". *(A5)*
- **T39** — **Dado** `Impact` con 4 cifras **cuando** se renderiza **entonces** `value` y `text` aparecen tal cual. *(A4)*
- **T40** — **Dado** `Impact` con lista vacía **cuando** se renderiza **entonces** no renderiza nada, ni el título. *(A6)*
- **T41** — **Dado** `Experience` con 3 entradas **cuando** se renderiza **entonces** muestra empresa (`h3`), cargo, periodo y resumen, en orden. *(A4)*
- **T42** — **Dado** una experiencia sin `summary`, `location` ni `phases` **cuando** se renderiza **entonces** solo muestra lo disponible. *(A6)*
- **T43** — **Dado** `Experience` vacía **cuando** se renderiza **entonces** omite la sección. *(A6)*
- **T44** — **Dado** `Skills` con grupos **cuando** se renderiza **entonces** cada grupo es un `h3` con sus keywords en `ul/li`. *(A3, A4)*
- **T45** — **Dado** un grupo con `keywords:[]` **cuando** se renderiza **entonces** se omite. *(A6)*
- **T46** — **Dado** `Contact` con 2 perfiles **cuando** se renderiza **entonces** hay `mailto:` y un enlace por perfil con `target="_blank"` y `rel="noopener noreferrer"`. *(A4, A15)*
- **T47** — **Dado** un perfil de red desconocida **cuando** se renderiza **entonces** se muestra con su `network` sin lanzar. *(A6)*
- **T48** — **Dado** una URL de perfil con esquema `javascript:` **cuando** se renderiza **entonces** el enlace no se emite. *(A15)*
- **T49** — **Dado** `SiteHeader` **cuando** se renderiza **entonces** el `nav` tiene `aria-label` y anclas, y en ES el conmutador enlaza a `/en/` con `hrefLang="en"`. En EN enlaza a `/` y marca `aria-current`. *(A3, A18)*
- **T50** — **Dado** la página completa **cuando** se renderiza **entonces** hay un solo `h1` y los landmarks banner, navigation, main y contentinfo. *(A3)*
- **T51** — **Dado** la página completa **cuando** se inspecciona **entonces** no hay demo HL7 ni arquitectura. *(A5)*

**Tokens y CSS** (`app/globals.test.ts`, unit sobre el CSS como texto)
- **T52** — **Dado** `globals.css` **cuando** se parsea `:root` **entonces** tiene los valores de B: `--bg:#0b0f14`, `--surface:#10161d`, `--ink:#e6edf3`, `--muted:#8b98a5`, `--line:#1f2933`, `--accent:#39d98a`, `--accent-ink:#04130b`, `--soft:#0f2a1f`, `--radius:6px` y fuentes monoespaciadas. *(A14)*
- **T53** — **Dado** los CSS **cuando** se buscan hex fuera de los tokens **entonces** no hay ninguno. *(A14)*
- **T54** — **Dado** los pares `ink/bg`, `muted/bg`, `muted/surface`, `accent/bg`, `accent/soft` y `accent-ink/accent` **cuando** se calcula el ratio WCAG **entonces** todos son ≥4.5:1. *(A16)*
- **T55a** — **Dado** el CSS **cuando** se busca `prefers-reduced-motion: reduce` **entonces** apaga el cursor con `animation:none` y existe `:focus-visible` con outline. *(A15)*
- **T55b** — **Dado** `experience.module.css` **cuando** se inspeccionan sus media queries **entonces** hay un breakpoint de 640 px o menos con una columna. *(A17)*

**Build** (`tests/build/*.test.ts`)
- **T56** — **Dado** un build correcto **cuando** se listan los archivos de `out/` **entonces** existen `index.html`, `en/index.html`, `sitemap.xml`, `robots.txt` y `404.html`, y no hay `fr/`. *(A2, A13, A19)*
- **T57** — **Dado** los HTML **cuando** se parsean **entonces** `/` tiene `lang="es"`, `/en/` tiene `lang="en"` y cada uno tiene un `h1` y landmarks. *(A2, A3)*
- **T58** — **Dado** los HTML **cuando** se buscan los datos de Ada (nombre, email, empresas, cifras, keywords) **entonces** aparecen en el idioma correspondiente. *(A4)*
- **T59** — **Dado** los HTML **cuando** se inspecciona `<head>` **entonces** cada uno tiene `title`, description, canonical propio, 3 hreflang recíprocos y metas `og:*`. *(A12)*
- **T60** — **Dado** los HTML **cuando** se extrae el `ld+json` **entonces** es JSON válido, `@type:'Person'`, con el nombre de Ada e `inLanguage` coherente. *(A12)*
- **T61** — **Dado** `sitemap.xml` y `robots.txt` **cuando** se leen **entonces** el sitemap tiene `/` y `/en/` con alternates, y robots tiene `Allow: /` y `Sitemap:`. *(A13)*
- **T62** — **Dado** que la API de prueba envía además `phone`, `dni` y `birthDate` con valores centinela **cuando** se leen TODOS los archivos de `out/` (HTML, RSC y JS) **entonces** no aparecen esos valores ni etiquetas como phone, teléfono, birth, nacimiento o dni. *(A11)*
- **T63** — **Dado** el HTML **cuando** se buscan enlaces externos **entonces** todos llevan `rel="noopener noreferrer"` y no hay enlace "PDF". *(A5, A15)*
- **T64** — **Dado** la API de prueba funcionando **cuando** se construye **entonces** quedan `resume-es.json` y `resume-en.json` en la caché. *(A8)*
- **T65** — **Dado** la caché de T64 y la API detenida **cuando** se hace un nuevo build **entonces** sale con código 0, avisa del respaldo y el HTML equivale al de T58. *(A9)*
- **T66** — **Dado** la API detenida y la caché vacía **cuando** se hace el build **entonces** sale con código ≠0, no existe `out/index.html` y stderr nombra idioma y causa. *(A9)*
- **T67** — **Dado** una API que responde 200 con JSON inválido y la caché vacía **cuando** se construye **entonces** el build falla. *(A9, A10)*
- **T68** — **Dado** el código fuente **cuando** se buscan `fetch(` y `process.env` fuera de `lib/` **entonces** no hay coincidencias. *(A7)*
- **T69** — **Dado** el fuente **cuando** se busca `console.log` **entonces** no hay ninguno. *(A1)*
- **T70** — **Dado** `package.json` **cuando** se leen sus scripts **entonces** existen `dev`, `build`, `test`, `lint` y `typecheck`. *(A1)*

**Trazabilidad criterio → tests**
A1: T69, T70 + ejecución de scripts · A2: T25, T56, T57 · A3: T36, T44, T49, T50, T57 · A4: T1, T2, T26, T27, T36, T39, T41, T44, T46, T58 · A5: T38, T51, T63 · A6: T11, T28, T32, T37, T40, T42, T43, T45, T47 · A7: T1, T68 · A8: T14, T20, T22, T64 · A9: T3–T9, T15–T19, T21, T65–T67 · A10: T5–T7, T10, T12, T17, T18, T20, T67 · A11: T13, T35, T62 · A12: T29–T34, T59, T60 · A13: T56, T61 · A14: T52, T53 · A15: T46, T48, T55a, T63 · A16: T54 · A17: T55b + revisión visual manual (R9) · A18: T2, T23, T25, T49 · A19: T24, T56.

## 5. Datos y resiliencia
1. `getResume(lang)` llama a la API con timeout de 10 s y 2 reintentos. Solo cuenta como éxito si hay 200, JSON, `isResume` verdadero y `language === lang`.
2. Si tiene éxito, escribe `.next/cache/cv-web/resume-<lang>.json` de forma atómica.
3. Si falla, lee el respaldo: si es válido, emite `console.warn` y continúa. Si no hay respaldo, lanza error y el build sale con código distinto de 0.
4. El respaldo no se commitea, porque `.next/` está ignorado. En Cloudflare Pages persiste por ser `.next/cache`, con el build cache de V2 activado. Se purga a los 7 días sin lectura.
5. Los tests pasan `CV_CACHE_DIR` y `CV_API_URL` para no tocar la API real.

## 6. Tokens de diseño (propuesta B)
- Los valores son los de T52. Las tres fuentes (`--font`, `--head`, `--mono`) usan `ui-monospace,"SF Mono","JetBrains Mono",Menlo,monospace`.
- Hay un literal fuera de tokens, el borde de pill `#1d4a35`, que debe convertirse en el token `--pill-line`.
- **Layout:** `.wrap` de 1040 px con padding de 24; nav con padding-top 64; secciones con padding 56 y `border-top`; títulos de sección de 14 px, mayúsculas, tracking .12em, en mono; `h1` con `clamp(30px,5vw,50px)` y peso 700; lead de 16 px; impacto en grid `auto-fit minmax(180px,1fr)`; job en grid 150px/1fr, con una columna con 640 px o menos; skills en grid `minmax(280px,1fr)`; pills mono de 12 px sobre `--soft`; cursor `blink 1.1s steps(1)`.
- Se excluyen los elementos propios de la maqueta: el conmutador A/B, la propuesta A, las secciones Demo y Arquitectura, el botón PDF y `localStorage`.

## 7. Privacidad, SEO y accesibilidad
- **Privacidad:** el cliente proyecta la respuesta a los campos conocidos, así que un cambio futuro de la API no filtra datos al HTML. El JSON-LD no incluye email ni campos privados. Solo se publican email, LinkedIn y GitHub. Los fixtures son ficticios.
- **SEO:** un `h1`, metadata por idioma, canonical propio, hreflang recíproco con `x-default`, JSON-LD Person, sitemap con alternates y robots. `trailingSlash:true` hace coincidir canonical, sitemap y hreflang con las URLs reales.
- **Accesibilidad:** contraste AA calculado (T54), `:focus-visible`, `prefers-reduced-motion`, cursor `aria-hidden`, nav con nombre, listas semánticas, `lang` correcto y `hrefLang` en el conmutador. El reviewer comprobará a mano que los objetivos táctiles midan al menos 44 px.

## 8. Alternativas descartadas
1. **Dos layouts raíz con grupos de rutas (`(es)` y `en`):** duplica layout y página. Se usa un solo `app/[[...lang]]` con `generateStaticParams` y `dynamicParams=false`.
2. **`next-intl` o el i18n integrado de Next:** no funcionan con `output:'export'` y sobran para 2 idiomas.
3. **Respaldo commiteado en el repo:** viola "el contenido no se copia al repo" y C3.
4. **Directorio de caché propio (`.cache/`):** Pages solo documenta `.next/cache` para Next.js, así que no persistiría.
5. **Fetch en el cliente, en runtime:** contradice el brief y empeora el SEO.

## 9. Riesgos y dudas
- **R1 Node:** Vitest 5.1 exige Node ≥22.12 y el local es 20.20.2. Recomiendo Node 22 LTS con `.nvmrc`. La alternativa es bajar de versión de Vitest, que no verifiqué.
- **R2 TypeScript:** propongo 5.9.3 porque openapi-typescript pide `^5.x`, aunque la última es 7.0.2. Hay que confirmar que se acepta.
- **R3 Caché en Pages:** solo está documentado `.next/cache`, con build system V2, activado el build cache y una purga de 7 días sin lectura. No lo probé en un proyecto real. Si no hay build en 7 días y la API cae, el build falla, como pide el brief. Conviene un build programado en `web-deploy`.
- **R4 Versión de Node en Pages:** la documentación consultada no la cubre. Asumo `NODE_VERSION=22` o `.nvmrc`. Se confirma en `web-deploy`.
- **R5 `trailingSlash`:** el brief dice `/en`. Con `true` la canonical sería `/en/` y Pages redirige `/en` a `/en/`. La documentación no lo cubre, así que hay que decidir.
- **R6 Open Graph:** el brief lo pide, pero no hay imagen. Propongo `og:*` sin `og:image` en este slice.
- **R7 Logo `julio.flores`:** la maqueta lo escribe a mano. Propongo derivarlo de `profile.name`, con el nombre completo como alternativa si el formato es inesperado, o ponerlo en el diccionario. Hay que decidir.
- **R8 Flags del titular (`--backend --hl7 --fhir`):** son texto fijo de UI, igual en EN, y no vienen de la API. Hay que confirmar que es aceptable.
- **R9 Responsive:** no hay test visual en el brief. T55b cubre solo el CSS. Propongo revisión manual a 360 px y escritorio, o Playwright en otra tarea.
- **R10 Alcance de datos:** `highlights`, `phases`, `education`, `languages` y `location` quedan fuera del render, pero se tipan y validan. El pie de la maqueta ("Monforte de Lemos · ES") usaría `profile.city` y `countryCode` si existen. Hay que confirmar.
- **R11 Skills:** la maqueta tiene 3 grupos y la API devuelve 6. Se renderizan todos, en el orden recibido.
- **R12 Cifras y disponibilidad:** salen de la API y no de literales. Con `availability` nulo no se muestra estado.
- **R13 Nav:** la maqueta enlaza Demo HL7 y Arquitectura, que están fuera de alcance. No se incluyen enlaces muertos y la nav solo enlaza a las 4 secciones del slice.
- **R14 Tests de build lentos:** T56–T67 ejecutan `next build` varias veces. El implementer los agrupa o los mueve a `npm run test:build`, sin dejar sin cubrir A9 ni A11.
- **R15 Timeout y reintentos:** 10 s y 2 reintentos los eligió el analyst, no el brief.
- **R16 Datos reales:** el CV real se descargó solo a un directorio temporal fuera del repo para ver su forma. Nada de él aparece en este plan.

La numeración es provisional: T55a y T55b se pueden renumerar si se mantiene la trazabilidad.

## 10. Decisiones del humano (plan VALIDADO, 2026-11-04)
El humano validó el plan ("sí, está bien") aceptando las recomendaciones del analyst:
- **R1** Node 22 LTS (`.nvmrc`, `engines >=22.12`). **R2** TypeScript 5.9.3. **R5** `trailingSlash: true` (`/en/`).
- **R7** El logo se deriva de `profile.name` (alternativa: nombre completo si el formato es inesperado).
- **R8** Los flags del titular (`--backend --hl7 --fhir`) son texto fijo de UI, igual en EN.
- **R10** El pie usa `profile.city` y `countryCode` si existen.
- Resto como propone el plan: OG sin `og:image`, nav solo con las 4 secciones, los 6 grupos de skills en el orden recibido, tests de build agrupados (`npm run test:build` permitido si se mantiene la cobertura de A9 y A11).
- El botón PDF no se incluye.
