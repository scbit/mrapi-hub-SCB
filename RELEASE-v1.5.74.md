# MRAPI Hub v1.5.74

- Corrige el vínculo CRM de conversaciones legacy agrupadas.
- `resolveConversationGroup` ya no busca aliases únicamente por `waFrom`: también consulta `customerPhone`, `phone`, `from` y `contactPhone`.
- Sólo incorpora aliases que normalizados correspondan al mismo cliente + la misma línea WhatsApp.
- De esta forma recupera `dealId/contactId/dealIds/contactIds` guardados en documentos históricos aunque el chat actual de Gateway no los tenga.
- Conserva el filtro de búsqueda de Bandeja de v1.5.72 y no agrega escrituras/self-heal.
