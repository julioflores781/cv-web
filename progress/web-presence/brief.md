# web-presence (2026-11-23)

Dos cambios de la web pública decididos por Julio. Se analizan juntos porque tocan los mismos archivos (`components/home-view.tsx`,
`lib/i18n/dictionaries.ts`, cabecera) y se implementan como **dos slugs hijos**, uno detrás de otro:

- `web-trajectory-split`: separar Experiencia y Formación, y mostrar fases y logros de cada trabajo.
- `web-home-services`: Servicios pasa a ser la portada del dominio; el Perfil, la página secundaria.

Contexto de datos: el contenido real del CV, servicios, proyectos y arquitectura se publica estos días en la base (`private/content`
del repo `cv`). El CV trae ahora **tres trabajos con fases y/o logros** (dos de ellos en curso a la vez) y formación con titulación,
certificado y tres cursos. La API y su contrato **no cambian**: `phases[]` y `highlights[]` ya llegan validados (`lib/api/validate.ts`),
la web hoy solo dibuja el `summary` de cada trabajo.

## A. `web-trajectory-split` — decisiones de Julio

1. **Experiencia y Formación son secciones separadas**, cada una con su número en la secuencia (los números se recalculan solos).
   Hoy `components/trajectory.tsx` mezcla trabajos, titulación, certificados y cursos en una sola línea de tiempo: eso desaparece.
2. **Experiencia** (`#experience`): solo trabajos, en la línea de tiempo actual (periodo, puesto · empresa, resumen).
   - **Fases visibles** (título · cliente) en todo trabajo que las tenga.
   - **Logros en un desplegable cerrado por defecto** (`<details>`/`<summary>` nativo, sin JavaScript), con el texto «Ver logros (n)» /
     «See achievements (n)», en todo trabajo que tenga logros. Sin logros, no hay desplegable.
   - El CTA del hero «Ver trayectoria» sigue llevando a `#experience`.
3. **Formación**: sección propia, **sin línea de tiempo**, bloque compacto en tres columnas (Titulación · Certificaciones · Cursos) que
   se apilan en móvil. Una columna sin datos no se pinta; sin ningún dato, no hay sección.
4. Mismos tokens del diseño v2 (`design/artifact-v2/project/Main.dc.html`, `app/globals.css`): nada de colores ni tipografías nuevos.
   Accesible con teclado (el `summary` recibe foco visible), `prefers-reduced-motion` respetado.
5. El PDF del CV no forma parte de este slug (verificar solo que no se rompe).

## B. `web-home-services` — decisiones de Julio

1. **`floreslab.dev` abre Servicios.** Rutas nuevas: `/` → Servicios (ES), `/perfil/` → Perfil (ES), `/en/` → Services (EN),
   `/en/profile/` → Profile (EN).
2. **Redirecciones permanentes (301/308, el analyst decide cuál y lo justifica)** de las URLs viejas de servicios: `/servicios/` → `/` y
   `/en/services/` → `/en/`, para no romper enlaces ya compartidos.
3. **Clic en el nombre/logo de la cabecera → página de Servicios** del idioma actual (desde cualquier página; en la propia portada,
   arriba del todo).
4. **Enlace visible «Perfil / CV» («Profile / CV»)** en la cabecera hacia el Perfil, para que un reclutador llegue al CV en un clic.
   (Propuesto por el leader al recomendar el cambio; confirmar en la validación del plan.)
5. Todo lo que hoy asume «perfil = portada» se invierte: hojas del cajetín (`01 / 02 · Servicios`, `02 / 02 · Perfil`), interruptor de
   modo, `metadata` (title/description de la portada = los de Servicios), canonical, hreflang (`x-default` incluido), Open Graph,
   `sitemap.xml`, JSON-LD (`Person.url` → página de Perfil). El PDF sigue enlazado solo desde el Perfil.
6. Actualizar la documentación que describe las rutas (`AGENTS.md`, `CLAUDE.md`, `docs/web-standards.md` si aplica) y todo lo que
   compruebe rutas en tests, smoke del CI y `scripts/parity`.

## Fuera de alcance
- `og:image`, JSON-LD de servicios (`ProfessionalService`), Search Console: slug posterior (`web-seo-presence`).
- La API (`cv`), el contenido de la base, el panel `/admin`.
- Cambios de diseño fuera de lo descrito.

## Estado del repo al abrir la tarea
La copia de trabajo está en `feature/nas-autodeploy` con un cambio sin commitear de Julio en `deploy/docker-compose.yml`: **no tocarlo**.
Las ramas de implementación saldrán de `develop`.

## Entregable del analyst
`progress/web-presence/analysis.md` con el formato del protocolo (`.claude/agents/analyst.md`), **una sección por slug hijo** (archivos,
criterios, catálogo de tests `Tn`), el **orden recomendado** de los dos slugs con su porqué, y los conflictos entre ambos (mismos
archivos). Verificar con la documentación de la versión de Next instalada cómo se declaran las redirecciones con `trailingSlash: true`
y cómo afectan al catch-all `app/[[...slug]]`. Cita lo comprobado.
