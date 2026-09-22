# v1.5.69

- Corrige el vínculo CRM de conversaciones legacy cuando el contacto/trato existe pero no tiene índice de búsqueda.
- El resumen CRM de Bandeja busca primero por variantes exactas de teléfono (`549...`, `+549...`, `whatsapp:+549...`) en contactos.
- También recupera tratos legacy directamente por `contactPhone` y obtiene desde allí `contactId/dealId`.
- Mantiene fallback por índice y self-heal de `contactId/dealIds` sobre los alias físicos de la conversación.
- Evita scans globales: son consultas exactas y acotadas.
