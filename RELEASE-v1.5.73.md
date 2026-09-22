# v1.5.73

Fix conservador de vínculo Bandeja ↔ CRM legacy.

- Basado en v1.5.72, conservando el filtro de búsqueda que quedó estable.
- Restaura la prioridad de `dealId/contactId` ya guardados en conversaciones y aliases.
- No invalida `contactId` por ausencia del documento en `contacts` (SCB tiene datos legacy con `contacts` vacío).
- Trae todos los deals por `contactId` directamente desde `deals`.
- El índice global por teléfono queda sólo como fallback cuando no existe ningún vínculo legacy.
- Elimina el self-heal/escrituras automáticas del resolver CRM mientras estabilizamos la relación legacy.
