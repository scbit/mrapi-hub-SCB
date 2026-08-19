# MR API HUB — Arquitectura v0.1

Producto: `mrapi-hub`  
Primer deployment/cliente: `mrapi-hub-scb` / tenant `scb`.

## Principios

1. Un solo contenedor Cloud Run; módulos internos desacoplados.
2. Firestore y Cloud Storage continúan como persistencia.
3. Multi-tenant desde el núcleo: SCB es configuración, no código del producto.
4. Cero escaneos globales en requests interactivos.
5. Cursor pagination (`limit + startAfter`) en listas.
6. Denormalización/materialización deliberada para reducir reads.
7. Secretos exclusivamente por Secret Manager / variables de entorno.
8. Sesión firmada stateless para no leer `users` en cada request.

## Bases SCB existentes

- CRM: `bscrmscb`
- Bandeja: `bsscb`

La v0.1 puede leer estas bases mediante configuración. No migra ni destruye datos.

## Próximo bloque de migración

Portar la Bandeja funcional completa al router `src/modules/inbox`, conservando webhooks, envío, media y templates, pero reemplazando la búsqueda histórica de hasta 15.000 conversaciones por índices de búsqueda materializados.
