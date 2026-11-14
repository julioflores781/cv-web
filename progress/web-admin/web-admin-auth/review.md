# Review — web-admin-auth (slug 2/10 of web-admin), round 1

## Veredicto: APPROVED

"Cambios requeridos" is empty. Every gate is green, T240–T296 are covered by real `it()`s, and the security points were verified both by reading and against the built standalone server with `curl`.

## Ejecución (Node 22.23.1, branch `feature/web-admin-api-client`, uncommitted, stacked on web-admin-api-client)
- `npm run lint` OK, `npm run typecheck` OK, `npm test` 107 files / 500 tests OK, `npm run build` OK (`ƒ Proxy`, every `/admin*` route and `robots.txt` are `ƒ`; the build does not touch the API).
- No `console.*` outside `lib/log.ts`, no TODO, `eslint-disable`, `@ts-*` or `any` in the new code (grep over `app/admin`, `lib/admin`, `components/admin`, `proxy.ts`).

## Trazabilidad Tn <-> it()
T240–T296 each have an `it()` whose name carries the Tn, in the files listed in impl.md. Read in full or in the relevant part:
- T244/T245/T246 `proxy.test.ts`; T249/T250 `session.test.ts`; T258 `login/route.test.ts` (checks exact cookie flags, no token in the body, 32-hex request id, `X-Client-IP`=203.0.113.7, zero `cf-*` headers reaching the API, same request id on both sides); T265 `logout/route.test.ts`; T280–T283, T291–T293 `tests/runtime/admin-gate.test.ts`; T288 `admin-auth.test.ts` (https -> `Secure`, http -> none).
- T240 and T283 cover all six panel headers on the login page, a handler and a 404; `/` carries no `X-Robots-Tag`.
- T264/T269/T289/T290 check the log sweep and the HTML/JSON scan for the token and the cookie name.
- Criteria AC1–AC9, AC23, AC25–AC28 map as in impl.md; nothing of this slug is uncovered. T239 stays with slice 3 (already tracked in the api-client review).

## Seguridad (verified)
- **Cookie** (`lib/admin/session.ts`): HttpOnly, SameSite=Strict, Path=/admin, `Secure` from `SITE_URL` (not the request scheme), `Max-Age` from `expiresAt`, rejected if not in the future. Clearing reuses the same base options with `maxAge:0`. Verified on the standalone with `SITE_URL=https://floreslab.dev`: both the proxy clear (`?expired=1`) and the logout handler emit `cv_admin_token=; Path=/admin; Max-Age=0; Secure; HttpOnly; SameSite=strict`.
- **Proxy**: only `hasSessionCookie` (presence, empty = absent); never decodes the token; no logs per visit. The `Location` header on the wire is relative (`/admin/login/?next=%2Fadmin%2F`) even with `Host: floreslab.dev` and `X-Forwarded-Proto: https`, so deviation 1 does not leak an internal host.
- **CSRF** (`csrf.ts` + `handler.ts`): every mutating route is built with `mutating: true`, which runs `Sec-Fetch-Site` (cross-site and same-site refused), `Origin` against `SITE_URL`/`Host`/`X-Forwarded-Host`, and JSON-only media type before the session check and before any API call. Confirmed live: foreign Origin -> 403 `ADMIN_CSRF`; no Origin and no `Sec-Fetch-Site` -> 403; same-site with a matching Origin -> 403. All non-POST methods answer 405 with `Allow: POST` and mutate nothing.
- **Open redirect** (`next-path.ts`): must start with `/admin` followed by `/`, `?` or end; rejects backslashes, control characters, `%2f`, `%5c`, `%2e` (anywhere, so strictly more than T248 asks), `//`, `..`, > 512 chars. Followed only after `safeNext` in the client.
- **Upstream headers**: `X-Client-IP` from `CF-Connecting-IP` only; the closed header list of the api-client (reviewed in slice 1) forwards no `CF-*`.
- **No leaks**: login answers `{ok:true}` with the token only in the cookie; error bodies are `{code, requestId, retryAfterSeconds?}` with `code` filtered by `SAFE_CODE`; 5xx details are never relayed; `logEvent` drops blocked keys and reduces errors to their class name; the admin events log only `outcome`, `status`, `request_id`.
- **Headers/SEO**: `headers()` in `next.config.ts` adds noindex, no-store, frame protections, referrer and nosniff to `/admin/:path*`, which also reach the 404 and the handlers (curl-verified); `robots.txt` shows `Disallow: /admin/` and the sitemap.
- **Spanish and a11y of the login**: `lang="es"`, one `h1`, labelled `type=password` field with `autocomplete=current-password`, `role=status` region, `role=alert` errors with text prefix + icon (not colour only), focus returns to the field after a failure, 48 px targets, `:focus-visible` outline, double submit guarded, lockout countdown announced once.

## Desvíos de impl.md
1. Absolute redirects from the proxy: accepted (needed by Next 16; the wire value is relative, checked).
2. All methods of `/admin/api/login` pass the proxy without a cookie: accepted. It exposes nothing the handler does not already control (405, or CSRF + media + credentials checks for POST) and it is what T291 needs; the other `/admin/api/*` routes stay 401 at the proxy.
3. T286 as two hops: accepted (a Server Component cannot set cookies; the plan's single-hop wording was not implementable).
4. T281 without a proxy-less baseline: accepted; T104 (`proxy-ready.test.ts`) still guards the public behaviour and the test asserts 200, no `set-cookie`, no panel headers and no cookie name in the HTML for every public page, health, contact and PDFs.
5. T292 without `<html lang>`: accepted with an observation below. Reproduced on the standalone: `/admin/nope/` is 404 with all panel headers and the panel's «No encontrado» in the payload, but the SSR shell is `<html id="__next_error__">` with no `lang`. It is the same Next shell as the public 404, not something this diff can fix; the test asserts the part that is under the diff's control (status, headers, robots meta, panel text).
6. T293 using the fake's `invalid-json`: accepted, it produces exactly one `render_error` line without cookie material.
7–11 (files not created, naming, `error.tsx` location, 10 s test, docs deferred): accepted.

## Skills consultadas
- `simplify`: `lib/admin/next-path.ts:1` `DEFAULT_NEXT` is exported but only used inside the file (drop the `export`, or use it in the layout redirects); `app/admin/(panel)/layout.tsx` hard-codes `/admin/login/?expired=1` while `expiredLoginUrl` (used by `password-form.tsx`) exists, so the layout path drops `next`. Both are observations, not defects.
- `next-best-practices`: sin hallazgos accionables (route handlers `force-dynamic`, `proxy.ts` as the single file with no `middleware.ts`, layout reads cookies/headers asynchronously, own root layout, `notFound()` for the catch-all, metadata `robots`).
- `strict-typing`: sin hallazgos (no `any`, no `@ts-*`; the only assertion is `parsed as Record<string, unknown>` after an object/array guard in `handler.ts:75`, and `body as T` in `browser-client.ts` for a caller-chosen generic, both narrow and local).
- `ui-ux-pro-max`: `components/admin/login-form.tsx:105` the error banner is not tied to the field with `aria-describedby` (the `role=alert` already announces it); the `<form method="post">` falls back to a native POST of `secret` to `/admin/login/` if JS has not hydrated (same-origin, no URL exposure; harmless). Observations only. Visual checks (360 px, contrast, real `showModal`) were not run here, as impl.md states.
- `testing-strategy`: tests read against the plan above; they assert behaviour (attributes, counts of API calls, log sweep), not just "does not throw". `seo-audit`: noindex headers, meta and robots verified; no public metadata touched.

## Checkpoints
- C1: [x] lint, typecheck, test green; [x] build green without API, routes `ƒ`; [x] no debug logs, dead code or context-less TODOs.
- C2: [x] every Tn has an `it()`; [x] behavioural assertions with fictional fixtures.
- C3: [x] no phone, document or birth date in the diff; fixtures are fictional.
- C4: [x] data only through `lib/api` (browser pages use only `adminFetch`, T294/T295); [x] API down -> `Unavailable`/502/504 with no cache.
- C5: [x] tokens from the design system, focus, landmarks, one `h1` (browser-only checks pending, see impl.md risks); [x] noindex for the panel.
- C6: [x] reports in `progress/web-admin/web-admin-auth/`.
- C7: not evaluated (closer, after human authorization).

## Cambios requeridos
Ninguno.

## Observaciones fuera de alcance
- T265 says logout is idempotent "with or without a cookie", but through the real pipeline a POST to `/admin/api/logout/` without a cookie is a 401 from the proxy (consistent with T245, which lists `/admin/api/logout`). The browser client treats that as `expired` and goes to the login, so the user outcome is right; the unit test exercises the handler directly. Worth aligning the plan wording in the regression slice.
- SSR 404 shell without `lang` (deviation 5), shared with the public 404.
- Not verified here and to be checked before release: real login through the Cloudflare tunnel (Secure + Strict + redirect), `ADMIN_LOGIN_RATE_LIMITED` code name against the real API, visual and keyboard checks in Chrome DevTools.
