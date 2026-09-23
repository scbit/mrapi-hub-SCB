# MR API HUB v1.5.77

Fixes solicitados para Bandeja/CRM:

- Al responder un chat se limpia `unread` en todos los aliases físicos de la misma conversación, evitando que siga en **No leídos**.
- **Nuevos / sin asignar** valida también vínculos CRM legacy por `hubConversationId` al cargar más, para no mostrar chats que ya tienen trato/contacto.
- Navegación **CRM → HUB** y **HUB → CRM** abre en pestaña nueva.
- Nuevo botón **↻ Refrescar** en Bandeja, equivalente a recargar la página.
