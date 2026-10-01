# MRAPI Hub v1.6.0 — Tenant Fiorella

Base: v1.5.99 estable.

## Nuevo tenant
- `MRAPI_TENANT_ID=fiorella`
- Branding Fiorella Mucholi Realtor con logo propio.
- Color principal rosa y acento dorado.
- Pipeline inmobiliario propio:
  - No responde
  - Seguimiento
  - Marca Personal
  - Búsqueda por iniciar
  - Búsqueda Iniciada
  - Propuesta Enviada
  - Contrato Enviado
  - Contrato Firmado
  - Por Closing
  - Win
  - Perdido
  - Spam
- `Win` se define como etapa ganada.
- `Perdido` y `Spam` se definen como cierres negativos.

## Seguridad SCB
- SCB conserva explícitamente la lista de etapas y defaults existentes.
- `MRAPI_TENANT_ID=scb` mantiene el pipeline histórico sin cambios.
- AR-TEC mantiene temporalmente el pipeline actual de SCB hasta su reforma posterior.
- El pipeline de CRM y Bandeja ahora se toma del tenant activo.
