# Cierre — web-runtime

- Slugs hijos cerrados juntos: ci, datos, vacios, salud, pdf, contacto, dominio, docker, regresion (todos con review APPROVED), por estar entrelazados en los mismos archivos.
- Rama `feature/web-runtime`: `a32a159` (código y configuración), `ee102f9` (documentación vigente), `04c7777` (progress); merge `--no-ff` a `develop`: `35c74fb`.
- Verificación: lint OK, typecheck OK, 346/346 tests (76 archivos), build OK, Node 22.
- Autorización humana explícita de Julio para cerrar, publicar y fusionar a `main` por PR.
- Publicación y CI: ver sección siguiente (se completa tras la ejecución en `main`).

## Nota — primera CI

- El job de pruebas de la primera CI (PR #2) falló por un falso positivo de T5 en el escáner de higiene. Arreglado en `f987977` (slug `web-runtime-ci`). Esta sección se completa tras la ejecución en `main`.

## Publicación y CI en main

- PR #2 (develop → main) fusionado tras el arreglo `f987977` (merge de develop `094bcf0`); la CI del PR pasó el job de pruebas.
- Ejecución en `main`: https://github.com/julioflores781/cv-web/actions/runs/43130369836 — job de pruebas OK y job `docker` OK (build amd64 + smoke + publicación).
- Imagen `julioflores781/cv-web`, tags `latest` y `sha-89be003`, digest del índice `sha256:a06126e5f0292a903e7d4b9d602753d930658145e1eee837c41b2e6155b6795b`.
- Plataformas: linux/amd64 (`sha256:355f32ed...`) y linux/arm64 (`sha256:eb136bd3...`), más manifiestos de atestación.
- `develop` queda un commit por delante de `main` (este cierre); main solo recibe PR.
