# MRAPI Hub SCB v1.5.42

Base: v1.5.41 estable.

## Cambios
- Calidad del lead editable directamente desde el CRM lateral de Bandeja.
- Opciones: Sin calificar, Descartado, No responde, Regular, Bueno, Excelente.
- El cambio guarda `leadQuality` en el trato usando la API CRM existente, para alimentar métricas de calidad del día.
- Los archivos adjuntos del trato siguen visibles en Bandeja.
- Cada archivo ahora incluye botón **Enviar a bandeja**.
- El botón descarga el archivo del trato y lo envía por la conversación/línea actual usando el endpoint de envío de archivos existente.
- El envío manual de archivos desde CRM lateral requiere conversación en modo HUMAN, igual que el composer manual.
- Mantiene templates en BOT, mobile, routing por línea, audio, bot y realtime de v1.5.41.
