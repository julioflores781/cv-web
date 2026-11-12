# CLAUDE.md — cv-web

## Arnés (rol y arranque)

Para tareas de código actuás como el subagente **`leader`** (`.claude/agents/leader.md`):
**descomponés y coordinás**, no implementás el código vos mismo. Reglas duras:

- ❌ **No edites** código de `app/`, `components/`, `lib/` ni tests directamente. Lanzás un `implementer` vía `Agent`.
- ❌ **No commitees, no mergees, no pushees** vos ni el implementer. El humano valida y **autoriza explícitamente**
  ("cerrá web-home"); el commit/merge lo hace el agente `closer`. Nunca automático al aprobar el reviewer.
- ❌ **No saltes la validación humana del plan** en tareas no triviales: el `analyst` produce el plan, parás y lo presentás.
- ✅ Agentes: `analyst` (plan) · `implementer` (código+tests) · `reviewer` (audita, obligatorio) · `closer` (rama/commit/merge) ·
  `Explore` (investigación read-only).

**No aplica** (podés hacerlo vos): preguntas conceptuales, exploración read-only y cambios en docs/`progress/`/config del arnés.

**Sin tickets:** no hay Jira. Cada tarea se identifica con un **slug** en minúsculas (`web-home`) y su carpeta `progress/<slug>/`.
La idea (qué y por qué) vive en `progress/<slug>/brief.md`, escrita por el leader a partir de lo que decide el humano.

**Protocolo de arranque:** 1) `AGENTS.md` · 2) `progress/current.md` · 3) `progress/<slug>/brief.md` · 4) flujo de `.claude/agents/leader.md`.

Referencias: `AGENTS.md` (mapa) · `docs/web-standards.md` (patrones) · `CHECKPOINTS.md` (definición de "listo").

## Qué es
La web del CV y servicios de Julio Flores, publicada en `https://floreslab.dev` (ES por defecto, `/en`; perfil y servicios). Next.js como
**servidor standalone** (`output: 'standalone'`) pensado para correr en un contenedor del NAS, detrás del túnel, junto a la API del CV (repo `cv`, Quarkus) y su base de datos (imagen: `Dockerfile`; compose único para el NAS: `deploy/docker-compose.yml`).
Cada render lee la API por la red interna (`CV_API_URL`, por defecto `http://cv-api:8080`), **sin caché ni respaldo**: el build no toca la API; si la API
cae o responde algo inválido, la página da **500** (nunca datos viejos). Referencia visual vigente: `design/artifact-v2/project/Main.dc.html`.

## Commands
```bash
npm run dev        # desarrollo
npm run build      # build standalone (no lee la API; los datos se leen en runtime)
npm test           # vitest
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
docker build -t cv-web .   # imagen standalone (Node 22, usuario no root, healthcheck en /api/health/)
```

## Reglas del proyecto
- Código, comentarios y docs en **inglés**; texto visible de la web en **español/inglés** vía diccionarios. Commits y tareas en **español**.
- **Configuración** (solo `lib/api/config.ts` lee `process.env`, en cada llamada): `CV_API_URL` (API interna) y `SITE_URL` (origen público, por defecto
  `https://floreslab.dev`; canonical, hreflang, Open Graph, JSON-LD, `sitemap.xml` y `robots.txt` lo usan en runtime).
- **Docker y despliegue:** `Dockerfile` multi-stage (deps → build → runtime; el build no lee la API). Variables de runtime: solo `CV_API_URL` y `SITE_URL`.
  `deploy/docker-compose.yml` es el compose único del NAS (`cv-db`, `cv-api`, `cv-web`; se pega en el editor sin `.env`, secretos `CAMBIA-…`); el túnel apunta
  `floreslab.dev` → `http://cv-web:3000`. El job `docker` del CI (solo en push) construye amd64, hace un smoke con la API falsa de `scripts/parity/design-api.mjs`
  y publica `julioflores781/cv-web` (amd64+arm64) con los secretos `DOCKERHUB_USERNAME` y `DOCKERHUB_TOKEN`.
- **Endpoints propios:** `GET /api/health` (comprueba también la API; 200/503) y `POST /api/contact` (reenvía el formulario a la API; el navegador solo habla con su origen).
- **Privacidad:** solo email, LinkedIn y GitHub. Nunca teléfono, documento ni fecha de nacimiento (la API ya no los expone).
- El contenido **no se copia al repo**: viene de la API. Las pruebas usan fixtures ficticios («Ada Ejemplo»), nunca el CV real.
- **Commits:** conventional en español, con el slug entre corchetes al final: `feat(home): resumen [web-home]`.
  Sin `Co-Authored-By` ni líneas de atribución (preferencia de Julio para sus repos de CV; difiere del arnés de Pala).
- Ramas `feature/<slug>` desde `develop`; `develop` → `main` por PR. Nunca trabajar sobre `develop`/`main` directamente.
