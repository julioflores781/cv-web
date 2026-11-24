# Cierre — web-featured-facts

Tarea trivial (plan: `progress/web-featured-facts/analysis.md`, prefijo `FF`, validado por Julio: «dale, quita los h-01»). Review **APPROVED** en la ronda 1.
Autorización humana explícita de Julio: «cerrá las dos» (`web-trajectory-split`, ya cerrado con el merge `11b933d`, y este slug).

## Repo `cv-web`
- Rama `feature/web-featured-facts`, creada desde `develop` (`11b933d`, al día con `origin/develop`).
- Commit 1, código y tests: `f3500c1` fix(projects): logros del proyecto destacado sin la etiqueta h-NN [web-featured-facts].
  Contiene los 4 archivos de «Archivos tocados» de `impl.md`, sin más:
  - `components/project-featured.tsx`
  - `components/project-featured.module.css`
  - `components/projects.test.tsx`
  - `components/project-featured.module.test.ts` (nuevo)
- Commit 2, progress: docs(progress): plan, revisión y cierre de web-featured-facts [web-featured-facts]. Contiene
  `progress/web-featured-facts/{brief,analysis,impl,review,close}.md` y `progress/history.md` (la entrada de `web-trajectory-split` que añadió el leader).
  Su hash no puede figurar en este archivo, que va dentro de él; ver `git log develop`.
- Merge `--no-ff` a `develop` («Merge feature/web-featured-facts en develop [web-featured-facts]») y push de `develop` a `origin`.
  La rama feature no se publica, igual que en los cierres anteriores. Un push a `develop` no lanza la CI ni publica imágenes: `ci.yml` solo corre en push a `main`, en tags y en PRs.
- Verificación (Node 22.23.1, review ronda 1): lint OK, typecheck OK, 732/732 tests (156 archivos), build OK; `ƒ /[[...slug]]`,
  `ƒ /sitemap.xml`, `ƒ /robots.txt` y los PDF siguen dinámicos. La sonda de paridad `featured-facts` sigue en 1 px a 1440 y a 390.
- Después del merge, la rama local `feature/nas-autodeploy` de Julio (sin commits propios) avanza en fast-forward hasta `develop` y queda como rama actual.

## Fuera de este cierre (siguen sin commitear en la copia de trabajo)
- `deploy/docker-compose.yml`: el cambio de Watchtower de Julio.
- `AGENTS.md`: el bloque que añade `next dev`.
- `progress/current.md`: lo actualiza el leader.

## Pendiente
- La entrada de este slug en `progress/history.md` es del leader.
- Las observaciones fuera de alcance de `review.md` son sugerencias y no bloquean: el `p` como único hijo del `li` y la etiqueta «stack» repetida en la columna derecha del destacado.
- El PR `develop -> main` no se abre aquí: lo decide el humano. Al fusionarlo se lanza la CI y se publica `julioflores781/cv-web`.
