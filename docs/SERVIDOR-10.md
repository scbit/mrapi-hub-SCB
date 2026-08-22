# servidor-10

## Bandeja

- Evita el error de índice compuesto en filtros server-side.
- Cuando hay filtros activos, consulta por los campos filtrados con `limit=50` y ordena el lote devuelto en memoria por último mensaje.
- `Cargar 50 más` sigue usando cursor dentro del filtro activo.

## Seguridad operativa

- No hace fallback masivo.
- Mantiene límite de 50 por página.
