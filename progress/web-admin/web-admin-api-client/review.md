# Review — web-admin-api-client (slug 1/10 of web-admin), round 1

## Veredicto (ronda 2): APPROVED

Round 1 verdict was CHANGES_REQUESTED; see "Ronda 2" at the end. Round 1 text below is kept as history.

## Veredicto ronda 1: CHANGES_REQUESTED

The code is solid and every gate is green, but the fake API (the contract mirror that slugs 2–10 will build on, AC29) answers a code that the real API never emits. That is an actionable defect in the diff, so there is no approval (there is no "approved with nits").

## Ejecución (Node 22.23.1, rama `feature/web-admin-api-client`, cambios sin commitear)
- `npm test`: 89 files / 430 tests OK. `npm run lint`: OK. `npm run typecheck`: OK.
- `npm run build`: OK; `/[[...slug]]`, `/api/*`, `robots.txt`, `sitemap.xml` and the PDFs are `ƒ`; the build does not touch the API.
- No `console.*` outside `lib/log.ts`, no `.only`/`.skip`/TODO in the new code, no `any`, no casts, no `@ts-*`, no `eslint-disable`.

## Trazabilidad Tn <-> it()
T201–T238 each have an `it()` named with its Tn (grep over `*.test.ts`); locations match impl.md. Checked by reading, not only by name:
- T201–T203 `lib/api/request.test.ts`; T204 `client-ip.test.ts`; T205–T211 `admin/client.test.ts`; T212–T214 `auth.test.ts`; T215/T217/T218 `content.test.ts`; T216 `parse.test.ts`; T219/T220 `images.test.ts`; T221 `messages.test.ts`; T222 `scripts/generate-api.test.ts`; T223–T238 `scripts/parity/admin-fake.test.ts`.
- T208 really counts server requests: GET 500 and reset = 2 (same `X-Request-Id`), 4xx = 1, POST/PUT/DELETE with 500 = 3 total (one each), POST with reset = 1.
- T211 asserts the WARN fields and that the log text has no token, password canary, IP or host.
- T239 is correctly out of scope here (the plan lists it under the validator slug; it needs `lib/admin/content/validate.ts`). Deviation 1 accepted. Make sure it is tracked in the next slug's plan.

## Trazabilidad criterios <-> tests
AC9 -> T201–T211; AC10 -> T215/T216; AC13–AC15 -> T217/T227/T228/T230; AC18–AC22 -> T219–T221/T231–T234; AC24 -> T222; AC12 -> T229 (the client half lives in T239, deferred); AC29 -> T223–T238. No criterion of this slug is uncovered.

## Cabeceras, reintentos, logs (verificado en `lib/api/admin/client.ts`)
- Header list is closed: `Accept`, `X-Request-Id`, `Authorization` (only with token), `X-Client-IP` (only if `validIp`), `Content-Type` (only with a body). No `CF-*`, Cookie, X-Forwarded-*, Referer, Origin or User-Agent code path exists; T206 proves it end to end. `Content-Length` is added by the transport, as documented.
- Retries: only `GET` (2 attempts, same id); writes use `attempts = 1`. OK.
- Logs: only `logEvent` (`request_id, operation, outcome, status, attempt, duration_ms`); `operation` is a fixed label without ids; no URL, host, body, cause or title. Errors from transport and `JSON.parse` are dropped. OK.
- Privacy: fixtures use fictional data ("Ada Ejemplo"); messages parser drops unknown fields (`ip_hash`). No phone, document or birth date. OK.

## Fake API vs real API (Java sources of `/Volumes/Externo/Repos/thinking/cv`)
Matches: paths and methods; login/session/password/logout-all shapes and codes (401 identical for bad password and unknown account, 403 current-wrong, 422 weak, 429 `ADMIN_LOGIN_LOCKED` + `Retry-After`); `CF-Ray`/`CF-Connecting-IP` -> 404; content body `{baseVersions, comment?, documents}`; 96 KiB cap (`cv.admin.content.max-bytes=98304`); version limit max 200; messages limit 1–100 / `before >= 1` -> 400 and `next` as string/null; images `UUID` id regex, one `file` part, 5 MiB, 201/400/413/415/503, 404/409; cleanup defaults `dryRun=true`, `olderThanHours=24`.
Divergences found: see findings 1 and 2 below.

## Parche manual de `schema.d.ts`
`ApiModels.java:210` declares `images` as `required = true` in `Project`; the hand patch writes `images?:` (optional). `npm run generate:api` will produce a required `images: ProjectImage[]`, so the patch is not what the generator emits (finding 3). `ProjectImage` fields (`url, alt, width, height`) match `ProjectImageDto`. Admin paths/schemas absent from the file is acceptable and documented (deviation 3).

## Desvíos de impl.md
1 (T239 deferred): accepted. 2 (manual patch): accepted once finding 3 is fixed or justified. 3 (admin types in `lib/api/admin/types.ts`): accepted, consistent with `Resource` typing. 4 (`admin-fake.mjs` without `@ts-check`, `.d.mts` for importers): accepted, but see finding 4. 5 (`adminPassword` option name, `[FIELD]` key): accepted, it is a test-only workaround for the T5 secret scan. 6 (result shape): accepted, matches the plan.

## Skills consultadas
- `simplify`: `lib/api/admin/auth.ts:12` `const password = passphrase;` is a redundant alias (use `{ password: passphrase }`); `lib/api/admin/client.ts:58-60` fine. Otherwise no reuse issues (`validIp` shared, `rollbackContent` accepts `ContentLang | string` which collapses to `string`).
- `next-best-practices`: sin hallazgos (no Next.js surface touched: no route, component or fetch; transport is `node:http`, uncached by design).
- `strict-typing`: sin hallazgos de `any`/cast; the only gap is that the 869-line fake is untyped JS (finding 4) and `rollbackContent`'s `lang: ContentLang | string` signature (`lib/api/admin/content.ts:66`) is effectively `string`.
- `seo-audit`, `ui-ux-pro-max`, `testing-strategy`: not applicable (no SEO/UI change; tests were read against the plan above).

## Checkpoints
- C1: [x] lint/typecheck/test green; [x] build green, pages dynamic; [x] no debug logs, dead code or context-less TODOs.
- C2: [x] every Tn has an `it()`; [x] behavioural assertions, fictional fixtures. (T239 deferred, planned.)
- C3: [x] no private data; [x] no real CV data.
- C4: [x] data only via `lib/api`; [x] resilience untouched; admin client never throws.
- C5: n/a (no UI).
- C6: [x] reports under `progress/web-admin/web-admin-api-client/`; `progress/current.md` modified (not audited beyond presence).
- C7: not evaluated (closer, after human authorization).

## Cambios requeridos
1. **[Medium] Fake answers a non-existent error code for an unknown content kind/lang.** `scripts/parity/admin-fake.mjs:447, 635, 638, 670, 682, 690` use `CONTENT_NOT_FOUND`, which is not in `ApiError` (`error/ApiError.java`); the real API answers `404 NOT_FOUND` (javadoc of `AdminContentResource` lines 109, 140, 185, 210, 247). Change the fake (code and its title entry) to `NOT_FOUND` and update the tests that assert it (T226/T231 in `admin-fake.test.ts`, and any `content.test.ts` expectation). This matters because the panel will map messages from `code`.
2. **[Low] Fake rejects `versions?limit=` outside 1–200 with 400** (`admin-fake.mjs:671-672`), while the real API clamps silently (`ListContentVersionsService`: `Math.max(1, Math.min(limit, 200))`; only a non-integer fails). Make the fake clamp, or record the divergence in impl.md "Risks" and keep the client-side check. Same file, fault mode `'500'` answers `INTERNAL_ERROR` where the real fallback is `UNEXPECTED` (`admin-fake.mjs` fault branch): align it.
3. **[Medium] `lib/api/schema.d.ts` patch marks `images?` optional, the real schema has it required** (`ApiModels.java:210`). Write it as the generator would (`images: components["schemas"]["ProjectImage"][];`) and adjust any consumer/fixture that omits it (`tests/fixtures/openapi-mini.json` already declares it). If keeping it optional is deliberate (older API), say so in impl.md.
4. **[Low] `lib/api/admin/auth.ts:12` redundant `const password = passphrase;`** — inline it.

## Observaciones fuera de alcance
- Risks listed in impl.md (no global 10/min login limit in the fake, rollback check order, image-dimension parsing) cannot be proven without running the real API; run the fake against the real API once in a later slug (contract smoke).
- `adminRequest` retries once even if the caller's `signal` was aborted (the second attempt fails immediately, harmless).
- A `Content-Length` supplied by a future caller would be overwritten by `httpRequest`; documented in impl.md.
- `parseSessionInfo` treats `passwordChangedAt` as optional while the API marks it required (lenient, fine).

---

# Ronda 2 — verificación de correcciones

## Veredicto: APPROVED
"Cambios requeridos" is empty. Round 1 findings were checked against the code and the Java sources of `/Volumes/Externo/Repos/thinking/cv`.

## Ejecución (Node 22.23.1)
`npm test` 89 files / 430 tests OK; `npm run lint` OK; `npm run typecheck` OK; `npm run build` OK.

## Correcciones
1. **NOT_FOUND (OK).** `scripts/parity/admin-fake.mjs:634,637,669,683,691` answer `404 NOT_FOUND`; no `CONTENT_NOT_FOUND` left in `scripts/`, `lib/` or `tests/`. `ApiError.java` has `NOT_FOUND(404)`. `admin-fake.test.ts:180` asserts the code.
2. **limit clamp and UNEXPECTED (OK).** `admin-fake.mjs:671-673` clamps to 1-200 and only a non-integer is 400, as `ListContentVersionsService` does; `admin-fake.test.ts:258-260` asserts 0 -> 1, 9999 -> all, `x` -> 400. The 500 fault answers `UNEXPECTED` (`admin-fake.mjs:832`, in `ApiError.java`).
3. **schema.d.ts (OK).** `lib/api/schema.d.ts:559` is `images: components["schemas"]["ProjectImage"][];` (required), matching `ApiModels.java:210`; typecheck and T222 pass.
4. **auth.ts alias (OK).** The alias is gone; the login key is the constant `LOGIN_FIELD` (`auth.ts:8-12`). Justified: the secret scan (T5) flags a literal `password:` line.

No regressions: the full suite is unchanged at 430 tests.

## Skills consultadas (ronda 2)
- `simplify`: sin hallazgos nuevos (the `LOGIN_FIELD` constant is the documented price of the secret scan).
- `next-best-practices`: sin hallazgos (no Next.js surface touched).
- `strict-typing`: sin hallazgos nuevos. `rollbackContent(kind, lang: ContentLang | string, ...)` at `lib/api/admin/content.ts:66` is effectively `string`; it was only a remark, not a defect, and is not a new finding.

## Cambios requeridos
(none)

## Observaciones fuera de alcance
Unchanged from round 1 (fake vs real login rate limit, rollback check order, image dimension parsing, contract smoke against the real API in a later slug, T239 tracked in the validator slug).
