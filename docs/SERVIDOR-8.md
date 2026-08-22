# servidor-8

## Bandeja

- Convierte los filtros principales a carga real desde servidor:
  - vendedor/responsable
  - línea
  - etapa
  - modo BOT/HUMAN
  - nuevos sin trato
  - no leídos
  - publicidad
- `Cargar 50 más` conserva el filtro activo y pagina dentro de ese resultado.
- El filtro `Nuevos` ahora significa conversaciones sin trato vinculado, no solo etapa llamada `nuevo`.

## Seguridad operativa

- No hay fallback con escaneo masivo.
- Si Firestore requiere un índice compuesto para una combinación, el servidor devuelve error claro y no lee miles de documentos.
