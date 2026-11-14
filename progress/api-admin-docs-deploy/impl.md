# impl — api-admin-docs-deploy

Estado: **hecho**. Cambios en el working tree de `cv` y `cv-web`, sin commits ni ramas. Código de la API sin tocar.

## Qué cambió en cada archivo

### Repo `cv-web`
- `deploy/docker-compose.yml`: servicio `cv-api` con `CV_ADMIN_JWT_SECRET` (marcador `CAMBIA-por-32-bytes-aleatorios`, 30 caracteres a propósito: sin editarlo el admin queda deshabilitado, no firmable con un secreto público), `CV_ADMIN_SESSION_LIFESPAN` (`PT8H`), `CV_ADMIN_LOGIN_MAX_FAILURES` (`"5"`), `CV_ADMIN_LOGIN_LOCK` (`PT15M`), `CV_ADMIN_EDGE_BLOCK: "true"` (obligatorio, comentado), `R2_ENDPOINT`/`R2_BUCKET_NAME` (`CAMBIA-…`), `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` (`""`), `R2_PUBLIC_URL` (`""`). Comentarios: `openssl rand -base64 48`, token de R2 propio con permisos solo sobre el bucket, parámetros de Argon2 como variables **comentadas** (`CV_ADMIN_ARGON2_MEMORY_KIB/_ITERATIONS/_PARALLELISM`, medir en el NAS, R-12), y nota de memoria (sin `mem_limit`; si se pone, ≥ 512m). Cabecera: aviso de bloquear `/api/v1/admin/*` si la API se expone por el túnel.
- `tests/deploy/deploy-files.test.ts`: describe nuevo «admin and R2 variables of cv-api» con 4 tests extra (Da–Dd, ver abajo). Los existentes (T94/T95…) siguen intactos y verdes.

### Repo `cv`
- `deploy/docker-compose.yml`: **eliminado** (es el único archivo borrado; `deploy/backup-db.sh` se conserva). El README apunta al compose de `cv-web`. Nota: por un descuido ejecuté un `git rm --cached` sobre ese archivo y lo revertí de inmediato con `git reset -q -- deploy/docker-compose.yml`; el índice quedó como antes (el borrado figura como no preparado, ` D`). Fue el único comando de git de escritura.
- `docs/admin-runbook.md` (nuevo): checklist del humano en 8 puntos (token R2, regla WAF, variables, desplegar + `set-password`, prueba contra R2 real con ajustes de checksum, comprobaciones, rotación/recuperación, medir Argon2).
- `README.md`: estructura (sin compose, `docs/`), comandos (smoke con sus requisitos y `unittest`), forma de `images` en el JSON de proyectos y de `GET /projects`, sección nueva «Administración» (tabla de rutas, códigos de error, comando de contraseña, tabla de variables), «Despliegue en el NAS» apuntando al compose de `cv-web`, CI (Python y smoke con admin).
- `ARCHITECTURE.md`: reescrita la afirmación «No hay endpoints de administración»; fila `/admin/**` y `images[]` en el contrato; `admin_account` y `source/comment` en datos; límites de cuerpo; nueva sección 7 (capas, sesión y `sv`, fuerza bruta, contenido versionado, imágenes, contrato para el panel, trampas: red, límite de cuerpo solo en `admin/images`, filtro de Cloudflare, autenticación diferida, `sv` y una instancia, época de caché).
- `CLAUDE.md`: estado, comandos (compose en `cv-web`, smoke, `unittest`, `admin-password.sh`), regla «Admin», trampas del admin, «Hecho» y nota de la fase 3.
- `scripts/smoke-test.sh`: cabecera con requisitos; comprueba que `GET /projects?lang=en` trae `https://media.example.test/site/projects/00000000-0000-4000-8000-000000000001.webp`; `auth/session`, `content/services` e `images` sin token dan 401 con `ADMIN_UNAUTHORIZED`; con `CF-Ray` da 404.
- `.github/workflows/ci.yml`: paso «Pruebas de los scripts (Python)» (`python3 -m unittest discover -s scripts -p 'test_*.py' -v`) antes del resumen de cobertura; el contenedor del smoke arranca con `CV_ADMIN_JWT_SECRET` de prueba (constante desechable, no secreta), `CV_ADMIN_EDGE_BLOCK=true` y `R2_PUBLIC_URL=https://media.example.test`. El umbral 90/80 sigue igual.

## Tn → verificación
| Tn | Verificación |
|---|---|
| T144 (smoke con el seed regenerado con `images`) | `scripts/smoke-test.sh` contra el jar empaquetado en Docker (imagen construida con el `Dockerfile` del repo, Postgres 16, seed `db/sample/V1000__sample_resume.sql`, mismas variables que el CI): todo verde, incluida la URL de la imagen del ejemplo |
| T145 (401 admin con `code`) | mismo smoke: 3 rutas admin sin token → 401 `ADMIN_UNAUTHORIZED`, y `CF-Ray` → 404. Contraste: arrancada sin `CV_ADMIN_JWT_SECRET`, el smoke **falla** (404 `NOT_FOUND`), como está documentado |
| T146 (`mvn verify` + 90/80 + Python en CI) | `mvn -B verify` BUILD SUCCESS (308 pruebas solo de infrastructure en el último reactor; 0 fallos); `ci-summary.py --min-total 90 --min-module 80` rc 0: total 96,3 %, application 98,8 %, domain 94,2 %, infrastructure 95,3 %; `python3 -m unittest discover -s scripts -p 'test_*.py'` 7 OK. El paso nuevo del workflow no se ejecutó en GitHub (ver no verificado) |
| T147 (sin secretos ni datos reales) | grep en ambos repos (claves AWS/GitHub/PEM/Slack/`sk-`, endpoints R2 con id de cuenta, tokens de Telegram, `R2_*`/`CV_ADMIN_JWT_SECRET` con valor, correos): solo coincide la constante de prueba del CI (intencional) y un hallazgo local, ver abajo |
| extra Da | `deploy-files.test.ts`: todas las variables admin/R2 declaradas, valores por defecto documentados, sin `R2_KEY_PREFIX` |
| extra Db | `CV_ADMIN_EDGE_BLOCK` es `"true"`; credenciales y URL pública de R2 vacías; endpoint y bucket `CAMBIA-…` |
| extra Dc | el secreto JWT es `CAMBIA-…` y mide < 32 caracteres |
| extra Dd | las variables de Argon2 solo existen comentadas y `cv-api` no tiene `mem_limit`/`deploy`/`memory` |

Verificación de `cv-web` (con Node 22.23.1; el `node` por defecto del PATH es 20.20.2 y con él fallan los tests de PDF por `Map.groupBy`, ajeno a este cambio): `npm run lint` y `npm run typecheck` limpios; `npm test` dos veces: 76 archivos, 352 pruebas, verde las dos; `npm run build` OK. Compose: `docker compose -f deploy/docker-compose.yml config -q` OK (Compose v5.1.2) y parseado con Ruby `YAML` (el Python local no trae PyYAML): `CV_ADMIN_EDGE_BLOCK` llega como el texto `true` y las 16 variables esperadas están. No se desplegó nada. Limpieza: contenedores, red e imagen del smoke eliminados.

## Decisiones y desviaciones del brief
1. **`R2_KEY_PREFIX` NO se añade al compose.** El brief y §9 del plan lo pedían, pero `api-admin-images` decidió que la clave es siempre `site/projects/<uuid>.<ext>` y la API no lee esa variable (grep en `application.properties` y el código: no existe). Una variable inerte engañaría. El test extra Da comprueba que no está y README/CLAUDE lo dicen.
2. **`cv.admin.openapi.enabled` (§5.5) tampoco existe en el código**: no se documenta. Swagger muestra siempre las rutas admin.
3. **`R2_PUBLIC_URL` vacío** (no `https://media.floreslab.dev` como en §9): es un dominio no confirmado; vacío = el GET público no devuelve imágenes, sin URLs rotas. `R2_ENDPOINT`/`R2_BUCKET_NAME` con `CAMBIA-…` y claves vacías: la API exige las cuatro para considerar R2 configurado, así que sigue deshabilitado (comprobado en `R2Settings.configured()`).
4. **Marcador del secreto JWT < 32 caracteres** (fail-safe): un compose pegado sin editar no deja un secreto conocido y válido.
5. **Sin límite de memoria** en `cv-api` (no tiene `mem_limit`, comprobado): solo se documenta. La recomendación de ≥ 512m es mía y **no está medida**; hay que tener en cuenta además la segunda JVM de `admin-password.sh` en el mismo contenedor.
6. **Compose de `cv` eliminado** (no puntero): evita dos fuentes de verdad; la referencia queda en README y CLAUDE. El compose antiguo tenía `QUARKUS_HTTP_CORS_ORIGINS`; el de `cv-web` no (la web llama por la red interna), y el README lo dice.
7. El smoke exige el admin activo y `R2_PUBLIC_URL` (documentado en su cabecera, README y CLAUDE.md): no sirve tal cual contra un `quarkus:dev` sin esas variables.
8. Los tests extra del compose se llaman «extra Da–Dd» para no confundirlos con T144.
9. Documentado tal como lo dicen los `impl.md` y verificado contra el código: rutas (`@Path`), códigos (`ApiError`), variables (`application.properties`), claims del JWT (`SmallRyeSessionTokenIssuer`: `iss`, `aud=cv-admin`, `sub=admin`, `sv`, `jti`), columnas de `admin_account` (V4), comando y flags de `admin-password.sh`.

## Hallazgo para el humano (T147)
`cv/.idea/workspace.xml` (local, ignorado por git: `.gitignore` línea 2, no está en el índice ni en el historial consultado) contiene en claro un valor de `CV_CONTACT_TELEGRAM_BOT_TOKEN` que parece un token real de bot de Telegram. No está en el repo público, pero conviene **revocarlo con @BotFather** (o limpiar esa entrada de la configuración de ejecución del IDE). No reproduzco el valor aquí.

## NO verificado
- Que el paso nuevo de Python y el `docker run` ampliado funcionen **en GitHub Actions** (reproduje los comandos en local, no el workflow). `docker compose config` sí se ejecutó, pero el compose no se desplegó.
- Nada contra R2 real (R-3), ni la regla de Cloudflare (R-1), ni Argon2 en el NAS (R-12), ni `admin-password.sh` en el NAS (arm64, Portainer). Son los pasos del runbook para el humano.
- La memoria mínima recomendada (512m).
- El runbook describe de memoria la interfaz de Cloudflare (nombres de menús y expresión WAF), sin poder abrirla.
- Los tipos TypeScript de `images[]` en la web y el panel `/admin` son de la **fase 3** (no se tocaron en `cv-web`).
- Los slugs 1–6 siguen sin cerrar (decisión del humano); el working tree de `cv` mezcla todos los `api-admin-*`.
