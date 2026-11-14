# Implementation — web-admin-history (slug 7/10 of web-admin)

Stacked on slugs 1–6 in the same working tree (branch `feature/web-admin-api-client`); no commit, merge or push. Other slugs not touched beyond the
additive changes listed under «Deviations».
Verified with Node 22.23.1: `npm run lint`, `npm run typecheck`, `npm run build` green (`/admin/history/{services,projects,architecture}` and
`/admin/api/content/[kind]/[lang]/rollback` listed as `ƒ`, `ƒ Proxy`); `npm test` 145 files / 655 tests green (636 before this slug).
No server left running (`pgrep next-server` empty).

## Contract checked against the `cv` sources
- `AdminContentResource` + `RollbackContentService` + `PostgresContentVersionRepository.activate`:
  - `POST /content/{kind}/{lang}/rollback` `{baseVersion ≥0, targetVersion ≥1}` (strict DTO: unknown fields and coercions are 400).
  - **It does not create a version**: it moves the `active` pointer of ONE language. The next save takes `MAX(version)+1`, so the history keeps
    everything. The answer is the same as `GET /content/{kind}`, with the current parity (a one-language rollback may break it).
  - Order: `active != baseVersion` → 409 `CONTENT_VERSION_CONFLICT` first (rechecked under a lock), then missing target → 404
    `CONTENT_VERSION_NOT_FOUND`, then today's rules → 422 `CONTENT_INVALID` with `errors`. The 409 body carries no structured active version
    (only `detail`), so the web handler reads `GET /content/{kind}` right after it (as the PUT already does).
- `GET .../versions?limit=` → `ListContentVersionsService` clamps to 1–200 (default 50); `@QueryParam int`. The web always asks for 50 and
  `listVersions` still refuses anything outside 1–200 before calling.
- `GET .../versions/{n}` → snapshot with `publishedAt`, `source`, `comment` (optional in the schema) besides `version`, `active`, `content`.

## What was done
- **Handler** `app/admin/api/content/[kind]/[lang]/rollback/route.ts` (`adminRoute`: CSRF + JSON body type, session, `no-store`, `X-Request-Id`):
  validates kind/lang (404 `ADMIN_NOT_FOUND`), body ≤ 4 KiB (413), `baseVersion`/`targetVersion` whole numbers 1…2³¹−1 (400 otherwise), forwards
  only those two, once (no retry). 200 → content; 409 → `{code, requestId, latest?}` (immediate GET); 422 → `{code:'CONTENT_INVALID', requestId,
  errors≤200}`; 404 passes; the rest through `failure()`. Log `admin_rollback` (`request_id`, `kind`, `lang`, `outcome`, `from`, `to`).
- **Screen** `app/admin/(panel)/history/`: `history-page.tsx` (shared server screen), `services|projects|architecture/page.tsx` (thin routes),
  `loading.tsx` (skeleton). Reads in parallel with their own request ids: versions (limit 50), current content (both languages + parity) and,
  with `?v=N`, the snapshot. `?lang=` (es by default), `?v=` only digits 1…2³¹−1 (anything else ignored, never sent). 401 → login with `next`;
  failures → `LoadFailure` with reference and retry; a missing `v` → friendly alert next to the list.
- **Client** `components/admin/history-view.tsx` (+ `history.module.css`, tokens only): ES|EN selector (`nav`, `aria-current`), «Activa ahora:
  ES vX · EN vY» + link to the editor, list (`ol` named by its heading; each row named by its number) with number, date (`LocalTime`), origin
  (Inicial/Panel), comment (cut to 80 code points with the full text in `title`; React escapes) and «Activa» (text + filled circle + thick
  border); «Ver la versión N (ES)» / «Restaurar la versión N (ES)» (unique names; inert `aria-disabled` + description on the active one and while a
  rollback is in flight). Snapshot region: facts, «Solo lectura», what restoring would change against the active one (`diffDocuments` + the
  model's Spanish field names), items «id — title», the whole document in a `<details>` (JSON as text), «Restaurar esta versión», «Volver a la
  lista». Empty: «Nunca publicado en …» + «Publicar el primero»; one version: «no hay otra a la que volver».
- **Rollback flow**: always a `<ConfirmDialog>` («ES pasa de vX a vY (se conserva el historial…). EN no cambia (sigue en vZ).»); one POST with
  `baseVersion` = active version seen and `targetVersion`; a ref blocks double sends; no retry ever. Success → badge and «Activa ahora» move,
  `role=status` announcement, snapshot becomes «activa», parity notice with link to the editor when broken. 409 → «La versión activa en … cambió
  mientras mirabas (ahora es la vN). No se ha restaurado nada…» + «Recargar»; 404 / 422 (with the paths and Spanish messages) → «No se puede
  restaurar… La activa sigue siendo la vX.»; network/timeout → message + «No se ha reintentado…» + «Recargar»; 401 → login with `next`.
- **Drafts**: the rollback never touches `sessionStorage`. When opening the dialog the screen reads the kind's draft (with the editor model's
  `isDraft`); if there is one the dialog says it is kept and that the editor will offer it and ask before overwriting (its `baseVersions` no
  longer match, so the existing stale-draft flow of `EditorFrame` → 409 → confirmed overwrite applies); the success message repeats it.
- **Links switched on**: `KIND_ROUTES[kind].history` (dashboard cards «Historial de …») and a new `HistoryLink` under the intro of the three
  editors («Historial de versiones de …»).
- `lib/admin/history.ts` (browser-safe): `HISTORY_LIMIT`, `parseLang`, `parseVersionParam`, `historyUrl`, `shortComment`, `snapshotItems`, `isKind`.
- `components/admin/content-diff.tsx`: one-language `DocumentDiffList` extracted (reused by `ContentDiffList`).
- `lib/admin/messages.ts`: `UI.history` texts (Spanish only).
- `lib/api/admin`: `VersionSnapshot` keeps `publishedAt`, `source`, `comment` (null when absent; malformed → invalid).
- **Fake** `scripts/parity/admin-fake.mjs` aligned with Java: rollback checks the base (409) before the target (404); rollback body strict (unknown
  field → 400; > int → 400); `limit` and the `{version}` segment parsed like a Java `int` (`02` is 2; non-int → 404 `NOT_FOUND`, same inference as
  `olderThanHours` in slug 6, not run against the API).

## Tests (Tn → it())
| Tn | it() |
|---|---|
| T392 | `components/admin/history-view.test.tsx` «T392: …»; `app/admin/(panel)/history/history.test.tsx` «T392 (page): …»; HTTP 404 of an unknown kind in `tests/runtime/admin-history.test.ts` (T400) |
| T393 | `history-view.test.tsx` «T393: …»; `history.test.tsx` «T393 (page): …» |
| T394 | `history-view.test.tsx` «T394: …»; `history.test.tsx` «T394 (page): …» |
| T395 | `history-view.test.tsx` «T395: …» |
| T396 | `app/admin/api/content/[kind]/[lang]/rollback/route.test.ts` «T396: …» |
| T397 | `history-view.test.tsx` «T397: …»; `rollback/route.test.ts` «T397 (handler): …» |
| T398 | `history-view.test.tsx` «T398: …» |
| T399 | `rollback/route.test.ts` «T399: …» |
| T400 | `tests/runtime/admin-history.test.ts` «T400: …» (standalone + fake) |
| T401 | `history-view.test.tsx` «T401: …» |

Extra tests outside the plan:
- `history-view.test.tsx`: «extra (drafts)» (dialog warns, draft intact after restoring); «extra» 401 → login with `next`, network failure not retried.
- `history.test.tsx`: «extra (AC23)» skeleton, failed read with reference/retry, 401 redirect with `next`; «extra» dashboard and editor links.
- `lib/api/admin/parse.test.ts`: «extra (web-admin-history)» snapshot facts.
- `scripts/parity/admin-fake.test.ts` T231: `limit=x` → 404 `NOT_FOUND`, `versions/02` and `versions/abc`, 409 before 404, unknown field 400.

Criteria: AC21 → T392–T398, T400, T401; AC7 → T396 (CSRF, body type, 0 calls); AC9 (no retry on writes) → T397 (handler); AC23 → T393, T394,
extra (AC23); AC25 → T399, T400 (log without comment, title or token); AC26 (DOM level) → T392 (names, `aria-current`, inert buttons with
description), T398 (`role=status`), T401; AC14 (draft never lost) → extra (drafts).

## Deviations
1. **Three static routes instead of `history/[kind]/page.tsx`.** With the panel's `loading.tsx` boundary the page streams a 200 before a
   `notFound()` runs (Next docs, `not-found.md` «Status codes»); `dynamicParams = false` is ignored with `force-dynamic` (tried: still 200).
   With `history/{services,projects,architecture}/page.tsx` + shared `history-page.tsx`, any other kind falls to `app/admin/[...rest]` → real
   404 (T400). URLs are the ones of the plan (`/admin/history/<kind>/?lang=&v=`).
2. **A missing `?v=N` is an in-page alert** («La versión N no existe en …», list still shown) with HTTP 200, not an HTTP 404 page; a `v` that is
   not a positive int is ignored.
3. **`baseVersion` ≥ 1 in the handler** (the plan's «enteros ≥1»; the API accepts 0, which can only end in 404). Body > 4 KiB → 413 `ADMIN_BAD_REQUEST`.
4. **Fake changed for parity with `cv`** (see above); T231 (slug 1) updated: `limit=x` is now 404 `NOT_FOUND` instead of 400.
5. `VersionSnapshot` type extended (additive). `KIND_ROUTES.history` is now always a string. `ContentDiffList` split (same output).
6. `admin_rollback` also carries `request_id` (§11: every line has it) and no `status`.
7. The parity notice is shown after a rollback done in this screen; on load, parity is already on the dashboard and the editor.
8. No «Historial» entry in the main nav (the history is per kind; reached from the dashboard cards and the editors).

## Risks / notes
- Visual checks pending in Chrome (§16 V2, V7, V11): the list and snapshot at 360 px, the real `<dialog>`, focus ring of the language links.
- The `title` of a cut comment is not reachable by keyboard; the full comment is in the snapshot view («Ver»).
- If a rollback reaches the API but the answer is lost (network/timeout), the screen says it was not retried and offers «Recargar»; restoring
  again with the old base would be a 409, never a double rollback.
- Fake vs real API, inferred and not run: non-int `limit` / `{version}` → 404 `NOT_FOUND`. To confirm with the runbook against the deployed API.
- The snapshot JSON can be up to ~96 KB in a `<details>` (closed by default).

## Ronda 2 (review CHANGES_REQUESTED, CR-1)
Verified with Node 22.23.1: `npm run lint`, `npm run typecheck`, `npm run build` green (same routes, `ƒ`); `npm test` 145 files / 655 tests green.
No server left running; no commit.

1. **[Baja] CR-1 — unreachable guard and duplicated type guards.**
   - `app/admin/(panel)/history/history-page.tsx`: `kind` is typed `ContentKind` (the three routes pass a literal); the `if (!isKind(kind)) notFound()`
     guard and the `notFound` import are gone. An unknown kind has no route and is a real 404 through `app/admin/[...rest]` (runtime test T400).
   - `lib/admin/history.ts`: `isKind` deleted (and its `KINDS` import). The mention of `isKind` in «What was done» above no longer applies.
   - `app/admin/api/content/[kind]/[lang]/rollback/route.ts`: the local `isKind`/`isLang` are gone; it uses `isContentKind`/`isContentLang`, now
     exported from `lib/api/admin/index.ts` (defined in `parse.ts`). Same behaviour (T396 unchanged and green).
   - `app/admin/(panel)/history/history.test.tsx` «T392 (page)»: no longer calls the shared screen with an unknown kind (that branch does not
     exist); it goes through the three routes only, and the `notFound` mock was removed. The 404 of an unknown kind stays covered over HTTP in
     `tests/runtime/admin-history.test.ts` (T400: `/admin/history/resume/` → 404).
