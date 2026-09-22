# v1.5.70

## Fix: vínculo CRM legacy por teléfono en Bandeja

- El lateral CRM de Bandeja usa primero el mismo índice global de CRM para resolver teléfono/contacto/tratos.
- Busca deals indexados por teléfono y recupera `contactId` + `dealId` aunque la conversación legacy no tenga vínculo.
- Mantiene fallback exacto para registros pre-index, incluyendo teléfonos históricos guardados como número en Firestore.
- Conserva self-heal sobre los aliases físicos de la conversación una vez recuperado el vínculo.
- No modifica Gateway, Twilio, Meta, Recovery ni notificaciones.
