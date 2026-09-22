# MRAPI Hub v1.5.65

Fix de conversaciones duplicadas por cliente + línea.

- La Bandeja agrupa conversaciones por `telefonoCliente__telefonoLinea`.
- Dos documentos legacy con el mismo cliente y la misma línea se muestran como un único chat.
- El historial visible combina los mensajes de esos documentos legacy.
- El CRM lateral reúne los tratos vinculados a cualquiera de esas conversaciones duplicadas.
- Un cliente puede seguir teniendo múltiples tratos dentro de un único chat.
- Si el mismo cliente habla por otra línea, continúa apareciendo como otro chat independiente.
- Se conserva el link público legible `cliente__linea`.
- No se modifica Gateway, Twilio, Meta Cloud API ni alertas de Cotizado para enviar.
