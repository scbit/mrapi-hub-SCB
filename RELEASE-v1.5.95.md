# v1.5.96

- Corrige **No leídos + owner**: el filtro toma como fuente de verdad el owner actual del trato en CRM, no un `ownerEmail` legacy/stale de la conversación.
- Antes de aplicar owner, mantiene la resolución de aliases cliente+línea.
- Resuelve owner por `dealId`, luego por `hubConversationId` y usa índice CRM por teléfono sólo como último fallback.
- No modifica filtros generales, CRM, HUMAN/BOT, Recovery ni Gateway.
