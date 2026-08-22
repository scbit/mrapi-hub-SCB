# servidor-2

## Objetivo

Pulir el layout de Bandeja/HUB para que el chat mantenga una presencia profesional aunque haya pocos mensajes o ninguna conversación seleccionada.

## Cambio

- Se fijan filas explícitas del chat:
  - encabezado;
  - contexto publicitario cuando existe;
  - mensajes como área flexible principal;
  - composer compacto al pie.
- El estado vacío del chat conserva altura mínima visual.

## Riesgo de datos

Sin cambios de backend, Firestore, Twilio, webhooks ni escrituras.
