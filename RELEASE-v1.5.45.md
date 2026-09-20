# MRAPI Hub SCB v1.5.45

- Mi Estado > TOTAL: cálculo exacto con COUNT, sin truncar al llegar a 10.000 tratos.
- Si faltan índices, fallback paginado para no devolver totales parciales.
- Bandeja: la URL cambia al abrir cada conversación e incluye `conversationId`, `chat` (teléfono) y `line`.
- Los links son compartibles: al abrirlos, Hub entra directo a la misma conversación.
- Back/Forward del navegador sincroniza la conversación seleccionada.
