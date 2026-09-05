# MR API HUB v1.5.5

**Base:** v1.5.3 Inbox Live.

### Novedades v1.5.5
- Audios, PDFs, imágenes y adjuntos visibles/abribles desde la Bandeja.
- Cache de media entrante en el bucket del tenant al primer acceso.
- Scroll inteligente: no vuelve abajo si el usuario está leyendo historial.
- Badge de mensajes nuevos mientras se lee arriba.
- Administración de múltiples líneas por contacto: descubrir, vincular y elegir línea de respuesta.
- Mismo código multi-tenant para SCB, Ar-Tec y futuros clientes.

Ver `docs/V1.5.5.md`.

# MR API HUB v1.5.3 — Multi-tenant + WhatsApp inbound

Esta versión elimina el bloqueo `Tenant no configurado: artec` y convierte tenant + branding en configuración reutilizable por Cloud Run.

## Presets incluidos

### SCB
`MRAPI_TENANT_ID=scb`

Branding preset:
- Sentire Customs Broker
- verde / naranja
- logo SCB

### AR-TEC INVENT
`MRAPI_TENANT_ID=artec`

Branding preset:
- AR-TEC INVENT
- Investigación & Desarrollo
- grafito / acero / plata
- logo AR-TEC incluido

## Variables mínimas por Cloud Run

```env
MRAPI_TENANT_ID=artec
MRAPI_CRM_DB=mrapi-hub-artec
MRAPI_INBOX_DB=mrapi-hub-artec
MRAPI_FILES_BUCKET=mrapi-hub-artec
MRAPI_SESSION_SECRET=CAMBIAR_POR_SECRETO_PROPIO
MRAPI_PUBLIC_BASE_URL=https://TU-CLOUD-RUN.run.app
```

## WhatsApp / Twilio — opcional

```env
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+...
```

Si Twilio no está configurado o el SID no comienza con `AC`, el servicio **levanta igual**. Las operaciones WhatsApp devuelven `Twilio no configurado` en vez de matar el contenedor.

## Dialogflow / Conversational Agent — opcional

```env
DF_PROJECT_ID=...
DF_AGENT_ID=...
DF_LOCATION=global
DF_LANGUAGE_CODE=es
```

La configuración queda disponible por tenant. Si no hay agent, el HUB puede operar HUMAN sin impedir el arranque.

## Branding por variables — opcional

SCB y Artec ya tienen presets. Para futuros clientes se puede usar cualquier `MRAPI_TENANT_ID` y definir:

```env
MRAPI_BRAND_NAME=Cliente SA
MRAPI_BRAND_SHORT_NAME=CLIENTE
MRAPI_BRAND_SUBTITLE=...
MRAPI_BRAND_LOGO_URL=https://...
MRAPI_PRIMARY_COLOR=#4b5563
MRAPI_PRIMARY_DARK_COLOR=#1f2937
MRAPI_ACCENT_COLOR=#9ca3af
```

Si el tenant no es `scb` ni `artec`, se crea un tenant genérico en vez de tirar error.

## Desk — opcional

```env
MRAPI_DESK_DB=...
MRAPI_DESK_BASE_URL=https://...
```

SCB mantiene sus defaults legacy. Otros tenants no apuntan accidentalmente a SCB Desk.

## Qué cambia técnicamente

- `getTenant()` ya no acepta solo SCB.
- Presets `scb` y `artec`.
- Fallback genérico para futuros tenants.
- Logo servido dinámicamente por `/assets/tenant-logo`.
- Nombre, short name, subtítulo y colores inyectados en HUB / CRM / Bandeja / Contactos / Agenda / Mi Estado / Usuarios.
- `health` muestra tenant, brand e integraciones configuradas.
- Twilio se inicializa solo con SID válido `AC...` + token.
- DB y bucket se siguen definiendo por variables del Cloud Run.

## Primer usuario en un Firestore nuevo

La base nueva necesita una colección `users` con al menos un usuario admin compatible con el login actual antes de poder iniciar sesión.


## WhatsApp Twilio inbound — v1.5.3

MR API HUB now supports inbound WhatsApp for each tenant. Configure the WhatsApp Sender in Twilio with:

- **When a message comes in:** `${MRAPI_PUBLIC_BASE_URL}/api/inbox/twilio/inbound`
- **Method:** `POST`

Example AR-TEC:

`https://mrapi-hub-artec-invent-604957912671.us-central1.run.app/api/inbox/twilio/inbound`

The webhook validates `X-Twilio-Signature`, stores inbound messages idempotently by `MessageSid`, maintains one conversation per customer + receiving line, increments unread counts, and preserves Meta/Click-to-WhatsApp referral fields when Twilio sends them.

Outbound text, media and approved templates continue using the existing Twilio credentials. Template status callbacks now include the conversation id.

New conversations default to HUMAN when Dialogflow is not configured; when `DF_AGENT_ID` exists they default to BOT.

## v1.5.3 — BOT Conversational Agent multi-tenant

Cuando una conversación está en `BOT` y están configuradas `DF_PROJECT_ID`, `DF_AGENT_ID`, `DF_LOCATION` y `DF_LANGUAGE_CODE`, cada mensaje entrante de Twilio se envía al Conversational Agent del tenant mediante Dialogflow CX `detectIntent`.

- Sesión estable por conversación para conservar contexto.
- La respuesta del agente se envía por el mismo número Twilio que recibió el mensaje.
- La respuesta se guarda en `conversations/{id}/messages` con `source=dialogflow`.
- Si el usuario cambia el chat a `HUMAN` mientras el agente procesa, la respuesta automática se descarta.
- Si Conversational Agents falla o supera timeout, el mensaje entrante permanece guardado y la conversación pasa automáticamente a `HUMAN`.
- Los tenants sin `DF_*` siguen funcionando normalmente.


## v1.5.3 — Inbox Live

- Polling incremental cada 2 segundos, solo mientras la pestaña está visible.
- Conversaciones nuevas aparecen arriba automáticamente.
- Un chat existente sube al recibir o enviar un mensaje.
- El chat abierto trae solo mensajes posteriores al checkpoint.
- No recarga las primeras 50 conversaciones en cada ciclo.
- Al volver a una pestaña oculta hace una sincronización inmediata con pequeño solapamiento para evitar perder eventos.
- Respeta filtros de owner y permisos del backend.
