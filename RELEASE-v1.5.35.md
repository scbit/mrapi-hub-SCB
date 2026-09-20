# MRAPI Hub SCB v1.5.35

Cambios:
- Plantillas Meta: el mensaje guardado/mostrado en el chat usa el texto BODY real de la plantilla cuando está disponible, en vez de `Plantilla enviada (nombre)`.
- Audio desde Bandeja: botón `🎙 Audio`, grabación con micrófono del navegador, conversión WebM/Opus -> OGG/Opus con ffmpeg y envío por MRAPI Gateway.
- Adjuntos: acepta audio además de PDF/JPG/PNG/WEBP.
- BOT/Dialogflow: al pasar una conversación a BOT se hace un test real de `detectIntent` y se muestra si está conectado o el error concreto. Endpoint: `GET /api/inbox/bot/status?test=1`.
- Version visual: v1.5.35.

Nota BOT:
No hace falta vincular cada número nuevo dentro de Dialogflow. El Hub llama al agente de Dialogflow CX por API y luego responde por la línea Meta correspondiente vía Gateway. Si falla, revisar DF_PROJECT_ID, DF_AGENT_ID, DF_LOCATION y permisos de la service account de Cloud Run.
