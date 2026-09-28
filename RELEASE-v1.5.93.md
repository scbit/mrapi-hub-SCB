# MRAPI Hub v1.5.93

Revisión integral de edición de tratos desde CRM y Bandeja.

## Cambios
- El endpoint `PUT /api/crm/deals/:id` normaliza y valida etapa, owner, vencimiento, título y campos editables antes de guardar.
- Después de cada edición se vuelve a leer el trato desde Firestore y se devuelve `item` con lo realmente persistido.
- Bandeja usa el valor persistido por el servidor para etapa, nombre y vencimiento; deja de asumir que un cambio optimista quedó guardado.
- CRM drag & drop usa la etapa confirmada por el servidor.
- El drawer de CRM envía sólo los campos realmente modificados. Evita que una pestaña/drawer viejo pise una etapa o fecha cambiada desde Bandeja u otra pestaña.
- Se agregan eventos de auditoría para cambio de vencimiento y cambio de nombre del trato.
- La sincronización CRM -> Inbox sigue siendo `merge`, sin reemplazar conversación, mensajes, referral, unread ni línea.

## No modificado
- Filtros de Bandeja / No leídos / Nuevos sin asignar.
- HUMAN/BOT sticky.
- Recovery / Centro de Recontacto.
- Gateway / Meta / Twilio.
