# Review — web-admin-content-core (slug 3/10 of web-admin)

## Veredicto
**APPROVED** (round 2; round 1 was CHANGES_REQUESTED, kept below for the record)

The core is solid: the handler, the validator mirror and the editor frame match the plan and the real API, and every T297–T341 and T239 has a
real `it()`. Four actionable findings remain (one medium, three low). They are listed under "Cambios requeridos".

Verified with Node 22.23.1 on the working tree (`feature/web-admin-api-client`, uncommitted):
`npm run lint` green · `npm run typecheck` green · `npm test` 124 files / 553 tests green · `npm run build` green, with `/admin/services` and
`/admin/api/content/[kind]` listed as `ƒ`.

## Trazabilidad Tn ↔ it()
All found and read. The critical ones are marked (*).

| Tn | it() | Notes |
|---|---|---|
| T239 (*) | `tests/contract/validation-vectors.test.ts` | client vs fake over the vectors and `LIMIT_CASES`, both roots, plus parity |
| T297, T298, T300 | `lib/admin/content/model.test.ts` | |
| T299, T302–T306 (*) | `lib/admin/content/validate.test.ts` | exact `(path, code)` sets; T305 freezes the input; T306 numeric sort + comment |
| T301 | `lib/admin/content/slug.test.ts` | |
| T307 (*) | `lib/admin/content/size.test.ts` | exactly 98 304 / 98 305 UTF-8 bytes |
| T308, T309 (*) | `lib/admin/content/paths.test.ts` | prototype pollution checked; ES/EN merge of common fields |
| T310 | `lib/admin/content/diff.test.ts` | |
| T311 | `lib/admin/content/drafts.test.ts` | throwing storage, corrupt JSON, other kind, >200 KB |
| T312–T318 (*) | `app/admin/api/content/[kind]/route.test.ts` | T314 asserts 0 PUTs to the API; T317 asserts exactly 1 PUT on 5xx (no retry); T316 log sweep |
| T319–T329 (*) | `components/admin/editor-frame.test.tsx` | T323 has two `it()`s; T329 does not cover the save after restoring a stale draft (see CR-1) |
| T330 | `components/admin/parity-panel.test.tsx` | |
| T331 | `components/admin/paired-field.test.tsx` | |
| T332, T333 | `components/admin/item-list.test.tsx` | |
| T334, T335 | `app/admin/(panel)/page.test.tsx` | |
| T336, T337 | `components/admin/services-editor.test.tsx` | |
| T338 | `app/admin/(panel)/services/page.test.tsx` | |
| T339–T341 (*) | `tests/runtime/admin-content.test.ts` | standalone + fake; T341 sweeps the log for the title, summary, comment and token sentinels |

## Trazabilidad criterios ↔ tests
AC10 → T298, T312, T334, T335 · AC11 → T297–T301, T330–T332 · AC12 → T239, T302–T307, T320, T321, T333, T337 · AC13 → T313, T314, T319, T320, T322, T327, T339 ·
AC14 → T310, T311, T315, T318, T323, T324, T328, T329, T340 · AC15 → T308, T309, T316, T321, T325, T326 · AC23 → T334–T336, T338 · AC25 → T313, T316, T341 ·
AC26 (DOM level) → T331–T333 · AC9 (no retry on writes) → T317. Every criterion in scope maps to at least one test.
AC7 (CSRF) is covered only through the generic `adminRoute` tests, not for this new mutating handler (CR-3).

## Paridad con la API real (repo `cv`)
Read: `ContentValidator.java`, `ContentParity.java`, `ViolationCode.java`, `SaveEditableContentService.java`, `ErrorCode`/`problems_es.properties`, `README.md`.
- **Codes and paths:** all 14 `ViolationCode`s, every limit (30/50/20/20/10; 120/600, 160/800/160/160, 80/300/200, stack 30×60, highlights 20×400, links 10 with https ≤300,
  alt 200, side ≤20 000, id ≤64, price ≤1e9, currency `[A-Z]{3}`, month `(19|20)YY-MM`), `TOO_MANY` skipping the items, `UNKNOWN_FIELD` paths, the client rules and
  the date rules match line by line. Parity: same positional pairing, same neutral fields, unprefixed paths, `es`/`en` when one side is missing.
- **Save flow:** the API validates comment + ES + EN first and checks parity only when there are no violations; `validateSave` does the same
  (`validate.ts:333-339`). Comment: API `strip()`s and counts code points; the web trims and counts code points.
- **413:** the API answers **413 `CONTENT_TOO_LARGE`** above 96 KB (`ContentTooLargeException`, `AdminContentResourceTest:351`, README). Deviation 1 is therefore
  correct: the handler's own 413 over 128 KiB uses the same code and message as the API's, and an API 413 passes through `failure()` with its code (T317).
  T314's wording «413/400 `ADMIN_BAD_REQUEST`» in the plan is read as «413 for size, 400 for shape», which is what is implemented.
- **Fake:** T239 pins the client mirror to the fake; the vectors file does not exist in the `cv` repo, so fake ↔ API parity rests on the manual read above (no divergence
  found for the services slice). Minor divergences that both JS validators share are listed under observations.

## Seguridad, privacidad y logs
- PUT forwards only `baseVersions`, `comment`, `documents` (`route.ts:56-57` rebuilds the object; `saveAdminContent` rebuilds it again), body capped at 128 KiB while
  streaming (`handler.ts:67-89`), 400 for shape errors, no API call on either (T314). No retry on the PUT (T317 counts one). The 409 does a single GET for `latest`.
- 409 → `{code, requestId, latest?}`; 422 → `{code, requestId, errors ≤200}` with only `path`/`code`; the editor keeps the draft in both (T323–T326).
- `admin_content_save` logs `request_id, kind, outcome, status, es_version, en_version, error_count`: no titles, summaries, comment nor token (T316, T341).
- CSRF: `PUT` is `mutating: true`, so Origin/`Sec-Fetch-Site` and JSON media type are enforced before anything else (`handler.ts:103-112`). No route-level test (CR-3).
- Drafts: `sessionStorage` per kind, only `{kind, baseVersions, draft, savedAt}`; the comment is not stored; no tokens or personal data. Cleared on save and on discard.
- Existing ids are read-only (`services-editor.tsx:77`, `saved` from the published documents; `markSaved` after a save); the server stays the authority.
- Privacy (C3): no phone, document or birth date; fixtures are the fictional `cv/db/sample` services (byte-identical copy).
- AC27: the only `fetch(` is `lib/admin/browser-client.ts`; no `'use client'` file imports `lib/api` or `session.ts` at runtime; no `process.env`, `console.*` or TODOs in the diff.

## Accesibilidad y textos
- Error summary: `role=alert`, `tabIndex=-1`, receives the focus after a failed save (T321, T325) and links to each field; fields get `aria-invalid` + `aria-describedby`;
  errors are «Error:» text + icon + 3 px border (`editor.module.css:188-189, 278-283`), no new colour token.
- Confirm dialog reused from slug 2 (initial focus on «Cancelar», T323). Accordion with `aria-expanded`/`aria-controls`, move buttons `aria-disabled` at the ends,
  position announced, 44 px targets, `lang` per column with Spanish labels. Visual checks (V2–V5, V7, V11) are still pending in Chrome, as impl.md says.
- Spanish texts: all visible strings come from `lib/admin/messages.ts`, except two problems (CR-2, CR-4).

## Desvíos de impl.md
1. 413 `CONTENT_TOO_LARGE` — **accepted** (matches the API, see above).
2. `adminRoute` passes `params` — accepted (additive, existing handlers untouched).
3. `adminFetch` carries `errors`/`latest` — accepted (additive; T276 untouched; the editor checks their shape).
4. T318 at the handler + `sending` ref — accepted.
5. Restoring a stale draft keeps the CURRENT bases, so the next save overwrites what was published without a 409 — **not accepted as is** (CR-1).
6–14. Accepted (routes only for existing editors, per-id change count, limit cases generated, error clearing, `aria-disabled`, in-page load failures, extra files,
   additive edits to slug 1/2 files: `messages.ts`, `nav.ts`, `admin-routes.ts`, `handler.ts`, `browser-client.ts` — all backwards compatible and green).

## Skills consultadas
- `simplify`: `components/admin/editor-frame.tsx:213,219` `saveDraft(storage, kind, base.versions, draft)` is repeated in three places with the autosave effect
  (line 122); acceptable. `app/admin/(panel)/page.tsx:17-21` and `services/page.tsx:26` duplicate the result→code mapping (`ADMIN_BAD_RESPONSE`/`ADMIN_TIMEOUT`/
  `ADMIN_UPSTREAM`); worth one helper when projects/architecture add a third copy. Observations, not defects.
- `next-best-practices`: sin hallazgos accionables (`force-dynamic` pages and handler, async `params` of Next 16, `loading.tsx`, `redirect()` on a page 401,
  server pages pass plain data to the client editor, no client import of server modules).
- `strict-typing`: sin hallazgos (no `any`/`@ts-*`; narrow casts after guards: `handler.ts:85`, `editor-frame.tsx:227` type guard, `page.tsx:113`).
- `ui-ux-pro-max`: `components/admin/editor-frame.tsx:126-134` the `beforeunload` guard is still armed when a 401 sends the browser to the login (CR-2);
  `components/admin/content-diff.tsx:26` shows raw API field names (`title`, `price`) in a Spanish-only panel (CR-4); `components/admin/error-summary.tsx:21-25`
  a summary link to a field inside an accordion the user collapsed again does nothing (focus on a `hidden` element); minor, observation.
- `testing-strategy`: tests assert behaviour (API call counts, request bodies, focus, log sentinels). Gaps: no test for the save after restoring a stale draft (CR-1)
  and no route-level CSRF test for the content PUT (CR-3).

## Checkpoints
- C1: [x] lint, typecheck, test green · [x] build green without API, panel routes `ƒ` · [x] no debug logs, dead code or context-less TODOs.
- C2: [x] every Tn has an `it()` · [ ] tests cover every behaviour of the diff: the stale-restore save path and the content PUT CSRF are untested (CR-1, CR-3).
- C3: [x] no private data · [x] fictional fixtures only.
- C4: [x] data only through `lib/api` / `adminFetch` · [x] API failures render in-page errors with request id; dashboard cards fail independently (T335).
- C5: [x] tokens only, focus visible, one `h1` per page, landmarks · [ ] all panel text in Spanish (CR-4) · visual checks pending in Chrome (impl.md risks).
- C6: [x] one task in progress · [x] reports in `progress/web-admin/web-admin-content-core/`.
- C7: n/a (closer, after human authorization).

## Cambios requeridos
1. **[Medium] Restoring a stale draft overwrites the newer version without the confirmed overwrite** — `components/admin/editor-frame.tsx:258-263` (deviation 5).
   After a restore, `save(base.versions)` sends the CURRENT bases, so the API accepts the save and replaces the newer version with no 409 and no confirmation.
   The warning (`messages.ts` `draft.stale`) and the diff are shown only BEFORE «Restaurar borrador» and disappear after it, and the change counter mixes the admin's
   edits with the reverts of the newer version (e.g. a service added in another tab shows up only as one more «cambio» and is silently removed on save).
   This is exactly the path a 409 without `latest` sends the user to («recarga la página para recuperarlo», `messages.ts`), so it bypasses AC14's
   «guardar encima (confirmado)». It is not data loss without any warning, but it is a confirmed action turned into an unconfirmed one.
   Fix (either is fine): (a) keep the draft's stored `baseVersions` after a stale restore so the first save gets a 409 and the normal conflict banner
   (diff + confirmed overwrite) takes over; or (b) mark the restore as stale and make the next save open the existing «Guardar encima» `ConfirmDialog`
   before sending. Add an `it()` to T329: restore a stale draft, click «Guardar», assert that nothing overwrites without a confirmation (409 banner or dialog).
2. **[Low] `beforeunload` prompt on the 401 redirect** — `components/admin/editor-frame.tsx:212-215` with `126-134`. On `expired` the draft is copied to
   `sessionStorage` and `navigate(expiredLoginUrl(path))` runs while `dirty` is true, so a real browser shows «¿Salir del sitio?» on top of the redirect
   (the work is already safe; cancelling leaves the user on a dead session). Disarm the guard before navigating (e.g. a ref checked by the handler) and
   assert in T328 that no `beforeunload` listener is left when `navigate` is called.
3. **[Low] No CSRF test for the new mutating handler** — `app/admin/api/content/[kind]/route.test.ts`. AC7 says every mutating handler rejects foreign or missing
   `Origin` and non-JSON bodies with 403/415 and 0 API calls; slug 2 tests it per route (`logout/route.test.ts:33`). Add one `it()` for the content `PUT`
   (foreign `Origin` → 403 `ADMIN_CSRF`, `text/plain` → 415, `puts() === 0`).
4. **[Low] Texts that are wrong or not in Spanish** —
   - `lib/admin/messages.ts:49` `INVALID_URL: 'La dirección debe ser una URL http o https.'` contradicts the API and both validators, which accept **https only**
     (`ContentValidator.httpsUrl`, `validate.ts:29-37`). Use «La dirección debe ser una URL https (sin espacios, hasta 300 caracteres).» or similar.
   - `components/admin/content-diff.tsx:26` lists modified fields with their API names (`servicio-ejemplo (title)`); the panel is Spanish-only (decision 2).
     Map them through the model's `fieldLabel` (or a field-label table) so it reads `(Título)`, and update the T323/T329 expectations.

## Observaciones fuera de alcance
- Whitespace: `isBlank`/`trim()` in JS also strips U+00A0, U+2007, U+202F and U+FEFF, which Java's `isBlank()`/`strip()` keep, so a title made only of
  non-breaking spaces is `REQUIRED` in the browser and the fake but valid for the API. The client is stricter, never laxer; worth a vector when the
  projects slice adds links.
- URLs: `new URL()` accepts hosts that `java.net.URI` rejects (`https://ex_ample.com`, IDN hosts); the client is laxer there and the 422 mapping catches it.
  Relevant for `web-admin-projects`.
- The validation vectors live only in cv-web; the `cv` repo does not run them, so fake ↔ API parity relies on manual reads like this one.
- `app/admin/(panel)/page.tsx:103-104` the three dashboard reads share one request id; fine for correlation, but the API log will show three calls with the same id.
- `ParityPanel` adds published differences to the local count, so after the draft is fixed the announced count still includes the published ones (they are labelled «En lo publicado»).
- Slug-2 observation still open (impl.md 14): `(panel)/layout.tsx` redirects to `login?expired=1` without `next`.

## Ronda 2

**Veredicto: APPROVED.** The four findings are fixed and tested; no regressions found.

Verified with Node 22.23.1: `npm run lint` green · `npm run typecheck` green · `npm test` 124 files / 556 tests green (553 + 3 new `it()`s) ·
`npm run build` green, panel routes still `ƒ`.

- **CR-1 (stale draft) — fixed.** `components/admin/editor-frame.tsx:277` a stale restore sets `draftBase` to the draft's old versions; `saveBase`
  (`:111`) feeds «Guardar» (`:415`), «Reintentar» (`:374`), the autosave (`:129`) and the drafts written on 401/409 (`:225`, `:234`). The PUT therefore
  gets a 409 and the standard banner decides; «Guardar encima» only exists with `latest` and always goes through `ConfirmDialog` (`onConfirm`, `:263`).
  `draftBase` is cleared on a successful save (`:215`) and on discard (`reset`, `:258`). The banner names the versions actually sent (`Conflict.sent`,
  `:236, :340`) and «Ver qué cambió» diffs what is published now against the draft, with an intro sentence (`:356-360`). A 409 without `latest` keeps the same
  bases, so it can never overwrite. The stale warning now says a confirmation will be asked. Tests: `editor-frame.test.tsx:276` (restore v1 over v4 →
  PUT with `{es:1,en:1}`, banner «v1 → v4», diff in Spanish, stored draft still on v1, nothing sent until the dialog is confirmed, then `{es:4,en:4}` with the
  draft's content) and `:301` (409 without `latest` → no «Guardar encima», the second save resends the same bases).
- **CR-2 (beforeunload) — fixed.** The listener is kept in `unloadGuard` (`:101, :139-143`) and removed before `navigate(expiredLoginUrl(path))` (`:226-229`).
  T328 (`editor-frame.test.tsx:229`) checks that no `beforeunload` listener is armed at the moment `navigate` runs.
- **CR-3 (CSRF test) — fixed.** `app/admin/api/content/[kind]/route.test.ts:52`: foreign `Origin`, `Sec-Fetch-Site: cross-site` and no `Origin` → 403
  `ADMIN_CSRF`; `text/plain` → 415 `ADMIN_UNSUPPORTED_MEDIA`; 0 PUTs reach the fake (`adminReq` does pass `headers`, so the cross-site case is real).
- **CR-4 (texts) — fixed.** `lib/admin/messages.ts:49` `INVALID_URL` now says https only, matching the API. `ContentDiffList` takes `label` and both callers pass
  `model.fieldLabel` (`editor-frame.tsx:322, :360`), so the list reads `servicio-ejemplo (Título)`; T323/T329 expectations updated.

Checkpoints updated: C2 [x] (stale-restore save and content PUT CSRF now tested) · C5 [x] all panel text in Spanish (visual checks in Chrome still pending, as
impl.md states). "Cambios requeridos" of round 2: none. The round-1 "Observaciones fuera de alcance" stay open as observations (projects slice / later slugs).

### Skills consultadas (ronda 2)
- `simplify`: sin hallazgos en la corrección (one `saveBase` value replaces the scattered `base.versions`; no new duplication).
- `next-best-practices`: sin hallazgos (client-only changes; no server/client boundary touched).
- `strict-typing`: sin hallazgos (`draftBase` typed `Record<ContentLang, number> | null`, `unloadGuard` typed ref; no casts added).
- `ui-ux-pro-max`: sin hallazgos (conflict banner now names the sent versions; diff intro sentence; Spanish field labels).
- `testing-strategy`: sin hallazgos (the new tests assert request bodies, call counts, dialog gating and listener state, not just rendering).
