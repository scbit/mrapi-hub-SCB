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

## v1.1

Paridad CRM ↔ HUB: archivos de trato, acceso directo a conversación y contexto de publicidad Meta/Facebook/Instagram. Ver `docs/V0.7.md` y `docs/PARITY-MATRIX.md`.


## v1.1
- Publicidad: el texto de la tarjeta queda fijado al primer mensaje inbound del lead asociado al anuncio, no al último mensaje del cliente.
- Versión visible actualizada en `/`, CRM, Bandeja y health endpoints.


## v1.1
- HUB 3 columnas optimizado para uso diario.
- Usuario visible en mensajes salientes, compatible con metadata legacy.
- Resumen CRM lateral al abrir conversación, cargado bajo demanda y cacheado en cliente.
- Acceso directo HUB → trato CRM.
- Responsive: panel CRM se vuelve drawer en tablet/móvil.


## v1.1
- Crear ticket en Desk directamente desde HUB.
- Cambiar stage del trato desde el panel CRM lateral.
- Ver, abrir, adjuntar y eliminar archivos del trato desde HUB.
- Sin scans nuevos: las acciones usan IDs directos y el ticket crea escrituras directas en Desk.

## v1.1 — SCB Visual System
- Nueva identidad visual basada en Sentire Customs Broker.
- Header blanco, navegación unificada Bandeja / CRM / HUB / Desk.
- Bandeja en tres paneles con KPI calculados sobre datos ya cargados (0 reads adicionales).
- Chat y composer rediseñados; mantiene envío, adjuntos, templates, HUMAN/BOT.
- CRM lateral rediseñado; mantiene stage, archivos y tickets Desk.
- CRM principal re-skin sin alterar su lógica validada.
- Home HUB rediseñada.
- Responsive móvil con navegación inferior.
- Logo SCB incluido como asset tenant-specific.

## v1.1
Bandeja: creación contacto/trato, filtros rápidos y multi-owner con permisos.

## v1.2
- Crear trato con todas las etapas del CRM y filtro de etapas.
- Owner del trato y owner del contacto editables por separado desde HUB.
- Permisos de owner validados en frontend y backend.


## v1.3
- Contactos completos dentro de MR API HUB.
- Agenda Comercial con tareas manuales y vencimientos.
- Seguimientos por Vencimiento en `/vencimientos`.
- Owners y permisos respetados en backend.
- Paginación y límites; no se introducen scans masivos.
- Navegación CRM: Pipeline / Contactos / Agenda / Vencimientos.
