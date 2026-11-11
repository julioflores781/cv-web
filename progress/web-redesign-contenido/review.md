APPROVED

# Review — web-redesign-contenido (CO), ronda 1

Veredicto: CHANGES_REQUESTED

## Cambios requeridos (priorizados)
1. **HTML inválido: `h3` dentro de `button`** (`components/service-cards.tsx`, el `<h3 ... data-probe="service-card-title">` dentro del `<button>`). El contenido flujo no es válido en un botón y su rol heading se pierde (los hijos de un botón son presentacionales). Arreglo válido: `<span className={`${styles.title} display`} data-probe="service-card-title">` (display:block en el CSS si hace falta). Sin cambio visual ni de sonda. Actualizar CO-T13 (el leader enmienda el plan: «título del servicio», no `h3`) y `service-cards.test.tsx`. El nombre accesible del botón ya contiene todo el texto.
2. **Doble anuncio en regiones vivas**: `engagement-aside.tsx` (`<div aria-live="polite">`) y `selection-line.tsx` (`aria-live="polite"`) anuncian el mismo cambio de selección. Dejar una sola región viva (el aside) y quitar `aria-live` de `SelectionLine`; ajustar los tests que lo comprueben.

## Trazabilidad Tn ↔ it()
CO-T1…T81 localizados por grep en los archivos del mapa de impl.md (cada `it` lleva su `CO-Tn`); lo leído hace lo que dice la descripción (T5/T11/T76 con centinela en parser, caché y out/; T70-72 acotados; T73 comprobado vía `--line-input` en `.field`, equivalente al plan; T21 exacto). CO-T82 es protocolo: ejecutado por mí (abajo). Desviación menor: T5 comprueba `client === null` + ausencia del centinela (el plan decía «sin client»); equivale a lo exigido.
## Trazabilidad criterios ↔ tests
A1…A12 cubiertos según el mapa de impl.md; sin criterios huérfanos.

## Ejecución (Node 22)
- lint 0 avisos; typecheck OK; test 53 archivos / 263 tests OK.
- build con design-api (CV_API_URL=http://localhost:4020): OK. Build contra la API pública, con caché vacía: FALLA por diseño (`Services` en `en`, ContentUnavailable). OK.
- `out/`: sin placeholders ([TU PRECIO], CAPTURA, OTRO PROYECTO, Astro), sin tel/DNI/nacimiento, sin centinela. Nota: tras mis builds de variantes dejé `out/` regenerado con la caché local (copia de los datos del diseño).

## Privacidad
OK. `parseProject` fuerza `client:null` en anónimos; la caché guarda el dato ya parseado; el componente además usa `clientName()`. Variante con anónimo (centinela enviado por la API): ausente de out/ y de la caché; se pinta solo «Banca regional».

## Reglas de arnés / T68
`fetch(` solo en `lib/api` y `lib/contact/client.ts`; `process.env` solo en `lib/api/config.ts`. `lib/contact` sin node:/console/almacenamiento. TS estricto sin `any`. Sin git de escritura (no verificable: el repo no tiene cambios mías). Reuso: Cta, SectionHead, SectionShell, `getContent` genérico, tokens CSS (sin colores crudos en los módulos nuevos).

## Paridad en Chrome (CO-T82, capturas en design/artifact-v2/.shots/rv-*)
- Estilos computados (claves de la tabla): 0 diferencias en Servicios/Perfil a 1440 y 390; sin overflow (scrollWidth = innerWidth). Diferencias de rect: anchuras −48 px a 1440 (desfase de contenedor ya anotado HX #9/PA), 1 tarjeta vs 2 (contenido), formulario +10/+21 px (contador). Anchura del aside 429 vs 483 (6 px más que el desfase): no la pude atribuir; verificarla en PA.
- Interacción (1440): marcar S-02/S-04 y desmarcar S-01 → `aria-pressed` y sombra 8px solo en las marcadas; aside con 2 filas; línea `selección → …`; contador 0/1941. Envío vacío: 3 `aria-invalid`, mensajes, foco en Nombre.
- Envío contra servidor falso (Quarkus no levantado por mí; el implementer lo probó): 201 → status con foco, campos vacíos; 400 email → campo + foco + mailto; 429/500/red caída → `alert` con foco, valores conservados, mailto, botón activo; doble clic → una sola petición, botón «Enviando…» `aria-disabled`; cuerpo con prefijo `Servicios de interés: A + B\n\ntexto` y `website:""`; solo `Content-Type` propio.
- Foco por teclado: outline 2 px sólido en tarjetas. reduced-motion: 0 transiciones/animaciones activas. Consola: solo aviso de preload de CSS de Next.
- Proyectos: 0 → sin sección ni enlace, numeración 03 / contacto; 1 → solo destacado; 3 (con anónimo) → destacado + 2 tarjetas, anónimo con `clientLabel`.

## Desviaciones del implementer
- BA-T37 y HX-T41 modificados: justificados y no debilitados (siguen siendo igualdades exactas; la nueva expectativa es consecuencia de A4 —«Proceso» siempre en Servicios— y del `<noscript>` del formulario).
- reduced-motion global: correcto y coherente con BA-T16/CO-T73.
- Copy EN provisional: aceptado, pendiente de revisión humana.
- `h3` en `button`: ver Cambios requeridos 1.

## Skills consultadas
- simplify: sin hallazgos de duplicación; tipos exportados sin uso externo (`ServicesResult`, `ProjectsResult`, `SafeLink`, `ContactErrorCode`) — nit fuera de alcance salvo que se quiera limpiar.
- next-best-practices: sin hallazgos (Server Component pasa `apiUrl` por prop; `'use client'` acotado).
- strict-typing: sin hallazgos.
- ui-ux-pro-max: `service-cards.tsx` h3 en button (req. 1); `selection-line.tsx` / `engagement-aside.tsx` doble aria-live (req. 2).
- seo-audit: no se tocó metadata; sin hallazgos.

## Checkpoints
C1 OK (build con API real = design-api y API pública que falla por diseño; falta probar «API caída con respaldo» más allá de los tests) · C2 OK · C3 OK · C4 OK · C5 pendiente de req. 1-2 · C6 OK · C7 no aplica.

## Observaciones fuera de alcance
- «Proceso» se mantiene en Servicios aunque no haya servicios (decisión de A4).
- `aria-pressed` con texto que cambia («incluido»/«+ añadir») duplica la señal; viene del plan.
- CORS de producción no probado (dev acepta cualquier origen).
- `SERVICES`/`PROJECTS` exportados sin uso externo.

## Segunda pasada
Veredicto: APPROVED

- Req. 1 corregido: `service-cards.tsx` usa `<span className={`${styles.title} display`} data-probe="service-card-title">` (misma clase y sonda); no queda `h3` dentro de `button` (los `h3` restantes están en otros componentes, fuera de botones). `service-cards.test.tsx` comprueba `tagName === 'SPAN'` (CO-T13 enmendado): no se debilita, sigue exacto.
- Req. 2 corregido: `selection-line.tsx` sin `aria-live`; queda solo el `div aria-live="polite"` del aside (`engagement-aside.tsx`). Sin duplicación ni regresiones (los `aria-live` de `hex-plane` son de otra sección). CO-T83 válido: monta aside + línea, exige exactamente 1 `[aria-live]`, dentro del aside, y que la línea siga presente; fallaría con el doble anuncio anterior. Ningún otro test se modificó a la baja.
- Aside 429 vs 483: ARTEFACTO de la referencia, no defecto. CSS comparado con `design/artifact-v2/project/Main.dc.html` (l.230-241): contenedor flex wrap gap 24, grid `flex: 2 1 520px`, aside `flex: 1 1 300px; padding: 28px; gap: 16px`; idéntico al de `engagement-aside.module.css` / `services-section.module.css` / `service-cards.module.css`. Misma regla + mismos estilos computados (0 diferencias) implican que la diferencia viene del ancho de contenedor/medida de la referencia (ya anotado: desfase de 24 px/PA), no del código. A medir en PA.
- Ejecución (Node 22): lint 0; typecheck OK; test 53 archivos / 264 tests OK (en una primera corrida hubo 1 fallo no reproducible; 2.ª y 3.ª corrida limpias: posible flake por carga, vigilar); build con design-api (4020): OK; `out/` sin placeholders.
- C5 pasa a OK.
