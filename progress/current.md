# Estado de la sesión

Tarea en curso: ninguna (web-runtime implementado; pendiente la decisión del humano sobre el cierre).

## web-runtime (cambio de rumbo 2026-11-11: servidor Next standalone en el NAS)
Plan: `progress/web-runtime/analysis.md` (v2). Los 9 slugs están implementados y con review APPROVED, **sin cerrar** (el humano pidió cerrarlos al final, con "cerrá <slug>"):
- web-runtime-ci · web-runtime-datos · web-runtime-vacios · web-runtime-salud · web-runtime-pdf · web-runtime-contacto · web-runtime-dominio · web-runtime-docker · web-runtime-regresion (cada uno con `impl.md` y `review.md` en su carpeta).
- Docker NO verificado en local (sin daemon): imagen, arm64, healthcheck del contenedor, smoke y publicación (T98–T100) solo los comprobará la CI de GitHub.
- Pendiente del humano: revisión visual de Perfil/Servicios y de los estados vacíos (`design/artifact-v2/.shots/`, ignorado por git).

## web-redesign (ronda 4, diseño v2)
CERRADO (6/6 slugs, commit e7cbadd, merge 8816e1d en develop; publicado en julioflores781/cv-web).

## En pausa
`web-home`: review APPROVED (ronda 2); en pausa hasta decidir su destino con el diseño nuevo.
`web-polish`: review APPROVED; en pausa, se cierra tras `web-home`.
`web-architecture`: plan listo (`analysis.md`); en pausa, se re-planifica sobre el diseño nuevo.
`web-hl7-demo`: plan listo (`analysis.md`); en pausa, se re-planifica sobre el diseño nuevo.

Nota: los slugs de web-runtime comparten el mismo working tree sin commits; se cierran con el closer cuando el humano lo ordene.
