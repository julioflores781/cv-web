# web-runtime-salud

Slug hijo 3 de `web-runtime` (depende de `web-runtime-datos`; slugs 0–2 APPROVED y sin cerrar: el humano pidió implementar todos seguidos y cerrar al final).
Plan validado por el humano: `progress/web-runtime/analysis.md` (v2): **§2.2** (salud), **§4** A5, **§5 «Slug 3»** (tests T52–T56).
Alcance: `GET /api/health/` (`app/api/health/route.ts` + `lib/api/health.ts`): comprueba `${apiUrl}/q/health/ready` (timeout 2 s, sin reintentos); 200 `{"status":"ok","api":"up"}` / 503 `{"status":"degraded","api":"down"}`, `no-store`, sin URLs ni mensajes internos. `trailingSlash` se mantiene (sin barra → 308). No hay `/api/revalidate` (descartado por el humano).
Reglas: sin duplicar código (reutilizar el transporte de `lib/api/request.ts` si encaja; `process.env` solo en `lib/api/config.ts`), sin git de escritura, Node 22, tests exactamente los del plan (extras anotados), repo PÚBLICO.
