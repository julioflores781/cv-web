# Brief — web-architecture

## Idea
El humano echó en falta en la web **el esquema y el flujo de cómo está diseñada**. Una página de arquitectura que cuente, con diagramas legibles, cómo funciona todo el sistema: es parte del mensaje del portfolio (perfil senior, arquitectura deliberada pero sin sobreingeniería).

## Decisiones ya tomadas
- Diseño: propuesta B (terminal). Páginas nuevas: `/arquitectura/` (ES) y `/en/architecture/` (EN), enlazadas desde la nav y el pie.
- Contenido **estático** de la web (diccionarios ES/EN), no viene de la API.
- Diagramas en **SVG en línea**, accesibles (título y descripción), con los tokens de diseño, legibles a 360 px (que escalen o hagan scroll horizontal solo dentro del propio diagrama).
- Sin datos sensibles: nada de IPs internas, tokens, nombres de contenedores internos ni detalles que ayuden a atacar la infraestructura.

## Contenido (a bajar a secciones)
1. **Flujo general** (el esquema que falta): visitante → Cloudflare Pages (HTML estático) ; en el build: Cloudflare Pages → API pública → Cloudflare Tunnel → API Quarkus → PostgreSQL ; publicación: seed SQL → PostgreSQL → build hook → web nueva ; CI/CD: GitHub Actions (pruebas, cobertura, smoke test) → imagen Docker Hub → despliegue en el NAS.
2. **La API por dentro** (hexagonal): `domain` ← `application` (casos de uso y puertos) ← `infrastructure` (adaptadores REST, PostgreSQL, HAPI HL7); regla de dependencias verificada con ArchUnit.
3. **Decisiones clave**: Quarkus y no NestJS, multi-módulo, CV como JSONB versionado en PostgreSQL con rollback, errores RFC 7807 con código estable, i18n acotado, demo HL7 sin persistir datos, resiliencia del build (respaldo de caché).
4. **Calidad**: 127 pruebas y ~95 % de cobertura en la API (cifras a verificar contra el repo `cv` el día de la implementación, no inventarlas), pipeline con smoke test antes de publicar.
5. **Enlaces**: repositorio de la API (público: github.com/julioflores781/cv-as-a-service), Swagger (`https://cv-api.floreslab.dev/swagger/`), OpenAPI. El repo `cv-web` aún no tiene remoto: no enlazarlo hasta que exista.

## Fuera de alcance
La demo HL7 (tarea `web-hl7-demo`). ADRs completos (podrán enlazarse cuando existan en el repo `cv`). Animaciones elaboradas.

## Dudas que el analyst debe resolver verificando
- Cifras reales (pruebas, cobertura, endpoints) leyendo el repo repo `cv` (README, CLAUDE.md, ARCHITECTURE.md).
- Cómo hacer SVG en línea accesible y responsive en React, con tema por variables CSS.
- Cómo tratar las URLs bilingües (`/arquitectura/` y `/en/architecture/`) con la ruta `[[...lang]]` actual y el sitemap/hreflang.
