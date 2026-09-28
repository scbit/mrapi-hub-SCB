# MRAPI Hub v1.5.97

Fix puntual: Mi Estado — cambio de fecha/vencimiento rebota después de Guardar.

## Causa
Mi Estado mantiene un cache por owner de hasta 60 segundos. El `PUT /api/crm/deals/:id`
guardaba correctamente el nuevo `dueDate`, pero la recarga inmediata de Mi Estado podía
leer una foto cacheada anterior y volver a mostrar la fecha vieja. En Cloud Run esto podía
ocurrir incluso si el PUT y el GET siguiente caían en instancias distintas.

## Cambio
- `exactMyStatusFallback` acepta `forceFresh`.
- `/api/crm-admin/my-status` y `/api/crm-admin/my-status/deals` aceptan `fresh=1`.
- Después de Guardar desde Mi Estado, la fila se vuelve a leer forzando Firestore fresco.
- Las métricas posteriores al guardado también se actualizan con lectura fresca.
- Se conserva el cache de 60 s para navegación normal; sólo se evita inmediatamente
  después de una modificación.

No se modifican CRM, Bandeja, filtros, HUMAN/BOT, Recovery ni Gateway.
