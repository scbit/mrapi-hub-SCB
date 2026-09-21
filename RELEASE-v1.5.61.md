# MRAPI Hub v1.5.61

- Fix de links directos legibles de Bandeja (`cliente__linea`).
- Mantiene el ID interno `wa_...` sin exponerlo en la URL.
- Si el hash determinístico no coincide con una conversación legacy, resuelve por teléfono de cliente + línea con consultas indexadas y acotadas.
- El botón **Ir al HUB** desde CRM vuelve a abrir directamente el chat correspondiente.
