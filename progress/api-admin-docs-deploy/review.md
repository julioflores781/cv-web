# review — api-admin-docs-deploy

## Veredicto: APPROVED

Revisión independiente de los dos working trees (`cv` mezcla los slugs `api-admin-*` sin cerrar; aquí solo se juzga lo de este slug). Sin git de escritura; no se editó código ni docs.

## Verificación ejecutada por el revisor
- `cv`: `mvn -B verify` BUILD SUCCESS (308 pruebas, 0 fallos); `scripts/ci-summary.py --min-total 90 --min-module 80` rc 0; `python3 -m unittest discover -s scripts -p 'test_*.py'` 7 OK.
- Workflow `ci.yml`: parseado con Ruby `YAML` (sin PyYAML local): jobs `test` y `docker`, paso «Pruebas de los scripts (Python)» antes del resumen. Extraje el `run:` del paso «Probar el contenedor (smoke test)» del propio YAML y lo ejecuté tal cual contra la imagen construida con el `Dockerfile` (jar del `mvn verify`): smoke completo verde (incluye la URL `https://media.example.test/site/projects/0000…0001.webp`, 3 rutas admin con 401 y `CF-Ray` -> 404).
- Compose de `cv-web` sin editar, reproducido como `docker run` sobre una instancia real (mismos valores: marcador JWT `CAMBIA-por-32-bytes-aleatorios`, `CV_ADMIN_EDGE_BLOCK=true`, `R2_ENDPOINT`/`R2_BUCKET_NAME` `CAMBIA-…`, claves y `R2_PUBLIC_URL` vacías): `ready` 200, `/services`, `/projects`, `/architecture` 200; `/api/v1/admin/auth/session` y `/login` 404 `NOT_FOUND`; en el log `Admin disabled: CV_ADMIN_JWT_SECRET is missing or shorter than 32 characters`. La API pública NO se tumba.
- Mismo contenedor con secreto válido: `scripts/admin-password.sh set-password` (con pseudo-TTY vía `script`) crea la cuenta; login con la contraseña da 200 con `accessToken`; la contraseña mala 401; `CF-Ray` y `CF-Connecting-IP` -> 404; sin token -> 401 `no-store` + `WWW-Authenticate: Bearer`. Las variables `CV_ADMIN_ARGON2_*` del compose (descomentadas) sí se aplican: el hash salió `m=8192,t=1,p=1`. Sin TTY el script falla con el mensaje documentado.
- `cv-web` con Node 22.23.1: `npm run lint`, `typecheck`, `npm test` (incluye `tests/deploy`) y `npm run build` rc 0. `docker compose -f deploy/docker-compose.yml config -q` OK.
- Limpieza: contenedores `cv-db`, `cv-api`, `rv-db`, `rv-api`, redes `cvnet`/`rvnet` e imágenes `cv-api:ci`/`cv-api:rev` eliminados; puerto 8080 libre. (`postgres:16-alpine` ya existía en la máquina y se deja.)

## Trazabilidad Tn <-> it()
| Tn | Evidencia |
|---|---|
| T144 | `scripts/smoke-test.sh` verde con el CV de ejemplo (ejecutado arriba) |
| T145 | `smoke-test.sh` líneas 69-72: 401 + `ADMIN_UNAUTHORIZED` en 3 rutas y 404 con `CF-Ray` (ejecutado arriba) |
| T146 | `mvn verify` + 90/80 + paso Python en `ci.yml:34-37` (comandos reproducidos; el workflow en sí no corrió en GitHub) |
| T147 | grep de secretos en ambos repos versionados: sin coincidencias (ver Privacidad) |
| extra Da-Dd | `tests/deploy/deploy-files.test.ts:126-169`; verdes; comprueban variables, `EDGE_BLOCK` `"true"`, R2 vacío, marcador JWT `CAMBIA-` < 32, Argon2 solo comentado, sin `mem_limit`, sin `R2_KEY_PREFIX`. Los tests previos (T94/T95…) intactos |

## Trazabilidad criterios <-> verificación
1. Docs contra el código: contrastado con `application.properties`, `ApiError.java` (21 códigos citados coinciden con sus HTTP), `@Path` de los 5 recursos, `AdminPasswordPolicy` (12-128), `Argon2PasswordHasher` (`MAX_CONCURRENT = 2`), `R2ClientConfig` (`chunkedEncodingEnabled(false)`, `pathStyleAccessEnabled(true)`, `WHEN_REQUIRED`), `R2Settings.configured()` (4 variables), defaults (`dryRun=true`, `olderThanHours=24`, `limit=50`, 98304 bytes, 10 intentos/min, 5 fallos/PT15M), `ApiCacheHeaders` (`public, max-age=300`), `V4`/`V5`, `MinioSupport` (imagen chainguard), `AdminConfig.java:45` (texto exacto del aviso). Sin referencias obsoletas: grep de `deploy/docker-compose`, `QUARKUS_HTTP_CORS`, «no hay endpoints» en `cv` solo devuelve los punteros nuevos a `cv-web`.
2. Compose de `cv-web`: estilo del repo, valores `CAMBIA-…`, sin secretos, YAML válido, arranque sin editar comprobado (arriba).
3. Smoke/CI: coherentes (secreto de prueba de 42 caracteres >= 32, `EDGE_BLOCK=true`, `R2_PUBLIC_URL` de prueba; sin credenciales R2 = subida deshabilitada).
4. Runbook ejecutable en orden 1->4, regla WAF con expresión exacta, guion R2, tabla de síntomas, rotación/recuperación, sin secretos (`"password":"…"` es un marcador).
5. Desviaciones (sin `R2_KEY_PREFIX`, sin `cv.admin.openapi.enabled`, compose de `cv` eliminado, `backup-db.sh` conservado): coherentes en README, ARCHITECTURE, CLAUDE.md, compose, test Da e impl.md.
6/7: ver abajo.

## Privacidad / T147
- `cv/.idea/workspace.xml`: `git check-ignore` -> `.gitignore:2 .idea/`; `git ls-files .idea` = 0; `git log --all -- .idea` = 0 commits; ningún commit que toque `CV_CONTACT_TELEGRAM_BOT_TOKEN` añade un valor con forma de token. El valor no aparece en ningún doc de `cv` ni en `cv-web/progress` (grep de patrón de token de Telegram: 0). Sigue siendo recomendable revocarlo con @BotFather (aviso ya en impl.md).
- Patrones (claves AWS/GitHub/PEM/Slack/`sk-`, endpoint R2 con id de cuenta, token Telegram, `R2_SECRET_ACCESS_KEY` con valor) sobre archivos versionados y no ignorados de ambos repos: sin coincidencias. Solo correos `ada@example.com` (CV ficticio). La constante del CI es un valor desechable declarado como tal.
- Índice de `cv`: `git diff --cached` vacío; el borrado de `deploy/docker-compose.yml` figura como ` D` (working tree, no preparado). Sin rarezas.

## Skills consultadas
Revisión manual con el criterio de cada una (no se invocaron como herramienta):
- `simplify`: sin hallazgos accionables en el diff (docs y config). Duplicación README/ARCHITECTURE/CLAUDE intencionada (distinto lector).
- `next-best-practices`: no aplica (cv-web solo toca `deploy/docker-compose.yml` y un test).
- `strict-typing`: `tests/deploy/deploy-files.test.ts:129-130,162` tipado limpio (`typecheck` verde); sin hallazgos.

## Checkpoints C1-C7
Sin hallazgos que afecten al alcance (no hay UI, SEO ni lib/api tocados). Lint, typecheck, tests y build verdes.

## Cambios requeridos
Ninguno.

## Observaciones fuera de alcance (no bloquean)
- `docs/admin-runbook.md:67`: `API=http://cv-api:8080` solo resuelve desde dentro de la red de Docker, no desde el shell del NAS; el propio texto ofrece `localhost:8085` publicando el puerto, que es lo que funciona. Podría decirlo explícito y avisar de que el guion usa `jq`.
- `ARCHITECTURE.md` (fila `admin_account`): «una sola fila (`id = 1`) (un único administrador)» tiene un paréntesis redundante.
- `application.properties:62` dice «404/401» sin secreto; el comportamiento real es 404 (verificado). Es código de otro slug.
- Las imágenes `cv-api:latest`/`cv-web:latest` del compose no cambian por este slug: la API desplegada necesita la versión nueva para que existan las variables.

## NO verificado
- Que el paso de Python y el `docker run` ampliado funcionen dentro de GitHub Actions (se reprodujo el `run:` extraído del YAML en local, no el workflow).
- Nada contra R2 real (R-3), la regla WAF de Cloudflare (R-1) ni los nombres de menús de Cloudflare descritos en el runbook; tampoco Argon2 ni `admin-password.sh` en el NAS (arm64, Portainer).
- La memoria mínima de 512 MB recomendada (no medida) y el tiempo de Argon2 en el NAS.
- El compose no se desplegó en Portainer: se validó con `docker compose config -q` y emulando sus variables con `docker run`.
- `GET /api/v1/projects` con `Cache-Control` en vivo (confirmado en código, no con `curl -i`; el `curl -I` HEAD no mostró la cabecera).
- Subida/borrado/limpieza de imágenes y login con contraseña real ya existente (solo el alta y el login básicos).
- Los slugs 1-6 de `cv` siguen sin cerrar; su código no se revisó aquí.
