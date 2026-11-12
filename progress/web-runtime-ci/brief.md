# web-runtime-ci

Slug hijo 0 de `web-runtime`. Plan validado por el humano: `progress/web-runtime/analysis.md` (v2): **§2.8** (CI y repo público), **§4** criterios A11 y A18, **§5 «Slug 0»** (tests T1–T5) y **§9 R10–R12**.
Brief global: `progress/web-runtime/brief.md`. Referencia de estilo del workflow: `../cv/.github/workflows/ci.yml` (solo el job `test`; el job `docker` llega en `web-runtime-docker`).
Reglas: sin duplicar código, sin git de escritura, Node 22 (`.nvmrc`), tests exactamente los del plan, repo PÚBLICO (nada de secretos ni datos reales).
Compose único del NAS: vivirá en `cv-web/deploy/` (decisión del humano; slug `web-runtime-docker`), no se toca aquí.
Punto de atención (R12): ningún test puede depender de archivos no versionados (`design/artifact-v2/.rendered`, `.shots`, `private/`); si alguno lo hace, hay que saltarlo cuando no existan o generar el render antes, y anotarlo en `impl.md` como decisión.
