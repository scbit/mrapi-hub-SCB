# MR API HUB v1.5.53

## WhatsApp Cloud API - ventana de 24 horas

- La Bandeja ahora respeta visualmente la ventana de atención de 24 h de Meta WhatsApp Cloud API.
- Pasadas 24 h desde el último mensaje entrante del cliente, se bloquean mensaje libre, adjuntos y audio.
- Las plantillas aprobadas siguen disponibles para reabrir el contacto.
- El compositor muestra `ventana 24 h cerrada` para líneas Meta fuera de ventana.
- El backend también impide envíos libres Meta fuera de ventana (HTTP 409), para evitar que una UI desactualizada intente enviar.
- Un nuevo mensaje entrante del cliente actualiza `lastInboundMessageAt` y vuelve a abrir automáticamente la ventana.
- Twilio mantiene el comportamiento existente y no fue modificado por esta regla.
