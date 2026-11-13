# AGENTS.md — Mapa de navegación de cv-web

> Punto de entrada para cualquier agente. Es un **mapa**, no una biblia: leé solo lo que necesites. Comandos y reglas → `CLAUDE.md`.
> Patrones → `docs/web-standards.md`.

## 1. Antes de empezar
1. `progress/current.md` (estado de la última sesión).
2. `progress/<slug>/brief.md` (la idea) y, si existe, `analysis.md` (el plan validado).
3. `docs/web-standards.md` si vas a tocar código.

## 2. Mapa (`app/`, `components/`, `lib/`)
| Área | Rol |
|------|-----|
| `app/` | Rutas App Router (dinámicas, renderizadas por petición). `/` y `/servicios/` en español, `/en/` y `/en/services/` en inglés; `sitemap.xml`, `robots.txt`, `/api/health`, `/api/contact` y los PDF del CV. |
| `components/` | UI reutilizable (hero, impacto, experiencia, skills, contacto). Sin lógica de datos. |
| `lib/api` | Cliente de la API del CV (lectura en runtime, memo solo por petición) + tipos (generados desde su OpenAPI) + `config.ts` (`CV_API_URL`, `SITE_URL`). |
| `lib/log.ts`, `lib/request-id.ts`, `instrumentation.ts` | Logs JSON (única salida, `logEvent`) y `X-Request-Id`. Ver «Logs» en `docs/web-standards.md`. |
| `lib/i18n` | Diccionarios ES/EN y helpers de idioma. |
| `Dockerfile`, `deploy/` | Imagen standalone y compose único del NAS (`cv-db`, `cv-api`, `cv-web`). El CI publica la imagen (job `docker`). |
| `design/` | `artifact-v2/project/Main.dc.html`: referencia visual vigente. Fuente de los tokens de diseño. |
| `progress/` | Estado del arnés: `current.md`, `history.md`, y una carpeta por tarea. |

## 3. Reglas duras
- **Una tarea (slug) a la vez.**
- **Los datos solo entran por `lib/api`**; los componentes reciben props tipadas, no hacen `fetch`.
- **Sin caché ni respaldo:** cada render lee la API; si no responde o devuelve algo inválido, la página da **500** (jamás datos viejos). Servicios, proyectos y arquitectura vacíos muestran un estado vacío.
- **Tokens de diseño** de `design/artifact-v2/project/Main.dc.html` (variables CSS en `app/globals.css`); no inventar colores ni tipografías.
- **Accesibilidad:** contraste AA, foco visible, `prefers-reduced-motion` respetado, HTML semántico.
- **No commitear ni mergear automáticamente.** Solo el `closer` y solo tras "cerrá <slug>".
- **Escribí en `progress/current.md` mientras trabajás.**
- Si no sabés algo, buscá en `docs/` o en el código antes de inventarlo; si te bloqueás, documentalo y pará.

## 4. Naming
Componentes `PascalCase.tsx`; archivos y carpetas `kebab-case`; constantes `UPPER_SNAKE_CASE`; sin prefijo `I` en tipos.

## 5. Flujo
```
idea → [leader: brief.md] → [analyst] → analysis.md → ⏸ HUMANO valida el plan
  → [implementer ⇄ reviewer]* → ⏸ HUMANO valida y AUTORIZA ("cerrá <slug>")
  → [closer] → rama + commit + merge a develop
```
Detalle y tabla de escalado en `.claude/agents/leader.md`.
