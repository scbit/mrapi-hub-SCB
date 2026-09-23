# v1.5.80

- Bandeja / Refrescar: actualiza los datos sin recargar la página y conserva filtro rápido, owners y búsqueda activa.
- Bandeja / No leídos: deja de escanear conversaciones generales para encontrar no leídos; consulta solamente documentos con `hasUnread=true`.
- Reduce drásticamente los reads de Firestore del filtro No leídos, especialmente cuando hay miles de conversaciones históricas.
- Mantiene los fixes incluidos hasta v1.5.79.
