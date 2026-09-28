# MRAPI Hub v1.5.94

Unificación de guardado de tratos entre CRM, Bandeja y Mi Estado.

## Cambios
- Mi Estado ahora envía únicamente los campos realmente modificados (`stage`, `dueDate`, `leadQuality`, `notes`).
- Evita que una vista vieja de Mi Estado pise etapa, fecha, calidad o nota modificadas desde CRM/Bandeja.
- Mi Estado usa la respuesta persistida del servidor antes de refrescar la fila.
- Si no hubo cambios, no ejecuta una escritura innecesaria.
- Se conserva el endpoint central `PUT /api/crm/deals/:id` como única fuente de verdad para ediciones de trato.

## Resultado esperado
CRM, Bandeja y Mi Estado editan el mismo documento de trato con actualizaciones parciales, validación central, sincronización hacia Inbox y auditoría.

## No modificado
- Filtros de Bandeja.
- HUMAN/BOT.
- Recovery.
- Gateway / Meta / Twilio.
