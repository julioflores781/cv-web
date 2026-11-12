# Review — web-runtime-ci

## Veredicto: APPROVED

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
