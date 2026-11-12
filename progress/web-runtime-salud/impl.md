# Implementation — web-runtime-salud

## Code
- `lib/api/health.ts`: `checkApi()` reuses `requestJson` (node:http transport, `getConfig().apiUrl`), timeout 2 s, `retries: 0`; any `ApiFetchError` is `down`. Note: the shared transport appends `?lang=es` to the probe URL (Quarkus ignores it).
- `app/api/health/route.ts`: `force-dynamic`, 200 `{"status":"ok","api":"up"}` / 503 `{"status":"degraded","api":"down"}`, `Cache-Control: no-store`.
- `tests/helpers/fake-api.ts`: the fake API now answers `GET /q/health/ready` (200 `{status:"UP"}`); `respond` can override it.

## Tn -> it()
- T52, T53 -> `lib/api/health.test.ts`
- T54, T55 -> `app/api/health/route.test.ts`
- T56 -> `tests/runtime/endpoints.test.ts` (standalone server)
- Extra tests outside the plan: none.

## Criterion -> tests
- A5 -> T52-T56; A8 -> T55; A10 -> T56.

## Verification (Node 22.23.1)
- lint, typecheck, `npm test` x2 (66 files / 301 tests), `npm run build` (route `/api/health` dynamic): green.
- Manual with the standalone + fake APIs (curl): healthy 200 (0.27 s); 503 -> 503 degraded; closed port -> 503 (0.03 s); slow (never answers) -> 503 at 2.4 s; `/api/health` -> 308 to `/api/health/`. All with `no-store` and JSON.
