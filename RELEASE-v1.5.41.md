# MRAPI Hub SCB v1.5.41

- Corrige carga de plantillas en conversaciones en modo BOT.
- `GET /api/inbox/templates` ya no exige modo HUMAN porque es una operación de lectura.
- El envío manual de mensajes/plantillas sigue protegido por modo HUMAN en los endpoints de envío.
- Mantiene routing por línea exacta, mobile app y panel CRM de v1.5.40.
