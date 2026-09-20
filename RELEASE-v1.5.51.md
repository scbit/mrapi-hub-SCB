# MRAPI Hub v1.5.51

## Recovery Automation Engine

- Nueva etapa CRM protegida: `RESPONDIO RECOVERY`.
- Las respuestas de campañas Recovery se detectan tanto por Twilio como por MRAPI Gateway / Meta Cloud API.
- Al responder, el mismo trato pasa a `RESPONDIO RECOVERY`; no vuelve al owner anterior.
- La secuencia pendiente de ese contacto se cancela automáticamente.
- Campañas configurables de 1 a 10 mensajes.
- Cada paso define día desde inicio, horario, plantilla Meta y/o Twilio.
- El proveedor se elige automáticamente según la línea asignada a la conversación.
- Motor secuencial 1x1 con delay configurable entre clientes.
- Un error se registra y no detiene la campaña ni los siguientes contactos/pasos.
- Ejecución manual desde Centro de Recontacto y endpoint interno para Cloud Scheduler.
- Endpoint scheduler: `POST /internal/recovery/run`, usando `x-recovery-secret`.
- `MRAPI_RECOVERY_ENGINE_SECRET` es opcional; si no existe usa `MRAPI_GATEWAY_SECRET` como fallback.

## Importante

Para que los pasos futuros salgan solos en Cloud Run, configurar Cloud Scheduler para invocar `/internal/recovery/run` periódicamente (recomendado: cada minuto).
