# Cierre — web-home-services

Hijo 2/2 de `web-presence` (plan: `progress/web-presence/analysis.md` §3, prefijo `HS`). Review **APPROVED** en la ronda 1.
Autorización humana explícita de Julio (2026-11-24): «cierra todo y sube el commit y push al repo y que se publique la imagen por favor».
Este cierre solo lleva el slug a `develop`; el PR `develop -> main`, que es el que publica la imagen, es un paso aparte.

Validación local de Julio (HS-D5, HS-D7): «se ve bien». La fila de más que gana la cabecera en las franjas de 740–780 px (ES) y
724–764 px (EN) (observación 1 de `review.md`) se deja como está (HS-D7).

## Repo `cv-web`
- Rama `feature/web-home-services`, creada desde `develop` (`7b16090`, al día con `origin/develop`).
- Commit 1, código, configuración, docs y tests: `c90791c` feat(routes): Servicios como portada y Perfil en /perfil/, con 308 desde /servicios/ [web-home-services].
  Contiene los 28 archivos de «Archivos tocados» de `impl.md`, sin más:
  - Código y configuración: `lib/i18n/routes.ts`, `next.config.ts`, `components/site-header.tsx`, `components/mode-toggle.tsx` (solo el JSDoc),
    `lib/i18n/dictionaries.ts` y `.github/workflows/ci.yml`.
  - Docs: `AGENTS.md` (solo la fila `app/` del mapa), `CLAUDE.md` y `docs/web-standards.md`.
  - Tests: `lib/i18n/routes.test.ts`, `next.config.test.ts`, `components/{site-header,cajetin,home-view}.test.tsx`,
    `lib/seo/{metadata,json-ld}.test.ts`, `app/sitemap.test.ts`, `tests/helpers/runtime-pages.ts`,
    `tests/runtime/{pages,pdf,domain,resilience,admin-content,admin-e2e,admin-history,admin-images}.test.ts`,
    `tests/deploy/deploy-files.test.ts` y `tests/source.test.ts`.
- Commit 2, progress: docs(progress): revisión y cierre de web-home-services [web-home-services]. Contiene
  `progress/web-home-services/{impl,review,close}.md` y `progress/history.md` (la entrada de `web-featured-facts` que añadió el leader).
  El plan (`progress/web-presence/{brief,analysis}.md`) ya entró con `web-trajectory-split`. Su hash no puede figurar en este archivo, que va
  dentro de él; ver `git log develop`.
- Merge `--no-ff` a `develop` («Merge feature/web-home-services en develop [web-home-services]») y push de `develop` a `origin`.
  La rama feature no se publica, igual que en los cierres anteriores. Un push a `develop` no lanza la CI ni publica imágenes: `ci.yml` solo corre en push a `main`, en tags y en PRs.
- Verificación (Node 22.23.1, review ronda 1): lint OK, typecheck OK, 729/729 tests (156 archivos), build OK; `ƒ /[[...slug]]`,
  `ƒ /sitemap.xml`, `ƒ /robots.txt`, `ƒ /api/*` y `ƒ /cv-julio-flores-{es,en}.pdf` siguen dinámicas, y `.next/routes-manifest.json` trae las
  dos reglas nuevas con `statusCode: 308`. Los archivos del slug no cambiaron después de la review.
- Después del merge, la rama local `feature/nas-autodeploy` de Julio (sin commits propios) avanza en fast-forward hasta `develop` y queda como rama actual.

## Fuera de este cierre (siguen sin commitear en la copia de trabajo)
- `deploy/docker-compose.yml`: el cambio de Watchtower de Julio.
- `AGENTS.md`: el bloque `nextjs-agent-rules` que añade `next dev` (se stageó solo el hunk de la fila `app/`).
- `progress/current.md`: lo actualiza el leader.
- `web-service-cards` (otro slug aprobado, se cierra después): `components/service-cards.{tsx,module.css,test.tsx,module.test.ts}`,
  `components/contact-form.test.tsx` y `progress/web-service-cards/`.

## Pendiente
- La entrada de este slug en `progress/history.md` es del leader.
- HS-T27 (el smoke del job `docker`: `/perfil/` con `<h1` y las dos 308) solo corre en CI; su primera ejecución real es la del PR `develop -> main`.
- Las observaciones fuera de alcance de `review.md` son sugerencias y no bloquean: la granularidad de los tests fusionados (HS-T24, HS-T26),
  que `docs/web-standards.md` no nombre `/perfil/` ni las 308 en la descripción del smoke y la 404 con `lang="es"` (HS-D6).
- El PR `develop -> main` no se abre aquí: es el paso siguiente. Al fusionarlo se lanza la CI, se publica `julioflores781/cv-web` y, con
  Watchtower, se despliegan las redirecciones permanentes (HS-D5).
