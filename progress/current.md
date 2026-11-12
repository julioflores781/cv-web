# Estado de la sesión

Tarea en curso: ninguna. Siguiente: `api-observability`, con el plan en `progress/api-observability/analysis.md` (brief en `brief.md`).

## api-admin
CERRADO (7/7 slugs, `cv`: merge `40cf2a7` en develop; `cv-web`: commit `0fbba98` + merge en develop). Detalle y pasos de PR en `progress/api-admin/close.md`. PR `develop -> main` NO abiertos (en `cv` publicaría `cv-api`).
- NO verificado: R2 real, regla WAF de Cloudflare para `/api/v1/admin/*`, Argon2 y `admin-password.sh` en el NAS, el workflow de GitHub Actions de `cv`.
- Pendientes del humano: crear token R2 propio, crear la regla WAF, revocar el token de Telegram expuesto en el IDE, prueba manual contra R2.
- Pendiente de la fase 3 (repo `cv-web`): panel `/admin`, tipos TS de `images[]`, la web pública leyendo `project.images`.

## web-runtime
CERRADO (9/9 slugs, commits a32a159/ee102f9/04c7777, merge 35c74fb en develop). Detalle en `progress/web-runtime/close.md`.
- Arreglo del falso positivo T5 (`web-runtime-ci`, `f987977`) subido; PR #2 en revisión de CI.
- Pendiente: primera ejecución de la CI en `main` (job de pruebas y job `docker`: build amd64 + smoke + publicación) y la verificación del humano.
- Docker no se verificó en local (sin daemon): imagen, arm64, healthcheck, smoke y publicación (T98-T100) solo los comprueba la CI.
- Pendiente del humano: revisión visual de Perfil/Servicios y de los estados vacíos.

## web-redesign (ronda 4, diseño v2)
CERRADO (6/6 slugs, commit e7cbadd, merge 8816e1d en develop; publicado en julioflores781/cv-web).

## En pausa
`web-home`: review APPROVED (ronda 2); en pausa hasta decidir su destino con el diseño nuevo.
`web-polish`: review APPROVED; en pausa, se cierra tras `web-home`.
`web-architecture`: plan listo (`analysis.md`); en pausa, se re-planifica sobre el diseño nuevo.
`web-hl7-demo`: plan listo (`analysis.md`); en pausa, se re-planifica sobre el diseño nuevo.
