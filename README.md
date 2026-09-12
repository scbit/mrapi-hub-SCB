# MR API HUB v1.5.10

**Base:** v1.5.3 Inbox Live.

### Novedades v1.5.9
- Audios, PDFs, imágenes y adjuntos visibles/abribles desde la Bandeja.
- Cache de media entrante en el bucket del tenant al primer acceso.
- Scroll inteligente: no vuelve abajo si el usuario está leyendo historial.
- Badge de mensajes nuevos mientras se lee arriba.
- Administración de múltiples líneas por contacto: descubrir, vincular y elegir línea de respuesta.
- Mismo código multi-tenant para SCB, Ar-Tec y futuros clientes.

Ver `docs/V1.5.9.md`.

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

## v1.5.9 — Desk + Read state + Line catalog

### Desk
- El botón `Desk` de la navegación abre `MRAPI_DESK_BASE_URL` directamente.
- La creación de ticket desde el resumen CRM se conserva separada.
- Si un tenant no tiene Desk configurado, la UI avisa sin romper la Bandeja.

### Leído / No leído manual
- El chat abierto muestra `Marcar leído` / `Marcar no leído`.
- `POST /api/inbox/conversations/:id/read`
- `POST /api/inbox/conversations/:id/unread`
- El estado se refleja inmediatamente en la lista y KPIs.

### Catálogo global de líneas
Colección interna: `mrapi_line_catalog`.

- Cada inbound de Twilio registra/actualiza automáticamente la línea receptora.
- Cada envío registra/actualiza automáticamente la línea usada.
- `Líneas` en Bandeja muestra el catálogo completo conocido por el tenant.
- Admin/Backoffice puede agregar una línea manualmente.
- `Detectar existentes` hace un bootstrap explícito sobre hasta 5.000 conversaciones históricas. Es una operación manual para evitar scans automáticos recurrentes.
- El catálogo normal se mantiene incrementalmente sin scans.

### Nuevo mensaje
`+ Nuevo mensaje` permite:
1. ingresar teléfono del cliente;
2. elegir una línea activa del tenant;
3. preparar/abrir la conversación;
4. enviar texto si existe ventana de WhatsApp o una plantilla aprobada para iniciar fuera de ventana.

Endpoint: `POST /api/inbox/conversations/start`.

### Líneas de un contacto
El modal `Líneas` ahora combina:
- líneas históricamente usadas por ese teléfono;
- líneas globales activas del tenant.

Por lo tanto se puede elegir como `preferredLineId` una línea habilitada aunque ese contacto todavía no haya hablado por ella. `Vincular conversaciones detectadas` sigue agrupando solamente conversaciones históricas reales del mismo teléfono.


## v1.5.9 — Desk SSO + Multi-line Alert

- HUB → Desk SSO using the authenticated MR API user.
- Configure the exact same `DESK_SSO_SECRET` in MR API HUB and SCB Desk.
- `DESK_SSO_TTL_SECONDS` defaults to 60 seconds.
- New WhatsApp conversations automatically detect the same customer across multiple receiving lines and materialize `linkedLineIds` / `duplicateConversationIds`.
- Existing historical conversations are repaired on first open through the lightweight line-alert endpoint.
- Inbox list shows a `N líneas` warning badge and the open chat shows a persistent multi-line warning.
- The alert links directly to the existing Lines manager, where the operator can inspect conversations and choose the preferred outbound line.

SSO does not share browser cookies across Cloud Run domains. The HUB creates a short-lived signed handoff token that Desk validates at `/auth/crm`.


## v1.5.9 — Legacy Desk SSO + real multi-line dedupe
- Desk SSO token contract now matches legacy CRM exactly (no tenantId in payload; legacy role normalization).
- Multi-line detection canonicalizes WhatsApp numbers by digits before counting.
- Same line in different formats no longer creates false 2-line alerts.
- Historical stale multi-line flags are cleared when a re-check finds one real line.

## v1.5.9 — Legacy-compatible multi-line detection
- Multi-line lookup now follows the proven legacy HUB/CRM strategy.
- Searches normalized customer phone across customerPhone, phone, waFrom, from and contactPhone.
- Checks historical formatting variants (digits, +digits, whatsapp:+digits).
- Excludes the current line after normalization.
- Applies owner visibility rules.
- Does not scan the full conversations collection.
- Materializes the resulting linked lines only on the opened conversation.

## v1.5.10 — Fixed advertising origin
- Advertising acquisition source is now immutable once detected.
- Later normal WhatsApp messages no longer overwrite a Meta Ads origin.
- Stores the first ad-associated inbound message as `leadOriginMessage`.
- Keeps the advertising card fixed above the scrollable conversation.
- Existing legacy referral fields remain supported as fallback.

## v1.5.11 — Chat layout restore
- Advertising origin stays fixed but compact.
- Message history gets the remaining vertical space again.
- Composer stays visible at normal height.
- Prevents the ad card from shrinking the chat.
- Mobile layout adjusted separately.

## v1.5.12 — Bulk toolbar + Vencidos +15
- Bulk action toolbar is sticky and stays visible above the Kanban after selecting deals.
- New `Vencidos +15 días` pipeline filter backed by Firestore `dueDate`.
- Shows overdue age in days on cards/list.
- `Seleccionar cargados` selects all currently loaded filtered deals.
- Bulk move now asks for confirmation and supports up to 450 selected deals per operation.
- Saved views preserve the +15-day filter.
- No collection-wide fallback scan is used.

## v1.5.13 — Bulk UI + Firestore indexes for Vencidos +15
- Bulk actions are now a compact centered card instead of a full-width black strip.
- The card remains visible without visually covering the Kanban headers.
- Added composite Firestore indexes for all supported Vencidos +15 combinations:
  owner, stage, dealType and their combinations with dueDate.
- Missing-index message is now operational/friendly instead of exposing an internal fallback warning.
- `firestore.indexes.json` contains the required definitions. These indexes must be deployed/created once in the CRM Firestore database.

## v1.5.14 — Preserve stage scroll + fixed bottom bulk bar
- `Cargar más de esta etapa` preserves the Kanban horizontal position.
- It also preserves the stage scroll relative to the bottom, so repeated loading stays where the user clicked instead of jumping to the top.
- Bulk actions now live in a fixed bottom floating bar, independent from Kanban rendering.
- Added bottom workspace padding so the floating bar does not cover deal cards.
- Mobile gets a separate fixed position above the bottom navigation.

## v1.5.15 — RECOVERY +15 DIAS
- Added `RECOVERY +15 DIAS` as the final CRM pipeline stage.
- It appears at the end of the Kanban and in bulk-move destination selectors.
- Intended workflow: filter Vencidos +15 días → select deals → move to RECOVERY +15 DIAS.

## v1.5.16 — Bulk bar attached to Kanban
- Removed the fixed-bottom floating bar and the excessive bottom whitespace it created.
- Bulk actions now sit centered directly above the Kanban.
- The bar remains sticky while scrolling but does not cover stage headers.
- Preserves the v1.5.14 stage-scroll restoration when loading more cards.

## v1.5.17 — Cambio masivo de owner
- Bulk selection can now reassign selected deals to another owner.
- Uses the existing owner permission model.
- Supports up to 450 selected deals per operation.
- Keeps bulk stage move and owner reassignment as separate actions.

## v1.5.18 — Composer always visible
- Restores the WhatsApp message composer at the bottom of the Inbox.
- Conversation history uses the remaining height and scrolls independently.
- Composer stays visible on desktop and mobile.
- CRM behavior unchanged.

## v1.5.19 — Chat scrolls, composer stays visible
- Fixed the structural Inbox grid: topbar + KPI strip + workspace.
- Workspace is now bounded to the viewport instead of extending the page.
- Long conversations scroll only inside the message history.
- Composer remains visible at the bottom regardless of chat length.
- Sidebar and CRM panel scroll independently inside the same viewport.

## v1.5.20 — Composer bottom on short chats
- Short conversations now stretch the message area to fill the available space.
- Composer stays anchored at the bottom just like in long conversations.
- Long-chat behavior remains unchanged: only message history scrolls.

## v1.5.21 — Definitive composer sizing
- Removes `height:100%` from the message history, which could invade the composer row on long chats.
- The central chat is now strictly: header / ad / multi-line alert / flexible messages / composer.
- Only the message history scrolls.
- Composer remains visible at the same bottom position for both short and long conversations.

## v1.5.22 — Fix composer when optional alerts are hidden
- Root cause fixed: hidden multi-line/ad blocks no longer shift the CSS Grid rows.
- Explicit rows: header=1, ad=2, multi-line alert=3, messages=4, composer=5.
- Composer remains at the bottom whether the customer has 1 line, 2 lines, advertising context, or none.

## v1.5.23 — Manual read semantics
- Opening/clicking a conversation no longer marks it as read.
- Keeping a conversation open while live messages arrive no longer marks it as read.
- Manual `Marcar leído` / `Marcar no leído` remains authoritative.
- A HUMAN seller sending text, file or approved template marks the conversation as read.
- BOT/Dialogflow replies do not mark the conversation as read.
- New inbound customer messages still set unreadCount / hasUnread.
