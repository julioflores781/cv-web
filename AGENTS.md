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
| `app/` | Rutas App Router. `/` es español, `/en` inglés; ambas generadas estáticamente. |
| `components/` | UI reutilizable (hero, impacto, experiencia, skills, contacto). Sin lógica de datos. |
| `lib/api` | Cliente de la API del CV + tipos (generados desde su OpenAPI) + respaldo de build. |
| `lib/i18n` | Diccionarios ES/EN y helpers de idioma. |
| `design/` | `preview.html`: referencia visual aprobada (propuesta B). Fuente de los tokens de diseño. |
| `progress/` | Estado del arnés: `current.md`, `history.md`, y una carpeta por tarea. |

## 3. Reglas duras
- **Una tarea (slug) a la vez.**
- **Los datos solo entran por `lib/api`**; los componentes reciben props tipadas, no hacen `fetch`.
- **Si la API no responde en el build** se usa el último CV bueno guardado; si no hay ninguno, el build **falla** (jamás se publica una web vacía).
- **Tokens de diseño** de `design/preview.html` (variables CSS); no inventar colores ni tipografías.
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
