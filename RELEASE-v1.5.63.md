# MRAPI Hub v1.5.63

Base: v1.5.62-cotizado-alert.

- Normaliza estados de entrega WhatsApp en Bandeja para Twilio y Meta Cloud API.
- accepted/queued/pending: Pendiente de entrega.
- sent: Enviado.
- delivered: Entregado.
- read: Leído.
- failed/undelivered/rejected/error: Falló.
- La UI prioriza deliveryStatus sobre el status inicial para reflejar callbacks posteriores.
- Si existe un motivo de error, se muestra debajo del mensaje fallido.
- Se preservan las notificaciones WhatsApp de la base cotizado-alert.
