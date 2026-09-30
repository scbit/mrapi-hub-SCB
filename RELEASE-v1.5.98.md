# MRAPI Hub v1.5.98

Fix: historial incompleto de Bandeja / links directos.

## Causa
El endpoint de mensajes devolvía como máximo 60 mensajes. En conversaciones con mucha actividad, esos 60 podían representar aproximadamente las últimas 24 horas, dando la impresión de un corte temporal. Además, dependía de los aliases enviados por el frontend.

## Cambio
- El backend resuelve siempre el grupo completo cliente + línea.
- Reúne todos los aliases históricos de esa conversación.
- Lee todos los mensajes de cada alias en páginas de 250 hasta terminar.
- Deduplica por messageSid y ordena cronológicamente.
- El frontend deja de pedir limit=60.
- El endpoint devuelve historyComplete=true.

No se modifica la regla de ventana de 24 h de Meta; esa regla sólo controla el envío libre, no la visualización del historial.
