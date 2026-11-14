# Implementation — web-admin-content-core (slug 3/10 of web-admin)

Stacked on `web-admin-api-client` + `web-admin-auth` in the same working tree (branch `feature/web-admin-api-client`); no commit, merge or push.
Verified with Node 22: `npm run lint`, `npm run typecheck`, `npm run build` green; `npm test` 124 files / 553 tests green (500 before this slug).
The build lists `/admin/services` and `/admin/api/content/[kind]` as `ƒ`.

## What was done
- **Shared editing logic** `lib/admin/content/` (browser-safe: no `node:*`, only type imports of `lib/api`):
  - `validate.ts`: mirror of `ContentValidator`/`ContentParity` (same paths and codes as the fake), `validateSave` (comment ≤200 + both documents + parity when valid, sorted by path with numeric indexes), `comparePaths`, `codePoints`.
  - `model.ts`: pairs `{key, saved, common, es|null, en|null}`, `pairItems` (by id, ES order, EN-only last), add/remove/move/update/twin/markSaved (immutable), `EditorModel` interface, `parseContentView`.
  - `services.ts`: the services model (common = id + price «A consultar»/amount/currency; per language = title, summary), `parseAmount`, `normalizeCurrency`, `newService`.
  - `paths.ts`: `parsePath` (rejects `..`, empty parts, `[x]`, `__proto__`/`constructor`/`prototype`), `mapViolations` → field ids, merged ES/EN copies of common fields, per-item counts, the rest to the summary.
  - `diff.ts` (by id, images by key, key order ignored, `countChanges`), `drafts.ts` (`sessionStorage` per kind, ≤200 KB, never throws), `slug.ts`, `size.ts` (98 304 bytes), `kinds.ts`.
- **Handler** `app/admin/api/content/[kind]/route.ts`: GET and PUT (others 405). PUT forwards only `baseVersions`/`comment`/`documents`, caps the body at 128 KiB, 409 → `{code, requestId, latest?}` after an immediate GET, 422 → `{code, requestId, errors≤200}`, other failures through `failure()` (401 clears the cookie). Log `admin_content_save` (`kind`, `outcome`, `status`, `es_version`, `en_version`, `error_count`, `request_id`).
- **Components** `components/admin/`: `editor-frame` (save bar with state and comment, client validation, `ErrorSummary`, 409 banner with diff / overwrite / discard confirmed, 422 mapping and parity banner, network retry, draft autosave + offer, `beforeunload` while dirty, `ParityPanel`), `item-list` (accordion, add/remove/move with focus management and announcements), `paired-field` (`TextField`, `PairedFields`: common once, ES|EN columns with `lang`, 2 columns ≥900 px), `parity-panel`, `error-summary`, `content-diff`, `services-editor`, `load-failure`, `local-time`, `editor.module.css`, `dashboard.module.css` (tokens only).
- **Pages**: `(panel)/page.tsx` (dashboard: one card per kind via `Promise.allSettled`, versions, date, source, parity badge, links, version-0 CTA, per-card error with reference and retry), `(panel)/services/page.tsx` + `loading.tsx`. Nav gains «Servicios».
- `lib/admin/page-context.ts` (server only): token + request id + `CF-Connecting-IP` for page reads; a 401 redirects to `login?expired=1&next=<page>`.

## Tests (Tn -> it())
| Tn | File |
|---|---|
| T239 | `tests/contract/validation-vectors.test.ts` |
| T297, T298, T300 | `lib/admin/content/model.test.ts` (+ extra: `parseContentView`) |
| T299, T302–T306 | `lib/admin/content/validate.test.ts` |
| T301 | `lib/admin/content/slug.test.ts` |
| T307 | `lib/admin/content/size.test.ts` |
| T308, T309 | `lib/admin/content/paths.test.ts` |
| T310 | `lib/admin/content/diff.test.ts` |
| T311 | `lib/admin/content/drafts.test.ts` |
| T312–T318 | `app/admin/api/content/[kind]/route.test.ts` |
| T319–T329 | `components/admin/editor-frame.test.tsx` (T323 has two its; + extra: a draft equal to what is published is cleared) |
| T330 | `components/admin/parity-panel.test.tsx` (unit + inside the editor) |
| T331 | `components/admin/paired-field.test.tsx` (+ unique ids/labels in the services editor) |
| T332, T333 | `components/admin/item-list.test.tsx` (T332 has two its) |
| T334, T335 | `app/admin/(panel)/page.test.tsx` |
| T336, T337 | `components/admin/services-editor.test.tsx` (+ extra: id suggested from the title) |
| T338 | `app/admin/(panel)/services/page.test.tsx` |
| T339–T341 | `tests/runtime/admin-content.test.ts` (standalone + fake) |

Criteria: AC10 → T298, T312, T334, T335; AC11 → T297–T301, T330–T332; AC12 → T239, T302–T307, T320, T321, T333, T337; AC13 → T313, T314, T319, T320, T322, T327, T339; AC14 → T310, T311, T315, T318, T323, T324, T328, T329, T340; AC15 → T308, T309, T316, T321, T325, T326; AC23 → T334–T336, T338; AC25 → T313, T316, T341; AC26 (this slug's screens, DOM level) → T331–T333; AC9 (no retry on writes) → T317.

## Deviations
1. **Oversized body (T314)**: over 128 KiB answers **413 `CONTENT_TOO_LARGE`** (same code as the API's 413, so the same message); malformed bodies are 400 `ADMIN_BAD_REQUEST`. Needed `readJson` in `lib/admin/handler.ts` (distinguishes `too-large` from `invalid`; `readJsonObject` delegates to it).
2. **`adminRoute` passes the dynamic segments** (`params`) to the handler as a second, optional argument (Next 16 `{ params: Promise<…> }`); existing handlers are unchanged.
3. **`adminFetch` problems carry `errors` and `latest`** only when the answer has them (`lib/admin/browser-client.ts`), so the 409/422 details reach the editor; the T276 expectations are untouched.
4. **T318 is tested at the handler** (two identical PUTs: 200 then 409 with `latest`, one stored version); how the UI shows a 409 is T323. Double clicks are also blocked in the frame (`sending` ref + inert button).
5. ~~Restoring a draft based on older versions keeps the CURRENT base versions~~ — replaced in round 2 (option A, see below).
6. **Dashboard links only to routes that exist** (`KIND_ROUTES` in `lib/admin/content/kinds.ts`): projects and architecture say «Su editor llegará pronto» and there are no history links yet; the projects/architecture/history slices switch them on.
7. **Change count** comes from a per-id diff of the normalised documents (`countChanges` in `diff.ts`), not from pair keys, so a restored draft counts only real edits.
8. **Limit cases** (30 services, 50 projects, 20 ports/adapters, 600/300/200 lengths, stack 30×60, highlights 20×400, links 10/300/https) are generated in `tests/helpers/admin-content.ts` (`LIMIT_CASES`) instead of being added to `admin-validation-vectors.json`; T302–T304 and T239 run them against both validators.
9. **Clearing errors**: client errors are re-validated on each change (only paths of the failed save are kept); server errors leave a field when that field is edited.
10. **Inert, not disabled**: «Guardar», «Añadir» at the cap and move buttons at the ends use `aria-disabled` so the focus is never lost.
11. **Load failures** of the services page and the dashboard cards render in-page (`LoadFailure`, Spanish text, request id as reference, retry link); `error.tsx` (digest) still covers unexpected exceptions.
12. **Extra files** not in §3: `lib/admin/content/services.ts`, `lib/admin/page-context.ts`, `components/admin/{load-failure,local-time,content-diff}.tsx`, `dashboard.module.css`, `editor.module.css`, `tests/helpers/{admin-content.ts,admin-editor.tsx}`, `tests/fixtures/admin-samples/services.{es,en}.json` (copied from the fictional `cv/db/sample`). `LocalTime` was planned for the messages slice; the dashboard needed it first.
13. Touched slug 1/2 files additively: `lib/admin/messages.ts` (texts), `lib/admin/nav.ts` («Servicios»), `tests/helpers/admin-routes.ts` (`startAdminApi` takes extra fake options), and the placeholder `(panel)/page.tsx` became the dashboard.
14. Not addressed: the slug-2 review observation that `(panel)/layout.tsx` redirects to `login?expired=1` without `next` (a layout does not know the path); my pages and the editor do send `next`.

## Risks / notes
- Visual checks are pending (V2–V5, V7, V11 of §16): side-by-side columns at ≥900 px, sticky save bar, accordion and focus ring, 409/422 composition, the real `<dialog>`. jsdom tests stub `showModal`.
- The draft in `sessionStorage` holds the content being edited (no secrets); it is cleared on save and discard.
- The dashboard date is formatted in the browser's time zone (`LocalTime`, `useSyncExternalStore`); the server renders the ISO date.
- The client validator is a second implementation of the API rules; T239 keeps it in line with the fake, and the fake with the API through the vectors. The server stays the authority (422 mapping).

## Ronda 2 (review CHANGES_REQUESTED)
Verified with Node 22: `npm run lint`, `npm run typecheck`, `npm run build` green; `npm test` 124 files / 556 tests green.

1. **[Medium] Stale draft restore (option A).** `components/admin/editor-frame.tsx`: restoring a draft whose `baseVersions` differ from the published ones keeps
   them (`draftBase`); saves, retries and the autosave use them (`saveBase`). The PUT therefore gets a 409 and the normal conflict flow decides (diff,
   «Guardar encima» confirmed, discard). `draftBase` is dropped on a successful save or on «Descartar». The conflict banner now names the versions the refused
   save was based on (`Conflict.sent`), and «Ver qué cambió» shows the differences between what is published now and the draft (with a sentence that says so),
   which is meaningful both for a normal 409 and for a stale restore. A 409 without `latest` keeps the same bases, so saving again is another 409, never an
   overwrite (the overwrite button only exists with `latest`). The stale warning text now says a confirmation will be asked.
   Tests: two new `it()`s in T329 (`editor-frame.test.tsx`): restore a v1 draft over v4 → the PUT carries `{es:1,en:1}`, 409 banner «v1 → v4», diff, nothing is
   sent until the dialog is confirmed, then `{es:4,en:4}`; and a 409 without `latest` → no «Guardar encima», the second save sends the same bases.
2. **[Low] `beforeunload` on the 401 redirect.** The listener is kept in a ref and removed before `navigate(expiredLoginUrl(...))`. T328 asserts that no
   `beforeunload` listener is armed at the moment `navigate` is called.
3. **[Low] CSRF of the content PUT.** New `it()` «extra (AC7)» in `app/admin/api/content/[kind]/route.test.ts`: foreign `Origin`, `Sec-Fetch-Site: cross-site`
   and no `Origin` → 403 `ADMIN_CSRF`; `text/plain` → 415 `ADMIN_UNSUPPORTED_MEDIA`; 0 PUTs reach the API.
4. **[Low] Texts.** `INVALID_URL` → «La dirección debe ser una URL https (sin espacios, hasta 300 caracteres).». `ContentDiffList` takes a `label` function and
   shows the model's Spanish field names (`servicio-ejemplo (Título)`); T323/T329 expectations updated.

Observations of the review not addressed (out of scope or accepted): non-breaking-space blanks and `new URL` vs `java.net.URI` (projects slice), shared request
id of the dashboard reads, published differences counted in the parity panel, the layout redirect without `next`, the summary link to a collapsed item.
