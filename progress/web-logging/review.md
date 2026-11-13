# Review — web-logging (cv-web, slug 4 de api-observability)

## Veredicto final (ronda 2): APPROVED

Ronda 1 (CHANGES_REQUESTED, C1-C3) y ronda 2 más abajo; las secciones de la ronda 1 se conservan como histórico.

## Ronda 2 — verificación de las correcciones (Node 22.23.1)
- `npm run lint`, `npm run typecheck`, `npm run build`: ok. `npm test` x2: 81 archivos, 382 tests, verde ambas veces; 0 líneas JSON de log en la salida, 0 `next-server` tras las ejecuciones, `/tmp` limpio.
- **C1 resuelto.** `lib/api/errors.ts`: `describeError` devuelve solo el código (`^[A-Z0-9_]{1,40}$`, también dentro de `AggregateError`) o el nombre de clase, nunca el mensaje; `ApiFetchError` ya no acepta ni guarda `cause`. Standalone real con API caída: el volcado de Next dice `request failed (ECONNREFUSED)`, sin puerto de la API, sin `address:`, sin `connect ECONNREFUSED`; el código sí queda para depurar; el cuerpo del 500 no contiene `ECONNREFUSED`, `ApiFetchError`, `ResumeFetchError` ni `127.0.0.1`. (`127.0.0.1` aparece solo en el banner de Next, que es el listen de la propia web; y `ResumeFetchError` en `render_error`/dump de Next, la clase que el plan exige.) Mutaciones en copia con rebuild: `describeError` devolviendo `error.message` y `cause` reañadida a `ApiFetchError`: el test `C1` de `tests/runtime/logging.test.ts:95` cae (con `describeError` revertido: 1 fallo); la mutación de `cause` en `request.ts` no tiene efecto porque el constructor ya no lo admite (correcto).
- **C2 resuelto.** W13/W14 parametrizados con canarios e IP en todos los resultados. Mutaciones que ahora caen: IP en `rejected`, en `timeout`, en `invalid` y en `upstream_error`/`unreachable` (W13, y W14 en la última).
- **C3 resuelto.** `lib/log.ts:15,41`: `normalizeKey` (NFKC, minúsculas, solo `[a-z0-9]`) y coincidencia exacta contra la lista. Cubre ` email`, `e\nmail`, ancho cero, `E-Mail`, `e_mail`, ancho completo, `na\tme`; revertir a `key.toLowerCase()` hace caer `W4 extra`. Efecto colateral: solo se descarta una clave cuyo normalizado sea EXACTAMENTE un elemento de la lista (`user-name` -> `username` pasa). Ninguna clave real (`request_id`, `route_path`, `route_type`, `duration_ms`, `status`, `code`, `reason`, `outcome`, `attempt`, `path`, `method`, `digest`, `error`, `lang`) coincide, y todas aparecen en las líneas del standalone.
- **Pasada al standalone (curl-equivalente, API falsa):** contacto 201/400/429 (una línea `contact`, id igual al de la API falsa y de la cabecera de respuesta), API caída 502, health sano 200 sin línea, degradado 503 con WARN, 500 de render con `render_error`, home con API caída 500. Canarios (nombre, correo, mensaje, IP, cookie, Authorization, query, cuerpo y URL de error de la API), puerto de la API: ausentes de toda la salida del servidor. Los cuerpos de las respuestas 400/429 de contacto reenvían el problema de la API (comportamiento previo, no es log).
- Cambios requeridos: ninguno. Skills: sin hallazgos nuevos sobre el diff de la ronda 2.

---
## Ronda 1 (histórico): CHANGES_REQUESTED

Calidad alta y todo verde, pero hay un fuga real de la URL base de la API en el log del servidor (la salida propia de Next con la causa del error) y dos huecos de robustez/cobertura que el brief pedía cerrar.

## Verificación propia (Node 22.23.1)
- `npm run lint`: ok. `npm run typecheck`: ok. `npm run build`: ok (el standalone trae `.next/server/instrumentation.js`).
- `npm test` x2: 81 archivos, 378 tests, verde las dos veces; sin líneas JSON de log en la salida, sin procesos nuevos (11 `next-server` previos y ajenos antes y después: son de sesiones anteriores en `.next/standalone`, no de este slug) y `/tmp` idéntico antes/después.
- `proxy.ts`/`middleware.ts` no existen, `next.config.ts` y `Dockerfile` sin cambios, sin `output: 'export'`; `process.env` solo en `lib/api/config.ts`; `console.` solo en `lib/log.ts:28-30`.

## Trazabilidad W ↔ it()
| W | it() real | Mutación que lo hace fallar |
|---|---|---|
| W1-W4 | `lib/log.test.ts` | lista negra sin `ip` / sin `website`: falla W4; `Error` -> mensaje: falla W2; sin saneado de saltos: falla W3; sin truncar: falla W3 |
| W5 | `lib/request-id.test.ts` | (no mutado) |
| W6 | `lib/api/request.test.ts:85` | id nuevo por intento: falla (W6, W12, W7); sin cabecera `X-Request-Id`: falla W6 y W12 |
| W7-W9, W15 | `lib/api/request.test.ts:112,138,153,173` | añadir `error.message` o la URL al log: fallan W7/W8/W15 |
| W10 | `lib/api/request.test.ts:166` | log en éxito: falla |
| W11 | `app/api/health/route.test.ts` | health sano con línea: falla |
| W12 | `lib/api/health.test.ts` | sin cabecera: falla |
| W13 | `app/api/contact/route.test.ts` (`W13`) | sin cabecera de respuesta: falla; valor del campo en `reason`: falla |
| W14 | `app/api/contact/route.test.ts:194`, `lib/api/contact.test.ts:93` | nombre o IP en el log de éxito/API caída: falla; cabecera extra o falta `X-Request-Id`: falla. **Hueco**, ver C2 |
| W16 | `instrumentation.test.ts` | cabecera/cookie o query en el log: falla |
| W17-W18 | `tests/runtime/logging.test.ts` | ejecutado a mano (abajo) |
| W19 | `lib/pdf/build-cv-pdf.test.ts` (`PD-T14 / W19`) | mensaje en vez de clase: falla |
| W20 | `tests/runtime/docker-layout.test.ts` | ok |
| W21 | `tests/log-gate.test.ts` | `console.` en `lib/api/health.ts` o `app/api/health/route.ts`: falla |

Criterios: A13 y A14 cubiertos por los W anteriores.

## Runtime en el standalone real (API falsa, curl-equivalente con `fetch`)
Servidor del build actual, API falsa conmutable. Resultado:
- Contacto válido 201: una línea `contact outcome=sent`; la API falsa vio `x-request-id` = `request_id` de la línea = cabecera de respuesta, más solo `content-type` y `cf-connecting-ip` (válida) además de las de Node.
- API responde 400 / 429: `outcome=rejected` con `code`, INFO. API 500: 502 `upstream_error` WARN. Email inválido: 400 `invalid reason=email`. API colgada: 504 `timeout` (10 s). API caída: 502 `unreachable`.
- Health sano: 200, sin salida. Degradado (API 500 o caída): 503, un `api_call` y un `health outcome=degraded` con el mismo id.
- Home y PDF correctos: sin salida (lecturas silenciosas).
- Home con API 500: 500; un WARN `api_call` por intento (2 por recurso, mismo `request_id` en los dos intentos) y `render_error` (x2, mismo `digest`) con `route_path`, `route_type`, `method`, `path` sin query, `digest`, clase. `onRequestError` SÍ se ejecuta en el standalone; el plan B no hace falta. PDF con API 500: 500 más `render_error` de ruta.
- Canarios (nombre, correo, mensaje, `CF-Connecting-IP`, cookie, Authorization, query, cuerpo y URL dentro de los cuerpos de error de la API) en TODA la salida del servidor: ninguno, con una excepción (C1).
- No pude provocar `pdf_render_failed` en el standalone (el render no falla con el fixture); queda cubierto solo por el unit W19.

## Privacidad
Líneas de `logEvent`: limpias en todos los escenarios. Fuga fuera de `logEvent`: ver C1.

## Skills consultadas
- `simplify`: `lib/api/content.ts` (ahora `cache(requestJson)`) es una simplificación limpia; sin duplicación en `app/api/contact/route.ts` (`finish`/`invalid` bien factorizados). Sin hallazgos adicionales.
- `next-best-practices`: `instrumentation.ts:9` usa la firma `Instrumentation.onRequestError` correcta; rutas siguen `force-dynamic`; funciona en standalone. Sin hallazgos.
- `strict-typing`: sin `any` ni `as` nuevos en código de producción; `LogFields = Record<string, unknown>` es deliberado. Sin hallazgos de tipado (el hallazgo C3 es de normalización de claves, no de tipos).
- `seo-audit`, `ui-ux-pro-max`, `testing-strategy`: no se tocó metadata ni UI. Cobertura de tests: C2.

## Checkpoints C1–C7 (CHECKPOINTS.md)
Sin cambios de UI, datos ni diseño; datos solo por `lib/api`, privacidad solo cuestionada en C1 del review; build/lint/typecheck/tests en verde. Todo conforme salvo lo de abajo.

## Cambios requeridos (ronda 1, ya resueltos; la sección vigente está vacía)
**C1 — La URL base de la API (host:puerto) sale en el log del servidor cuando la API está caída.**
`lib/api/request.ts:91-92`: el mensaje de `ApiFetchError` lleva `describeError(error)` (`connect ECONNREFUSED 127.0.0.1:63540`) y se le adjunta `cause: error`. Next imprime ese error entero por stderr (`⨯ Error [ResumeFetchError]: Resume (es): request failed (connect ECONNREFUSED 127.0.0.1:63540)` más `[cause]: ... address: '127.0.0.1', port: 63540`), así que host y puerto de la API (en producción `cv-api:8080`) acaban en el log. Lo reproduje con GET `/` con la API caída (3 apariciones del puerto). El `impl.md` afirma que ese mensaje "no lleva URLs ni datos": es incorrecto para fallos de transporte. Viola el brief («ni URL base de la API, ni mensajes de causa con URLs en NINGÚN log»). Arreglo: que el mensaje y la causa de los fallos de transporte lleven solo el código (`ECONNREFUSED`, `ENOTFOUND`, `timeout`) y no adjuntar el `Error` original como `cause` (o adjuntar uno nuevo sin `address`/`port`); ajustar el T22 de `lib/api/request.test.ts:30` si hace falta, y añadir un test de runtime (API caída, `server.log()` no contiene el puerto de la API) en `tests/runtime/logging.test.ts`. Si el humano prefiere aceptar el límite, debe quedar escrito como decisión y corregirse la frase del `impl.md`.

**C2 — Los tests de privacidad del contacto no cubren cada fallo aguas arriba.**
`app/api/contact/route.test.ts:194` (W14) solo ejecuta éxito y API caída (`unreachable`); W13 usa `toMatchObject` y sus casos no llevan canarios ni IP. Mutaciones que sobreviven: escribir `CF-Connecting-IP` en la línea de `rejected` (400/429) y en la de `timeout` (11 tests verdes). Arreglo: pasar los canarios y la IP por todos los casos de W13 (rejected 400/429, upstream_error, timeout, invalid) y aplicar la comprobación de «ningún canario ni IP» sobre `logs.text()` de todo el recorrido; opcionalmente comparar las claves exactas de cada línea.

**C3 — La lista negra de `logEvent` se elude con claves no normalizadas.**
`lib/log.ts:41` comprueba `BLOCKED_KEYS.has(key.toLowerCase())` sobre la clave cruda y solo después `clean(key)`: `{' email': x}`, `{'e\nmail': x}` o `{'name​': x}` salen en la línea (`" email":"LEAK1"`, `"e mail":"LEAK3"`; comprobado). Hoy todas las llamadas usan claves fijas, pero la lista negra es la defensa del módulo. Arreglo: normalizar la clave (`clean(key).trim().toLowerCase()`, y quitar los caracteres de ancho cero) antes de consultar `BLOCKED_KEYS`, y añadir el caso a W4. Comprobado y correcto: `logEvent` no lanza con circulares, BigInt, símbolos, `Proxy`, getters que lanzan, `null` como campos ni 5 MB de texto (un getter o `Proxy` que lanza descarta la línea entera, aceptable como «mejor esfuerzo»).

## Observaciones fuera de alcance
- Next imprime por su cuenta el error de render multilínea (no JSON) y `render_error` sale duplicado por 500 con el mismo `digest` y sin `request_id`: límites ya documentados, aceptados por el brief.
- 11 procesos `next-server` huérfanos previos (varios con cwd `cv-web/.next/standalone`, anteriores a esta sesión): no los dejan los tests de este slug (conteo estable); conviene matarlos a mano.
- `docs/web-standards.md` sección «Logs» y `deploy/docker-compose.yml` quedan para el slug 5 (`ops-log-docs`).
