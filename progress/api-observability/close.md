# Cierre — api-observability

Slugs: api-logging-core, api-audit-log, api-business-events (código en `cv`), web-logging, ops-log-docs (código en `cv-web`; docs y smoke en `cv`). Todos con review APPROVED. Cerrados juntos por estar entrelazados en los mismos archivos. Autorización humana explícita de Julio («cierra esta fase»).

## Repo `cv` (API Quarkus)
- Rama `feat/observability` desde `develop`; merge `--no-ff` a `develop`: `c7e59a5`.
- Commits: `2d7e6ff` feat(observability) (logging core, audit, business events; código y pruebas), `6eca3f5` docs(observability) (`docs/observability.md`, runbook, README, CLAUDE, ARCHITECTURE, smoke con X-Request-Id).
- Verificación: mvn -B verify OK (606 tests: 46 + 153 + 407); cobertura 96,4 % total (application 99,0 %, domain 94,2 %, infrastructure 95,3 %); `ci-summary.py --min-total 90 --min-module 80` OK; 7/7 pruebas Python.

## Repo `cv-web`
- Rama `feature/observability` desde `develop`; merge `--no-ff` a `develop` (hash en `git log`).
- Commits: `bb336fd` feat(logging) [web-logging], `779fbfa` chore(deploy) [ops-log-docs], y `docs(progress)` con este cierre, los 5 slugs, `api-observability/` y `current.md`. `progress/web-admin/` NO incluido (brief de la fase siguiente).
- Verificación (Node 22): lint OK, typecheck OK, 384/384 tests (81 archivos), build OK.

## NO verificado (solo el humano/CI)
Rotación de logs en el NAS y lectura en Portainer; el workflow de GitHub Actions de `cv`.

## Diferido
`api-metrics` (Micrometer/Prometheus en gestión interna; no debe mover `/q/health/ready`).

## Pendiente de la fase 3 (repo `cv-web`)
El panel `/admin` debe enviar `X-Client-IP` con la IP del navegador para que el audit la registre.

## Abrir los PR `develop -> main` (NO abiertos: decide el humano)
Sin líneas de atribución en el cuerpo.
- `cv`: **al fusionar a `main` el CI publica `julioflores781/cv-api` en Docker Hub.**
  `cd cv && gh pr create --base main --head develop --title "feat(observability): logs JSON, auditoría y eventos" --body "Logs estructurados, request id, audit de admin y eventos de negocio. Ver progress/api-observability/close.md en cv-web."`
- `cv-web`: lanza su CI (y publica `julioflores781/cv-web` en el push a `main`).
  `cd cv-web && gh pr create --base main --head develop --title "feat(logging): logs JSON y rotación en el NAS" --body "Logger JSON, request id y rotación de logs en el compose. Ver progress/api-observability/close.md."`
- Antes de fusionar: actualizar el stack en Portainer con el compose nuevo (rotación) y revisar `docs/observability.md` de `cv`.
