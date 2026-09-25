# MRAPI HUB SCB v1.5.89

Base: v1.5.88.

- Corrige `Nuevos / sin asignar`: una conversación que ya tiene un trato CRM no se muestra como nueva.
- El filtro usa la misma búsqueda indexada por teléfono que el lateral CRM como último fallback, antes de renderizar la lista.
- Evita el comportamiento donde el chat aparecía en Nuevos y desaparecía recién al abrirlo.
- El cambio se ejecuta sólo para el filtro `new`; no modifica Todos, No leídos, historial, HUMAN/BOT, Gateway ni Recovery.
