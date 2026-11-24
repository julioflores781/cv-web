# Cierre — web-service-cards

Tarea trivial (plan: `progress/web-service-cards/analysis.md`, prefijo `SC`, decidido por Julio: «quita de aquí las s-01…»). Review **APPROVED**
en la ronda 2 (la ronda 1 pidió borrar el `color: var(--muted)` muerto de `.top`).
Autorización humana explícita de Julio (2026-11-24): «cierra todo y sube el commit y push al repo y que se publique la imagen por favor».
Este cierre solo lleva el slug a `develop`; el PR `develop -> main`, que es el que publica la imagen, es un paso aparte.

## Repo `cv-web`
- Rama `feature/web-service-cards`, creada desde `develop` (`18d6288`, merge de `web-home-services`, al día con `origin/develop`).
- Commit 1, código y tests: `234e40c` fix(services): tarjetas de servicio sin la etiqueta S-NN [web-service-cards].
  Contiene los 5 archivos del slug (`analysis.md`, cambios 1–4), sin más (28 inserciones, 17 borrados, igual que en la review ronda 2):
  - `components/service-cards.tsx`
  - `components/service-cards.module.css`
  - `components/service-cards.test.tsx`
  - `components/service-cards.module.test.ts`
  - `components/contact-form.test.tsx`
- Commit 2, progress: docs(progress): plan, revisión y cierre de web-service-cards [web-service-cards]. Contiene
  `progress/web-service-cards/{brief,analysis,impl,review,close}.md` y `progress/history.md` (la entrada de `web-home-services` que añadió el leader).
  Su hash no puede figurar en este archivo, que va dentro de él; ver `git log develop`.
- Merge `--no-ff` a `develop` («Merge feature/web-service-cards en develop [web-service-cards]») y push de `develop` a `origin`.
  La rama feature no se publica, igual que en los cierres anteriores. Un push a `develop` no lanza la CI ni publica imágenes: `ci.yml` solo corre en push a `main`, en tags y en PRs.
- Verificación (Node 22.23.1, review ronda 2): lint OK, typecheck OK, 730/730 tests (156 archivos), build OK (el `next build` del `globalSetup`
  de `npm test`, con T25, T26 y T427 en verde; la ronda 2 del implementer también lanzó `npm run build`). Los archivos del slug no cambiaron después de la review.
- Después del merge, la rama local `feature/nas-autodeploy` de Julio (sin commits propios) avanza en fast-forward hasta `develop` y queda como rama actual.

## Fuera de este cierre (siguen sin commitear en la copia de trabajo)
- `deploy/docker-compose.yml`: el cambio de Watchtower de Julio.
- `AGENTS.md`: el bloque `nextjs-agent-rules` que añade `next dev`.
- `progress/current.md`: lo actualiza el leader.

## Pendiente
- La entrada de este slug en `progress/history.md` es del leader.
- Las observaciones fuera de alcance de `review.md` son sugerencias y no bloquean: el recorrido por nodos de texto repetido en `projects.test.tsx`
  y `service-cards.test.tsx` (candidato a un helper `textNodes` si aparece una tercera vez), SC-T1 sin aserción en EN y la divergencia con
  `Main.dc.html`, que conserva `S-01…S-04`.
- El PR `develop -> main` no se abre aquí: es el paso siguiente. Al fusionarlo se lanza la CI y se publica `julioflores781/cv-web`.
