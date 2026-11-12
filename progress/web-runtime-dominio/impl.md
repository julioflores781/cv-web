# Implementation — web-runtime-dominio

Plan: `progress/web-runtime/analysis.md` §2.6, §4 A9, §5 «Slug 6» (T87-T91). Node 22 (nvm). No git writes.

## Code
- `app/robots.ts`, `app/sitemap.ts`: `dynamic = 'force-dynamic'` (were `force-static`, which baked `SITE_URL` at build). Both now read `getConfig().siteUrl` per request. `siteUrl` default `https://floreslab.dev` and no `redirects()` were already in place (`lib/api/config.ts`, `next.config.ts`); nothing else in code referenced the old subdomain or Cloudflare Pages.
- `.env.example`: `SITE_URL` comment now says it also feeds robots/JSON-LD, is read at runtime and defaults to `https://floreslab.dev`.

## Docs: what changed in each
- `CLAUDE.md`: «Qué es» rewritten (floreslab.dev, standalone server on the NAS, API read at runtime, no cache/backup, API down -> 500, visual reference `design/artifact-v2/project/Main.dc.html`); `npm run build` comment; new rules «Configuración» (`CV_API_URL`/`SITE_URL`, only `lib/api/config.ts` reads env) and «Endpoints propios» (`/api/health`, `/api/contact`).
- `AGENTS.md`: map rows for `app/`, `lib/api`, `design/`; hard rule «build falls without data» replaced by «sin caché ni respaldo / 500 / estados vacíos»; tokens rule points to `Main.dc.html` and `app/globals.css`.
- `docs/web-standards.md`: Stack (`standalone`, `force-dynamic`, no `export`); tokens source; whole «Datos» section rewritten (runtime reads, `React.cache` memo, no cache/backup, 500, empty states, contact route, health, cache invalidation left for phase 2); SEO (all URLs from `SITE_URL`, robots/sitemap dynamic, no host redirect); PDF section (dynamic routes, in-memory content-keyed cache, ETag, 404 if render fails); Testing (runtime tests against standalone).
- `CHECKPOINTS.md`: C1 build (no API, `ƒ` routes), C4 (500 / empty states / health 503), C5 tokens source.
- `.claude/agents/analyst.md`: reads `Main.dc.html`; «cómo funciona el servidor standalone» instead of Cloudflare Pages; test edge cases «API caída (500), estados vacíos».
- `.gitignore` still lists `design/preview.html` on purpose (keeps the old mock-up with real data out of the repo).

## Tn -> test
| Test | Where |
|---|---|
| T87 | `lib/seo/metadata.test.ts`, `lib/seo/json-ld.test.ts`, `app/sitemap.test.ts`, `app/robots.test.ts` (new) — one `it('T87: ...')` each |
| T88, T90, T91 | `tests/runtime/domain.test.ts` (new; T88 with `SITE_URL=https://example.test`, T90 via `node:http` with `Host` set, T91 on a second server with `SITE_URL=https://floreslab.dev`) |
| T89 | `tests/source.test.ts` («public repository hygiene», uses `git ls-files`, excludes `progress/`; pattern built from parts so it does not match itself) |

Extra tests outside the plan: none.

## Criteria -> tests
A9: T87, T88, T89, T90, T91 (plus T6/T7/T9/T23/T29 from earlier slugs).

## Verification (Node 22.23.1)
- `npm run lint`, `npm run typecheck`: clean. `npm test` twice: 74 files, 337 tests green both times.
- `npm run build`: OK; route table: `ƒ /robots.txt`, `ƒ /sitemap.xml`, `ƒ /[[...slug]]`, `ƒ /api/*`, `ƒ` both PDFs; only `/_not-found` and `/icon.svg` are `○`.
- Manual: build copy of `.next/standalone` + fake API + `SITE_URL=https://manual.example.org`: `robots.txt` (`Sitemap: https://manual.example.org/sitemap.xml`), `sitemap.xml` (16 occurrences, 0 of floreslab), the 4 pages (canonical, 3 hreflang, og:url, JSON-LD `url` all on that origin; 0 occurrences of `floreslab` in the HTML), and `Host: <other>` answers 200 without redirect.

## Correcciones de la ronda 1 (review)
- `docs/web-standards.md` «Salud»: ya no afirma que lo usen `HEALTHCHECK`/`depends_on` (no existen aún); dice «pensado para el healthcheck del contenedor». Stack y `CLAUDE.md` suavizados igual («pensado para un contenedor», imagen/compose en `web-runtime-docker`). Revisados todos los docs: no queda otra afirmación de Dockerfile, compose, túnel configurado ni CI de imagen como existentes.

## Notes
- Observation, not changed (outside plan): the static `/_not-found` shows `getConfig().siteUrl`'s host as a visible link label, baked at build with the default (`floreslab.dev`); it does not follow a runtime `SITE_URL`. It is noindex and only a label.
- Docs do not describe Dockerfile/compose/`deploy/`: they do not exist yet in the repo (later slug of `web-runtime`); docs only mention the container/NAS model in general terms.
- `progress/current.md`: `Tarea en curso: web-runtime-dominio`.
