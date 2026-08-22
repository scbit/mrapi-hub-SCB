# servidor-4

## Objetivo

Hacer visible quién responde y quién tiene asignada una conversación en la Bandeja/HUB multiusuario.

## Cambio

- La API de mensajes expone campos de autor existentes: `sentBy`, `sentByName`, `sentByEmail`, `sentByUserId`.
- Los mensajes salientes nuevos guardan nombre, email e ID del usuario.
- La lista de conversaciones muestra `Resp: usuario` cuando existe `ownerEmail`.
- El encabezado del chat muestra responsable de la conversación.
- Cada burbuja saliente muestra `Respondió usuario` cuando el dato existe.

## Riesgo de datos

- No agrega queries ni reads.
- No hay migraciones ni backfills.
- No toca webhooks ni Twilio.
- Las únicas escrituras afectadas son futuros envíos manuales, agregando metadata de autor al mensaje saliente.
