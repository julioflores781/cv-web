# CHECKPOINTS — Definición de "listo" (cv-web)

> Se evalúa el destino, no el camino. El `reviewer` marca cada box y rechaza el cierre si queda alguno vacío.

## C1 — Calidad ejecutable
- [ ] `npm run lint`, `npm run typecheck` y `npm test` en verde.
- [ ] `npm run build` en verde sin API (el build no la consulta) y las páginas, `sitemap.xml` y `robots.txt` salen dinámicas (`ƒ`).
- [ ] Sin `console.log` de debug, código muerto ni TODOs sin contexto.

## C2 — Cobertura y trazabilidad
- [ ] Cada criterio de aceptación está cubierto por al menos un test (`Tn` del plan ↔ `it()`).
- [ ] Los tests verifican comportamiento real, no solo que "no explota". Usan fixtures ficticios, nunca el CV real.

## C3 — Privacidad y contenido
- [ ] No aparece teléfono, documento ni fecha de nacimiento en ninguna página ni en el HTML generado.
- [ ] Ningún dato real del CV está commiteado (ni en fixtures ni en el repo).

## C4 — Datos y resiliencia
- [ ] Los datos entran solo por `lib/api`; los componentes no hacen `fetch`.
- [ ] API caída o respuesta inválida → la página da 500 (sin caché ni respaldo); listas vacías → estado vacío; `/api/health` da 503 si la API no contesta.

## C5 — Diseño, accesibilidad y SEO
- [ ] Usa los tokens de `design/artifact-v2/project/Main.dc.html`; se ve como la referencia en escritorio y móvil.
- [ ] Contraste AA, foco visible, `prefers-reduced-motion`, un solo `h1`, landmarks.
- [ ] `title`, `description`, Open Graph, `hreflang` ES/EN y JSON-LD `Person` en cada idioma.

## C6 — Estado del arnés
- [ ] Una sola tarea en curso; `progress/current.md` describe la sesión activa.
- [ ] Informes de subagentes en `progress/<slug>/` (analysis, impl, review), no volcados en el chat.

## C7 — Cierre (lo hace el `closer`, tras autorización humana)
- [ ] Rama `feature/<slug>`; commit conventional en español `type(scope): … [<slug>]` con línea `Verificación`.
- [ ] El humano validó y **autorizó explícitamente** el cierre.
- [ ] Merge de `feature/*` a `develop`; resumen movido a `progress/history.md`.
