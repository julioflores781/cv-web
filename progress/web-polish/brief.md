# Brief — web-polish

## Idea
Dos detalles menores detectados al revisar `web-home` con Chrome (Lighthouse y emulación a 360 px):
1. Falta el favicon: el navegador pide `/favicon.ico` y recibe 404 (único error de consola).
2. El enlace «EN»/«ES» del conmutador de idioma mide 22 px de ancho (44 de alto): objetivo táctil insuficiente en móvil.

## Decisiones del humano
"Aplica los detalles" (2026-11-04). Tarea trivial: el leader escribió un `analysis.md` mínimo; implementer y reviewer siguen siendo obligatorios.
Nota: `web-home` aún no está cerrada (esperando "cerrá web-home"); esta tarea modifica el mismo working tree y se cierra a continuación.

## Fuera de alcance
Cualquier otro cambio visual. Imagen Open Graph. Apple touch icon / manifest.
