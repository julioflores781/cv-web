# Review — web-runtime-ci

## Veredicto final: APPROVED (ronda 3; ronda 2 fue CHANGES_REQUESTED por T89 borrado)

Revision independiente con Node 22.23.1. Cambios requeridos: ninguno.

## Verificacion propia
- Working tree: `npm run lint`, `npm run typecheck`, `npm test` (61 archivos / 310 tests) y `npm run build`: verdes.
- T4 (clon limpio): `git clone` del repo local en el scratchpad + commit local de los 3 archivos sin versionar (ci.yml, tests/deploy, tests/source.test.ts), `npm ci`, lint, typecheck y `npm test`: verdes. Ningun test depende de `.rendered`, `.shots` ni `private/`.
- `design/preview.html`, `design/artifact/` y `.env*` (salvo `.env.example`) no estan versionados. Sin telefonos ni correos reales en archivos versionados fuera de `progress/` (grep propio); `progress/` solo cita los patrones prohibidos en `progress/web-runtime/analysis.md:232`.

## Trazabilidad Tn <-> it()
- T1 -> `tests/deploy/deploy-files.test.ts:24` (push main, tags v*, pull_request, concurrency solo PR, permissions contents: read). OK.
- T2 -> `tests/deploy/deploy-files.test.ts:35` (checkout@v7, setup-node con `.nvmrc`=22, cache npm, timeout, runs exactos). OK.
- T3 -> `tests/deploy/deploy-files.test.ts:48` (sin pull_request_target, sin literales, credenciales via secrets.*). OK.
- T4 -> verificado por mi en clon limpio (no es it(), como indica el plan).
- T5 -> `tests/source.test.ts` > "public repository hygiene" (.env*, `.gitignore` con `.env*`, patrones). OK.
- Criterios: A11 -> T1-T4; A18 -> T3, T5. Cubiertos.

## Workflow (`.github/workflows/ci.yml`) para repo publico
- Sin `pull_request_target`; `permissions: contents: read` a nivel raiz; sin secretos (el job docker llega en otro slug); acciones fijadas a major como en `cv/.github/workflows/ci.yml` (checkout@v7, setup-node@v6); `timeout-minutes: 20`; concurrency identica a `cv`. Sin hallazgos.

## Privacidad
Sin datos reales ni secretos en el diff.

## Skills consultadas
- simplify: sin hallazgos (sin dependencia YAML, helper `block` unico, sin codigo muerto).
- next-best-practices: sin hallazgos (no se toca codigo de app).
- strict-typing: sin hallazgos (`tests/deploy/deploy-files.test.ts:24-60` usa casts `as string` acotados tras regex/indices comprobados).
- testing-strategy: sin hallazgos accionables (ver observaciones).

## Checkpoints C1-C7
Sin cambios que afecten a UI/SEO/datos; lint, typecheck, tests y build en verde. Sin hallazgos.

## Cambios requeridos
Ninguno.

## Observaciones fuera de alcance
- `tests/source.test.ts` (regex `secretPattern`): la bandera `i` hace que `AKIA`/`ghp_` casen en minusculas y sin `\b`; riesgo latente de falso positivo en texto normal. Hoy 0 falsos positivos; los patrones son los del plan.
- T5 excluye `progress/` (desviacion documentada respecto al plan, que solo excluia node_modules/.next/lock): auditado a mano, solo `progress/web-runtime/analysis.md:232` cita patrones.
- T5 usa `git ls-files`: no escanea archivos aun sin commitear y requiere `.git` presente (en CI hay checkout, correcto).


---
# Ronda 2 (tras el fallo de la CI real, PR #2)

## Cambios requeridos
1. **Regresion: el arreglo borro el test T89** (`it('T89: no versioned file (progress/ excluded) mentions the old subdomain nor the old hosting')`), que existe en `HEAD:tests/source.test.ts:120` (slug web-runtime; `tests/runtime/domain.test.ts:11` lo referencia). En `tests/source.test.ts` (bloque `public repository hygiene`, ~l.114-130) solo queda T5; el diff elimina T89 sin motivo. Restaurarlo usando `candidates` en lugar de `tracked`. Hoy la suite pasa (347) porque nadie lo ejecuta, pero se pierde cobertura de un criterio ya cerrado.

## Verificado y correcto
- (1) `tests/helpers/secret-scan.ts` acepta `${{ secrets.X }}` (con/sin comillas) y `CAMBIA-`; rechaza literales, `${{ env.X }}` y sufijos literales. Probado en un clon temporal con `leak.txt` sin versionar (`password: hunter2`): T5 falla con `['leak.txt']`. Tests de ambos casos existen ("T5 extra", 2 its).
- (2) Escanea versionados + sin versionar no ignorados (`--cached --others --exclude-standard`), omite borrados. Confirmado con el leak sin versionar.
- (3) La bandera `i` ya solo aplica a `password|secret`; AKIA/ghp_/BEGIN/xox son sensibles a mayusculas (test "case-sensitively").
- (4) Simulacion CI (rsync del working tree + `git add -A`, ci.yml versionado, `npm ci`): lint, typecheck, `npm test` (76/347) y build verdes.
- (5) En el repo: lint, typecheck, build y suite x2 (76 archivos / 347 tests) verdes.


---
# Ronda 3

- `git diff HEAD -- tests/source.test.ts`: solo cambia el import, `tracked` -> `candidates`, T5 y los 2 tests "T5 extra". T89 intacto (ahora usa `candidates`, `tests/source.test.ts:125`). Cambio requerido 1 de la ronda 2: corregido.
- Tests: 348 (347 + T89 restaurado). Suite x2, lint, typecheck y build verdes en el repo.
- Simulacion de CI (rsync + `git add -A`, `.github/workflows/ci.yml` versionado, `npm ci`): lint, typecheck, 76 archivos / 348 tests y build verdes.

## Cambios requeridos
Ninguno.
