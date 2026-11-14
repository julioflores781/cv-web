# Review — web-admin-projects (slug 4/10 of web-admin)

## Veredicto
**CHANGES_REQUESTED** (round 1)

The slug is solid where it matters most: the privacy rules match `ContentValidator` line by line, the anonymous client cannot be typed, kept, or
logged, images are never removed on their own, and the Java text port (blank/strip and `java.net.URI`) agrees with Java 21 in my own independent run
(0 differences, see "Paridad con Java"). Four low-severity findings remain, all about accessibility and Spanish text. They are listed under "Cambios
requeridos". None of them is a privacy or data risk.

Verified with Node 22.23.1 on the working tree (`feature/web-admin-api-client`, uncommitted): `npm run lint` green · `npm run typecheck` green ·
`npm test` 128 files / 575 tests green · `npm run build` green, with `/admin/projects` listed as `ƒ` (all panel routes `ƒ`).

## Trazabilidad Tn ↔ it()
All found and read. (*) = critical, read line by line.

| Tn | it() | Notes |
|---|---|---|
| T342 (*) | `lib/admin/content/projects.test.ts:9` | common/per-language split, alts by position, canonical round trip, 0 diff changes, the sample validates clean |
| T343 (*) | `components/admin/projects-editor.test.tsx:27` | disabled + emptied, accessible description, `role=status` notice, stays empty when back to public |
| T344 (*) | `projects-editor.test.tsx:44` | `CLIENT_REQUIRED` on the field, 0 PUTs; own+public saves and the body has no `client` |
| T345 (*) | `projects-editor.test.tsx:69` | note on the anonymous block (no alt inputs); warning after the change, image still there, save blocked, block error; removing it lets the save through without `images` |
| T346 | `projects-editor.test.tsx:100` | `2024-13`, `abc`, end < start, end without start; «Vacío = en curso» |
| T347 | `projects-editor.test.tsx:128` | Enter and comma, blanks ignored, labelled remove + focus, 61 refused / 60 accepted, cap of 30, «Copiar ES → EN» |
| T348 | `projects-editor.test.tsx:173` | add/move/remove with focus and announcement, cap of 10, label 81 → TOO_LONG, `http://` → INVALID_URL |
| T349 | `projects-editor.test.tsx:212` | header «título · id · relación · visibilidad · N imágenes», error badge, new = employer+anonymous with the client disabled, empty state, cap of 50 |
| T350 | `projects-editor.test.tsx:245` | the confirmation mentions the storage only when the project has images |
| T351 (*) | `projects-editor.test.tsx:257` | the three paths land on link field, image block and common client; summary links in path order |
| T352 (*) | `tests/runtime/admin-content.test.ts:77` | standalone + fake: `/` and `/en/` reflect the save; anonymous + sentinel client → 422 `ANONYMOUS_CLIENT_FORBIDDEN`, sentinel absent from both pages |
| T353 | `projects-editor.test.tsx:291` | inputs/selects only, three projects open; does not cover buttons nor equal titles (CR-1, CR-2) |

Extras read: privacy helpers and path→field mapping (`projects.test.ts:38, :58`), draft guard (`:93`), `java-text.test.ts` (Java cases), the two new
validation vectors and the parity vector (run by T239/T303), `app/admin/(panel)/projects/page.test.tsx` (states and the dashboard link).

## Trazabilidad criterios ↔ tests
AC11 → T342 · AC12 → T346–T348 + vectors · AC13 → T352 · AC15 → T351 + mapping extra · AC16 → T343–T345, T349, T352 · AC19 → T350 ·
AC23 → T349 + page extra · AC26 → T353 + focus/announcements in T347, T348. Every criterion in scope maps to at least one test. AC16 says the
eligibility change "avisa": it is shown, not announced (CR-3).

## Privacidad (contra `cv/application/.../ContentValidator.java` y `ContentParity.java`)
- **Anonymous empties/disables the client:** `withDisclosure` (`projects.ts:58-60`) empties `client` on the change, and it does not come back
  (`projects.test.ts:45`, T343). The input is `disabled` (`projects-editor.tsx:138`), with the reason as its description. Java: `client()` gives
  `ANONYMOUS_CLIENT_FORBIDDEN` when it is present; the client's `present` uses Java's `isBlank` (`validate.ts:162`). A blank client on an anonymous
  project is valid in both (vector «a blank client on an anonymous project is fine»).
- **Employer + public requires the client:** `clientRequired` + the hint; the validator emits `CLIENT_REQUIRED` exactly as Java does (`validate.ts:167`), T344.
- **Images only on own + public:** `canHaveImages`; validator `IMAGES_NOT_ALLOWED_FOR_PROJECT` on `…images`, after `TOO_MANY` as in Java
  (`validate.ts:131-134` ↔ `ContentValidator.java:155-163`).
- **Never removed on their own:** no code path drops images except the explicit «Quitar la imagen N del proyecto» (`withoutImage`). Removing a project
  warns that its images stay in the storage (T350).
- **Restrictive default:** `newProject()` = employer + anonymous, empty client (`projects.ts:63-71`, T349).
- **No leak of the anonymous client:** it cannot be typed (disabled) and it is emptied in the draft state before the autosave writes it, so the
  `sessionStorage` draft never holds it. The draft guard only checks shapes. The conflict diff shows ids and field labels, never values
  (`content-diff.tsx:26`). The hidden context span and the accordion header use title/id/relation/visibility, not the client
  (`projects-editor.tsx:286, :409`). There is no new `logEvent` in this slug. The handler log stays counts-only (T316/T341 of slug 3), and T352 checks the
  public HTML with a sentinel.
- **Existing ids are read-only:** `readOnly={pair.saved}` (`projects-editor.tsx:107`). The automatic id from the title runs only for `!item.saved` (`:78`).
- C3: no phone, document or birth date. Fixtures are the fictional `cv/db/sample` projects («Ejemplo S.A.», example.com).

## Paridad con Java (whitespace y URL)
- Read `ContentValidator.httpsUrl` (length ≤300 UTF-16 units, no `Character.isWhitespace`, `new URI(text)`, scheme `https` ignoring case,
  `getHost() != null`), `text()`/`strings()`/`enumValue()`/`client()` (`isBlank`), and `ContentParity.text()` (`isBlank` neutral). The client
  (`java-text.ts`, `validate.ts:28, :252`) and the fake (`admin-fake.mjs:33-157`, a line-by-line copy) use the same rules in every one of those places.
  The save comment now uses `strip()` in both `validateSave` and `EditorFrame`, like the API.
- **Independent check** (scratchpad only, nothing added to the repo): I compiled a Java 21 program with the exact `httpsUrl` + `isBlank` + `strip`, and
  ran the same strings through `java-text.ts`. The input was 105 hand-made edge cases plus 20 000 random URL-like strings and 3 000 random whitespace
  strings, about 23 100 in total. Edge cases included IPv6 forms and scopes, IPv4 look-alikes, `%` escapes in host, userinfo and path,
  lone surrogates, U+00AD/U+200B/U+0085/U+3000/U+FEFF, ports up to 2^31, `[]` in path vs query, trailing dots, digit-led labels, `https:`/`https:#`,
  and nested `?`/`#`. Result: **0 differences** (URL verdict, `isBlank`, `strip` length).
- The representative cases in the repo (`java-text.test.ts`, the two new vectors) match Java in that run as well.

## Cambios sobre slugs previos (aditivos)
- `TextField` gains `labelledBy`/`disabled`/`lang`, and `SelectField` is new. `ItemList` gains an optional `removeText` (the default is unchanged), and
  `FieldError` an optional `text`. `failureCode` moved to `lib/admin/page-context.ts` and is used by the dashboard, services and projects pages
  (this resolves the slug-3 `simplify` observation). `EditorFrame` comment `trim` → `javaStrip`. The validator now uses Java blank and URL rules (this
  resolves both slug-3 observations). All are backwards compatible. Services tests and slug-1–3 tests stay green (556 → 575, none modified to pass).

## Desvíos de impl.md
1. Unique names through `aria-labelledby` + hidden context: the approach is accepted. **Equal titles produce equal names: not accepted** (CR-2).
2. `ItemList.removeText`, `FieldError.text`: accepted (additive).
3. No thumbnails / upload / «Hacer portada» / reorder until slug 6: accepted (they need `GET /admin/images`; the plan puts them in `web-admin-images`).
4. **Refusing a repeated technology while the API accepts it: accepted as a divergence.** It only applies when typing a new chip. Loaded or
   copied data with repeats is kept and saved unchanged, and the validator does not report it, so the client is never laxer than the API and never
   rewrites stored content. It keeps each chip's remove button unique within its column. That rationale only holds per column (CR-1).
5. `failureCode` shared: accepted.
6. Fake changed to the Java text rules: accepted, and verified above.
7. Byte copies of the fictional samples: accepted.

## Accesibilidad y textos
- Errors are «Error:» text + icon + a 3 px `--ink` border (`projects.module.css:13-15, :30-37`), with no new colour token. Targets are ≥44 px; the global
  `:focus-visible` covers the `tabIndex=-1` image rows. Focus handling in `RowList`/`TagListField` is correct and tested. The live regions are
  `role=status`. `lang` is set per column and the labels are Spanish.
- Spanish texts all come from `lib/admin/messages.ts`; one grammar error (CR-4).

## Skills consultadas
- `simplify`: `scripts/parity/admin-fake.mjs:33-157` duplicates `java-text.ts` (about 120 lines). This is justified, because the `.mjs` fake cannot import TS and
  T239 pins both copies. Observation. `projects-editor.tsx:46` `FIELDS` merges two label tables; fine. No other findings.
- `next-best-practices`: sin hallazgos (`force-dynamic` page, `loading.tsx` skeleton, server page passes plain data to a client editor, 401 → `redirect`, no
  server import in `'use client'` files).
- `strict-typing`: sin hallazgos (no `any`/`@ts-*`; the casts `tail[1] as string` (`java-text.ts:81-82`) and `moved as T` (`row-list.tsx:71`) follow
  index guards under `noUncheckedIndexedAccess`; draft read back through `isProjectPair`).
- `ui-ux-pro-max`: `components/admin/row-list.tsx:90-104`, `tag-list-field.tsx:85,122` and `projects-editor.tsx:385-387`: buttons repeat the same
  accessible name in the ES and EN columns and across projects (CR-1). `lib/admin/content/projects.ts:220` + `projects-editor.tsx:287`: equal titles
  give equal names (CR-2). `projects-editor.tsx:67-70, :341`: an eligibility change that leaves images is shown but not announced (CR-3).
  `lib/admin/messages.ts:194`: «Tecnologías copiados» (CR-4). Also `projects-editor.tsx:372`: «Texto alternativo de la imagen 1 (EN) (inglés · …)»
  says the language twice; cosmetic, observation.
- `testing-strategy`: the tests assert behaviour (request bodies, PUT counts, focus, descriptions, live regions, public HTML with a sentinel). Gaps: T353
  checks only inputs and only distinct titles (CR-1, CR-2), and there is no assertion on the eligibility announcement (CR-3).

## Checkpoints
- C1: [x] lint, typecheck, test green · [x] build green without API, panel routes `ƒ` · [x] no debug logs, dead code or TODOs.
- C2: [x] every T342–T353 has a real `it()` · [ ] T353 does not cover button names nor equal titles (CR-1, CR-2).
- C3: [x] no private data · [x] fictional fixtures only.
- C4: [x] data only through `getAdminContent`/`adminFetch` · [x] load failure in-page with reference and retry; version 0 empty (page extra).
- C5: [x] tokens only, focus visible, one `h1`, landmarks · [ ] unique names and announced eligibility warning (CR-1–CR-3) · [ ] Spanish text (CR-4) ·
  visual checks V3–V5 in Chrome still pending (impl.md risks).
- C6: [x] one task in progress · [x] reports in `progress/web-admin/web-admin-projects/`.
- C7: n/a (closer, after human authorization).

## Cambios requeridos
1. **[Low] Buttons with duplicate accessible names inside one project and across projects.** These buttons have the same name in the ES and EN
   columns of the same project, and again in every open project:
   - «Añadir tecnología» (`tag-list-field.tsx:122`);
   - «Quitar «Java» de tecnologías» (`:85`), as soon as both columns share a tag, which «Copiar ES → EN» makes the normal case;
   - «Añadir logro» / «Añadir enlace» and «Subir/Bajar/Quitar el logro N / el enlace N» (`row-list.tsx:90-113`);
   - «Copiar … ES → EN»;
   - «Quitar la imagen N del proyecto» across projects (`projects-editor.tsx:385`).

   A screen-reader user who lists buttons cannot tell them apart. Fix: reuse the context span the inputs already use. Pass the context id to
   `RowList`/`TagListField`/`ImagesBlock`, then use `aria-labelledby="<own label id> <ctx>"` or add the context to the `aria-label`. Extend T353 to the
   `button` role inside the open projects; the accordion's own toolbar can be excluded if it is generic to slug 3.
2. **[Low] Equal titles give equal accessible names** (deviation 1, `projects.ts:220` used by `projects-editor.tsx:66, :287`). Two projects titled
   alike (or two new ones typed the same) collide, so T353's «todos tienen nombre único» does not hold in general. Fix: make the context unique by
   construction, for example by always adding the position («español · Proyecto 2: <título>»). Ids are not enough, because they can repeat while the user is
   editing. Add a T353 case with two projects that share a title.
3. **[Low] The eligibility change that leaves images is not announced** (`projects-editor.tsx:67-70` for relation, `:93-96` for disclosure; the
   warning `<p>` at `:341` is not a live region). The client gets a `role=status` notice on the same kind of change (T343), but «ya no admite imágenes…
   Quítalas» appears silently. A screen-reader user learns about it only at save time, through the error summary. Fix: when a relation or disclosure change
   turns `canHaveImages` false and `images.length > 0`, set the existing `notice` to `B.mustRemove`, or a short form of it. Assert in T345 that the
   status region announces it.
4. **[Low] Wrong gender in a Spanish message:** `lib/admin/messages.ts:194` `copied: (what) => \`${what} copiados del español.\`` produces
   «Tecnologías copiados del español.». Use one message per list («Tecnologías copiadas del español.» / «Enlaces copiados del español.»), and assert
   the stack one in T347.

## Observaciones fuera de alcance
- `TagListField` uses `String.prototype.trim()` to clean a typed tag (`tag-list-field.tsx:48`). A tag made only of U+00A0 is ignored, although Java
  would accept it, and U+001C is kept and then flagged by the validator. The client is never laxer than the API, so this is harmless.
- A server error on `stack[N]` lands on the stack input without saying which tag is wrong; acceptable for the 422 fallback.
- The image row error (`IMAGE_KEY_INVALID` on `images.N`) is shown in the `li` but not tied by `aria-describedby`; it can only come from the API, and
  slug 6 reworks this block.
- The random Java comparison is not reproducible from the repo (it needs a JDK). The curated cases and vectors are, which is enough for the CI.
- Slug-3 observations still open: the summary link to a field inside a collapsed accordion; the shared request id of the dashboard reads; `(panel)/layout.tsx`
  without `next`.

## Ronda 2

**Veredicto: APPROVED.** All four findings are fixed and tested, and no regressions were found.

Verified with Node 22.23.1: `npm run lint` green · `npm run typecheck` green · `npm test` 128 files / 575 tests green · `npm run build` green, with
`/admin/projects` and every other panel route listed as `ƒ`.

- **CR-1 (button names) — fixed.**
  - `RowList` and `TagListField` take an optional `context`. When it is given, it is appended to add, up, down, remove and remove-tag
    (`row-list.tsx:38, :90-116`; `tag-list-field.tsx:37, :85, :125`). Without it, nothing changes, so services keep their names.
  - «Copiar … ES → EN» and «Quitar la imagen N del proyecto» append the scope context too (`projects-editor.tsx:210, :407`).
  - The visible text stays first in each name, so the name contains the label as WCAG 2.5.3 requires.
  - T353 (`projects-editor.test.tsx:297`) now also collects `button` inside every item body. It runs after «Copiar tecnologías ES → EN», so both columns
    share tags, asserts no duplicates and checks ES/EN samples of each button kind.
- **CR-2 (equal titles) — fixed.** `UI.projects.context(scope, position, title)` always carries the position: «(español · Proyecto 2: <título>)»
  (`messages.ts:174`, `projects-editor.tsx:66-68`). T353 renders a second time with two projects that share a title and both have images. It opens all of
  them and asserts unique names, including `Quitar la imagen 1 del proyecto (común · Proyecto 2: …)`.
- **CR-3 (eligibility announced) — fixed.**
  - `announceEligibility` (`projects-editor.tsx:96-113`) runs for both relation and visibility changes. It announces through the existing `role=status`
    only on a real transition, that is, when the project could take images before, cannot after the change, and still has images.
  - It joins the message to the client notice when both happen.
  - T345 (`:83`) asserts the status text, and T343 (`:40`) asserts the combined sentence. The sample project has an image, which is why both messages
    appear there.
- **CR-4 (Spanish) — fixed.** `copied` is now one message per list: «Tecnologías copiadas del español.» / «Enlaces copiados del español.»
  (`messages.ts:197`). T347 (`:176`) asserts the stack message and its `role=status`.

**Accordion bar and save bar left out of T353: acceptable.**
- The save bar is unique per page, so its names cannot collide.
- The accordion toolbar is the generic `ItemList` of slug 3, which was approved and is shared with services. Its names come from `label(item)` («Subir
  «título»», «Quitar «título»»), so two projects with the same title still share those three names. The toggle does not have this problem, because
  its id and detail differ.
- Fixing the toolbar means changing the shared component's naming for services as well. That is a cross-slug change, not something this diff
  introduced. It goes to the observations below, recommended for `web-admin-regresion`: add the position to the `ItemList` tool names, and extend
  the T353-style check to services and to the toolbar.

Checkpoints updated: C2 [x] (T353 covers buttons and equal titles) · C5 [x] unique names, eligibility announced, Spanish text. The visual checks V3–V5 in
Chrome are still pending, as impl.md states. "Cambios requeridos" of round 2: none.

### Skills consultadas (ronda 2)
- `simplify`: sin hallazgos (one optional `context` prop and a `named()` helper per component; `announceEligibility` replaces the ad-hoc client notice).
- `next-best-practices`: sin hallazgos (client-only changes).
- `strict-typing`: sin hallazgos (`context?: string | undefined`, `copied` typed by key; no casts added).
- `ui-ux-pro-max`: sin hallazgos in the fix; accordion-toolbar names with equal titles noted as an observation (above).
- `testing-strategy`: sin hallazgos (T353 asserts no duplicate names across roles and with equal titles; T343/T345/T347 assert the live-region text).

### Observaciones fuera de alcance (ronda 2)
- `components/admin/item-list.tsx` toolbar («Subir/Bajar/Quitar «título»») repeats its names for items with the same title, in projects and services.
  Recommended for `web-admin-regresion`.
