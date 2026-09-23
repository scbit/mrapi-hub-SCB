# MRAPI HUB SCB v1.5.86

- Bandeja: al pulsar **Enviar plantilla** se abre una vista previa con el texto, nombre e idioma antes de confirmar el envío.
- Bandeja / filtro **No leídos**: al marcar una conversación como leída, desaparece inmediatamente del listado filtrado.
- El cambio de leído/no leído actualiza `unreadCount` y `hasUnread` en el estado local y contabiliza los reads reportados por el backend.
- No se agregan consultas periódicas ni scans adicionales para estas funciones.
