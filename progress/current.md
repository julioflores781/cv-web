# Estado de la sesión

Tarea en curso: ninguna (web-runtime CERRADO).

## web-runtime
CERRADO (9/9 slugs, commits a32a159/ee102f9/04c7777, merge 35c74fb en develop). Detalle en `progress/web-runtime/close.md`.
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
