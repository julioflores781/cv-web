# impl — ops-log-docs

Estado: **HECHO** (D1, D2, D3). Repos `cv` y `cv-web`, solo working tree, sin git de escritura. No se tocó código de API ni de web, ni el CI de `cv` (no hizo falta: el smoke ya corre en el job `docker`).

## Cambios por archivo
`cv-web`:
- `deploy/docker-compose.yml`: `logging: {driver: json-file, options: {max-size: "10m", max-file: "5"}}` en `cv-db`, `cv-api` y `cv-web` (comentarios en español). Healthchecks intactos.
- `tests/deploy/deploy-files.test.ts`: nuevo `describe` «log rotation (D1)» con 2 tests (rotación en los 3 servicios y exactamente 3 bloques `logging`; los 3 `healthcheck` literales con sus tiempos).
- `docs/web-standards.md`: sección «Logs». `CLAUDE.md`: bullet «Logs». `AGENTS.md`: fila del mapa (`lib/log.ts`, `lib/request-id.ts`, `instrumentation.ts`).
- `progress/current.md`: `Tarea en curso: ops-log-docs`.

`cv`:
- `scripts/smoke-test.sh`: función `request_id_of` y 4 comprobaciones: `/api/v1/profile` sin cabecera devuelve 32 hex; con `X-Request-Id: smoke-test-0001` devuelve el mismo; con uno inválido (`corto`) lo sustituye por 32 hex; `/q/health/ready` responde 200 (curl `-f`) y lleva la cabecera.
- `docs/observability.md` (nuevo): lectura en el NAS (Portainer, `docker logs`, grep por audit/access/`request_id` entre web y API), formato, access (`rid=`, `err=`, `ip=`, exclusiones), tabla de audit (13 acciones), negocio y errores, web (5 eventos), qué no se registra, fuerza bruta, rotación y límites.
- `README.md` (árbol + sección «Logs»), `ARCHITECTURE.md` (enlace en Trazabilidad y en retención de audit), `CLAUDE.md` (enlace en Auditoría y nota en la línea del smoke), `docs/admin-runbook.md` (enlace en §7).

## Dn -> verificación
- **D1**: tests `D1: every service rotates…` y `D1: the health checks are exactly…` (15/15 en `tests/deploy`). Mutación (`max-file` "3" en un servicio) hace fallar el primero; revertido. Parseo con Ruby YAML (los 3 `logging` correctos) y `docker compose config -q` OK (Node 22.23.1: lint sin avisos, typecheck OK, `npm test` x2 = 81 archivos / 384 tests verdes, build OK).
- **D2**: se construyó el jar desde una copia del repo en el scratchpad (`mvn package -DskipTests`; no se tocó `target` del repo) y la imagen `cv-api:opslog`; Postgres 16 + API con las mismas variables que el CI (`CV_ADMIN_JWT_SECRET` de prueba, `CV_ADMIN_EDGE_BLOCK=true`, `R2_PUBLIC_URL=https://media.example.test`), sample de `db/sample` aplicado: `scripts/smoke-test.sh` completo OK (rc 0, dos ejecuciones). `curl -i` confirma `X-Request-Id` de 32 hex y el access log de la instancia muestra `rid=smoke-test-0001` con `request_id` plano. Contenedores y red retirados.
- **D3**: revisión contra el código y los `impl.md` 1–4. Contrastado: patrón de access (`%R`, no `%U`), exclusiones, claves excluidas del JSON (incluido `ndc`), `logger` de negocio = nombre completo de clase (el plan decía `cv.contact`, que no existe), textos de los WARN/INFO de Telegram, caché y refresco, 13 acciones de `AuditAction` y sus detalles ordenados por clave, campos y `outcome` de los eventos web, lista negra de `lib/log.ts`. Ejemplos tomados de los `impl.md` (ficticios).
- Grep de `/Users/`, `/Volumes/`, tokens y claves en lo añadido: sin coincidencias.

## Decisiones
- `cv-db` también rota (misma regla; Postgres escribe poco, y así ningún servicio queda fuera).
- Se corrigió respecto al plan: access usa `%R`; categorías de negocio por clase; los `grep` usan `"logger":"audit"` en vez de `audit` suelto (evita falsos positivos).
- No se modificó `ci.yml` de `cv` (el smoke ya se ejecuta ahí y el script nuevo no pide nada más al contenedor); no se ejecutó `mvn verify` porque no se cambió código.

## NO verificado
- Rotación real de Docker en el NAS (solo parseo del compose, `config -q`) ni Portainer (rutas de menú de la documentación según el brief).
- El workflow de GitHub Actions de `cv` (solo el script contra una instancia equivalente en local).
- Los `grep` de la guía ejecutados contra logs reales del NAS (sí contra el formato real visto en la instancia local).
