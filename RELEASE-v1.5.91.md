# MRAPI Hub v1.5.91

## HUMAN sticky canonico
- El cambio manual HUMAN/BOT se guarda en todos los aliases del chat y tambien en el conversationId canonico cliente + linea.
- Un cliente que vuelve a escribir no puede recrear/reactivar el chat en BOT si un vendedor ya lo habia pasado manualmente a HUMAN.
- Solo un vendedor que presiona BOT vuelve a habilitar el bot.
- El envio manual usa el modo efectivo (`manualModeOverride`) para validar HUMAN.
- No cambia filtros, CRM, Recovery, No leidos ni Gateway.
