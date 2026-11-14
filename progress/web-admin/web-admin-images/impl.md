# Implementation — web-admin-images (slug 6/10 of web-admin)

Stacked on slugs 1–5 in the same working tree (branch `feature/web-admin-api-client`); no commit, merge or push. Slug 9 (public components) not touched.
Verified with Node 22.23.1: `npm run lint`, `npm run typecheck`, `npm run build` green (`/admin/images`, `/admin/api/images`, `/admin/api/images/[id]`,
`/admin/api/images/cleanup` listed as `ƒ`, `ƒ Proxy`); `npm test` 141 files / 635 tests green (597 before this slug).

## Spike: upload of 5 MiB with `proxy.ts` (corrected in round 2)
Run on the real standalone build against `admin-fake.mjs` with `node:http` clients (scratch scripts, not in the repo).
- **Round 1 (wrong conclusion).** A full-speed client on loopback: every size got the expected status (201 up to 5 MiB, 413 above, chunked too),
  and no Next warning showed. That client wrote the whole body before the answer could matter, so it could not see when the 413 arrived.
- **Measured again with a slow client** (64 KiB every 12 ms, about 5 MiB/s; it stops writing when the answer arrives):

  | Case | Matcher `/admin/:path*` (before) | Matcher without `/admin/api/images` (after) |
  |---|---|---|
  | 12 MiB, `Content-Length` | 413 at 2 638 ms, 12 MiB sent | 413 at 4 ms, 0.06 MiB sent |
  | 12 MiB, chunked | 413 at 2 643 ms, 12 MiB sent | 413 at 1 129 ms, 5.13 MiB sent (cap reached) |
  | 30 MiB, `Content-Length` | 413 at 6 560 ms, 30 MiB sent | 413 at 10 ms, 0.06 MiB sent |
  | 12 MiB, `Content-Length`, no cookie | 401 (proxy) at 2 622 ms, 12 MiB sent | 401 (handler) at 3 ms, 0.06 MiB sent |
  | Non-JSON log lines | 4 × `Request body exceeded 10MB for /admin/api/images/. Only the first 10MB…` | none |

  With the proxy in front, Next clones the body for it and waits for the original stream to end before the handler runs, so the handler's early
  413 only reached the browser after everything was sent, and bodies over 10 MB left a plain-text line in the log (a confirmation of the review).
- **Decision (Julio, option a):** `proxy.ts` no longer matches `/admin/api/images` and its subroutes. The handler keeps its own cap
  (`Content-Length` > 5 MiB + 64 KiB → 413 before reading; counted read otherwise), asks for the session itself (401 without cookie), checks CSRF and
  answers `no-store`; `next.config.ts` still adds `X-Robots-Tag`/`X-Frame-Options` there. `request.formData()` is never called on the raw body:
  the multipart is parsed with `Response.formData()` over the bytes already read and capped. `proxyClientMaxBodySize` is not used.

## What was done
- **`lib/admin/images.ts`** (browser-safe): `sniffImage` / `checkImageBytes` / `checkImageFile` (port of `ImageFormat.detect`: only the first 12 bytes,
  ≥12 needed, name and MIME ignored; size first, nothing read for empty or >5 MiB), `isKnownUnsupported` (port of `ImageFormat.isKnownUnsupported`, used
  by the handler to split 415/400 like the API), `imageIdOf`, `shortKey` (moved from the projects editor), `parseUploaded`, `parseCleanup`, types
  `ImageLibrary` and `UploadedPreview`.
- **Handlers** (`adminRoute`: CSRF on every mutation, `no-store`, `X-Request-Id`):
  - `app/admin/api/images/route.ts`: `GET` (list, 503 passes with its code) and `POST` (multipart only): `Content-Length` > 5 MiB + 64 KiB → 413
    `IMAGE_TOO_LARGE` without reading; counted read with the same cap; exactly one non-empty `file` part (else 400 `IMAGE_INVALID`); file > 5 MiB →
    413; magic bytes → 415 (other image type) / 400 (not an image); then `uploadImage` (fresh multipart, fixed name `upload`, never retried, 30 s).
    Log `admin_image_upload` (`outcome`, `status`, `bytes`, `content_type`; never the file name or content).
  - `app/admin/api/images/[id]/route.ts`: `DELETE`, id must be a lowercase UUID (400 otherwise, no call), 204 → 200 `{ok:true}`, 404/409/503 pass.
    Log `admin_image_delete` (`outcome`, `status`).
  - `app/admin/api/images/cleanup/route.ts`: `POST {dryRun?=true, olderThanHours?=24}`, whole hours 1–8760, body ≤ 4 KB (413), unknown fields dropped,
    sent as query. Log `admin_image_cleanup` (`outcome`, `status`, `dry_run`, `count`).
  - `lib/admin/image-handler.ts`: `MAX_UPLOAD_BODY_BYTES`, call context, `imageFailure` (503 `IMAGE_STORAGE_UNAVAILABLE` reaches the browser as is;
    the common `failure()` would turn it into 502) and `imageOutcome`.
  - `lib/admin/handler.ts`: `readBody` (counted read, cancels past the cap; `readJson` now uses it) and `media: 'none'` (a mutation without body: the
    DELETE; Origin is still checked).
- **Browser client** `lib/admin/browser-client.ts`: `uploadImage(file, {signal})` → `FormData` with one `file` part, no forced `Content-Type`, 45 s,
  no retry; result `AbortableResult` (`aborted` only exists for calls with a signal, so `adminFetch`'s type is unchanged). `adminFetch` takes `form`.
- **Components**:
  - `image-uploader.tsx`: drop zone + «Elegir imágenes» button (keyboard path; the hidden `<input type=file multiple accept>` is out of the tab
    order), check in the browser, rejected files listed with their reason and never sent, files beyond the free slots rejected, sequential queue with a
    state per file (en cola / subiendo / subida / rechazada / error with reference / cancelada), summary in `role=status`; a 401 cancels the queue and
    calls the editor's `expire`. The drag state is also said in words and with a thicker dashed border.
  - `project-images-block.tsx` (replaces the inline block of slug 4): thumbnail (key → URL from the listing, or the local object URL right after an
    upload), «Portada» on the first, «Hacer portada», «Subir/Bajar la imagen N», «Quitar la imagen N del proyecto», `alt` ES/EN with hint (required,
    ≤200, validated by the existing mirror), key and size read-only, «No encontrada en el almacenamiento» when the listing lacks a key, storage-down
    notice (rest of the editor keeps working), uploader only for own + public. Focus: after an upload to the new ES `alt`; after a move to the moved
    row; after removing to the block. All announced in `role=status`. Button names carry the project context (unique names, as in slug 4).
  - `projects-editor.tsx`: takes `library` and `upload`; keeps this visit's uploads (public URL + object URL), revokes object URLs when a preview fails
    and when leaving.
  - `image-gallery.tsx`: cards with thumbnail (`lazy`, `async`, 160×90, `no-referrer`), short key, size (`formatBytes`), date (`LocalTime`), badge «En
    uso / En uso (versión antigua) / Sin usar» (text + shape), delete with confirmation, 409 explained (history), 404 removes with a note, 503/others in
    a row alert with reference, focus to the next card's delete button (or the title), `role=status` announcements; 401 → login with `next`.
  - `cleanup-panel.tsx`: hours (whole ≥1, inline error), «Simular» (dry run) → «Se borrarían N…; se conservan M» or «No hay nada que limpiar»;
    «Borrar N imágenes» enabled only with a simulation for the same hours and N>0; changing the hours voids it (said in the status); confirmation;
    result count; deleted keys leave the gallery.
  - `images.module.css` (tokens only).
- **Pages**: `app/admin/(panel)/images/page.tsx` + `loading.tsx` (listing + published projects in parallel, each with its own request id; empty state,
  503 with a pointer to `docs/admin-runbook.md` of the `cv` repo, other failures with retry); `projects/page.tsx` also reads the listing (own request
  id) and passes it to the editor. Nav entry «Imágenes».
- **Model** `lib/admin/content/projects.ts`: `withImage`, `withImageMoved` (keeps `alt`s paired by position in both languages), `imageKeysOf`.
- **Editor frame**: `EditorContext.expire` (keeps the draft, drops the `beforeunload` guard and goes to `login?expired=1&next=`), used by uploads.
- **Messages**: `UI.uploader`, `UI.images` and new `UI.projects.imageBlock` texts in `lib/admin/messages.ts` (Spanish only).
- **Fake API** (`scripts/parity/admin-fake.mjs`), parity with the Java sources of `cv`:
  - `sniff` = `ImageFormat.detect` + `isKnownUnsupported` (≥12 bytes; SVG anywhere in the first 1024 bytes, HEIC/AVIF brands, BMP, TIFF, ICO → 415);
  - `DELETE /images/{id}` with a non-UUID id → 404 `IMAGE_NOT_FOUND` (`DeleteImageService`), not 400;
  - cleanup `olderThanHours` < 1 is raised to 1 (`CleanupOrphanImagesService`), only a non-number is 400;
  - stored images record `sha256` and the part's `fileName` (state only, for tests; never returned).

## Tests (Tn → it())
| Tn | it() |
|---|---|
| T366 | `lib/admin/images.test.ts` (two `it` «T366: …») |
| T367 | `lib/admin/browser-client.test.ts` «T367: uploadImage …» |
| T368, T369, T370, T371 (two), T372 | `app/admin/api/images/route.test.ts` |
| T373 | `app/admin/api/images/route.test.ts` (`GET`) |
| T374 | `app/admin/api/images/[id]/route.test.ts` |
| T375 | `app/admin/api/images/cleanup/route.test.ts` |
| T376 (two), T377 | `components/admin/image-uploader.test.tsx` |
| T378–T382 | `components/admin/project-images-block.test.tsx` (one each) |
| T383, T384, T387 | `components/admin/image-gallery.test.tsx` |
| T385 (two) | `components/admin/cleanup-panel.test.tsx` |
| T386 | `app/admin/(panel)/images/page.test.tsx` |
| T388–T391 | `tests/runtime/admin-images.test.ts` (standalone with `proxy.ts` + fake) |

Extra tests outside the plan:
- `lib/admin/images.test.ts`: `imageIdOf`; `isKnownUnsupported` cases; `parseUploaded`.
- `app/admin/api/images/[id]/route.test.ts`: foreign Origin 403 without call, DELETE with no body type accepted, GET 405.
- `components/admin/image-gallery.test.tsx`: projects unreadable → plain «En uso»; 401 on delete → login with `next`.
- `app/admin/(panel)/images/page.test.tsx`: «En uso (versión antigua)» from real versions of the fake; the projects page passes the listing
  (thumbnail of a stored key; storage down → notice, no images).
- `scripts/parity/admin-fake.test.ts` (T232/T233 updated, see deviations): BMP and SVG after a prologue → 415, JPEG signature in <12 bytes → 400.

Criteria: AC7 → T372, T374 extra; AC18 → T366–T372, T376–T378, T388–T390; AC19 → T373–T375, T380, T383–T385; AC20 → T378, T379, T381, T382;
AC23 → T386; AC25 → T368, T374, T375, T391; AC26 → T376, T377, T387 (+ focus/announcements in T378, T379, T384); AC28 → T388.

## Deviations
1. **Handler type check splits 415/400 like the API** (`isKnownUnsupported`): SVG/HEIC/BMP… → 415 `IMAGE_UNSUPPORTED_TYPE`; HTML or text → 400
   `IMAGE_INVALID`. The browser check still reads only 12 bytes and reports both as «No es una imagen JPEG, PNG, GIF o WebP».
2. **Fake changed for parity with `cv`** (see above); two assertions of T233 (slug 1) were updated: non-UUID delete is 404, `olderThanHours=0` is 200
   (clamped) and `olderThanHours=abc` is 400. Not ported: Java's `@QueryParam boolean` turns any value other than `true` into `false`; the fake keeps 400
   for a `dryRun` that is not `true`/`false` (the web only sends booleans).
3. **`media: 'none'`** added to `RouteOptions` for the DELETE (no body); `readBody` added to `handler.ts` and reused by `readJson`.
4. **`EditorContext.expire`** is state-driven (the redirect runs in an effect after that render) because the React Compiler lint forbids handing
   ref-reading callbacks to a render function; the save path keeps calling the same logic directly.
5. **Failed local preview**: the object URL is revoked and the row shows «Vista previa no disponible.» + the ES `alt` (it does not fall back to the
   bucket URL). A thumbnail of the bucket that fails also shows that text.
6. **Gallery thumbnails** have fixed `width=160 height=90` (the listing has no dimensions) with `object-fit: cover`.
7. **Cleanup cap**: hours ≤ 8760 (a year) in the handler and the panel, besides ≥1 (a guard against typos; the API has no upper bound).
8. `app/admin/(panel)/architecture/page.test.tsx` (slug 5): the expected nav list now includes `/admin/images/`.
9. `shortKey` moved from `projects-editor.tsx` to `lib/admin/images.ts`; the inline `ImagesBlock` became `components/admin/project-images-block.tsx`.

## Risks / notes
- Visual checks pending in Chrome (§16 V8, V9): real file picker and drag and drop, real 5 MiB upload, thumbnails, the gallery with many images,
  the 503 state and the cleanup at 360 px; focus ring on the drop zone button and the cards.
- T371 «silence» waits the real 30 s upload timeout once (the test allows 45 s).
- The upload handler holds up to 5 MiB + 64 KiB in memory per request (plus the proxy's own copy); acceptable for a single administrator.
- Short keys (first 8 hex characters) name the delete buttons; two images sharing the first 8 characters of their UUID would share a button name
  (negligible with random UUIDs).
- Risk 4 of the plan holds: the stored `images[]` has no `url`; the editor resolves it through `GET /admin/images` (or the upload answer).

## Ronda 2 (review CHANGES_REQUESTED)
Verified with Node 22.23.1: `npm run lint`, `npm run typecheck`, `npm run build` green (image routes `ƒ`, `ƒ Proxy`); `npm test` 141 files / 636 tests
green (about 43 s; T371 no longer waits 30 s).

1. **[Alta] C-1 — matcher (option a, approved by Julio).** `proxy.ts`: `matcher: ['/admin', '/admin/((?!api/images(?:/|$)).*)']`, with the reason in
   a comment. `proxy.test.ts` checks the config and, with `unstable_doesMiddlewareMatch`, that `/admin`, `/admin/`, the login, the gallery page,
   other handlers and `/admin/api/imagesx/` are covered and `/admin/api/images[/…]` (list, cleanup, delete) and public paths are not.
   New runtime test «extra (matcher)» in `tests/runtime/admin-images.test.ts`: without cookie, GET/POST cleanup/DELETE of the image handlers are 401
   `ADMIN_UNAUTHORIZED` with `no-store`, `X-Robots-Tag: noindex, nofollow` and `X-Frame-Options: DENY` (from `next.config.ts`); a foreign Origin is
   403; `/admin/images/` without cookie is still 307 to the login; nothing reached the API. Spike section above rewritten with the measurements;
   decision noted in `progress/web-admin/brief.md` and in `analysis.md` (§6 and risk 2).
2. **[Media] C-2 — runtime tests catch it.** The `upload` helper of `tests/runtime/admin-images.test.ts` can pace the body (64 KiB / 10 ms) and
   records how much was written when the answer arrived. T388: 12 MiB and 24 MiB with `Content-Length`, paced → 413 with < 1 MiB sent; 12 MiB without
   cookie → 401 with < 1 MiB sent and the panel headers; no non-JSON log line after those bodies and no `Request body exceeded`. T389: chunked 8 MiB
   and 12 MiB, paced → 413 with < 6 MiB sent (< total); no non-JSON line. With the old matcher these assertions fail (whole body sent first).
3. **[Baja] C-3 — T371** uses `vi.useFakeTimers({ toFake: ['setTimeout'] })` like `app/api/contact/route.test.ts`: waits until the request reached the
   fake, advances 29 999 ms (still pending), then 1 ms → 504 `ADMIN_TIMEOUT`; `UPLOAD_TIMEOUT_MS === 30_000` kept.
4. **[Baja] C-4 — pure updater.** `onPreviewFailed(key, preview)` revokes the object URL and forgets it outside `setUploads`; the updater only builds
   the new map (`projects-editor.tsx`, `project-images-block.tsx` passes the failed URL).
5. **[Baja] C-5** `app/admin/(panel)/images/page.tsx`: `let body: ReactNode;`.
6. **`olderThanHours=abc` checked against `cv`.** `AdminImagesResource.cleanup` takes `@QueryParam("olderThanHours") @DefaultValue("24") int`.
   Under the JAX-RS rule for `@QueryParam`, a value that cannot be converted gives `NotFoundException` (404). The API's `ProblemExceptionMapper.transport`
   maps it to `ApiError.fromStatus(404)` = `NOT_FOUND`. The same repo takes `limit`/`before` of the messages as `String` and validates them itself
   (`AdminMessagesResource`, 400 tested), which fits that rule. No test of `cv` runs a non-integer `olderThanHours`, so this is **inferred, not
   executed**. The fake now answers 404 `NOT_FOUND` for `abc`, `1.5` and values outside the int range (T233 updated). `dryRun` that is not
   `true`/`false` stays 400 in the fake on purpose: Java's `boolean` would read it as `false` (a real deletion), and the web only sends booleans.
   This is a possible hardening for the `cv` repo, outside this slug. To confirm both against the deployed API with the runbook before closing the
   series (risk 6).
