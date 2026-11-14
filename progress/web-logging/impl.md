# Implementación — web-logging (slug 4 de api-observability, repo cv-web)

Estado: HECHO (ronda 1 de review aplicada, ver «Correcciones de la ronda 1») (W1–W21 escritos y en verde). Verificado con Node 22.23.1 (cifras de la primera entrega; las finales están en las correcciones): `npm run lint`, `npm run typecheck`, `npm test` (2 ejecuciones seguidas: 81 archivos, 378 tests, sin fallos, sin procesos huérfanos, sin líneas de log colándose en la salida) y `npm run build` (ok). Sin git de escritura.

## Código
- Nuevos: `lib/log.ts` (`logEvent`), `lib/request-id.ts` (`newRequestId`, 32 hex), `instrumentation.ts` (`onRequestError`).
- `lib/api/errors.ts`: `ApiFetchError.outcome` (`http_error|timeout|unreachable|invalid_response`), sin cambiar mensajes.
- `lib/api/request.ts`: un id por `requestJson` (opción `requestId` o generado), cabecera `X-Request-Id`, mismo id en reintentos, un WARN `api_call` por intento fallido; éxito silencioso.
- `lib/api/health.ts`: `checkApi(requestId?)`. `lib/api/contact.ts`: `requestId?` -> `X-Request-Id`. `app/api/health/route.ts`: WARN `health` solo si degradado. `app/api/contact/route.ts`: un id por POST, una línea `contact`, cabecera `X-Request-Id` en la respuesta. `lib/pdf/build-cv-pdf.ts`: `pdf_render_failed`.
- `lib/api/content.ts`: quitado su `console.error` (ver decisiones); ahora `getContent = cache(requestJson)`.
- `eslint.config.mjs`: `no-console` apagado solo para `lib/log.ts`. `docs/web-standards.md`: una frase del PDF actualizada.

## Tn -> test
| Tn | Test |
|---|---|
| W1-W4 | `lib/log.test.ts` (`W1`..`W4`) |
| W5 | `lib/request-id.test.ts` |
| W6-W10, W15 | `lib/api/request.test.ts`, `describe('request id and logs')` |
| W11 | `app/api/health/route.test.ts` (`W11`) |
| W12 | `lib/api/health.test.ts` (`W12`) |
| W13, W14 | `app/api/contact/route.test.ts`, `describe('logs and request id')`; W14 también en `lib/api/contact.test.ts` (`W14`) |
| W16 | `instrumentation.test.ts` |
| W17, W18 | `tests/runtime/logging.test.ts` (standalone real) |
| W19 | `lib/pdf/build-cv-pdf.test.ts` (`PD-T14 / W19`) |
| W20 | `tests/runtime/docker-layout.test.ts` (`W20`) |
| W21 | `tests/log-gate.test.ts` (+ helper `tests/helpers/console-scan.ts`) |

## Criterios -> tests
- A13 (logs estructurados y sin datos): W1-W4, W7-W11, W13-W21.
- A14 (request id web -> API): W5, W6, W12, W13, W14, W17, W18.

## `onRequestError` en el standalone
FUNCIONA, no hace falta el fallback. W17 lo demuestra (la página da 500, `render_error` aparece en el log del servidor). El build deja `.next/server/instrumentation.js` en el standalone (W20). Comprobado a mano también. Un 500 de render produce DOS líneas `render_error` idénticas (mismo `digest`; Next llama el hook dos veces, RSC y SSR). Se deja así; el `digest` las une.

## Tests extra fuera del plan
- `lib/log.test.ts`: `extra` (un campo no pisa timestamp/level/service/event; `logEvent` no lanza con consola rota ni getter que lanza).
- `lib/api/request.test.ts`: `W6 extra` (el `requestId` dado por el llamante es el enviado).
- `instrumentation.test.ts`: `extra` (un valor lanzado que no es `Error` no se registra).
- `tests/log-gate.test.ts`: `W21 extra` (el escáner acierta/ignora look-alikes).
- `tests/runtime/logging.test.ts`: `extra` (health degradado con la API real caída: 503, un WARN `health` con el mismo id que la sonda a la API).
- Ajustados por el cambio: `lib/api/content.test.ts` T12 y `tests/runtime/resilience.test.ts` T37 (antes comprobaban el `console.error` de `content.ts`), y `lib/pdf/build-cv-pdf.test.ts` PD-T14/T65/PD-T16 (ahora capturan `logEvent`).
- Helper nuevo `tests/helpers/capture-log.ts` y `TestServer.headers` en `tests/helpers/http-server.ts`.

## Decisiones
- `logEvent` usa `console.info` (stdout), `console.warn`/`console.error` (stderr): `console.log` está prohibido por `tests/source.test.ts` (T69).
- Salida: `request_id` va entre los campos (`logEvent('warn', 'x', { request_id })`); los campos no pueden pisar `timestamp/level/service/event`.
- Saneado: caracteres de control, U+2028/2029 -> espacio, `"` -> `'`, máximo 200 caracteres (termina en `…`).
- Contacto: `outcome` = `sent` | `rejected` (400/429 de la API, `code`) | `invalid` (validaciones propias: 415/413/JSON roto/campo; `code` y `reason` = `content_type|too_large|malformed_body|<nombre del campo>`) | `upstream_error`, `timeout`, `unreachable` (WARN, 502/504). Los 405 no se registran.
- Se eliminó el `console.error` de `content.ts` (`[cv-web] <Recurso> unavailable: <mensaje>`): duplicaba el `api_call` por intento y llevaba el mensaje del error; además W21 prohíbe `console.` fuera de `lib/log.ts`.
- `instrumentation.ts` no registra el `error` si no es una instancia de `Error` (un string lanzado podría llevar datos).
- No hay `request_id` en `render_error` (Next no da acceso a la petición): se une con `api_call` por el momento y la ruta, no por id.

## Ejemplos reales (standalone + API falsa, `X-Request-Id` coincide con el visto por la API falsa)
```
{"timestamp":"2026-11-12T18:47:17.952Z","level":"info","service":"cv-web","event":"contact","request_id":"1487cba8faf449cb96c6827de1d63075","outcome":"sent","status":201,"duration_ms":7}
{"timestamp":"2026-11-12T18:47:17.962Z","level":"info","service":"cv-web","event":"contact","request_id":"df9cbfc55d76431787bf93ceb0ed170e","outcome":"invalid","status":400,"code":"CONTACT_INVALID","reason":"email","duration_ms":0}
{"timestamp":"2026-11-12T18:47:17.979Z","level":"info","service":"cv-web","event":"contact","request_id":"ae9cbae92c31412ab6d3695d5571589e","outcome":"rejected","status":429,"code":"CONTACT_RATE_LIMITED","duration_ms":1}
{"timestamp":"2026-11-12T18:47:18.008Z","level":"warn","service":"cv-web","event":"api_call","request_id":"914b2d5af6a145eb96f720cda52d507f","path":"/q/health/ready","outcome":"http_error","status":503,"attempt":1,"duration_ms":1}
{"timestamp":"2026-11-12T18:47:18.008Z","level":"warn","service":"cv-web","event":"health","request_id":"914b2d5af6a145eb96f720cda52d507f","outcome":"degraded","status":503}
{"timestamp":"2026-11-12T18:47:18.016Z","level":"warn","service":"cv-web","event":"contact","request_id":"79071d6326054148a117a1c6ecf70165","outcome":"upstream_error","status":502,"duration_ms":1}
{"timestamp":"2026-11-12T18:47:18.159Z","level":"warn","service":"cv-web","event":"api_call","request_id":"8f390a895e2f4dbfaa4ac13a07552ee5","path":"/api/v1/resume","outcome":"http_error","status":503,"attempt":1,"duration_ms":15}
{"timestamp":"2026-11-12T18:47:18.671Z","level":"error","service":"cv-web","event":"render_error","route_path":"/[[...slug]]","route_type":"render","method":"GET","path":"/","digest":"2800301975","error":"ResumeFetchError"}
```
Prueba manual: contacto con canarios (nombre, correo, mensaje, `CF-Connecting-IP: 203.0.113.77`, cookie) válido, inválido (email), 429 y con API caída; health sano (sin línea) y caído; `GET /?q=CANARY-QUERY` con la API en 503 y luego sana (200). La API falsa vio `rid=` idéntico al `request_id` de cada línea (incluidos los 2 intentos del recurso con el mismo id). Ningún canario, IP ni query en la salida (solo el banner de Next muestra `127.0.0.1:<puerto del propio servidor web>`). Esa prueba manual NO cubría la API caída para el volcado de Next; lo corrige C1.

## Límites
- Next imprime por su cuenta el error de render completo (`⨯ Error [ResumeFetchError]: Resume (es): API answered HTTP 503` + traza + campos) en stderr: es multilínea y no pasa por `logEvent`. Tras la corrección C1 su mensaje y su causa ya no llevan host, puerto ni URL (la afirmación anterior de que no los llevaba era falsa para fallos de transporte); sigue sin ser JSON y no hay forma de silenciarlo sin `proxy.ts`/parches.
- `render_error` sale duplicado por 500 (mismo `digest`) y sin `request_id`.
- Sin línea por visita de página (decisión del humano). Los 405 del contacto no se registran.
- `docs/web-standards.md`: sección «Logs» completa y `deploy/docker-compose.yml` (`logging:`) quedan para `ops-log-docs` (slug 5).
- No verificado: Docker (sin daemon en local), salida real tras Cloudflare/NAS.

## Correcciones de la ronda 1 (review.md, «Cambios requeridos»)
- **C1 (fuga de host/puerto)**: `describeError` (`lib/api/errors.ts`) devuelve solo el código (`ECONNREFUSED`, `ETIMEDOUT`...) o la clase, nunca el mensaje; `ApiFetchError` ya NO admite `cause` (Next lo imprime con `address`/`port`); el JSON roto tampoco adjunta el `SyntaxError` (cita parte del cuerpo). Mensaje ahora: `Resume (es): request failed (ECONNREFUSED)`. Tests: `lib/api/request.test.ts` (`C1` x2; W15 sin `cause`), runtime `tests/runtime/logging.test.ts` (`C1`: API caída en el standalone real, ni la salida del servidor, incluido el volcado de Next, ni el cuerpo del 500 contienen `:<puerto de la API>`, `address:`, `connect ECONNREFUSED` ni `127.0.0.1` en el cuerpo; el cuerpo tampoco `ECONNREFUSED`/clases de error). Efecto: el volcado de Next sigue siendo multilínea pero solo con `request failed (ECONNREFUSED)`.
- **C2 (cobertura de contacto)**: W13 pasa canarios en name/email/message/website, `CF-Connecting-IP`, cookie y Authorization por TODOS los resultados (sent, rejected 400/429, upstream_error, timeout, unreachable, 415, 413, JSON roto, campo inválido), comprueba que ninguna línea contiene canarios, IP ni `127.0.0.1`, y que las claves de cada línea son solo `code, duration_ms, event, level, outcome, reason, request_id, service, status, timestamp`. W14 (éxito y API caída) se mantiene. Mutación probada en el repo y revertida: añadir `client: <CF-Connecting-IP>` a las líneas `rejected` y `timeout` ahora hace fallar W13 (antes, 11 tests verdes).
- **C3 (lista negra)**: `lib/log.ts` compara la clave normalizada (NFKC, minúsculas, solo `[a-z0-9]`), por lo que ` email`, `e\nmail`, `e\u200bmail`, `E-Mail`, `e_mail`, `\u0000ip`, `ｗebsite`... se omiten. Test `W4 extra` en `lib/log.test.ts`. Efecto colateral aceptado: una clave `e_mail` o `user-name`... tampoco se escribe si normaliza a una de la lista.
- Re-verificación (Node 22): lint sin avisos, typecheck ok, `npm test` x2: 81 archivos, 382 tests verdes cada vez, build ok, sin procesos del slug sobrantes.
