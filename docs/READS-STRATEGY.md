# Estrategia de Firestore Reads

## Reglas obligatorias

- Nunca `collection.get()` sin `where`, `limit` o acceso directo por ID en tráfico interactivo.
- Nunca cargar una colección completa para filtrar en Node/browser.
- Listados: 20–100 docs por página, siempre cursor.
- Detalle: lecturas directas por ID.
- Búsquedas: índices específicos (`contactPhones`, `conversation_lookup`, search tokens/materializados).
- Contadores: documentos agregados; no contar leyendo todos los documentos.
- Configuración y catálogos pequeños: cache TTL en memoria de instancia.
- UI no debe volver a pedir catálogos estáticos por cada componente.
- Listeners realtime solo sobre ventanas acotadas.

## Hallazgo de la Bandeja actual

La ruta histórica de búsqueda contiene un fallback que puede leer hasta 15.000 conversaciones. No se porta a MR API HUB.

## Objetivo Bandeja

Una página de 50 conversaciones debe costar aproximadamente 50 reads (+1 si se resuelve cursor por ID). La metadata requerida para pintar la fila debe estar materializada en el documento resumen de conversación.

## Inbox Live v1.5.3

La Bandeja no vuelve a leer las primeras 50 conversaciones cada 2 segundos.
Usa dos consultas incrementales:

- `conversations`: `lastMessageAt >= checkpoint`, máximo 100 cambios.
- chat abierto: `messages.timestamp >= checkpoint`, máximo 100 cambios.

El checkpoint tiene 1 segundo de solapamiento y el frontend deduplica por ID / MessageSid.
La sincronización se pausa cuando la pestaña está oculta y hace catch-up al volver.
Con filtro de owner se usa índice compuesto `ownerEmail + lastMessageAt DESC`.
