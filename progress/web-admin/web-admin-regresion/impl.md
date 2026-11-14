# impl — web-admin-regresion (slug 10/10)

Rama `feature/web-admin-api-client` (sin cambiar, sin commit). Node 22.23.1. `progress/current.md` no se tocó.

## Verificación final
- `npm run lint` ✅ · `npm run typecheck` ✅ · `npm test` ✅ **152 archivos / 709 tests** (antes del slug: 151/706 con `proxy-ready`; se retiró 1 archivo y se añadieron 2 de runtime, 2 unitarios y tests extra).
- `npm run build` ✅ sin API (`env -u CV_API_URL -u SITE_URL`). Tabla de rutas: todas `ƒ` salvo `/_not-found` e `/icon.svg` (`○`, como antes):
  `/[[...slug]]`, `/admin`, `/admin/[...rest]`, `/admin/api/content/[kind]`, `/admin/api/content/[kind]/[lang]/rollback`, `/admin/api/images`, `/admin/api/images/[id]`,
  `/admin/api/images/cleanup`, `/admin/api/login`, `/admin/api/logout`, `/admin/api/logout-all`, `/admin/api/password`, `/admin/architecture`, `/admin/history/{architecture,projects,services}`,
  `/admin/images`, `/admin/login`, `/admin/messages`, `/admin/projects`, `/admin/services`, `/admin/settings`, `/api/contact`, `/api/health`, `/cv-julio-flores-{en,es}.pdf`, `/robots.txt`, `/sitemap.xml`; `ƒ Proxy (Middleware)`.
- Servidores levantados para las verificaciones (standalone en 127.0.0.1:3100, API falsa en 4020) detenidos; puertos 3100/4020 libres y 0 procesos `next-server`/fake. Archivos temporales de subida borrados (`.next/visual-check`). Docker no se ejecutó.

## Hecho
1. **T420** recorrido completo en el standalone: `tests/runtime/admin-e2e.test.ts`.
2. **T421** `tests/runtime/proxy-ready.test.ts` (T104) **eliminado**; `docs/web-standards.md` («Testing») explica por qué y qué lo sustituye.
3. **T422** compose sin variables nuevas en `cv-web` (+ comentario del panel en `deploy/docker-compose.yml`), `.env.example` con la nota de `Secure`, standalone con el panel y sin `.env` versionado.
4. **T423** bundle público sin chunks ni cadenas del panel.
5. **T424** todos los eventos de log documentados; `docs/web-standards.md` con sección `## Admin` (rutas, flujo, sesión/proxy, `X-Client-IP`, CSRF/cabeceras, edición, eventos con campos, pruebas sin la API, pendientes). `AGENTS.md` (mapa) y `CLAUDE.md` (reglas) actualizados con el panel y **las dos decisiones de Julio** (matcher sin `/admin/api/images`; portadas solo `https:`).
6. **T425** sin secretos ni datos reales en código del panel, fake y fixtures.
7. **T426** smoke de CI con `curl` a `/admin/login/` (200 + `X-Robots-Tag`) y `/admin/` (307). Probado localmente el fragmento de shell contra el standalone + `design-api.mjs` sin admin (como en CI): pasa.
8. **T427** C1 en verde y tabla de rutas con el panel en `ƒ`.

## Mapa Tn → test
| Tn | it() | Archivo |
|---|---|---|
| T420 | `T420: login → edit services → public → project with an image → public cover → restore → public without it → logout-all → 401` | `tests/runtime/admin-e2e.test.ts` |
| T421 | `T421: the readiness probe of phase 3 is gone …` | `tests/runtime/admin-regression.test.ts` |
| T422 | `T422: cv-web keeps exactly CV_API_URL and SITE_URL …`, `T422: .env.example documents …` | `tests/deploy/deploy-files.test.ts` |
| T422 | `T422: the standalone carries the panel (pages, handlers and the compiled proxy) …` | `tests/runtime/docker-layout.test.ts` |
| T423 | `T423: no script of a public page is a panel chunk …` | `tests/runtime/admin-regression.test.ts` |
| T424 | `T424: every log event the code emits is documented …` | `tests/source.test.ts` |
| T425 | `T425: the panel code, the fake API and the fixtures hold no secret nor real contact data …` | `tests/source.test.ts` |
| T426 | `T426: the smoke also asks the panel …` | `tests/deploy/deploy-files.test.ts` |
| T427 | `T427: the build passes with the proxy and the panel …` (+ ejecución real de lint/typecheck/test/build arriba) | `tests/runtime/admin-regression.test.ts` |

Criterios: AC13/AC21/AC24/AC28 ← T420; AC28 ← T421, T423, T426, T427; AC30 ← T422, T424, T425; AC25 ← T425.

## Observaciones de las reviews resueltas (verificadas en cada review.md antes de tocarlas)
1. **Sesión caducada sin `next`** (messages review O-1). `proxy.ts` pasa a las páginas que deja pasar la cabecera interna `x-admin-path` (ruta + query sin `_rsc`, siempre sobrescrita) y `app/admin/(panel)/layout.tsx` redirige a `expiredLoginUrl(safeNext(cabecera))`. Helpers `PANEL_PATH_HEADER`/`panelPath` en `lib/admin/next-path.ts`; la redirección sin cookie también usa `panelPath`.
   Tests: `proxy.test.ts` (extra: cabecera y sobrescritura), `app/admin/(panel)/layout.test.tsx` (2 extra: ruta conservada; ausente/maliciosa → `/admin/`), `lib/admin/next-path.test.ts` (extra `panelPath`), **T286 actualizado** (`admin-auth.test.ts`: ahora espera `?expired=1&next=%2Fadmin%2F` y comprueba `/admin/messages/?before=2` con una `x-admin-path` falsa del navegador) y T420. Verificado en Chrome: con el token muerto, `/admin/messages/` y `/admin/architecture/` llevan a `login?expired=1&next=…` y tras entrar se vuelve a esa página.
2. **Nombres repetidos en la barra del acordeón** (projects review, ronda 2). `UI.editor.moveUp/moveDown/remove(label, position)` → «Subir «X» (posición N)»; `ItemList` pasa `index + 1`. Comprobación extendida: T353 (proyectos) ahora incluye la barra (`[data-item]`), el extra AC26 de arquitectura también, y test extra nuevo en `services-editor.test.tsx` con dos servicios del mismo título. Ajustados los nombres exactos en `item-list.test.tsx` (T331/T332), `architecture-editor.test.tsx` (T355) y `projects-editor.test.tsx` (T350). Verificado en Chrome (los dos «Proyecto de ejemplo» del diseño se distinguen por posición).
3. **Marcas 422 posicionales al reordenar** (architecture review O-2). Las marcas de primer nivel ya iban por `itemKey` (siguen al elemento); las de filas internas (logros, enlaces, imágenes, adaptadores) se **quitan** al mover o quitar filas: `update(change, fieldId, reordered)` en `EditorFrame` + `dropFields`/`isBelow` en `lib/admin/content/paths.ts` (recalcula los contadores por ítem); `RowList.onChange(items, reordered)`; adaptadores e imágenes pasan sus listas en los tres ámbitos. Las marcas del cliente ya se recalculaban contra el borrador. Sin pérdida de datos (los tests comprueban valores y orden).
   Tests extra: `paths.test.ts` (`dropFields`/`isBelow`), `projects-editor.test.tsx` (enlaces), `architecture-editor.test.tsx` (adaptadores). Comprobado que fallan sin el arreglo.
4. **«Crear gemelo» no movía el foco** (architecture review O-1). Hook `components/admin/use-focus-later.ts`; dentro de un ítem el foco va al primer campo creado (título en servicios/proyectos, nombre en puertos; adaptadores con su ref existente). En el panel de paridad, «Crear gemelo» y «Quitar» llevan el foco a la misma acción del siguiente elemento sin pareja o, si no queda, al título del panel (mismo patrón que CR-2 de «Igualar»). Tests extra en `parity-panel.test.tsx` (2), `architecture-editor.test.tsx` (puerto + aserción de foco en el adaptador), `projects-editor.test.tsx`; comprobado que fallan sin el arreglo.
5. **`isKind` local** (history review). `app/admin/api/content/[kind]/route.ts` usa `isContentKind` de `@/lib/api/admin`. Test extra en `tests/source.test.ts`.
6. **Página `/admin/messages`**: POST/DELETE → **405** `Allow: GET, HEAD`, `no-store`, cuerpo vacío y 0 llamadas a la API (regla en `proxy.ts` para todas las páginas del panel; los handlers no cambian; el panel no usa Server Actions). Tests: `proxy.test.ts` (extra) y `admin-regression.test.ts` (extra, runtime; también comprueba que conserva `X-Robots-Tag`). Lista: `role="list"` explícito y el nombre solo en la lista (la `section` ya no repite `aria-labelledby`); extra en `messages-list.test.tsx` (T409 ampliado). Lighthouse a11y 100 en la página.

## Arreglos encontrados en las verificaciones visuales (tests extra)
- **V3: barra de guardado de 424 px a 360 px** (tapaba media pantalla y el foco del teclado). Causa: `flex-direction: column` en ≤640 px convertía el `flex: 1 1 280px` del comentario en altura. Ahora el comentario ocupa su fila y estado + «Guardar» comparten la siguiente (218 px); además `html:has(.saveBar)` lleva `scroll-padding-bottom` (10rem / 15rem en móvil) para que el foco que se mueve quede por encima de la barra. Test: `components/admin/editor.module.test.ts` (nuevo).
- **V9: «Borrar 0 imágenes» desactivado se veía activo** (el estilo solo cubría `aria-disabled`). `.button:disabled` atenuado igual. Test en el mismo archivo.

## Verificaciones visuales (Chrome DevTools, standalone en 127.0.0.1:3100 contra la API falsa)
| # | Resultado |
|---|---|
| V1 | ✅ 360 px: error genérico con referencia, foco devuelto al campo con `aria-invalid`; tras 5 fallos, 429 «bloqueado» con «Tiempo restante 14:58», «Entrar» desactivado. 1280 px vista en el resto de pruebas. |
| V2 | ✅ Dashboard y shell a 360/768/1280: un `h1`, `aria-current`, skip link, sin scroll horizontal, objetivos ≥44 px; 768 px dos columnas, 1280 tres; estado «Sin publicar todavía». |
| V3 | ✅ tras el arreglo: ES/EN apilados a 360 px, lado a lado a 1280 px (595 px cada uno); barra fija abajo (136 px escritorio, 218 px móvil). |
| V4 | ✅ Reordenar con teclado (Enter en «Bajar»): el foco sigue en el botón (ahora «posición 2»), anillo 3 px, anuncio «… posición 2 de 4», visible sobre la barra. |
| V5 | ✅ 409 real (guardado desde otra «pestaña»): banner con icono, diff por idioma, «Guardar encima»/«Descartar»; resumen de errores enfocado con enlace al campo y badge en el ítem. |
| V6 | ⚠️ Parcial: la vista previa del panel y el plano público tienen el mismo SVG normalizado y los mismos nodos/textos (`data-probe` presentes); captura visual coherente. **No** se hizo la comparación por píxeles con `probe.mjs` + `parity:diff`. |
| V7 | ✅ `<dialog>` real: `:modal`, foco inicial en «Cancelar», Esc cierra y devuelve el foco a «Guardar encima». |
| V8 | ⚠️ Parcial: subida real por selector de un PNG de **5 MiB exactos** (201, entra como imagen 1 pendiente, foco al `alt` ES, anuncio); 5 MiB + 1 y un no-imagen rechazados en el navegador con motivo. **Arrastrar y soltar no verificado** (el MCP no suelta archivos). Las miniaturas/vista previa no se ven porque los archivos de prueba son PNG sintéticos y la URL de medios de la fake (`media.example.test`) no resuelve. |
| V9 | ✅ Galería con 12 imágenes a 360 px (lazy, «En uso»/«Sin usar»), simulación de limpieza («No hay nada que limpiar», «Borrar 0» desactivado, ahora atenuado) y estado 503 con referencia (fake con `storage:false`). Miniaturas rotas por la URL de medios de la fake (esperado). |
| V10 | ✅ Mensajes a 360 px con cuerpo largo sin espacios: `pre-wrap` + `overflow-wrap:anywhere`, sin scroll horizontal; Lighthouse a11y 100. |
| V11 | ✅ `prefers-reduced-motion: reduce` emulado: ningún elemento con transición/animación >10 ms; Lighthouse (snapshot) Accesibilidad 100 en dashboard (escritorio) y mensajes (móvil). Único fallo: `meta-description` (SEO), irrelevante en un panel noindex. |
| V12 | ✅ Consola sin errores ni avisos de hidratación (solo el recurso 409 esperado). Cookie (vía `Set-Cookie` de la respuesta, el panel Application no es accesible desde el MCP): `Path=/admin; Max-Age=28799; HttpOnly; SameSite=strict`, sin `Secure` con `SITE_URL=http://127.0.0.1:3100`. |
| V13 | ✅ Con «Slow 3G», la navegación a Proyectos muestra el esqueleto `role=status aria-busy=true` («Proyectos / Cargando…»). |

## Pendientes fuera de la web (no se tocaron; anotados en «Admin» de `docs/web-standards.md`)
- **404 deducidos de JAX-RS** (`limit` y `{version}` del historial, `olderThanHours=abc` de la limpieza): la fake responde 404 por deducción del código Java; confirmarlo contra la API desplegada con el runbook del repo `cv` (`docs/admin-runbook.md`). En `cv-web` no hay runbook propio: quedó documentado como «Pendiente de confirmar con la API real» en `docs/web-standards.md`; conviene añadirlo también al runbook de `cv` (otro repo).
- **Endurecer `dryRun`** en `POST /images/cleanup` (Java convierte cualquier no booleano a `false`): tarea del repo `cv`.
- Manuales del humano tras desplegar: cookie `Secure` tras el túnel, `X-Client-IP` en la auditoría, regla WAF y R2 real.

## Desvíos
- T420 sube la imagen con `FormData` de `fetch` (multipart real del navegador) en vez de reutilizar el helper `node:http` de `admin-images.test.ts`; mismo contrato.
- T426: el smoke se probó localmente contra `127.0.0.1:3100` porque `localhost:3000` está ocupado en esta máquina por un contenedor ajeno (no lanzado por mí); en CI es `localhost:3000`.
- La regla 405 cubre **todas** las páginas del panel (no solo `/admin/messages`), por coherencia; los handlers siguen con su propio 405.
- Los arreglos de V3 y V9 (CSS) no estaban en el plan; salen de las verificaciones visuales del propio slug.

## Riesgos
- La cabecera `x-admin-path` depende de que el proxy corra en las páginas: si un cambio futuro del matcher dejara fuera una página, la caducidad caería a `next=/admin/` (seguro, no abierto: `safeNext`).
- `scroll-padding-bottom` usa valores fijos (10rem/15rem); un comentario con error hace la barra algo más alta en móvil.
- El standalone local copia el `.env` local de Julio (ignorado por git y por `.dockerignore`); T422 lo tolera solo si el archivo existe en la raíz y no está versionado.
