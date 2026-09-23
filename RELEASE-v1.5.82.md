# v1.5.82 — CRM ↔ Bandeja safe sync

- Mi Estado Comercial sigue guardando los cambios en el documento del trato del CRM.
- Los cambios de etapa, owner, vencimiento, calidad y notas se reflejan también como metadata de la conversación vinculada en Bandeja.
- Cambio de owner individual y masivo sincroniza `ownerEmail`/`isAssigned` en Bandeja.
- Cambio de etapa individual y masivo mantiene sincronizada la etiqueta de etapa.
- La sincronización de Bandeja usa siempre `set(..., {merge:true})`: nunca reemplaza el documento de conversación ni borra mensajes, referral/publicidad, líneas, unread u otros campos.
- Para tratos actuales con `hubConversationId`, la sincronización agrega 0 reads (solo writes). El fallback con reads se usa únicamente en tratos legacy sin vínculo directo.
