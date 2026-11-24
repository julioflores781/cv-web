# web-service-cards (2026-11-24)

Decisión de Julio («quita de aquí las s-01…», sobre una captura de la portada de Servicios): cada tarjeta de servicio
(`components/service-cards.tsx`) lleva arriba a la izquierda una etiqueta `S-01`, `S-02`… Viene del rediseño v2
(`design/artifact-v2/project/Main.dc.html`), donde numeraba los bloques de ejemplo. Al visitante no le dice nada: es el mismo caso que
los `h-01` del proyecto destacado (`web-featured-facts`).

**Qué se hace:** quitar la etiqueta. La marca «incluido» / «+ añadir» se queda donde está, arriba a la derecha de la tarjeta.

**Fuera de alcance:** el resto de la tarjeta (título, resumen, precio, estados marcado/sin marcar), el panel de la selección, la
numeración de «Proceso» (`components/process.tsx`), la API, el contenido y el PDF.

Tarea trivial: sin analyst (tabla de escalado de `leader.md`). El plan corto está en `analysis.md`; implementer + reviewer siempre.
