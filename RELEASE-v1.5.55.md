# MRAPI Hub v1.5.55

- CRM: búsqueda global por nombre/título de trato y teléfono sin escanear toda la colección en cada búsqueda.
- Índice persistente `searchTerms` con backfill automático único en la primera búsqueda tras desplegar.
- Las búsquedas posteriores leen sólo candidatos del término.
- Los tratos nuevos y títulos editados mantienen el índice actualizado.
