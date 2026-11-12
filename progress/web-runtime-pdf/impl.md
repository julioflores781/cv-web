# web-runtime-pdf — implementation

Plan: `progress/web-runtime/analysis.md` §2.3, A6, Slug 4. Node 22.

## Code
- `lib/pdf/cache-key.ts` (new): `contentHash` (sha256 of key-sorted JSON), `cacheKey(lang, resume)`.
- `lib/pdf/build-cv-pdf.ts`: `getCvPdf` asks `getResume` on every call; LRU map (`MAX_CACHED_PDFS = 4`) of `Promise<Buffer>`; failed render is dropped + one `console.warn`, returns `null`. Returns `{ buffer, hash } | null`. Helpers `cvPdfCacheSize`, `resetCvPdfMemo`.
- `lib/pdf/response.ts`: `cvPdfResponse(lang, request)` with ETag, `Cache-Control: no-cache`, `Content-Disposition: inline`, 304 on `If-None-Match`, plain 404 if no PDF.
- Routes pass the `Request`. `next.config.ts` (`outputFileTracingIncludes`) and `page.tsx` unchanged (truthiness of `getCvPdf` still works).

## Tests (Tn -> it())
- T57, T58, T59, T62, T66 -> `tests/runtime/pdf.test.ts`
- T60 -> `lib/pdf/cache-key.test.ts`
- T61, T63, T64, T65 (unit) -> `lib/pdf/build-cv-pdf.test.ts`
- T65 (404 text/plain) and T67 -> `lib/pdf/response.test.ts`
- T68 -> `tests/source.test.ts` ("PDF cache rules")
- T69 -> `cv-document`, `fonts`, `theme`, `privacy` tests untouched and green.

Extras: PD-T14 and PD-T16 kept in `build-cv-pdf.test.ts` (adapted; PD-T16 now also asserts error with a PDF in memory). Old PD-T15/PD-T17 are covered by T61/T67/T65. T65 "runtime" half is covered by the unit test on `cvPdfResponse` (a render failure cannot be forced in the standalone with a valid resume).

## Criteria -> tests
A6: T57-T68. A2 (PDF part): T62, T66. A8: T58. A14/A15: T68, T69.

## Verification
lint, typecheck, `npm test` x2 (69 files, 312 tests), `npm run build`: green.
Manual (standalone + fake API): es/en `%PDF-`, 304 with If-None-Match, content change -> new ETag, API down -> 500.

## Correcciones de la ronda 1 (review)
1. `getCvPdf` calcula `contentHash` una sola vez por petición y la clave sale de él: `cacheKey(lang, hash)` (T60 adaptado con `keyOf = cacheKey(lang, contentHash(resume))`, mismas aserciones).
2. `cvPdfResponse(lang, request: Request)` obligatorio; sin `?.` ni `?? null`.
Re-verificado: lint, typecheck, test x2 (312), build verdes.
