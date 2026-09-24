# v1.5.77

Fix puntual de Bandeja para la combinación **No leídos + filtro de Owners**.

## Problema
En datos legacy, los aliases físicos del mismo chat pueden tener metadata repartida: un documento conserva `ownerEmail` y otro documento del mismo cliente + línea conserva `unreadCount`. El endpoint filtraba por owner antes de hacer el merge canónico, por lo que algunos no leídos desaparecían al activar ambos filtros.

## Cambio
Cuando se solicita `No leídos` junto con uno o más owners, el backend reúne una muestra acotada de conversaciones de esos owners y los documentos con `unreadCount > 0`, los une por la clave canónica `cliente__linea`, y recién después aplica el filtro de owner y no leído.

El frontend solicita este modo sólo para esa combinación, para evitar reads adicionales en el uso normal de Bandeja.

No se modificó CRM, Gateway, Meta/Twilio, Recovery ni la persistencia HUMAN/BOT.
