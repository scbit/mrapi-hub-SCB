# MRAPI Hub v1.5.66

Base: v1.5.65.

- Hub-link de tratos legacy: resuelve por dealId/dealIds, conversationId histórico, contacto y teléfono; devuelve URL pública cliente__línea cuando es posible.
- Buscador de Bandeja global por teléfono en formatos legacy y por nombre de contacto usando el índice CRM, sin scan masivo.
- Estados Meta Cloud API: los callbacks delivered/read/failed también actualizan mensajes guardados en conversaciones legacy del mismo cliente+línea, evitando que queden eternamente en accepted/Pendiente de entrega.
- Conserva Twilio, Meta Cloud API, Recovery y alertas de Cotizado.
