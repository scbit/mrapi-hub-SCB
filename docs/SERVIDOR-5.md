# servidor-5

## Bandeja

- Agrega endpoint autenticado para abrir adjuntos de un mensaje puntual: `GET /api/inbox/conversations/:id/messages/:messageId/media/:index`.
- Reproduce audios entrantes con control nativo del navegador.
- Muestra imagen/video/PDF/archivo con acciones de abrir y descargar.
- Amplia la lectura de metadatos de media para formatos legacy: `media[]`, `mediaUrls`, `mediaUrl`, `MediaUrl0`, `MediaContentType0` y `numMedia`.

## Seguridad operativa

- No hay escaneos: cada adjunto lee solamente `conversations/{id}/messages/{messageId}`.
- No modifica datos ni webhooks.
- El proxy solo usa URLs HTTPS guardadas en el mensaje y credenciales Twilio del servidor cuando corresponde.
