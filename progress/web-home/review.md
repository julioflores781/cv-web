# Review — web-home (ronda 2)

## Veredicto
**APPROVED**

Nota de la ronda 1: CHANGES_REQUESTED por 1 hallazgo de privacidad bloqueante (`@example` con datos reales del CV en `lib/api/schema.d.ts`) y 5 de calidad (tipado, claves React, `.btn`/`.ghost` duplicados, 404 sin metadata, par de contraste sin cubrir).

Entorno: Node 22.23.1. `npm run lint`, `npm run typecheck`, `npm test` (18 archivos, 86 tests) y `npm run build` (API real) corren en verde. T1…T70 siguen existiendo; los 4 tests nuevos (T71–T74) son extra del plan.

**Sigue sin haber Chrome: lo visual NO está verificado.** Fidelidad a la propuesta B, responsive a 360 px, objetivos táctiles de 44 px y contraste renderizado quedan pendientes de revisión humana. Esto incluye el aspecto de los botones tras moverlos a `app/globals.css`.

## Verificación de los 6 cambios
1. **Privacidad — corregido.** `lib/api/schema.d.ts` tiene 0 `@example` y ningún patrón de email. `generate:api` encadena `node scripts/strip-examples.mjs` (package.json:15). Lo reproduje: generé el esquema desde la API real en una carpeta temporal, apliqué el filtro y el resultado es idéntico al archivo del repo. T71 (sin `@example`, sin cadenas tipo email, sin URLs) y T72 (el script invoca el filtro) lo vigilan con reglas genéricas.
2. **Tipado — corregido.** `grep` sin ningún `as <Tipo>` en `lib/api/validate.ts` y ningún `as unknown`/`as any` en `lib`, `app`, `components` ni `tests`. Hay parsers por entidad y `childEnv` va tipado como `NodeJS.ProcessEnv`.
3. **Claves React — corregido.** `components/contact.tsx:27` y `components/impact.tsx:18` incluyen el índice.
4. **`.btn`/`.ghost` — corregido.** Solo existen en `app/globals.css:97` y `:111`; los CSS Modules ya no los llevan. T73 lo cubre.
5. **404 — corregido.** `out/404.html` lleva `<title>404</title>` y `noindex, nofollow`. El enlace usa `getConfig().siteUrl`, sin dominio fijo. T74 lo cubre.
6. **T54 — corregido.** Incluye `--accent` sobre `--surface` y el test pasa.

## Privacidad (C3)
Barrido de todo el repo (sin node_modules, .next, out, design/, progress/, docs/, CLAUDE.md): sin emails, teléfonos ni documentos. Las únicas apariciones de `floreslab` son URLs públicas por defecto en `lib/api/config.ts`, `.env.example` y `package.json`, más una referencia de agente en `.claude/agents/analyst.md`. `$ julio` en `hero.tsx` es la decisión R8 aceptada. T62 sigue verde.

## Skills consultadas
- **strict-typing:** sin hallazgos. Sin `as`, `any` ni `@ts-ignore`; los parsers por entidad están tipados con tipos nuevos en `lib/api/types.ts`.
- **simplify:** sin hallazgos nuevos. La duplicación desaparece y `strip-examples.mjs` es mínimo, sin código muerto.
- **seo-audit:** el 404 ya tiene `title` y `noindex, nofollow`. Sin hallazgos nuevos.

## Checkpoints
- C1: [x]  C2: [x]  C3: [x]  C4: [x]
- C5: [ ] pendiente solo de la revisión visual humana (no bloquea esta aprobación técnica).
- C6: `progress/web-home/{analysis,impl,review}.md` existen; `progress/current.md` lo mantiene el leader.
- C7: no aplica (lo hace el `closer`).

## Observaciones heredadas (fuera de alcance, sin cambios)
- `design/preview.html` contiene datos reales del CV; no commitearlo así o sustituirlo por datos ficticios antes del cierre.
- Botones sin `:hover`/`:active` (preferencia); la píldora del selector de idioma no es verificable sin render.
- Los tests de build modifican `out/` y `.next/`; ejecutar `npm run build` tras `npm test` antes de publicar.
- Pendientes para el humano: revisión visual a 360 px y escritorio, objetivos táctiles, Cloudflare Pages (caché `.next/cache`, versión de Node, redirección `/en` a `/en/`).
