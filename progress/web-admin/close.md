# Cierre — web-admin (fase 3, panel /admin)

Slugs (10, todos con review APPROVED): web-admin-api-client, web-admin-auth, web-admin-content-core, web-admin-projects, web-admin-architecture, web-admin-images, web-admin-history, web-admin-messages, web-admin-public-images, web-admin-regresion. Cerrados juntos por estar apilados y entrelazados en los mismos archivos. Autorización humana explícita de Julio («Ciérralo y sube todo a git»), tras probarlo en local (API + base local + standalone, también desde el móvil).

## Repo `cv-web`
- Rama `feature/web-admin` desde `develop`; merge `--no-ff` a `develop` y push de `develop` a `origin`.
- Commits: `7634b83` feat(admin) [web-admin] (código y tests), `1367b57` chore(ci) [web-admin-regresion] (smoke de CI y docs), y `docs(progress)` con este cierre, los 10 slugs y `current.md`.
- Verificación (Node 22.23.1): lint OK, typecheck OK, 709/709 tests (152 archivos), build OK; rutas del panel `ƒ` y `ƒ Proxy`.

## Decisiones de Julio durante la fase
- `/admin/api/images` fuera del matcher de `proxy.ts` (Next bufferizaba hasta 10 MB antes del tope de 5 MiB).
- Portadas públicas solo `https:`.

## NO verificado (tras desplegar)
Cookie `Secure` tras el túnel de Cloudflare, `X-Client-IP` en la auditoría, regla WAF de `/api/v1/admin/*`, R2 real (subida y miniaturas), arrastrar y soltar a mano, V6 por píxeles.

## Pendiente fuera de cv-web
- Repo `cv`: confirmar contra la API real los 404 deducidos de JAX-RS (`olderThanHours`, `limit` y `{version}` no enteros) y añadirlos a `docs/admin-runbook.md`.
- Repo `cv`: rechazar en la limpieza un `dryRun` que no sea `true`/`false` (hoy cuenta como `false`: borrado real).

## Abrir el PR `develop -> main` (NO abierto: decide el humano)
Lanza la CI y, al fusionar, publica `julioflores781/cv-web`. No desplegar el panel sin la regla WAF de la API.
`cd cv-web && gh pr create --base main --head develop --title "feat(admin): panel /admin" --body "Panel de administración y portadas públicas. Ver progress/web-admin/close.md."`
