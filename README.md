# MR API HUB v1.5.0 — Multi-tenant SCB + AR-TEC

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
