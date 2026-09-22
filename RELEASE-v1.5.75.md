# v1.5.75

- Corrige vínculo CRM de conversaciones legacy usando la relación inversa `deals.hubConversationId` → conversación.
- El lateral de Bandeja puede recuperar el trato aunque el documento de conversación no tenga `dealId/contactId`.
- Corrige la agrupación legacy para no depender solamente de `waFrom`; usa teléfono cliente/línea normalizados.
- No modifica datos históricos ni ejecuta self-heal automático.
