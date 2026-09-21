# MRAPI Hub v1.5.52

## Bandeja
- `Nuevos / sin asignar` ahora muestra únicamente conversaciones sin `contactId` y sin `dealId`.
- El filtro de owners deja de tener el límite de 10 selecciones.
- Se agregó acción `Todos` para seleccionar todos los owners visibles.
- Backend de Bandeja soporta más de 30 owners dividiendo las consultas de Firestore en bloques y unificando resultados.
- El mismo alcance de owners se aplica al polling realtime.

Base: v1.5.51.
