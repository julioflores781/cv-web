# Brief — web-redesign

## Idea
Adaptar la web del CV al diseño del artifact «Julio Flores — Perfil y servicios»
(https://claude.ai/artifact/VVqq5ouRhypBxYvASKADqN, copia local de referencia en `design/artifact/Main.dc.html`).
Sustituye la propuesta B (Terminal) de `design/preview.html` como dirección visual.

## Decisiones ya tomadas (humano, 2026-11-09)
- Alcance: **Perfil + Servicios** dentro de `cv-web` (toggle en la cabecera, hero con hexágono interactivo, acento por modo:
  lima `#C6F432` en Perfil, naranja `#FF8A4C` en Servicios).
- Orden: **rediseñar primero**; `web-home` y `web-polish` (aprobadas) se cierran después con el diseño nuevo ya dentro.
- Lenguaje visual: oscuro (`#0B0F14`), Space Grotesk / Inter / JetBrains Mono, hexágonos, tarjetas con borde `#1C2430`.

## Lo que viene del artifact y lo que NO
- Estructura: nav sticky con toggle · hero + diagrama hexagonal · (Perfil) trayectoria + arquitectura · (Servicios) servicios + proceso ·
  proyectos (PadelHub destacado) · contacto · pie.
- **Contenido real del CV** (trayectoria, skills, nodos del hexágono): sale de la API en el build, no del texto de ejemplo del artifact
  (que dice «Ocho años», «Prisma/TypeORM»… sin verificar). Los nodos del hexágono deben salir de los skills reales.
- **Placeholders** (`[AÑOS]`, `[TU PRECIO]`, `[OTRO PROYECTO]`…): no se publican. El humano debe dar precios y proyectos; mientras tanto
  esas tarjetas se omiten o se marcan «a consultar» — el analyst lo lista como duda.
- El pie dice «Hecho con Astro»: es falso (Next.js). Corregir.
- El formulario de contacto: la API no tiene `POST /contact/messages`. No simular envío; usar enlace `mailto`/LinkedIn/GitHub (privacidad: solo
  email, LinkedIn, GitHub) hasta que exista el endpoint.
- Enlaces del artifact a LinkedIn/GitHub son genéricos: usar los de la API.
- La imagen de PadelHub está subida como asset del artifact (`/_blob/…`): no es accesible desde el repo; el analyst propone cómo obtenerla.

## Restricciones que se mantienen
Privacidad, build estático, ES por defecto + `/en`, datos solo por `lib/api`, tests con fixtures «Ada Ejemplo», contraste AA,
objetivos táctiles ≥44 px, `prefers-reduced-motion`, un solo `h1`. El toggle Perfil/Servicios debe ser accesible (`aria-pressed`)
y el estado de modo no puede romper el SEO: el analyst decide entre una sola página con estado o rutas separadas (p. ej. `/servicios/`).

## Fuera de alcance
`web-architecture` y `web-hl7-demo` (se re-planifican sobre el diseño nuevo después). Cambios en la API. Despliegue.

## Decisiones del humano — ronda 2 (2026-11-09) · SUSTITUYEN lo anterior donde choquen
- **Web profesional, no rígida:** sigue generándose estática (SEO/velocidad) pero con islas interactivas y movimiento cuidado
  (respetando `prefers-reduced-motion`). Sin sobreingeniería.
- **El hexágono pasa a ser el diagrama de arquitectura hexagonal interactivo** (no los skills): dominio fijo en el centro;
  puertos (base de datos, colas, notificaciones…) alrededor; cada puerto permite cambiar de adaptador
  (p. ej. DB: PostgreSQL / MongoDB / SQL Server / Oracle) y el dominio no cambia. Los skills vuelven a ir como sección propia
  (revierte «eliminar skills.tsx» y A6/T83–T85 del plan 1). Honestidad: distinguir «implementado en esta API» de «posible por diseño».
- **Contacto real:** hay que **crear** `POST /api/v1/contact/messages` en la API (repo `cv`, tarea aparte); la web tendrá formulario real.
- **Servicios, precios y proyectos se configuran por base de datos** (endpoints de la API), no en el repo: anula R1 del plan 1.
- **Proyectos:** también webs/sistemas donde hizo backend (y web) trabajando para empresas (farmacéuticas, prepagas…).
  Pendiente: política de confidencialidad por proyecto.
- **Impacto y formación** se quedan en Perfil, adaptados al lenguaje visual del artifact.

## Efecto en el plan
`analysis.md` (ronda 1) queda **obsoleto en**: §2.3 (contenido sin datos), §3 (hexágono, skills, contacto, `site-content`), A6–A10, T83–T97.
Hay que re-planificar con el analyst tras definir el contrato de API (nuevas tareas en el repo `cv`).

## Ronda 3 (2026-11-09) — contratos de API ya implementados (repo `cv`, rama `develop`, commit bb7e975)
La API ya sirve todo lo que la ronda 2 pedía. El plan debe apoyarse en estos contratos reales (verificar con
`repo cv: infrastructure/src/main/java/.../adapter/in/rest/ApiModels.java` y `db/sample/*.json`;
`https://cv-api.floreslab.dev` aún NO los tiene desplegados, así que `lib/api/schema.d.ts` se regenera desde el repo `cv` local,
no desde la URL pública):
- `POST /api/v1/contact/messages` JSON `{name,email,message,website}` → 201 sin cuerpo; 400 `CONTACT_INVALID` (detail nombra el campo),
  429 `CONTACT_RATE_LIMITED`. `website` es un campo trampa: la web lo oculta (fuera de pantalla, `tabindex=-1`, `aria-hidden`,
  `autocomplete=off`) y lo envía vacío. Límites: name ≤100, email ≤254, message 10–2000. Es una llamada **en runtime desde el navegador**
  (excepción acotada a "datos solo por lib/api" y a la regla de no `fetch` en componentes; mismo patrón que planeaba `web-hl7-demo`);
  requiere CORS con el dominio de la web (`QUARKUS_HTTP_CORS_ORIGINS`, acción del humano).
- `GET /api/v1/services` → `[{id,title,summary,price:{from,currency}|null}]` (price null = «a consultar»).
- `GET /api/v1/projects` → `[{id,title,summary,relation:own|employer,role,disclosure:public|anonymous,client|null,clientLabel|null,
  period{start,end,current}|null,stack[],highlights[],links[{label,url}]}]`. En anónimos `client` nunca viene.
- `GET /api/v1/architecture` → `{core:{name,description},ports:[{id,name,description,adapters:[{id,name,status:in-this-api|production|experiment,note|null}]}]}`.
- Todos aceptan `?lang=es|en`; sin nada publicado devuelven lista vacía / `ports: []` (200): la web omite la sección.
- El contenido editorial (servicios, proyectos, hexágono) YA NO vive en el repo web (anula `lib/content/site-content.ts` del plan 1 para eso).
  Lo que sí queda en el repo web: textos de interfaz (diccionarios), titulares del hero por modo, texto del proceso de trabajo (4 pasos) y
  textos fijos de la sección de arquitectura, si el analyst los justifica; todo ES/EN. Pregunta abierta para el analyst: ¿el «proceso» va en la API o en el repo?
- Nuevo requisito de diseño: el **hexágono** se rediseña como diagrama de arquitectura hexagonal: núcleo fijo en el centro, un puerto por cada
  `ports[]` alrededor, y por cada puerto un selector de adaptadores (los de `adapters[]`) que cambia el adaptador mostrado SIN mover el núcleo
  (para demostrar que el dominio no cambia). Cada adaptador muestra su `status` con texto + forma/icono, no solo color (`in-this-api` =
  «implementado en esta API», `production` = «en producción», `experiment` = «proyecto de prueba»), y su `note` si existe.
  Debe funcionar con teclado y lector de pantalla, con `prefers-reduced-motion`, y degradar a lista legible sin JS. Con 0 puertos no se renderiza.
  Los **skills** vuelven a una sección propia (`skills.tsx` se conserva).
- Impacto y formación se quedan en Perfil, con el estilo del artifact.
- Servicios y Proyectos: rutas separadas (`/`, `/servicios/`, `/en/`, `/en/services/`) como en el plan 1 (decisión vigente).

## Decisiones aún abiertas (el analyst las lista como dudas para el humano; NO las inventa)
Wording final ES/EN de los titulares del hero y del texto de contacto · copy singular/plural de la sección de proyectos (hoy solo PadelHub) ·
pie de página (año/país) · captura de PadelHub (`public/projects/…`, aportada por el humano; las capturas de proyectos de clientes quedan fuera) ·
precios (null → «a consultar») · dominio exacto del origen CORS.

---

## Ronda 4 — diseño v2 «Bosque y lima» + PDF (decide el humano, 2026-11-10)

Julio autoriza a seguir de corrido con las recomendaciones: "genera el plan e impleméntalo con el arnés... no finalices si no está comprobada y se ve igual".

**Diseño de referencia (sustituye al v1 `design/artifact/Main.dc.html`):** `design/artifact-v2/project/Main.dc.html`
(artifact https://claude.ai/artifact/7umJcTtFbpD1AgnRYu4Ev8). Mismas zonas que v1, nueva identidad:
- Modo **Perfil** = «plano» (fondo `#0F2A1F`, acento lima `#C6F24E`); modo **Servicios** = «obra» (fondo `#F4F3EC`, acento esmeralda `#2FC98A`). Tokens CSS en `:root,.plano` / `.obra` (ver `<style>` del artifact).
- Tipografías: Barlow Condensed (titulares, mayúsculas), IBM Plex Sans (texto), IBM Plex Mono (anotaciones) vía `next/font/local` (self-host).
- Fondo cuadriculado hexagonal (`.gridbg`, tile 84×48.5): en el artifact es una imagen blob; recrear como SVG propio en `public/`/CSS (variante clara para obra).
- Cabecera sticky con logo hexagonal «JF», enlaces proyectos/contacto, toggle Perfil/Servicios.
- Hero con titular enorme `clamp(56px,8.4vw,124px)`, CTA y **plano hexagonal interactivo** (6 nodos hex alrededor del núcleo, línea animada `flow`, panel de detalle «01 / 06»), cajetín `dl` (Autor/Especialidad/En activo desde/Ubicación/Hoja).
- Perfil: «01 / trayectoria» (timeline) y «02 / arquitectura» (sección A–A′ por capas). Servicios: «01 / servicios» (tarjetas seleccionables + aside «Tu encargo» cuya selección viaja al formulario) y «02 / proceso» (4 pasos).
- Común: «03 / proyectos» (caso destacado con «plano del sistema» + tarjetas), «04 / contacto» (formulario), footer.
- Los demás boards del artifact (Marca, LinkedIn, Oferta) NO se implementan en la web (solo referencia de identidad).
- `prefers-reduced-motion` respetado; botones reales, objetivos ≥44px; contraste AA.

**Decisiones tomadas por el humano = las recomendadas de las rondas 1–3** (R1–R16 con la propuesta del plan), más:
- R13 cambia: **se genera un PDF del CV** (ES y EN) y el botón «Descargar CV (PDF)» existe. Recomendación adoptada: generar en **build** a partir de los datos de la API (misma fuente que la web, sin copiar contenido al repo), con `@react-pdf/renderer` en un script (`scripts/`), salida estática `public/`/`out/` (`cv-julio-flores-es.pdf`, `-en.pdf`), texto seleccionable (ATS), solo email/LinkedIn/GitHub (privacidad). Tests con fixture «Ada Ejemplo». Fallo del PDF no debe romper la web salvo que falte la fuente de datos (misma regla de loaders).
- Textos del artifact se usan tal cual como copy provisional (ES) + traducción EN razonable; luego se cambian por texto/DB. Placeholders `[TU PRECIO]`, `[CAPTURA…]` NO van a la web: precio/proyectos/servicios salen de la API; sin dato → se omite el elemento.
- El plano hexagonal sigue siendo el diagrama de puertos/adaptadores de la API (brief ronda 1–3); el artifact v2 solo cambia su apariencia (nodos hex con selección). Si la API no devuelve puertos, se omite.
- Footer: mantener el real (no «Astro», no año fijo).
- Servicios seleccionables: la selección se pasa al formulario (texto previo del mensaje o campo), sin romper la API de contacto existente.
- Orden de slugs: `web-redesign-base` → `web-redesign-hexagon` → `web-redesign-contenido` (+ PDF dentro de contenido o `web-redesign-pdf`; decide el analyst).
- **Verificación obligatoria al final (humano):** comparar la web construida con el artifact v2 con Chrome DevTools (screenshots lado a lado, ambos modos, 1440 px y 390 px). No cerrar sin ella.
