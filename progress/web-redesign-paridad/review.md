APPROVED (implementacion). PA-A7/PA-T10 (confirmacion humana del punto 9) sigue pendiente y bloquea el cierre, no la aprobacion tecnica.

# Review — web-redesign-paridad (ronda 1)

Veredicto: `APPROVED`. Cambios requeridos: ninguno. Node 22.23.1, ejecutado por el reviewer.

## Ejecucion propia (C1)
| Comando | Resultado |
|---|---|
| `npm run lint` / `npm run typecheck` | verdes |
| `npm test` x2 (la primera con lint+typecheck, la segunda sola) | 60 archivos, 306/306 las dos veces (HX-T43 y los tests de build estables) |
| `npm run build` con `design-api` (:4020) | exit 0, 11 paginas |
| `npm run build` con API caida + respaldo | exit 0, 10 avisos «API unavailable ... saved fallback copy» |
| Build con API caida sin respaldo (`CV_CACHE_DIR` vacio) | falla: «Resume (en) unavailable ... Refusing to publish a site without data.» |

## Punto critico 1: content-box 1328 vs border-box 1280
Evidencia independiente:
- `design/artifact-v2/project/Main.dc.html` no tiene reset: su `<style>` solo trae `body{margin:0}`; ningun `*{box-sizing}` en ninguno de los 4 `.dc.html` (Main, Marca, Oferta, LinkedIn). Los contenedores son `max-width:1280px; margin:0 auto; padding:0 24px` sin `box-sizing` (lineas 37, 55, 119, 147...). En cambio el autor declara `box-sizing:border-box` a mano solo en 4 elementos (plano 540, columnas del destacado, formulario): senal de que sabia que el defecto era content-box. `design/preview.html` (propuesta B antigua) si tiene `*{box-sizing:border-box}`, pero no es el artifact v2.
- Medicion en Chrome a 1440: referencia `nav/hero/seccion` x=56, ancho 1328, `box-sizing: content-box`; contenido y h1/h2 en x=80. Web: mismos valores (`header-nav`, `hero-inner`, `section-inner` content-box, x=56, w=1328; h1 x=80 w=642 en ambos; h2 «Cómo pienso un sistema» x=80 w=431 en ambos). Con border-box el texto empezaria en x=104 y el ancho util seria 1232: la web anterior estaba 24 px desplazada y 48 px mas estrecha.
- El plan (§2.10.1) pone `max-width 1280` + `padding 24` sin fijar la caja, asi que no contradice. Decision: **correcto**; es lo que un navegador sin reset computa a partir del CSS del artifact.
- **Riesgo explicito (residual):** el runtime `support.js` (dc) no esta en el repo; si claude.ai inyectara un reset `border-box` global, P1–P4 irian al reves (contenido a x=104, 1232). No hay indicio de ello (el render de referencia, sin runtime, es la unica base medible). Lo resuelve el punto 9 humano; si la comparacion en claude.ai muestra texto a x=104, revertir es acotado: `containers.module.css/test` y los `flex-basis` 549/570 de `ui.module.css`.

## Punto critico 2: `lib/api/request.ts` y `cache.ts`
- `httpGet` con `node:http(s)`: un unico punto de transporte (`requestJson`), sin duplicacion (`client.ts` lo reutiliza; unico otro `fetch(` en el repo es el cliente de contacto del navegador, permitido por T68). El timeout cubre tambien la lectura del cuerpo (se limpia en `finally`), `AbortSignal` destruye la peticion, `describeError` resuelve el `AggregateError` vacio de ECONNREFUSED (verificado en mi build con API caida: «request failed (ECONNREFUSED)»).
- Tests reales: `request.test.ts` usa servidor HTTP local; «does not go through the global fetch» espia `fetch`; ECONNREFUSED contra puerto cerrado; HX-T7/HX-T8 intactos. `tests/source.test.ts` (T68) pasa.
- `cache.ts`: `randomUUID()` en el temporal elimina la colision `pid+Date.now()`; hay test de 50 escrituras concurrentes. La causa del HX-T43 intermitente esta bien diagnosticada (dos carreras) y el test deja de depender del orden del `Promise.all`; mismo comportamiento verificado (falla nombrando el recurso). No lo debilita: lo hace determinista y sigue exigiendo error con nombre del recurso.
- Observacion fuera de alcance: `httpGet` no sigue redirecciones (`fetch` si lo hacia); un 3xx se trata como error HTTP. La API real responde 200 directo; solo importaria si se cambia a un host que redirige.

## Punto 3: resto de cambios
- `containers.module.test.ts`, `hero.test.tsx` (Ver proyectos en Servicios, §6), `source.test.ts` (not-found sin CSS module; consola limpia), `spec.test.ts` RF-T8: pasa de igualdad exacta a `startsWith('[data-probe="<clave>"]')` para admitir el calificador `aria-pressed/aria-current` del segmento activo; sigue exigiendo clave unica, selectores ref/web y los numeros 1440/390. Cambio justificado, no es un debilitamiento. HX-T43 se acoto (servidor solo sin architecture) conservando la asercion. No encontre otro test aprobado relajado.
- `design-data.json` con 3 proyectos, solo copy del diseno (no mezclado con «Ada Ejemplo»).

## Punto 4: paridad en Chrome DevTools (reviewer)
- 1440, Perfil: nav/hero/secciones x=56 w=1328, h1 x=80 w=642 y=204, ref = web. Overflow: `scrollWidth 1440`.
- 390 (web): `innerWidth = scrollWidth = 390`, h1 56 px, plano 342x342, nucleo 102.59 px (PA-T2/PA-T7). Unico control <44 px: el `input` honeypot oculto (`tabindex=-1`), irrelevante.
- Capturas lado a lado leidas (`design/artifact-v2/.shots/pa-sbs-perfil-1440-top.png`, `pa-sbs-servicios-1440-top.png`): fondo hexagonal, tipografia, colores y modo claro/oscuro, hex del logo, toggle, eyebrow, h1 y su ruptura de linea, lead, plano y nodos son visualmente iguales. Diferencias visibles = D2 (ES/EN en la cabecera), D6 (panel con fila extra: el plano sube ~30 px en Perfil; el hero de Servicios crece 64 px y el bloque izquierdo baja ~28 px por el centrado), D3/D9 y copy de nodos en Servicios (Quarkus/Docker... vs MVP/Cloud...: datos de la API, no del diseno). «Se ve igual salvo D1–D9»: **si**.
- Las 8 bandas/diff por seccion y los JSON de sonda (0 fallos x4) del implementer son coherentes con lo que medi; el diff de pagina entera no es comparable (D6/D7/D8) y la alineacion por seccion esta justificada banda a banda en impl.md §4. Consideradas validas para PA-T5.

## Punto 5: las 4 diferencias fuera de D1–D9
| # | Diferencia | Clasificacion | Propuesta |
|---|---|---|---|
| E1 | Contador `n/2000` bajo el mensaje | Aceptable (CO-A6/CO-A8 lo piden; +21 px) | Anadir como D10 al plan para que PA-A6/PA-T9 sean exactos |
| E2 | Enlace `mailto:` en el contacto | Aceptable (BA-A11; privacidad: solo email) | D11 |
| E3 | «Ver trayectoria» en el hero de Perfil | Aceptable (BA-T24, decision del plan) | D12 |
| E4 | Leyenda del plano con muestras dibujadas en lugar de `— - ■` | Aceptable; en la captura es indistinguible (adaptadores/puertos/contrato con la misma jerarquia) y mejora la fidelidad del trazo | D13 |
Ninguna es defecto de implementacion. Pendiente de proceso: el humano debe validar D10–D13 al confirmar el punto 9, porque PA-A6 dice «no hay otras».
Observacion (impl.md §6): con un nodo cuyo texto ocupa 2 lineas, el plano se mueve 12 px; el diseno hace lo mismo (columna centrada). Sin accion.

## Punto 6: Lighthouse y consola
Reviewer: `/` movil, Accesibilidad 100, Buenas practicas 100, SEO 100, 58/0; consola vacia. Las 8 ejecuciones del implementer (`.shots/lighthouse/*`) coinciden. Cumple PA-A5/PA-T8.

## Punto 7: privacidad en `out/`
Construccion de diseno y con respaldo, mas copia previa de `out/`: sin `tel:`, telefonos, «nacimiento/birth/documento/DNI», sin placeholders `[AÑOS]`, `lorem`, `{{`. Las coincidencias `undefined`/`nan`/`todo` son marcadores RSC (`$undefined`) y subcadenas de palabras. Solo `mailto:` (email), LinkedIn y GitHub. Los dos PDF sin telefono ni fecha de nacimiento (`pdftotext`). C3 cumplido.

## Trazabilidad Tn ↔ it()
PA-T1–T4: sonda (impl.md §3, JSON `pa-*`), independientemente verificada en 1440 y 390. PA-T5: impl.md §4 y `pa-summary.txt`. PA-T6: impl.md §7. PA-T7: medido (390 = 390). PA-T8: Lighthouse + consola. PA-T9: ver tabla E1–E4 (D1–D9 listadas en impl.md §6). PA-T10: **pendiente humano**. PA-T11: ejecutado arriba. Los tests extra (`cache`, `containers`, `hero`, `request`, `source`) tienen `it()` reales. Criterios PA-A1–A5, A8 cubiertos; A6 con la salvedad E1–E4; A7 abierto.

## Skills consultadas
- `simplify`: `lib/api/request.ts:55-67` sin duplicacion; unico smell: `get = ... https.get : http.get` aceptable. Sin hallazgos accionables.
- `next-best-practices`: `app/not-found.tsx` con estilo en linea (sin CSS module huerfano) correcto para el export estatico; `request.ts` esquiva el cache de `fetch` de Next (justificado con evidencia en el comentario). Sin hallazgos.
- `strict-typing`: sin `any`/`unknown` sin estrechar en el diff (`describeError`, `httpGet` tipados). Sin hallazgos.
- `ui-ux-pro-max`: contraste/foco/reduced-motion verificados por Lighthouse 100 y por impl.md §7.8; objetivos >=44 px a 390. Sin hallazgos.
- `seo-audit`: no se toco metadata; SEO 100. Sin hallazgos.
- `testing-strategy`: tests de CSS por regla (`containers.module.test.ts`) son estaticos pero se complementan con la sonda real; riesgo aceptado. Sin hallazgos accionables.

## Checkpoints
C1 ok · C2 ok (salvo PA-T10) · C3 ok · C4 ok (caida+respaldo pasa, caida sin respaldo falla con mensaje claro) · C5 ok (paridad medida; AA, foco, un h1, landmarks) · C6 ok (impl.md, review.md) · C7 pendiente (humano: punto 9 y autorizar cierre).

## Cambios requeridos
Ninguno.

## Observaciones fuera de alcance
1. Riesgo content-box vs reset de claude.ai (ver punto critico 1): lo cierra el punto 9 humano.
2. `httpGet` no sigue redirecciones.
3. D10–D13 a anadir al plan al cerrar PA-A6.
4. Efectos de mi ejecucion: `out/` quedo con la construccion de respaldo (datos del diseno); `.next/cache` contiene copias del diseno. Ambos ignorados por git.
