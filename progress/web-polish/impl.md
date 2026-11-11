# Impl — web-polish

## Cambios
- `app/icon.svg` (nuevo): `$_` en #39d98a sobre #0b0f14, rx 6. Next lo enlaza como `<link rel="icon">`.
- `components/site-header.module.css`: `.lang .link, .lang .current { min-width: 44px; justify-content: center; }` (el `min-height: 44px` ya existía en `.link, .current`).

## Pn -> it()
- P1 -> `tests/build/build.test.ts` "P1: / and /en/ link a favicon that exists in out/"
- P2 -> `app/globals.test.ts` "P2: app/icon.svg only uses token colors and has no script"
- P3 -> `app/globals.test.ts` "P3: the language switcher declares min-width and min-height of at least 44px"

## Criterio -> tests
- P-A1 -> P1 · P-A2 -> P2 · P-A3 -> P3
- P-A4 -> suite completa (89 tests, T1…T74 intactos), lint, typecheck y build en verde; T62 sigue verde.

## No verificado
- Render real del favicon (nitidez a 16 px, que `$_` quepa) y del conmutador a 360 px: sin Chrome DevTools MCP. Comprobar visualmente que el conmutador no desplaza el menú (ahora ~92 px de ancho en total).
- El SVG usa `text` con fuente monoespaciada del sistema; el glifo puede variar según el navegador.
- Sin tests extra fuera del plan.
