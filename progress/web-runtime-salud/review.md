# Review — web-runtime-salud

## Veredicto: APPROVED

Alcance revisado solo: `lib/api/health.ts`, `app/api/health/route.ts`, sus tests, `tests/runtime/endpoints.test.ts` (T56) y la ruta `/q/health/ready` de `tests/helpers/fake-api.ts`. No se mezclaron cambios de web-runtime-ci/-datos/-vacios.

## Verificación (Node v22.23.1)
- `npm run lint`, `npm run typecheck`: verdes. `npm run build`: verde, `/api/health` figura como dinámica (ƒ).
- `npm test` x2: 66 archivos / 301 tests verdes ambas veces.
- Standalone con APIs falsas (curl a `/api/health/`):
  - sana: 200 `{"status":"ok","api":"up"}`, `cache-control: no-store`, `application/json`, 0.03 s.
  - 503 (cuerpo con texto interno): 503 `{"status":"degraded","api":"down"}`, sin filtrar el cuerpo.
  - puerto cerrado: 503, 0.02 s.
  - lenta (no responde): 503 a 2.02 s, sin reintento.
  - `/api/health` sin barra: 308 `location: /api/health/`. POST: 405.

## Trazabilidad Tn ↔ it()
- T52 -> `lib/api/health.test.ts:15` (200, una sola petición a `/q/health/ready?lang=es`). OK.
- T53 -> `lib/api/health.test.ts:22` (503, puerto cerrado y lenta >2 s: ~2 s, 1 petición, sin reintento). OK.
- T54 -> `app/api/health/route.test.ts:15` (200, JSON, no-store, cuerpo exacto). OK.
- T55 -> `app/api/health/route.test.ts:26` (503, cuerpo exacto, sin URL/host/ECONNREFUSED/ApiFetchError/sentinelas). OK.
- T56 -> `tests/runtime/endpoints.test.ts:23` (308 sin barra, 200 con barra, contra el standalone). OK.
- Tests extra fuera del plan: ninguno.

## Trazabilidad criterios ↔ tests
A5 -> T52–T56; A8 (sin fuga) -> T55; A10 (trailingSlash/308) -> T56. Cubiertos.

## Comprobaciones específicas
- Sin fuga: la ruta solo emite dos cuerpos literales; `ApiFetchError` nunca se serializa (`app/api/health/route.ts:10-12`). Un error no-`ApiFetchError` se relanza (`lib/api/health.ts:22`), pero `requestJson` solo lanza `ApiFetchError`; Next devolvería un 500 genérico sin detalles. Sin hallazgo.
- Sin caché: `force-dynamic` + `no-store` + transporte `node:http` (no `fetch` parcheado).
- Timeout 2 s y `retries: 0` (`lib/api/health.ts:4,16`). Medido: 2.02 s.
- `trailingSlash` intacto (`next.config.ts` sin cambios; T23 sigue verde).
- Sin duplicar transporte: reutiliza `requestJson` con un `Resource` mínimo (`lib/api/health.ts:7-11`).
- `process.env` solo en `lib/api/config.ts` en código de producción (los otros hits son `tests/helpers/env.ts` y `tests/source.test.ts`).
- Privacidad: respuesta sin datos del CV; repo sin datos personales añadidos.

## Skills consultadas
- simplify: sin hallazgos (14 líneas de lib + 12 de ruta, sin duplicación).
- next-best-practices: sin hallazgos (`app/api/health/route.ts:3` `force-dynamic` correcto para route handler sin caché; GET sin `request`).
- strict-typing: sin hallazgos (`ApiStatus` unión literal, `Resource<true>`, sin `any`).
- testing-strategy: sin hallazgos (los 5 tests cubren éxito, 503, caída, lentitud, fuga y redirección contra servidores reales).
- seo-audit / ui-ux-pro-max: no aplican (sin metadata ni UI).

## Checkpoints C1–C7
Lint, typecheck, tests y build verdes; sin datos privados; sin git de escritura observado; tokens/accesibilidad/SEO no afectados. Sin incumplimientos.

## Cambios requeridos
Ninguno.

## Observaciones fuera de alcance
- La sonda añade `?lang=es` a `/q/health/ready` (documentado en impl.md); inocuo, Quarkus lo ignora.
- Un 200 con cuerpo no-JSON cuenta como `down` (el transporte parsea JSON); correcto con Quarkus, que siempre responde JSON.
