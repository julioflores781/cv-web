# Implementation — web-admin-architecture (slug 5/10 of web-admin)

Stacked on slugs 1–4 in the same working tree (branch `feature/web-admin-api-client`); no commit, merge or push. `progress/current.md` untouched.
Verified with Node 22.23.1: `npm run lint`, `npm run typecheck`, `npm run build` green (`/admin/architecture` listed as `ƒ`); `npm test` 131 files /
596 tests green (575 before this slug).

## What was done
- **Model** `lib/admin/content/architecture.ts` (browser-safe; no runtime import of `lib/api`):
  - core per language (`name`, `description`); port pair: common `id` + `adapters`, per language `name`, `description`; adapter pair (nested `Pair`):
    common `id` + `status`, per language `name`, `note`. Adapters pair by id inside their port (like `pairItems`); one in a single language is
    «sin pareja» inline.
  - Optional texts only travel when non-empty (`null` ≡ absent), `adapters` always travels; the fictional sample round-trips identically.
  - A status that already differs ES↔EN in stored data stays in the EN side (`AdapterText.status`), so it is not silently normalised: the parity
    panel lists it and `fixes()` offers «Igualar EN a ES»; choosing a status in the select sets both languages (`withStatus`).
  - `toArchitecture(draft, lang)` gives the public `Architecture` shape for the preview (adapters with an unknown status are left out, as the site
    never gets them). `target()` maps `adapters[n]` of a language to the draft row (by position among the adapters that have that language; Spanish
    for parity paths); `rootTarget()` maps `core`, `core.name`, `core.description`. `markSaved` also marks nested adapters (their ids turn read-only).
- **Shared editor pieces (additive, backwards compatible)**:
  - `EditorModel` (`model.ts`): `target(rest, item?, lang?)`, optional `rootTarget`, `markSaved`, `fixes` (+ `ParityFix` type).
  - `paths.ts`: paths outside the list go through `rootTarget` (location `itemKey: null`, DOM id `campo-<lang>-core[-name|-description]`).
  - `EditorFrame`: summary entry for root fields («Nombre del núcleo (EN)»), model `markSaved`, `fixes` handed to `ParityPanel`.
  - `ParityPanel`: optional `fixes` list (text + button «Igualar EN a ES «<puerto · adaptador>»»).
- **Editor** `components/admin/architecture-editor.tsx`: core block (ES|EN columns, each a fieldset that is also the target of `es|en.core`), live
  preview, status legend (3 values, `StatusShape` + text), «irá en lista» notes per language, ports in the `ItemList` accordion (slug 3), each with
  `PairedFields` and an `AdapterList` (add/move/remove with focus and `role=status` announcements, cap 20 with message, id + status select common,
  name + note per language, «Crear gemelo» for one-language adapters, read-only ids once published, ids suggested from the Spanish name and unique
  per scope). Markers: «Este puerto no tiene adaptadores: no se dibuja», «No se dibuja en esta versión…» per column, «Sin nombre no se dibuja.» as the
  name hint. Unique accessible names with the hidden context pattern of slug 4 («Nombre del adaptador 1 (inglés · Puerto 1: Base de datos)»).
- **Preview** `components/admin/hex-preview.tsx`: reuses the public `buildHexPlane` (`components/hex-plane-section.tsx` → `buildHexModel` + `HexPlane`
  or the public empty plane) with `getDictionary(lang)`, inside `data-mode="profile"`, ES/EN toggle (`aria-pressed`, thick border when pressed),
  keyed by language; admin message «Nada que dibujar todavía…» when the model is empty. No duplicated hexagon code.
- **Page** `app/admin/(panel)/architecture/page.tsx` + `loading.tsx`; nav «Arquitectura»; `KIND_ROUTES.architecture.editor` set. The dashboard link is
  active; `KIND_ROUTES.*.editor` is now non-null, so the «Su editor llegará pronto» branch, its text and the unused `.note` rule of
  `dashboard.module.css` were removed.
- **CSS** `components/admin/architecture.module.css` (tokens only); rows/notes reuse `projects.module.css` like `RowList` does.
- **Fixtures** `tests/fixtures/admin-samples/architecture.{es,en}.json`: byte copies of the fictional `cv/db/sample` files.
- **Java check**: `ContentValidator.architecture/adapters` (core required, name 80, description 300, note 200, 20 ports, 20 adapters, status enum, ids
  unique per port list / per adapter list of a port) and `ContentParity` (ports and adapters by position and id, `status` compared) match the mirror
  (`validate.ts`, unchanged; covered by T304 and the vectors).

## Tests (Tn -> it())
| Tn | it() |
|---|---|
| T354 | `lib/admin/content/architecture.test.ts` |
| T355–T362, T364 | `components/admin/architecture-editor.test.tsx` (one `it()` each) |
| T363 | `tests/runtime/admin-content.test.ts` (standalone + fake) |
| T365 | `app/admin/(panel)/architecture/page.test.tsx` |

Extra tests outside the plan:
- `architecture.test.ts`: version 0 → empty core refused (REQUIRED ×2); ES↔EN status mismatch kept, fix and `withStatus`; adapters paired by id and port
  twin; `markSaved` of nested adapters + `isDraft`; `toArchitecture`; path → field mapping (core, ports, adapters by language position, parity path).
- `architecture-editor.test.tsx`: unique accessible names (AC26); «Crear gemelo» for a one-language adapter.
- `page.test.tsx`: dashboard card links «Editar arquitectura» and the nav entry.
- Modified (slug 3): T334 in `app/admin/(panel)/page.test.tsx` now expects the architecture link instead of «Su editor llegará pronto».

Criteria: AC10 → T360, T365; AC11 → T354, T357, T362; AC12 → T356 (+ T355 note 201); AC13 → T363; AC15 → T361 (+ mapping extra); AC17 → T355–T360,
T363, T364; AC23 → T365; AC26 → T355 (focus/announcements) + extra unique names.

## Deviations
1. **Status mismatch kept in the draft** (EN side) instead of normalising to ES as projects do with images: needed so T362 can show it and make
   «Igualar EN a ES» a real (saveable) change. The fix button lives in the parity panel (generic `fixes` hook); the adapter row also says it.
2. **`en.core` (missing core)** lands on the EN core fieldset (`data-invalid`, error via `aria-describedby`), not on the name input.
3. **The status select** cannot hold an SVG: the shape + text of the chosen value sit next to it (`aria-hidden`, the select already says it), and a
   legend lists the three statuses once with their shapes.
4. **Adapter removal does not ask** (like `RowList` rows); ports keep the `ItemList` confirmation.
5. **New adapters** start with `in-this-api` (first value) and only get the languages their port has.

## Risks / notes
- Visual checks pending in Chrome (V6 of §16: panel preview vs the public plane with `probe.mjs`/`diff`; V3/V4 for the nested adapter rows at 360 px).
- Server errors on adapter fields are placed by position; if the user reorders after a 422, the stale marks follow positions until the next save
  (same behaviour as the project rows).
- `HexPlane` keeps its own selection state while the draft changes; out-of-range selections fall back to the first port (existing guards).

## Ronda 2 (review CHANGES_REQUESTED)
Verified with Node 22.23.1: `npm run lint`, `npm run typecheck`, `npm run build` green (`/admin/architecture` `ƒ`); `npm test` 131 files / 597 tests green.

1. **CR-1** «1 adaptador / N adaptadores» moved to `UI.architecture.adapterCount` in `lib/admin/messages.ts` (like `UI.projects.images`);
   `architecture-editor.tsx` uses it for the accordion header.
2. **CR-2** `ParityPanel`: after «Igualar EN a ES» the focus goes to the repair now at the same position (the next one), or to the panel title
   (`h2#paridad-titulo`, `tabIndex=-1`, focus ring in `editor.module.css` `.panelTitle:focus-visible`) when none is left. The change only acts after a
   repair click; `fixes` is used by the architecture model alone, so services and projects behave as before (their tests stay green; the title's
   `tabIndex=-1` does not add it to the tab order). T362 asserts the focus on the title; extra test «with two status mismatches…» checks next repair →
   title.
