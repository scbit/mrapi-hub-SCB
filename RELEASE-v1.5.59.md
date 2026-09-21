# MRAPI Hub v1.5.60

- Corrige la regresión de búsqueda global del CRM.
- La búsqueda vuelve a consultar inmediatamente el índice existente: no ejecuta rebuild/backfill dentro del request interactivo.
- Conserva la lista de resultados ancha y legible incorporada en v1.5.58.
- Evita bloquear en “Buscando…” y evita reads masivos por reconstrucción durante una búsqueda.
