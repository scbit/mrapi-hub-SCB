# MRAPI HUB SCB v1.5.87

- Bandeja / **No leídos**: carga todos los chats no leídos en una sola carga, sin botón **Cargar 50 más**.
- **No leídos + filtro por owner**: primero resuelve los aliases físicos del mismo cliente+línea y luego aplica el owner, evitando perder chats cuando el unread está en un alias y el owner en otro.
- El query de No leídos sigue leyendo sólo documentos `hasUnread == true`; no hace scan de toda la bandeja.
- WhatsApp Cloud API: agrega soporte de mensajes tipo **sticker** como media entrante (`image/webp`), para poder visualizar el sticker desde la conversación.
- Base: v1.5.86 estable.
