# servidor-12

## Corrección

- Cambia la autenticación de media a cookie same-origin.
- Elimina tokens visibles en URLs de audio, video, imágenes y descargas.
- Mantiene compatibilidad temporal con `access_token` por query para enlaces abiertos desde `servidor-11`.

## Seguridad operativa

- Los adjuntos siguen protegidos por sesión.
- No cambia consultas ni escrituras.
