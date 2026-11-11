# Implementation — web-home

Estado: implementado. Verificado con Node 22.23.1 (`~/.nvm/versions/node/v22.23.1/bin` en el PATH; sin tocar configuración global).

## Verificación
- `npm run lint`: verde (0 errores, 0 avisos).
- `npm run typecheck`: verde.
- `npm test`: 17 archivos, 82 tests, verde (incluye 4 `next build` reales, ~10 s en total).
- `npm run build` contra la API real: verde, deja `resume-es.json` y `resume-en.json` en `.next/cache/cv-web/`.
- Con `CV_API_URL` apuntando a un puerto cerrado y copia de respaldo: build verde con aviso `API unavailable for "es"`.
- Sin copia de respaldo y API caída: build falla con `Resume (es) unavailable: the API failed (...)`.
- Versiones fijadas (todas exactas, `npm view` coincide con el plan): next 16.4.5, react/react-dom 19.3.1, vitest 5.1.0, openapi-typescript 7.13.0, typescript 5.9.3, eslint 10.14.0, eslint-config-next 16.4.5, @testing-library/react 16.3.3, jest-dom 7.0.1, @testing-library/dom 10.4.2, jsdom 30.1.3, @vitejs/plugin-react 6.2.1.
- `lib/api/schema.d.ts` generado con `npm run generate:api` contra `https://cv-api.floreslab.dev/openapi.json` (solo tipos).

## Mapa Tn → it()
| T | Archivo | Título del `it()` |
|---|---|---|
| T1–T9 | `lib/api/client.test.ts` | `T1`…`T9: ...` |
| T10–T12 | `lib/api/validate.test.ts` | `T10`…`T12: ...` (describe `isResume`) |
| T13 | `lib/api/validate.test.ts` | `T13: drops unknown fields...` (describe `parseResume`) |
| T14–T19, T21 | `lib/api/get-resume.test.ts` | `T14`…`T19`, `T21` |
| T20, T22 | `lib/api/cache.test.ts` | `T20`, `T22` |
| T23–T28 | `lib/i18n/i18n.test.ts` | `T23`…`T28` |
| T29–T32 | `lib/seo/metadata.test.ts` | `T29`…`T32` |
| T33–T35 | `lib/seo/json-ld.test.ts` | `T33`…`T35` |
| T36–T38 | `components/hero.test.tsx` | `T36`…`T38` |
| T39–T40 | `components/impact.test.tsx` | `T39`, `T40` |
| T41–T43 | `components/experience.test.tsx` | `T41`…`T43` |
| T44–T45 | `components/skills.test.tsx` | `T44`, `T45` |
| T46–T48 | `components/contact.test.tsx` | `T46`…`T48` |
| T49 | `components/site-header.test.tsx` | `T49` |
| T50–T51 | `components/home-view.test.tsx` | `T50`, `T51` |
| T52–T54, T55a, T55b | `app/globals.test.ts` | `T52`…`T55b` |
| T56–T67 | `tests/build/build.test.ts` | `T56`…`T67` |
| T68–T70 | `tests/source.test.ts` | `T68`…`T70` |

Todos los títulos de `it()` empiezan por su `Tn:`.

## Criterio → tests
A1: T69, T70 + scripts ejecutados · A2: T25, T56, T57 · A3: T36, T44, T49, T50, T57 · A4: T1, T2, T26, T27, T36, T39, T41, T44, T46, T58 · A5: T38, T51, T63 · A6: T11, T28, T32, T37, T40, T42, T43, T45, T47 · A7: T1, T68 · A8: T14, T20, T22, T64 · A9: T3–T9, T15–T19, T21, T65–T67 · A10: T5–T7, T10, T12, T17, T18, T20, T67 · A11: T13, T35, T62 · A12: T29–T34, T59, T60 · A13: T56, T61 · A14: T52, T53 · A15: T46, T48, T55a, T63 · A16: T54 · A17: T55b + revisión visual (no hecha, ver abajo) · A18: T2, T23, T25, T49 · A19: T24, T56 (el 404 de rutas desconocidas lo da `dynamicParams=false`; solo se comprueba que no se genera `fr/` y que existe `404.html`).

## Tests extra fuera del plan
- `client.test.ts`: reintenta un fallo transitorio (503) y acierta.
- `validate.test.ts`: rechaza idioma desconocido y elementos anidados mal formados.
- `cache.test.ts`: ida y vuelta de escritura/lectura sin temporales; copia guardada con idioma equivocado se ignora.
- `i18n.test.ts`: `deriveHandle` (logo `ada.ejemplo`, nombre completo si es inusual).
- `metadata.test.ts`: descripción larga recortada a 160.
- `json-ld.test.ts`: URLs no http(s) quedan fuera de `sameAs`.
- `site-header.test.tsx`: logo derivado del nombre o nombre completo.
- `skills.test.tsx`: todos los grupos vacíos omite la sección.
- `home-view.test.tsx`: resume con listas vacías, sin secciones vacías ni anclas muertas.
- `build.test.ts`: caso "builds successfully" (código 0 y salida de Next).

## Desvíos y decisiones menores (ninguno cambia el diseño)
1. `components/home-view.tsx` (no listado en §2): la composición de la página vive ahí para poder probar T50/T51 sin ejecutar el server component async. `page.tsx` solo resuelve idioma y datos.
2. `lib/url.ts` (no listado): `safeHttpUrl`, compartido por `Contact` y el JSON-LD (T48).
3. `lib/api/errors.ts` (no listado): `ResumeFetchError` y `ResumeUnavailableError`.
4. `lib/api/validate.ts` expone `parseResume` (valida y proyecta) además de `isResume`; el cliente, la caché y el orquestador usan `parseResume`.
5. `resetResumeMemo()` exportado en `get-resume.ts` solo para tests.
6. Tests de build incluidos en `npm test` (sin script `test:build` aparte, ~10 s). Usan `out/` y `.next/` del repo y un `CV_CACHE_DIR` temporal; al terminar `out/` queda con datos de Ada hasta el siguiente `npm run build`.
7. `package.json` lleva `"type": "module"` (evita el aviso de Vite al cargar `vitest.config.ts`).
8. `.gitignore`: se añadieron `next-env.d.ts` y `!.env.example` (la regla `.env*` ignoraba el ejemplo).
9. `@types/node` fijado en 22.20.5 (coherente con Node 22) y `@types/jsdom` para los tests de build.
10. `app/not-found.tsx` incluye `<html>/<body>` propios (idioma `es`) porque el layout raíz vive bajo `[[...lang]]`; genera `404.html`.
11. La nav del cabecero solo enlaza a secciones que existen; el botón secundario del hero ("Ver experiencia") solo aparece si hay experiencia.
12. El conmutador de idioma muestra `ES · EN`: el idioma actual es un `span aria-current="true"` y el otro un enlace con `hreflang`.
13. El `<h1>` es solo el titular terminal (R8); el nombre aparece en el logo, el `<title>` y el JSON-LD.
14. Hero: el párrafo de resumen usa `summary` y, si falta, `tagline`.
15. `typescript` queda en 5.9.3 aunque `latest` es 7.0.2 (R2 validado).

## No verificado
- Revisión visual a 360 px y escritorio (A17 y fidelidad con la propuesta B): no hay Chrome en este entorno. Solo se comprueban por CSS (T55b, tokens) y por estructura HTML.
- Tamaño real de objetivos táctiles (se puso `min-height: 44px`, sin medir).
- Contraste real renderizado: solo el cálculo de los pares de tokens (T54).
- Comportamiento en Cloudflare Pages (persistencia de `.next/cache`, versión de Node, redirección `/en` → `/en/`): pendiente de `web-deploy`.
- El 404 de una ruta desconocida servido por un hosting real (solo se comprueba que no hay `fr/` y que existe `404.html`).

## Ronda 2 (correcciones de review.md, cambios 1 a 6)

Verificación (Node 22.23.1): `npm run lint` verde, `npm run typecheck` verde, `npm test` 18 archivos / 86 tests verde (T1…T70 intactos, nombres sin cambios), `npm run build` verde (API real). `out/404.html` lleva `<title>404</title>` y `noindex`.

1. Privacidad: nuevo `scripts/strip-examples.mjs`, encadenado en `npm run generate:api` (`... && node scripts/strip-examples.mjs`). `lib/api/schema.d.ts` regenerado: 0 líneas `@example`. Tests nuevos: T71 (`lib/api/schema.test.ts`: sin `@example`, sin cadenas tipo email, sin `http(s)://`; reglas genéricas, sin datos reales) y T72 (el script `generate:api` invoca el filtro).
2. Tipado: `parseNamed` eliminado; parsers por entidad (`parseEducationEntry`, `parseCertificate`, `parseCourse`, `parseSpokenLanguage`, `parseQualifications`) sin `as`. Tipos añadidos a `lib/api/types.ts` (Education, Certificate, Course, Qualifications, SpokenLanguage). En `build.test.ts`, `childEnv` se declara `NodeJS.ProcessEnv` (con `NODE_ENV: 'production'` explícito) y se quita `as unknown as`.
3. Claves React: `contact.tsx` usa `${index}|${href}`; `impact.tsx` usa `${index}|${value}|${text}`.
4. `.btn`/`.ghost` movidos a `app/globals.css` (clases globales `btn ghost`); copias eliminadas de `hero.module.css` y `contact.module.css`; `hero.tsx`/`contact.tsx` actualizados. Test nuevo T73 (`app/globals.test.ts`).
5. `app/not-found.tsx`: `metadata` con `title: '404'` y `robots: { index: false, follow: false }`; el enlace usa el host de `getConfig().siteUrl`. Test nuevo T74 (`tests/source.test.ts`).
6. T54 incluye ahora el par `--accent` sobre `--surface` (mismo `it()`).

Tests extra fuera del plan (ronda 2): T71, T72, T73, T74.
