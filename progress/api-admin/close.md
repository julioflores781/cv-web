# Cierre — api-admin

Slugs: api-admin-auth, api-admin-password-cli, api-admin-cache, api-admin-content, api-admin-images, api-admin-messages, api-admin-docs-deploy (todos con review APPROVED). Cerrados juntos por estar entrelazados en los mismos archivos del repo `cv`. Autorización humana explícita de Julio («cerrá api-admin»).

## Repo `cv` (API Quarkus)
- Rama `feat/api-admin` desde `develop`; merge `--no-ff` a `develop`: `40cf2a7`.
- Commits: `f729546` feat(admin) (auth, password CLI, caché, contenido, imágenes, mensajes; código y pruebas), `33354c9` docs(admin), `2ed4fa2` ci, `8c623c0` chore(deploy) (elimina `deploy/docker-compose.yml`; se conserva `deploy/backup-db.sh`).
- Verificación: mvn -B verify OK (473 tests: 46 + 119 + 308); cobertura 96,3 % total (domain 94,2 %, application 98,8 %, infrastructure 95,3 %); `ci-summary.py --min-total 90 --min-module 80` OK; 7/7 pruebas Python.

## Repo `cv-web`
- Rama `feature/api-admin` desde `develop`; merge `--no-ff` a `develop` (hash en `git log`).
- Commits: `0fbba98` chore(deploy) (compose + tests/deploy), y `docs(progress)` con planes, briefs, impl, review y close de los 7 slugs, `api-admin/analysis.md`, `api-observability/{brief,analysis}.md` y `current.md`.
- Verificación (Node 22): lint OK, typecheck OK, 352/352 tests, build OK.

## NO verificado (solo el humano/CI)
R2 real (guion en `progress/api-admin-images/impl.md`), regla WAF de Cloudflare para `/api/v1/admin/*`, Argon2 y `admin-password.sh` en el NAS, el workflow de GitHub Actions de `cv`.

## Pendientes del humano
Crear token R2 propio, crear la regla WAF, revocar el token de Telegram expuesto en `.idea/workspace.xml` del IDE (ignorado por git y ausente del historial, pero en claro en local), prueba manual contra R2.

## Abrir los PR `develop -> main` (NO abiertos: decide el humano)
Sin líneas de atribución en el cuerpo.
- `cv`: **al fusionar a `main` el CI publica `julioflores781/cv-api` en Docker Hub.**
  `cd cv && gh pr create --base main --head develop --title "feat(admin): zona privada /api/v1/admin" --body "Admin API: auth, contenido, imágenes R2, mensajes. Ver progress/api-admin/close.md en cv-web."`
- `cv-web`: lanza su CI (y publica `julioflores781/cv-web` en el push a `main`).
  `cd cv-web && gh pr create --base main --head develop --title "chore(deploy): API de administración en el compose del NAS" --body "Compose con CV_ADMIN_* y R2_*, y progress de api-admin. Ver progress/api-admin/close.md."`
- Antes de fusionar `cv` a `main`: configurar en el NAS las variables `CV_ADMIN_JWT_SECRET`, `R2_*` y la regla WAF (ver `docs/admin-runbook.md` en `cv`).
