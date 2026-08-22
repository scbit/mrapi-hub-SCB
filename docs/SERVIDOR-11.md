# servidor-11

## Correcciones

- Corrige `401` en audios, videos, imágenes y descargas de media:
  - los recursos cargados por `<audio>`, `<video>` e `<img>` ahora envían `access_token` en la URL.
  - el middleware acepta token por query solo para autenticar la misma sesión.
- Corrige `500` en HUB contextual por índice compuesto:
  - elimina `orderBy(createdAt)` sobre `deals.where(contactId)` y ordena el lote limitado en memoria.

## Seguridad operativa

- No hay escaneo masivo.
- Los contextos siguen leyendo una conversación puntual y documentos vinculados.
