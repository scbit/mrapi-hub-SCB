# v1.5.68

- Bandeja CRM lateral: fallback por teléfono normalizado para conversaciones legacy sin contactId/dealId.
- Unifica formatos whatsapp:+549..., +549... y 549... al buscar contacto CRM.
- Recupera todos los tratos reales del contacto encontrado.
- Self-heal: persiste contactId/contactIds/dealIds en los alias físicos de la conversación para futuros accesos y filtros.
- Mantiene la regla 1 cliente + 1 línea = 1 chat.
