# Implementation — web-admin-projects (slug 4/10 of web-admin)

Stacked on slugs 1–3 in the same working tree (branch `feature/web-admin-api-client`); no commit, merge or push. Image upload is not here (slug 6).
Verified with Node 22.23.1: `npm run lint`, `npm run typecheck`, `npm run build` green (`/admin/projects` listed as `ƒ`); `npm test` 128 files / 575 tests
green (556 before this slug).

## What was done
- **Model** `lib/admin/content/projects.ts` (browser-safe): common = `id, relation, disclosure, client, startDate, endDate, images[{key,width,height}]`;
  per language = `title, summary, role, clientLabel, stack, highlights, links, alts` (the `alt` of each common image, by position). Serialization keeps the
  sample identical (optional texts only when non-empty, lists always, `images` only when non-empty). Privacy helpers: `withDisclosure` (anonymous empties
  `client`; it does not come back), `canHaveImages` (own + public), `clientRequired` (employer + public), `newProject` (employer + anonymous),
  `withoutImage`. `target()` maps every violation path to a field: common fields, per-language texts, `stack`, `highlights.N`, `links.N.label|url`,
  `links`, `images` (the block), `images.N` (an image row), `images.N.alt`. Spanish field labels for the summary and the diff.
- **Editor** `components/admin/projects-editor.tsx` on top of `EditorFrame`/`ItemList`/`PairedFields` of slug 3 (409, 422, drafts, parity unchanged):
  - accordion header «título · id · relación · visibilidad · N imágenes · badge»;
  - common block: id (read-only once published), relation and visibility selects, client (disabled and emptied when anonymous, with the reason and a
    `role=status` notice; hint «Obligatorio…» for employer + public, «Opcional.» otherwise), dates `AAAA-MM` with «Vacío = en curso»;
  - per language: title, summary, role, client description, `TagListField` (stack), `RowList` (highlights, links) and «Copiar tecnologías/enlaces ES → EN»;
  - image block (no upload yet): key (short) and size read-only, «Portada» on the first, `alt` ES/EN, «Quitar la imagen N del proyecto». Not own + public:
    note, no `alt` inputs; with images left, a warning (text + icon + thick border) and the save is blocked by the validator until they are removed
    (never removed on their own);
  - removing a project with images: the confirmation says its images stay in the storage.
- **New shared components**: `components/admin/tag-list-field.tsx` (Enter/comma/button, labelled remove buttons, refuses blank, >60, duplicates and the 31st,
  announces), `components/admin/row-list.tsx` (add/remove/move with focus and announcements, cap with message), `components/admin/editor-skeleton.tsx`
  (services and projects `loading.tsx`), `components/admin/projects.module.css` (tokens only).
- **Page** `app/admin/(panel)/projects/page.tsx` + `loading.tsx`; nav «Proyectos»; `KIND_ROUTES.projects.editor` → the dashboard card now links to the editor.
- **Review observations of slug 3 resolved (Java parity)** — `lib/admin/content/java-text.ts`, used by `validate.ts`, and the same port in
  `scripts/parity/admin-fake.mjs`:
  - blank/strip follow `Character.isWhitespace` (`String.isBlank()`/`strip()`): U+00A0, U+2007, U+202F and U+FEFF are text, U+001C–U+001F are blank. Used for
    required texts, enums, stack/highlights items, the client presence, parity neutral values and the save comment (`EditorFrame` now sends `strip()`ed text,
    like the API).
  - https links: a port of `new java.net.URI(text)` (RFC 2396 server authority: hostname labels, IPv4, IPv6 with scope, userinfo, port ≤ 2^31−1, legal
    characters and `%hh` escapes per component, visible non-ASCII allowed outside the host) + scheme `https` (any case) + non-null host.
  - Checked against Java 21 itself (`ContentValidator.httpsUrl` and `String.isBlank/strip` copied in a scratch program, not in the repo): 200 083 cases
    (fixed + random) gave 0 differences for the client and 0 for the fake.

## Tests (Tn -> it())
| Tn | it() |
|---|---|
| T342 | `lib/admin/content/projects.test.ts` |
| T343–T351, T353 | `components/admin/projects-editor.test.tsx` (one `it()` each) |
| T352 | `tests/runtime/admin-content.test.ts` (standalone + fake) |

Extra tests outside the plan:
- `lib/admin/content/projects.test.ts`: privacy helpers; path → field mapping of every project field; `isDraft`.
- `lib/admin/content/java-text.test.ts`: Java blank/strip and URL cases (expectations verified with Java 21).
- `tests/fixtures/admin-validation-vectors.json`: two validation vectors (URLs as `java.net.URI` parses them; blank as Java sees it) and one parity vector
  (a client of non-breaking spaces); they run through T239 (client vs fake) and T303.
- `app/admin/(panel)/projects/page.test.tsx`: page states (skeleton, editor with the stored projects, 500 with reference and retry, version 0 empty) and the
  dashboard link to the projects editor.

Criteria: AC11 → T342; AC12 → T346–T348 (+ vectors); AC13 → T352; AC15 → T351 (+ mapping extra); AC16 → T343–T345, T349, T352; AC19 → T350;
AC23 → T349 (+ page extra); AC26 → T353 (+ focus/announcements in T347, T348).

## Deviations
1. **Unique accessible names (T353)** are built with `aria-labelledby` = visible label + a hidden context span per item and scope:
   «Título (español · Proyecto público de ejemplo)». `TextField` gained `labelledBy`, `disabled` and `lang` props and `SelectField` was added
   (additive; the services editor is unchanged). Two projects with the same title would share names; the context uses the title (else id, else position).
2. **`ItemList`** gained an optional `removeText` (the generic text stays the default), and **`FieldError`** an optional `text` (panel messages without a code).
3. **Image block without thumbnails**: thumbnails need `GET /admin/images` (key→url), which belongs to slug 6 together with upload, «Hacer portada» and reordering.
   This slug only shows key/size, edits the `alt`s and removes images from a project.
4. **Duplicate stack entries are refused** in the UI («Esa tecnología ya está en la lista.»); the API accepts them. Stricter on purpose (each chip has its own
   remove button name).
5. **`failureCode`** moved to `lib/admin/page-context.ts` and shared by the dashboard, services and projects pages (review observation of slug 3).
6. **Fake changed** (`scripts/parity/admin-fake.mjs`): Java text rules above. The fake ↔ API differences listed in the slug-1 impl.md are otherwise unchanged.
7. Fixtures `tests/fixtures/admin-samples/projects.{es,en}.json`: byte copies of the fictional `cv/db/sample` files.

## Risks / notes
- Visual checks pending in Chrome (V3–V5 of §16): ES/EN columns, chips and row tools at 360 px, the disabled client, the warning of the image block.
- The URL port is a reimplementation of `java.net.URI` for the subset that matters; the 422 mapping still catches anything it might miss. The random check
  lives only in this report (it needs a JDK); the curated cases are in `java-text.test.ts` and the vectors.
- Projects whose ES and EN images differ in published data are paired by position with the ES images as the common part, as `ContentParity` compares them.

## Ronda 2 (review CHANGES_REQUESTED)
Verified with Node 22.23.1: `npm run lint`, `npm run typecheck`, `npm run build` green (`/admin/projects` `ƒ`); `npm test` 128 files / 575 tests green.

1. **Unique button names.** `RowList` and `TagListField` take a `context` text appended to the names of their buttons (add, move up/down, remove,
   remove tag); «Copiar … ES → EN» and «Quitar la imagen N del proyecto» append it too (`projects-editor.tsx`). The visible label stays first (label in
   name). T353 now collects the `button` role inside every item body (the accordion toolbar and the save bar of slug 3 are excluded), after a
   «Copiar ES → EN» so both columns share tags, and asserts no duplicates plus sample names in ES and EN.
2. **Position always in the context.** `UI.projects.context(scope, position, title)` → «(español · Proyecto 2: <título>)», or «(común · Proyecto 3)» without
   a title, so equal titles never collide. T353 adds a second render with two projects of the same title (both with an image).
3. **Eligibility announced.** `announceEligibility` in `ProjectFields`: a relation or visibility change that turns `canHaveImages` false while images remain
   sets the `role=status` notice to the «ya no admite imágenes… Quítalas…» text (joined to the client notice when both happen). T345 asserts the status
   region; T343 now expects both sentences, since its project has an image.
4. **Spanish text.** `UI.projects.copied` is one message per list: «Tecnologías copiadas del español.» / «Enlaces copiados del español.». T347 asserts the
   stack one.

Tests that query project buttons now match the visible label as a prefix (helper `button()` in `projects-editor.test.tsx`).
