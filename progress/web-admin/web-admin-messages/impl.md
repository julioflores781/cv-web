# Implementation — web-admin-messages (slug 8/10 of web-admin)

Stacked on slugs 1–7 in the same working tree (branch `feature/web-admin-api-client`); no commit, merge or push; `progress/current.md` not edited
(as instructed by the leader). Verified with Node 22.23.1: `npm run lint`, `npm run typecheck`, `npm run build` green (`ƒ /admin/messages`,
`ƒ Proxy`); `npm test` 149 files / 672 tests green (655 before this slug). No server left running (`pgrep next-server` empty; the scratch
API on 4021 and the web on 3111 used for the visual check were stopped).

## Contract checked against the `cv` sources
- `AdminMessagesResource` (`GET /api/v1/admin/contact-messages`, no other method): `limit` and `before` arrive as **String** and are parsed by hand.
  - `limit`: `Integer.parseInt`, 1–100, default 50. `before`: `Long.parseLong`, ≥ 1. Anything else (blank, decimal, text, overflow) is a
    400 `BAD_REQUEST`, never a corrected value. A sign and leading zeros are accepted (`+2`, `007`).
  - 200 `{messages:[{id,name,email,body,createdAt}], next: string|null}`; `next` is the id of the last row returned, as a string.
- `ListContactMessagesService`: asks for one extra row to know whether there is another page; audits only `limit`, `returned`, `paged`.
- `PostgresContactMessageRepository`: `ORDER BY created_at DESC, id DESC`; the cursor is the row `(created_at, id)` of `before`; a cursor
  that does not exist gives an empty page (not an error).
- The web client (`lib/api/admin/messages.ts`, slug 1) already matched: GET only, `limit` 1–100 and `before` ≥ 1 checked before calling,
  parser keeps only the five fields. Not changed.
- **Fake aligned** (`scripts/parity/admin-fake.mjs`): parameters parsed like Java (`javaInteger`: optional sign, digits only, `long` range for
  `before`; before, `+2` was a 400 and a `before` above the `long` range a 200); order by date then id with a row cursor (before, by id only).

## What was done
- `lib/admin/contact-messages.ts` (new): `MESSAGES_LIMIT = 50`, `parseCursor` (digits only, 1..`Number.MAX_SAFE_INTEGER`; arrays, signs,
  decimals and huge values are ignored), `messagesUrl`, `mailtoHref` (narrow address pattern, ≤254: no `?`, `&`, `%`, blanks or quotes, so a
  link cannot smuggle recipients, subject or body).
- `components/admin/messages-list.tsx` + `messages.module.css` (new): server component, no client code of its own. A labelled `<ul>` of
  `<article>`s: `<h3>` name, `<dl>` Id / Recibido (`LocalTime`, `<time dateTime>`) / Email, `<h4>` «Mensaje» + body. Everything a visitor
  wrote is a React text node (no `dangerouslySetInnerHTML`, no autolinking); the only link is the `mailto:` of an address that passes
  `mailtoHref`. Body: `white-space: pre-wrap; overflow-wrap: anywhere`. One column by default, two from 900 px; 44 px targets; focus ring;
  tokens only. Pager `<nav aria-label="Páginas de mensajes">`: «Más antiguos» (`?before=<next>`, only if `next` is a valid cursor) and,
  when on an older page, «Volver a los más recientes».
- `app/admin/(panel)/messages/page.tsx` + `loading.tsx` (new): `force-dynamic`, one read per visit with `limit` fixed at 50 and the validated
  `before`; 401 → login with `next`; other failures → `LoadFailure` (text by code, reference, retry to the same page). Logs
  `admin_messages_view` with `request_id`, `outcome` (`ok|expired|unavailable`) and `count` only.
- `lib/admin/messages.ts`: `UI.messages` (Spanish only). `lib/admin/nav.ts`: «Mensajes» entry before «Ajustes».
- Nothing is stored in the browser (no `localStorage`/`sessionStorage`), there is no route handler for messages and no mutating method.
  `no-store`/noindex come from the existing `next.config.ts` headers for `/admin/:path*` (checked in the runtime test).

## Map Tn → test
| Tn | `it()` | File |
|---|---|---|
| T402 | `T402: with the fake, the rows come newest first…` · `T402 (component): one row per message…` | `app/admin/(panel)/messages/page.test.tsx` · `components/admin/messages-list.test.tsx` |
| T403 | `T403: markup in name, email and body is shown as text…` (+ escaped HTML in the standalone, in T409) | `components/admin/messages-list.test.tsx` |
| T404 | `T404: a valid email is a mailto link; an odd one stays plain text` · `T404 (rule): a plain address gives a mailto…` | `components/admin/messages-list.test.tsx` · `lib/admin/contact-messages.test.ts` |
| T405 | `T405: «Más antiguos» follows next…` · `T405 (links)…` · `T405 (cursor)…` (+ `?before=abc&limit=100` on the standalone, in T409) | `page.test.tsx` · `messages-list.test.tsx` · `contact-messages.test.ts` |
| T406 | `T406: skeleton while loading; no messages says so; a failure…` · `T406 (session): a 401…` · `T406 (empty)…` | `page.test.tsx` · `messages-list.test.tsx` |
| T407 | `T407: unknown fields the API sends (an ip_hash, a phone) never reach the DOM` | `page.test.tsx` |
| T408 | `T408: viewing logs admin_messages_view with only the request id, the outcome and the count…` (+ sweep of the real standalone log in T409) | `page.test.tsx` · `tests/runtime/admin-messages.test.ts` |
| T409 | `T409: the page answers no-store and noindex, needs the session, escapes…; T408: the log keeps no personal data` · `T409 (accessible, stacked)…` | `tests/runtime/admin-messages.test.ts` · `messages-list.test.tsx` |

Criteria → tests: **AC22** T402–T407 (+T221/T234 of earlier slugs); **AC23** T406; **AC25** T408; **AC8** T409 (headers, session gate);
**AC26** T409 (headings, labels, stacked layout, targets, focus).

Extra tests outside the plan:
- `extra (T234, web-admin-messages): like the Java resource, parameters are parsed as a Java int and long, and the order is date then id`
  (`scripts/parity/admin-fake.test.ts`).
- `extra: the navigation of the panel has the messages entry, before the settings` (`page.test.tsx`).
- In the runtime test: no `app/admin/api/messages` handler and the client only uses `GET`.

## Visual check (Chrome DevTools, V10)
Standalone copy against the fake with 60 fictitious messages (one long body with a 300-character word and markup, a long name, an odd email).
- 360 px: no horizontal scroll (`scrollWidth` = 360), one column, markup shown as text, 0 injected elements, email links and pager 44 px
  high, «Mensajes» is `aria-current` in the navigation, date formatted in the browser, console clean (no hydration warning), storage empty.
- 1280 px, `?before=11`: two columns (394 px / 788 px), 10 rows, only «Volver a los más recientes».
- The standalone log of that session: `admin_messages_view` with `outcome`/`count` only; 0 lines with a name, address or text.

## Deviations
1. `app/admin/(panel)/architecture/page.test.tsx` (slug 5): the expected navigation list now includes `/admin/messages/` (same additive
   change slug 6 made for images).
2. `scripts/parity/admin-fake.mjs` + its test (slug 1): aligned with the Java resource as described above. T234 unchanged and green.
3. The plan names the cursor check "entero positivo"; here it is also capped at `Number.MAX_SAFE_INTEGER` (the client passes a JS number).
   A real id (`bigserial`) is far below it; a `next` above it would simply give no «Más antiguos» link.
4. Small additions not spelled out in the plan: the «Volver a los más recientes» link and the «No hay mensajes más antiguos.» text for an
   empty page reached with a cursor (the API answers an empty page for a cursor that no longer exists).
5. A non-GET request to the page itself is not refused by Next (it renders the page); read-only is guaranteed by the absence of any handler
   or mutating client call, which is what the runtime test asserts.
6. The dashboard was not touched: the plan (§4) keeps it to the three content cards; messages are reached from the navigation.
7. Docs (`docs/web-standards.md`, `AGENTS.md`: event `admin_messages_view`) are left for `web-admin-regresion`, as the plan assigns.

## Risks
- The page HTML and the RSC payload carry personal data: they rely on the `no-store` header of `next.config.ts` and on the session gate
  (both covered by the runtime test). Every view is also audited by the API (`MESSAGES_READ`).
- `mailto:` is the only active link built from visitor data; the pattern is deliberately narrow, so a valid but unusual address (quoted
  local part, IDN host) is shown as plain text.
- Messages are rendered in the order of the API (not re-sorted), so the cursor paging stays consistent with it.
- Dates are formatted in the browser's time zone (`LocalTime`); the server HTML carries the ISO date until hydration (plan risk 15).
