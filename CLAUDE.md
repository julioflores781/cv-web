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
La web del CV de Julio Flores (`cv.floreslab.dev`). Next.js estático (ES por defecto, `/en`), estilo "Terminal" (propuesta B de
`design/preview.html`). Lee el contenido de la API `https://cv-api.floreslab.dev` (repo `cv`, Quarkus) **durante el build**.
Hosting: Cloudflare Pages. Hay un sitio hermano de servicios en `floreslab.dev` (otro repo, más adelante).

## Commands
```bash
npm run dev        # desarrollo
npm run build      # build estático (lee la API; usa respaldo si no responde)
npm test           # vitest
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

## Reglas del proyecto
- Código, comentarios y docs en **inglés**; texto visible de la web en **español/inglés** vía diccionarios. Commits y tareas en **español**.
- **Privacidad:** solo email, LinkedIn y GitHub. Nunca teléfono, documento ni fecha de nacimiento (la API ya no los expone).
- El contenido **no se copia al repo**: viene de la API. Las pruebas usan fixtures ficticios («Ada Ejemplo»), nunca el CV real.
- **Commits:** conventional en español, con el slug entre corchetes al final: `feat(home): resumen [web-home]`.
  Sin `Co-Authored-By` ni líneas de atribución (preferencia de Julio para sus repos de CV; difiere del arnés de Pala).
- Ramas `feature/<slug>` desde `develop`; `develop` → `main` por PR. Nunca trabajar sobre `develop`/`main` directamente.
