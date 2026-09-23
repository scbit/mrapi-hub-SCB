# v1.5.79

- Bandeja / No leídos: la paginación ahora busca del lado servidor hasta completar hasta 50 conversaciones realmente no leídas por carga.
- Evita el comportamiento donde “Cargar 50 más” agregaba solo 1–2 chats porque el filtro se aplicaba después de traer 50 conversaciones generales.
- Conserva cursor exacto para no saltear conversaciones entre cargas.
