# web-runtime (fase 1 del cambio de rumbo, 2026-11-11)

Decisión del humano (Julio), que **anula** de la ronda 4 todo lo que asume contenido en build estático:

1. **La web es un servidor Next (`output: 'standalone'`), no un export estático.** Corre como contenedor `cv-web` en el compose del NAS (junto a `cv-api` y `cv-db`).
   El túnel de Cloudflare publica `floreslab.dev` (dominio principal; `cv.floreslab.dev` pasa a redirección 301) hacia `http://cv-web:3000`. Sin Cloudflare Pages.
2. **Si el NAS cae, la web cae.** Sin respaldo estático, sin caché de build en archivo, sin contenido en el repo. El build NO lee la API ni la base de datos.
3. **Datos solo en la base de datos** (servicios, proyectos, arquitectura y el CV). Ningún archivo de datos en los repos. Los textos de interfaz (botones, títulos de sección, microcopy) sí viven en el código (i18n).
   Con la base vacía la web renderiza sin esas secciones y sin romperse.
4. **Lectura en el servidor** contra `http://cv-api:8080` (URL interna configurable por entorno; en dev/preview `CV_API_URL`). Sin CORS para lecturas.
   El navegador solo habla con el origen de la propia web (formulario de contacto vía route handler propio, no directo a la API) — revisar T68 y la política de privacidad de clientes anónimos.
5. **Tiempo real sin rebuild:** cada carga de contenido usa caché de datos de Next con etiqueta por tipo (`services`, `projects`, `architecture`, `resume`) y TTL corto;
   un endpoint interno de revalidación protegido (para que el futuro admin invalide al guardar). **No se usa WebSocket** (decisión justificada: solo edita el dueño).
6. **Salud:** `GET /api/health` de la web que comprueba también la API; healthcheck de Docker; `depends_on: cv-api: service_healthy` en el compose. Sin chequeo previo al build (no hace falta).
7. **PDF** (`/cv-julio-flores-{es,en}.pdf`): pasan de route handlers estáticos a dinámicos sobre los mismos datos, con caché y la misma etiqueta de `resume`. Mantener las reglas de privacidad.
8. **Dominio:** metadatos, canonical, sitemap, robots, hreflang y OG pasan a `https://floreslab.dev`. Revisar que nada apunte a `cv.floreslab.dev`.
9. Empaquetado: `Dockerfile` multi-stage (Node 22, standalone, usuario no root, amd64+arm64 como la API), workflow de CI que publica la imagen (`julioflores781/cv-web`) y `deploy/docker-compose.yml` actualizado/nuevo para el NAS (pegable en su editor, sin `.env`; ver el compose de `cv`).

## Qué se conserva
Diseño v2, tokens, tipografías, hexágono, formulario, servicios seleccionables, proyectos y privacidad, ES/EN, PDF, tooling de paridad (`scripts/parity`, `design-data.json` como API falsa para tests/preview). Cambia la capa de datos (`lib/api/*`, `cache.ts`, `generate:api`, `output: 'export'`) y el despliegue.
Estado del árbol: los 6 slugs `web-redesign-*` están implementados y APPROVED pero **sin commit ni cierre**; este slug construye sobre esa copia de trabajo.

## Fuera de alcance (fases 2 y 3, solo para que el diseño no las bloquee)
- Fase 2 (repo `cv`): login admin, CRUD versionado de servicios/proyectos/arquitectura, subida de imágenes a Cloudflare R2 (como `padelhub-api/src/media`, bucket y `media.floreslab.dev` reutilizados, prefijo `site/`).
- Fase 3: panel `/admin` en la web con el modelo de `fion-gastronomy` (login por route handler → JWT en cookie httpOnly, `proxy.ts` como puerta, noindex). Por eso hoy debe quedar sitio para route handlers y un `proxy.ts` sin que el servidor Next lo impida.
- **Decisión de auth ya tomada (para fase 2, no implementar aquí):** un único administrador cuya contraseña vive **en la base de datos, hasheada** (bcrypt/argon2), nunca en variables de entorno ni en el repo; se puede cambiar rápido (comando/script en el NAS y endpoint con contraseña actual), sin contraseña por defecto sembrada, login con límite de intentos.

## Entregable del analyst
`progress/web-runtime/analysis.md` con el formato del protocolo, más la **lista de slugs hijos recomendada** (p. ej. datos/servidor, PDF dinámico, contacto vía route handler, dominio/SEO, Docker/CI/compose, paridad/regresión) con dependencias y orden. Verificar con la documentación vigente de Next (versión instalada) `output: 'standalone'`, `unstable_cache`/`use cache`/`revalidateTag`, route handlers y `proxy.ts`. Cita lo comprobado.
