# Brief — web-hl7-demo

## Idea
El humano echó en falta en la web el **traductor HL7**: una demo interactiva donde un técnico pega un mensaje HL7 v2.5.1 y ve su traducción a JSON o a un Bundle FHIR R4, usando la API real (`POST /api/v1/hl7/translate?format=json|fhir`, ADT^A01 y ORU^R01). Es la pieza que demuestra el nicho sanitario de Julio.

## Decisiones ya tomadas
- Diseño: propuesta B (terminal) de `design/preview.html` (ver la sección «Demo · traductor HL7 → FHIR»: dos paneles, entrada `text/plain` y salida, pestañas JSON/FHIR, nota «solo mensajes sintéticos»).
- Es una sección de la home (ancla `#demo`, enlace en la nav) en ES y EN. No es una página aparte.
- Se ejecuta **en el navegador** (fetch en runtime a `https://cv-api.floreslab.dev`), a diferencia del resto de la web que lee la API solo en el build. Esto exige ajustar `docs/web-standards.md` (excepción acotada: un único módulo cliente, p. ej. `lib/hl7`) y la regla de AGENTS.md "datos solo por lib/api".
- Privacidad y seguridad: solo mensajes sintéticos (aviso visible); la web no guarda ni registra nada; el límite de la API es 64 KB.
- La API (repo `cv`) ya devuelve problemas RFC 7807 con `code` estable (`HL7_EMPTY_BODY`, `HL7_UNSUPPORTED_FORMAT`, `HL7_PAYLOAD_TOO_LARGE`, `HL7_INVALID_MESSAGE`, `HL7_UNSUPPORTED_MESSAGE`) y textos ES/EN según `?lang`/`Accept-Language`.
- Para que el navegador pueda llamar a la API hace falta CORS con el origen de la web: variable `QUARKUS_HTTP_CORS_ORIGINS` en el compose del NAS (acción del humano, no es código de este repo). Un POST con `Content-Type: text/plain` es una petición simple (sin preflight); el analyst debe verificarlo.
- Falta además una regla de rate limit de Cloudflare sobre `/api/v1/hl7/*` (acción del humano en el panel).

## Alcance
1. Sección de demo: selector de ejemplos sintéticos (ADT^A01 y ORU^R01), textarea editable, selector JSON/FHIR, botón «Traducir», panel de resultado con estado HTTP y tiempo, botón copiar.
2. Estados: cargando, éxito, error de la API (mostrar `title`/`detail` del problema y su `code`), API caída o sin red (mensaje claro), CORS bloqueado (mensaje distinguible si es posible), entrada vacía y entrada demasiado grande (validar en cliente a 64 KB en bytes UTF-8 antes de enviar).
3. Accesibilidad: etiquetas, región `aria-live` para el resultado, foco gestionado, usable con teclado, objetivos ≥44 px.
4. Textos en los diccionarios ES/EN. Ejemplos HL7 sintéticos (sin datos reales; nombres ficticios).
5. Tests con el cliente HTTP simulado (sin llamar a la API real) y de componente.

## Fuera de alcance
Cambios en la API (repo `cv`). Reglas de Cloudflare. Guardar historial. Otros mensajes HL7 (la API solo admite ADT^A01 y ORU^R01).

## Dudas que el analyst debe resolver verificando
- Que el POST text/plain desde otro origen no dispara preflight y qué cabeceras CORS devuelve hoy la API (probar con curl contra `cv-api.floreslab.dev`).
- Cómo documentar la excepción a "los componentes no hacen fetch" sin romper T68 (que busca `fetch(` fuera de `lib/`).
- Tamaño en bytes UTF-8 en el cliente, y cómo mostrar un JSON/FHIR largo sin romper el layout móvil a 360 px.
