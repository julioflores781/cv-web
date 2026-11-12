# web-runtime-ci — implementación

## Archivos
- `.github/workflows/ci.yml` (nuevo): job `test` (checkout@v7, setup-node@v6 con `.nvmrc`=22 y `cache: npm`, `npm ci`, lint, typecheck, test; `timeout-minutes: 20`). Sin job `docker` (llega en `web-runtime-docker`).
- `tests/deploy/deploy-files.test.ts` (nuevo): T1–T3. Sin dependencia YAML: se leen bloques por indentación y regex.
- `tests/source.test.ts` (ampliado): T5.

## Tn -> it()
| Test | it() |
|------|------|
| T1 | `tests/deploy/deploy-files.test.ts` > "T1: triggers on push to main, v* tags and pull_request; ..." |
| T2 | `tests/deploy/deploy-files.test.ts` > "T2: job test checks out with v7, ..." |
| T3 | `tests/deploy/deploy-files.test.ts` > "T3: no pull_request_target, ..." |
| T4 | Verificación en clon limpio (no es un `it()`): ver abajo |
| T5 | `tests/source.test.ts` > "T5: no .env files but .env.example, ..." |

## criterio -> tests
- A11 (CI pública lint+typecheck+test en push/PR): T1, T2, T3, T4. (La parte docker/publicación es de `web-runtime-docker`.)
- A18 (repo público sin secretos ni datos reales): T3 (workflow), T5 (árbol versionado).

## Decisiones / notas
- T4 (R12): `git clone` del repo local a un directorio temporal del scratchpad + overlay de los 3 archivos aún sin commitear, `npm ci`, lint, typecheck y `npm test` con Node 22: 61 archivos / 310 tests en verde. Ningún test depende de `.rendered`, `.shots` ni `private/`; no hizo falta saltar ni generar nada.
- T5 escanea `git ls-files` (excluye `package-lock.json`) y **excluye `progress/`**: esas notas del arnés nombran los patrones prohibidos a propósito (el propio plan los cita); se auditan a mano (R10). Los patrones del test usan clases de caracteres (`gh[p]_`) para no auto-detectarse.
- Sin tests extra fuera del plan. Sin dependencias nuevas.
- `.env.example` contiene solo URLs públicas; sin secretos.

## Verificación (Node 22.23.1)
`npm run lint`, `npm run typecheck`, `npm test` (310/310) y `npm run build`: verdes.
