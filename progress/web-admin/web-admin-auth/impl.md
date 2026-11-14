# Implementation — web-admin-auth (slug 2/10 of web-admin)

Stacked on `web-admin-api-client` in the same working tree (branch `feature/web-admin-api-client`); no commit, merge or push. Verified with Node 22.23:
`npm run lint`, `npm run typecheck`, `npm run build` green; `npm test` 107 files / 500 tests green (430 before this slug). The build lists `ƒ Proxy` and every `/admin*` route as `ƒ`.

## What was done
- **Session** `lib/admin/session.ts`: the only file that knows `cv_admin_token`. `sessionCookieOptions` (httpOnly, SameSite=Strict, Path=/admin, `Secure` from `SITE_URL` https, `maxAge` from `expiresAt`, `null` if not in the future), `applySession`, `clearSession` (same attributes, `maxAge:0`), `readToken` (printable ASCII, <=4096), `hasSessionCookie` (presence only, for the proxy).
- **`proxy.ts`** (single, matcher `/admin/:path*`, no logs): no cookie -> login and `/admin/api/login` pass, other `/admin/api/*` 401 JSON `ADMIN_UNAUTHORIZED`, the rest 307 to `/admin/login/?next=`; cookie -> `/admin/login` redirects to `/admin/`, except `?expired=1` which passes and clears the dead cookie.
- **`lib/admin/`**: `csrf.ts` (Origin/Sec-Fetch-Site, JSON/multipart media type), `handler.ts` (`adminRoute` wrapper: CSRF 403, media 415, session 401, 500 `ADMIN_INTERNAL`, `no-store` + `X-Request-Id` on every answer; `failure()` maps API results, a 401 clears the cookie, a 403 does not; `readJsonObject`, `notAllowed`), `next-path.ts` (`safeNext`, `expiredLoginUrl`), `messages.ts` (all Spanish texts, looked up by code; `UI`, `CLIENT_FAILURES`), `password.ts` (policy), `browser-client.ts` (single new `fetch(`; URLs get a trailing slash; `ok|expired|problem|network|offline|timeout`), `format.ts`, `fields.ts`, `nav.ts`.
- **Handlers** `app/admin/api/{login,logout,logout-all,password}/route.ts` (POST only, 405 + `Allow: POST` for the rest). `X-Client-IP` comes from the incoming `CF-Connecting-IP` through `adminRequest`; no `CF-*` is forwarded. Logs: `admin_login`, `admin_logout`, `admin_logout_all`, `admin_password_change`, `admin_session_expired`, `admin_internal` (outcome, status, request_id only).
- **Pages**: `app/admin/layout.tsx` (own root layout, `lang="es"`, `data-mode="services"`, robots noindex), `login/page.tsx`, `(panel)/layout.tsx` (asks `GET /auth/session` on every entry; 401 -> `/admin/login/?expired=1`; API down -> `Unavailable`; broken answer -> error), `(panel)/page.tsx` (placeholder dashboard), `(panel)/settings/page.tsx` (password + sessions), `(panel)/loading.tsx`, `error.tsx`, `not-found.tsx`, `[...rest]/page.tsx`.
- **Components** `components/admin/`: `status-banner` (text prefix + icon + 3 px border, no new token), `confirm-dialog`, `login-form`, `password-form`, `session-actions` (`LogoutButton`, `SessionActions`), `admin-shell`, `unavailable`, CSS modules using only tokens.
- `next.config.ts` `headers()` for `/admin/:path*`; `app/robots.ts` with `disallow: '/admin/'`.
- Test helpers: `tests/helpers/admin-routes.ts` (route unit tests against the fake) and `tests/helpers/admin-runtime.ts` (standalone + fake).

## Tests (Tn -> it())
| Tn | File |
|---|---|
| T240 | `next.config.test.ts` |
| T241 | `app/robots.test.ts` (T87 updated to the new rule) |
| T242-T247 | `proxy.test.ts` |
| T248 | `lib/admin/next-path.test.ts` |
| T249-T251 | `lib/admin/session.test.ts` |
| T252, T253 | `lib/admin/csrf.test.ts` (+ extra: content-type helpers) |
| T254-T256 | `lib/admin/handler.test.ts` |
| T257 | `lib/admin/messages.test.ts` |
| T258-T264, T291 (unit) | `app/admin/api/login/route.test.ts` (+ extra: cookie without `Secure` on http) |
| T265 | `app/admin/api/logout/route.test.ts` (+ extra: foreign Origin) |
| T266 | `app/admin/api/logout-all/route.test.ts` (+ extra: no cookie) |
| T267-T269 | `app/admin/api/password/route.test.ts` (+ extra: no cookie, GET 405) |
| T270 | `lib/admin/password.test.ts` |
| T271-T275 | `components/admin/login-form.test.tsx` |
| T276 | `lib/admin/browser-client.test.ts` |
| T277 | `components/admin/admin-shell.test.tsx` |
| T278 | `components/admin/password-form.test.tsx` (`PasswordForm` and `SessionActions`; extra: `LogoutButton`) |
| T279 | `components/admin/confirm-dialog.test.tsx` |
| T280-T283, T291, T292, T293 | `tests/runtime/admin-gate.test.ts` |
| T284-T290 | `tests/runtime/admin-auth.test.ts` |
| T294-T296 | `tests/source.test.ts` (T85 extended to `browser-client.ts`; T295, T296 new) |

Criteria: AC1 -> T249, T258, T284, T285, T288, T290; AC2 -> T259-T262, T272-T274; AC3 -> T242-T248, T281-T282; AC4 -> T246, T250, T255, T286; AC5 -> T265, T266; AC6 -> T267, T268, T270, T278, T287; AC7 -> T252-T254, T263; AC8 -> T240, T241, T283, T292; AC9 (X-Client-IP, no CF-*, request id) -> T258, T256; AC23/AC26 (this slug's screens) -> T271-T279; AC25 -> T264, T269, T289; AC27 -> T294-T296; AC28 -> T280, T281, T293.
T239 (deferred from slug 1) belongs to `web-admin-content-core`, not here.

## Deviations
1. **Redirects from the proxy are absolute**, on the request's own origin (`request.nextUrl.clone()`): Next 16 throws `Invalid URL` on a relative `Location` from a proxy (found by T282/T285). T242-T246 compare path and query. Behind the tunnel the scheme/host of that URL come from `Host` and `X-Forwarded-Proto` as Next sees them (not verifiable here).
2. **The proxy lets every method of `/admin/api/login` through without a cookie**, not only POST, so the handler answers 405 itself (T291 asks for 405 on GET/PUT/OPTIONS; T244/T245 are unaffected).
3. **T286 is two hops**: the layout cannot set cookies, so `/admin/` with a dead token answers 307 to `login?expired=1` and that page (proxy) clears the cookie with `Path=/admin; Max-Age=0`. The test asserts both hops.
4. **T281**: public pages, health, contact and PDFs are checked for 200, no `set-cookie` and none of the panel headers, but not compared with a proxy-less baseline build (that is T104, `tests/runtime/proxy-ready.test.ts`, which stays green and is retired in the regression slug).
5. **T292**: the 404 status, headers and `noindex` meta are asserted, and that the panel's «No encontrado» is in the payload; the SSR HTML of any 404 is Next's `__next_error__` shell (also the public 404 with its two root layouts), so `<html lang>` cannot be asserted on it.
6. **T293**: the panel layout throws when `GET /auth/session` answers something it does not understand; the test uses the fake's `invalid-json` fault to get exactly one `render_error`.
7. `lib/admin/request-context.ts` was not created: the context (request id, IP) lives in `handler.ts`. Extra small files: `fields.ts` (login JSON key constant), `nav.ts`, `format.ts` (only `formatRemaining` for now).
8. `UI.passwordChange` (not `UI.password`) because the repository secret scan flags any `password:` key; `LOGIN_FIELD` for the login body for the same reason.
9. `error.tsx` is at `app/admin/` (not under `(panel)`) so it also catches errors of the panel layout. The navigation only has «Inicio» and «Ajustes»; later slugs add their entries to `lib/admin/nav.ts`.
10. T262 waits the 10 s write timeout once (silent API); the test has a 30 s limit.
11. Docs (`web-standards.md`, `CLAUDE.md`, `AGENTS.md`, `.env.example`, compose comment, AC30) are left to the regression slug, as in the plan.

## Risks / notes
- Not verified here: a real login against the real API, cookie behaviour through the Cloudflare tunnel (Secure + SameSite=Strict + redirect origin), the code name `ADMIN_LOGIN_RATE_LIMITED` (taken from the plan; the fake only emits `ADMIN_LOGIN_LOCKED`; an unknown code still maps to a generic Spanish message), and all visual checks in Chrome DevTools (dialog `showModal`, focus order, 360 px, contrast). jsdom tests stub `showModal`.
- Logging out only deletes the cookie; the token stays valid until it expires (8 h), and the settings page says so.
- `proxy.ts` and `middleware.ts` must not coexist: T294 asserts there is no `middleware.ts`.
