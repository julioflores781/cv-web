# Cierre — web-trajectory-split

Hijo 1/2 de `web-presence` (plan: `progress/web-presence/analysis.md` §2, prefijo `TR`). Review **APPROVED** en la ronda 2.
Autorización humana explícita de Julio: «cerrá las dos» (este slug y `web-featured-facts`, que cierra otro closer después).

## Repo `cv-web`
- Rama `feature/web-trajectory-split`, creada desde `develop` (`d618e9f`, al día con `origin/develop`).
- Commit 1, código y tests: `0defa13` feat(profile): experiencia y formación como secciones separadas, con fases y logros [web-trajectory-split].
  Contiene los 19 archivos de «Archivos tocados» de `impl.md` (rondas 1 y 2), sin más.
- Commit 2, progress: docs(progress): plan, revisiones y cierre de web-trajectory-split [web-trajectory-split]. Contiene
  `progress/web-presence/{brief,analysis}.md` y `progress/web-trajectory-split/{impl,review,close}.md`. Su hash no puede figurar en este
  archivo, que va dentro de él; ver `git log develop`.
- Merge `--no-ff` a `develop` («Merge feature/web-trajectory-split en develop [web-trajectory-split]») y push de `develop` a `origin`.
  La rama feature no se publica, igual que en `web-admin`. Un push a `develop` no lanza la CI ni publica imágenes: `ci.yml` solo corre en push a `main`, en tags y en PRs.
- Verificación (Node 22.23.1, review ronda 2): lint OK, typecheck OK, 731/731 tests (155 archivos), build OK; `ƒ /[[...slug]]`,
  `ƒ /sitemap.xml`, `ƒ /robots.txt` y `ƒ /cv-julio-flores-{es,en}.pdf` siguen dinámicas.

## Fuera de este cierre (siguen sin commitear en la copia de trabajo)
- `deploy/docker-compose.yml`: el cambio de Watchtower de Julio.
- `AGENTS.md`: el bloque que añade `next dev`.
- `progress/current.md`: lo actualiza el leader.
- `web-featured-facts`: `components/project-featured.{tsx,module.css,module.test.ts}`, `components/projects.test.tsx` y `progress/web-featured-facts/`.

## Pendiente
- La validación visual final es de Julio (TR-D6).
- Las observaciones fuera de alcance de `review.md` son sugerencias y no bloquean. Entre ellas, que el PDF reutilice `clean()` (`lib/pdf/cv-document.tsx:173`) y que TR-T19 compruebe la clase sobre el DOM.
- El PR `develop -> main` no se abre aquí: lo decide el humano. Al fusionarlo se lanza la CI y se publica `julioflores781/cv-web`.
