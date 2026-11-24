# web-featured-facts (2026-11-24)

Decisión de Julio («dale, quita los h-01»): en el proyecto destacado (`components/project-featured.tsx`), cada logro lleva encima
una etiqueta `h-01`, `h-02`… Es un relleno del rediseño v2: el diseño (`design/artifact-v2/project/Main.dc.html`) pone una etiqueta
con sentido («roles», «pagos», «tiempo real», «arquitectura»), pero la API solo da el texto de cada logro (`highlights: string[]`).
Al visitante, `h-01` no le dice nada.

**Qué se hace:** quitar la etiqueta. Cada logro queda solo con su texto, en la misma rejilla de dos columnas con sus separadores.

**Descartado:** etiquetas reales por logro. Obligaría a cambiar el contrato en la API (`cv`), el panel y el contenido, y solo se ven
en un proyecto. No compensa ahora.

**Fuera de alcance:** las tarjetas del resto de proyectos, la API, el contenido y el PDF.

Tarea trivial: sin analyst (tabla de escalado de `leader.md`). El plan corto está en `analysis.md`; implementer + reviewer siempre.
