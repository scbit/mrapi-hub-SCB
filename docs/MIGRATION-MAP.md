# Mapa inicial de migración

## BANDEJA COMPLETA

Se porta a `modules/inbox`:
- webhooks WhatsApp/Twilio
- conversaciones
- mensajes
- media
- templates
- modo IA/humano
- envío texto/archivo/template

No se porta tal cual:
- credenciales hardcodeadas
- búsqueda fallback de 15.000 conversaciones

## CRM COMPLETO

Se divide entre:
- `modules/crm`: contacts, deals, pipeline, agenda, tareas, KPI
- módulos posteriores: campañas, vencimientos, producción, búsqueda de productos, conocimiento
- `core/auth`: users/login/roles
- `shared/storage`: archivos

## CORE COMPLETO

Se divide entre:
- `modules/hub`: vista unificada CRM + Bandeja
- `shared`: contexto contacto/trato/conversación
- `integrations`: mensajería y otros servicios
- módulo posterior de automatizaciones

La regla es portar comportamiento, no copiar los tres `index.js` dentro de un nuevo index gigante.
