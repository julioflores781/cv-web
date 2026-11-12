# Review — web-runtime-contacto

**Veredicto: APPROVED**

Revision independiente (Node 22.23.1). Working tree con cambios de slugs 0–4 sin cerrar: solo se evaluo lo del slug 5 (`lib/api/contact.ts`, `lib/api/request.ts`, `app/api/contact/route.ts`, `lib/contact/client.ts`, quitar `apiUrl` de HomeView/ContactSection/ContactForm, `tests/helpers/fake-api.ts`).

## Verificacion ejecutada
- `npm run lint`: limpio. `npm run typecheck`: limpio. `npm run build`: OK (`ƒ /api/contact`).
- `npm test` x2: 72 archivos / 329 tests verdes en ambas pasadas.
- Standalone (copia con `.next/static`) + API falsa (proxy a `design-api` que acepta el POST y vuelca `rawHeaders`):
  - POST con `CF-Connecting-IP: 203.0.113.9`, `Cookie`, `Authorization`, `Referer`, `X-Forwarded-For`, `User-Agent: SPY` -> 201; la API recibio solo `Content-Type`, `CF-Connecting-IP`, `Host`, `Connection`, `Content-Length` y el body exacto.
  - `CF-Connecting-IP: <script>` -> 201 y la API no recibio ese header. Sin IP -> sin header.
  - `POST /api/contact` (sin barra) -> 308. `GET` -> 405 con `allow: POST`. Body >8 KiB -> 413. 201 con `cache-control: no-store` y sin `Set-Cookie`.
  - API en 429 -> el navegador muestra el mensaje de rate-limit con el enlace de email.
  - Ni `4121` ni `127.0.0.1`/`CV_API_URL` aparecen en el HTML (ES/EN), en el RSC ni en `.next/static` (JS); el JS solo contiene `/api/contact/?lang=`.
- Chrome DevTools: envio real del formulario en `/`: una sola peticion `POST http://127.0.0.1:4130/api/contact/?lang=es [201]` (origen de la web). Exito (1440): formulario vaciado y estado «Mensaje enviado…» en `role=status`. Error 429 (viewport minimo del emulador, 500 px, equivalente movil; sin scroll horizontal del formulario): caja de alerta legible con enlace al email. Layout coherente con el diseno.

## Trazabilidad Tn <-> it()
| Tn | it() | OK |
|---|---|---|
| T70 | `lib/api/contact.test.ts:38` (metodo, URL, content-type, IP, body recortado) | si |
| T71 | `contact.test.ts:49` (lista exacta de cabeceras; IPs invalidas `<script>`, lista, >45, vacio, null) | si |
| T72 | `contact.test.ts:63` (sent, 400/429 problem, 500, HTML, 200, timeout, puerto cerrado) | si |
| T73 | `contact.test.ts:87` (1 peticion) | si |
| T74 | `app/api/contact/route.test.ts:41` | si |
| T75 | `route.test.ts:51` | si |
| T76 | `route.test.ts:62` + `tests/runtime/contact.test.ts:30` (502/504 sin URL/ECONNREFUSED) | si |
| T77 | `route.test.ts:76` y `:94` (Content-Length falso); la API no recibe nada | si |
| T78 | `route.test.ts:105` | si |
| T79 | `route.test.ts:113` | si |
| T80 | `tests/runtime/contact.test.ts:50` (centinelas en log) | si |
| T81 | `route.test.ts:119` | si |
| T82 | `tests/runtime/contact.test.ts:59` | si |
| T83 | `lib/contact/client.test.ts:24-82` | si |
| T84 | `components/contact-form.test.tsx` (`@ts-expect-error`) + tests de componente | si |
| T85 | `tests/source.test.ts:24` | si |
| T86 | `tests/source.test.ts:43` | si |

Extras anotados en impl.md (IP de CF-Connecting-IP, Content-Length mentiroso): legitimos.

## Trazabilidad criterios <-> tests
A7: T70–T83. A8: T71, T74, T80. A4: T76, T84. A15: T85, T86. A14: tests de componente en verde. Cubiertos.

## Revision de reglas
- Cabeceras reenviadas: solo `Content-Type` y `CF-Connecting-IP` valido (`net.isIP`, <=45) — `lib/api/contact.ts:44-48,56`.
- Validacion reutilizada: `validateContact` de `lib/contact/validate.ts` (`route.ts:73`), sin duplicar reglas.
- Limites: 8 KiB leido como stream acotado (`route.ts:19-33`), solo POST con 405+Allow (`route.ts:99-106`), 415, 413.
- Mapeo 201/400/429/502/504 (`route.ts:78-88`); 502/504 sin URL ni error interno.
- Sin cookies, sin `console.*` en la ruta ni en `lib/api/contact.ts`; log del servidor sin nombre/email/mensaje/IP (T80 y comprobacion manual).
- `apiUrl` solo en `lib/api/{config,request,contact}.ts`; `fetch(` solo en `lib/contact/client.ts`; `process.env` solo en `lib/api/config.ts`.
- Transporte reutilizado (`httpRequest` generalizado, `httpGet` envoltorio): sin duplicacion ni codigo muerto.

## Privacidad
Sin telefono/documento/fecha de nacimiento; fixtures ficticios. Nombre/email/mensaje/IP no se loguean.

## Skills consultadas
- simplify: sin hallazgos (transporte compartido, un solo mapeo de errores, sin codigo muerto).
- next-best-practices: sin hallazgos (`route.ts:6` `force-dynamic`, handlers por metodo, `no-store`, `trailingSlash` 308 verificado).
- strict-typing: sin hallazgos (union `ForwardResult`, `Record<string, unknown>` con comprobacion de tipos en `route.ts:46-49`, sin `any`).
- ui-ux-pro-max: sin hallazgos (estados exito/error con `role=status`/`alert`, legibles y sin desbordes).
- seo-audit / testing-strategy: no aplican (no se toco metadata; tests exactamente los del plan mas 2 extras anotados).

## Checkpoints
C1 ok · C2 ok · C3 ok · C4 ok (contacto no usa `fetch` fuera de `lib/api` salvo el cliente propio del origen, segun plan A15) · C5 ok (UI sin cambios visuales) · C6 ok (impl.md/review.md en progress) · C7 pendiente del closer.

## Cambios requeridos
Ninguno.

## Observaciones fuera de alcance
- R1 (valor real de `CF-Connecting-IP` tras Cloudflare) solo verificable tras desplegar en el NAS.
- `lib/api/request.ts` acumula el cuerpo de la respuesta de la API sin tope (preexistente en GET, API de confianza en red interna).
- El emulador de Chrome no baja de 500 px de ancho; 390 real se cubre por CSS responsive ya aprobado en slugs previos.
