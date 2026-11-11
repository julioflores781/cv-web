# Brief — web-home

## Idea
Crear el repositorio `cv-web` y su **primera página**: la home del CV de Julio Flores en `cv.floreslab.dev`. Un reclutador debe entender en 30 s
quién es; un técnico debe encontrar la prueba de que lo sabe hacer. Es la primera de varias tareas (ver "Fuera de alcance").

## Decisiones ya tomadas por el humano
- **Repo aparte** `cv-web` (el backend vive en el repo `cv`). **Next.js estático** (`output: 'export'`) en **Cloudflare Pages**.
- **Diseño: propuesta B "Terminal"** de `design/preview.html` (oscuro, monoespaciado, acento verde). Es la referencia visual: se replica,
  no se reinterpreta. El titular de la propuesta B es `$ julio --backend --hl7 --fhir_` (cursor parpadeante, apagado con reduced-motion).
- **Idiomas:** español en `/` (por defecto) e inglés en `/en`. El inglés de Julio es básico: los textos de interfaz los redacta el implementer
  de forma sencilla y neutra; el contenido del CV ya viene traducido por la API.
- **Datos:** salen de la API `https://cv-api.floreslab.dev` (repo `cv`) **solo en el build**: `GET /api/v1/resume?lang=es|en`
  (contrato en `/openapi.json`; los tipos se generan de ahí). Si la API no responde en el build se usa el último CV bueno guardado en caché
  (la caché de Cloudflare Pages); si no hay ninguno, el build **falla** — nunca se publica una web vacía.
- **Privacidad:** solo email, LinkedIn y GitHub. Nunca teléfono, documento ni fecha de nacimiento.
- **Dos sitios:** este (`cv.floreslab.dev`) y otro de servicios en `floreslab.dev` (otro repo, más adelante). No tocar el segundo.

## Alcance de esta tarea (slice 1)
1. Scaffold del proyecto (Next.js + TypeScript estricto + Vitest + ESLint) con los scripts de `CLAUDE.md`.
2. Tokens de diseño de la propuesta B como variables CSS.
3. Home en ES y EN con las secciones: cabecera/nav, hero (titular, resumen, estado de disponibilidad, botones), **impacto**, **experiencia**,
   **stack** (skills por grupo) y **contacto**. Con datos reales de la API; fixtures ficticios en los tests.
4. Capa `lib/api` (cliente, tipos, respaldo de build) y `lib/i18n`.
5. SEO básico: title, description, Open Graph, `hreflang`, canonical, JSON-LD `Person`, `sitemap.xml`, `robots.txt`.
6. Accesibilidad y responsive (a 360 px y escritorio).

## Fuera de alcance (tareas siguientes, cada una con su slug)
- `web-hl7-demo`: demo interactiva HL7 → JSON/FHIR contra la API (necesita CORS y rate limit en Cloudflare).
- `web-architecture`: página de arquitectura (diagrama, ADRs, enlaces).
- `web-deploy`: proyecto en Cloudflare Pages, dominio `cv.floreslab.dev`, build hook, `QUARKUS_HTTP_CORS_ORIGINS` en la API.
- PDF del CV, página de detalle por experiencia, consola de la API en vivo, selector de tema.
- El botón "Ver el CV (PDF)" de la maqueta **no se incluye** hasta que exista el PDF.
- Crear el repositorio remoto en GitHub (lo decide el humano al cerrar).

## Dudas que el analyst debe resolver verificando (no suponiendo)
- Qué versión de Next.js/React/Vitest usar (comprobar la vigente) y si el export estático soporta lo necesario para ES en `/` y EN en `/en`.
- Dónde guardar la caché de build para que **Cloudflare Pages** la conserve entre builds (verificar en su documentación qué rutas persisten).
- Forma exacta de la respuesta de `/api/v1/resume` (leer el OpenAPI real) y cómo generar los tipos.
- Cómo comprobar en un test que el HTML generado no contiene datos privados.
