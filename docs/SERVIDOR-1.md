# servidor-1

## Objetivo

Convertir la Bandeja en un primer HUB comercial vendible sin tocar webhooks, número de WhatsApp ni procesos automáticos.

## Agregado

- Panel contextual en `/inbox` al seleccionar conversación.
- Contexto conversación -> contacto -> trato con lecturas dirigidas.
- Notas recientes de contacto y trato.
- Actividades recientes del trato.
- Crear contacto desde conversación sin contacto vinculado.
- Crear trato rápido desde conversación con contacto.
- Agregar nota al contacto o al trato desde el panel.

## Reglas de seguridad de datos

- No hay migraciones.
- No hay backfills.
- No se activa webhook entrante Twilio.
- No se cambia el número de WhatsApp.
- No hay scans globales de `contacts`, `deals` ni `conversations`.
- Las consultas por contacto/trato usan ID, `contactPhones/{phone}`, teléfono exacto o `contactId` con `limit(10)`.
- Las notas y actividades se cargan con `limit(10)`.

## Reads esperados

- Abrir contexto HUB: 1 read de conversación, más contacto/trato/notas/actividades acotadas.
- Crear contacto: búsqueda exacta previa + 2 writes, y 1 write extra si se vincula conversación.
- Crear trato: 1 read de contacto + 3 writes.
- Agregar nota contacto: 1 read de contacto + 1 write.
- Agregar nota trato: 1 read de trato + 2 writes.
