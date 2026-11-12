# Implementation — web-runtime-contacto

Plan: `progress/web-runtime/analysis.md` §2.4, §4 A7/A8/A15, §5 «Slug 5». Node 22. No git writes.

## Code
- `lib/api/request.ts`: the `node:http(s)` GET was generalised into `httpRequest` (method, headers, body); `httpGet` is a thin wrapper (no duplicated transport).
- `lib/api/contact.ts` (new): `forwardContact` — POST to `${apiUrl}/api/v1/contact/messages?lang=`, only `Content-Type` and a valid `CF-Connecting-IP` (`net.isIP`, <=45 chars), 10 s timeout, no retry; result kinds `sent | rejected(400/429 + problem) | upstream-error | timeout | unreachable`.
- `app/api/contact/route.ts` (new): POST only (405 + `Allow: POST` otherwise), `application/json` (415), body <=8 KiB read as a capped stream (413), JSON/fields (400), validates with `lib/contact/validate.ts`, maps 201 / 400 / 429 transparently and 502 `CONTACT_UPSTREAM` / 504 `CONTACT_TIMEOUT`; `no-store`, no cookies, no logging.
- `lib/contact/client.ts`: relative `fetch('/api/contact/?lang=')`, `apiUrl`, `mode` and `credentials` removed. `apiUrl` removed from `HomeView`, `ContactSection`, `ContactForm`.
- `tests/helpers/fake-api.ts`: new optional `contact` handler.

## Tn -> test
| Test | Where |
|---|---|
| T70, T71, T72, T73 | `lib/api/contact.test.ts` |
| T74, T75, T76 (unit), T77 (x2), T78, T79, T81 | `app/api/contact/route.test.ts` |
| T76 (runtime), T80, T82 | `tests/runtime/contact.test.ts` |
| T83 | `lib/contact/client.test.ts` (rewritten CO-T46..54 on a `fetch` stub) |
| T84 | `components/contact-form.test.tsx` «no apiUrl prop» (`@ts-expect-error`) ; `apiUrl` props removed from the other component tests |
| T85, T86 | `tests/source.test.ts` (T85 adds: client has no http(s):// nor process.env; only `lib/api/config.ts` reads env) |

Extra tests outside the plan: `route.test.ts` «visitor IP from CF-Connecting-IP reaches the API» and the T77 case with a lying/missing Content-Length.

## Criteria -> tests
A7: T70-T83. A8: T71, T74, T80. A4: T76, T84. A15: T85, T86. A14: component tests still green (T84).

## Verification
- `npm run lint`, `npm run typecheck`: clean. `npm test` twice: 72 files, 329 tests green both times. `npm run build`: OK (`/api/contact` is `ƒ`).
- Manual (standalone + fake API on another port): curl 201 -> 201, API 400 -> 400, 429 -> 429, 500 -> 502, no answer -> 504 after 10 s, API down -> 502 `CONTACT_UPSTREAM`; `POST /api/contact` -> 308; `GET` -> 405 `allow: POST`. The API received only `Content-Type`, `CF-Connecting-IP`, Host, Connection, Content-Length (the `Cookie` sent by curl did not pass). Server log had no name/email/IP.
- Chrome DevTools: real send from the form at `/` -> exactly one fetch request, `POST http://127.0.0.1:4031/api/contact/?lang=es [201]` (own origin); the API received the message.

## Notes
- R1 (real `CF-Connecting-IP` behind Cloudflare) can only be checked after deploying to the NAS.
