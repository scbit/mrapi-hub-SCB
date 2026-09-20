# MRAPI Hub v1.5.48

Base: v1.5.47 estable.

## Cambios
- Centro de Recontacto mantiene Twilio y agrega MRAPI Gateway / Meta Cloud API en paralelo.
- Plantillas separadas para Meta y Twilio; cada envío usa el proveedor de la línea de la conversación.
- Campañas de recontacto conservan configuración de ambos proveedores.
- CRM: filtro Vencidos +15 días robusto ante fechas legacy y devuelve todos los tratos coincidentes visibles, con corte horario Argentina.
- Agenda Comercial: filtro YO.
- HUB: tarjeta Desk ahora abre Desk mediante SSO.
- Versionado interno normalizado a v1.5.48 en health/package y pantallas tocadas.

## Preservado
- Links legibles CLIENTE__LINEA.
- Firestore IDs internos wa_...
- Gateway inbound/outbound estable.
- Twilio no se elimina.
- BOT/HUMAN, templates desde Bandeja, media, audio, referral, CRM lateral y mobile.
