# MR API HUB v0.3

Producto: `mrapi-hub`  
Tenant piloto: `scb`  
Cloud Run: `mrapi-hub-scb`

Módulos actuales:

- Master Login compatible con CRM SCB.
- Bandeja paginada sobre `bsscb`.
- HUMAN / BOT.
- mensajes y no leídos.
- envío WhatsApp de texto.
- envío de PDF e imágenes.
- plantillas aprobadas Twilio.
- tracking de estados sin reads de búsqueda.

Ver `docs/V0.3.md` y `docs/READS-STRATEGY.md`.


## v0.6
CRM operativo: vistas guardadas, stages reordenables/ocultables/colapsables, scrollbar horizontal dentro del viewport, carga incremental global y por stage, y acciones masivas.

## v0.8

Paridad CRM ↔ HUB: archivos de trato, acceso directo a conversación y contexto de publicidad Meta/Facebook/Instagram. Ver `docs/V0.7.md` y `docs/PARITY-MATRIX.md`.


## v0.8
- Publicidad: el texto de la tarjeta queda fijado al primer mensaje inbound del lead asociado al anuncio, no al último mensaje del cliente.
- Versión visible actualizada en `/`, CRM, Bandeja y health endpoints.


## v0.8
- HUB 3 columnas optimizado para uso diario.
- Usuario visible en mensajes salientes, compatible con metadata legacy.
- Resumen CRM lateral al abrir conversación, cargado bajo demanda y cacheado en cliente.
- Acceso directo HUB → trato CRM.
- Responsive: panel CRM se vuelve drawer en tablet/móvil.
