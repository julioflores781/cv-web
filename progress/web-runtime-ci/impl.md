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

## Correcciones tras la CI real (PR #2, run 43128054670)
Fallo: T5 marcó `password: ${{ secrets.DOCKERHUB_TOKEN }}` (ci.yml l.70, forma estándar de docker/login-action). En local pasó porque ci.yml aún no estaba versionado y el escáner usaba `git ls-files`.
- Escáner extraído a `tests/helpers/secret-scan.ts` (`containsSecret`). Un valor es válido si está vacío, empieza por `CAMBIA-` o es EXACTAMENTE una referencia `${{ secrets.NOMBRE }}` (con o sin comillas). Un literal, `${{ env.X }}` o una referencia con sufijo literal siguen fallando.
- T5 escanea ahora `git ls-files --cached --others --exclude-standard` (versionados + sin versionar no ignorados; se omiten los borrados), de modo que esta clase de fallo se ve en local antes de commitear.
- Bandera `i`: ya solo se aplica a las claves password/SECRET; AKIA, ghp_, BEGIN y xox[bp]- son sensibles a mayúsculas.
- Tests añadidos (fuera del plan): "T5 extra: referencias a secretos y CAMBIA- aceptados, literales rechazados" y "T5 extra: formas de token sensibles a mayúsculas". Las muestras se montan por concatenación para que los archivos del test no se detecten a sí mismos.
- Verificación Node 22: lint, typecheck, `npm test` x2 (76 archivos / 347 tests), build: verdes. Simulación de CI: copia a tmp, `git init`, `git add -A` (ci.yml con el job docker incluido), `npm ci`, lint, typecheck, test: verdes.

## Corrección tras el review: T89 restaurado
Al reescribir el bloque «public repository hygiene» se borró por error el test T89 (A9 de web-runtime-dominio). Restaurado tal cual estaba, solo cambia la lista que recorre: `candidates` (versionados + sin versionar no ignorados) en lugar de `tracked`. El diff contra HEAD de `tests/source.test.ts` ya solo toca T5, sus tests extra, el import de `containsSecret` y la lista `candidates`.
Verificación Node 22: lint, typecheck, `npm test` x2 (76 archivos / 348 tests, +1 respecto a la ronda anterior), build: verdes.
