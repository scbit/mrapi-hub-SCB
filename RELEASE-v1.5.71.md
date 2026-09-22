# v1.5.71

- Corrige `Ir al HUB` en tratos legacy que apuntaban a un documento `wa_*` vacío.
- El resolver prioriza la conversación real que contiene mensajes del cliente, no un shell/orphan con `dealId` viejo.
- Mantiene la regla pública `cliente__línea` cuando puede recuperar ambos teléfonos.
- Conserva compatibilidad con vínculos explícitos y conversaciones históricas.
