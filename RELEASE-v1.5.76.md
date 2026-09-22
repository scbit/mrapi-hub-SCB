# MRAPI Hub v1.5.76

## HUMAN sticky

- Una conversación que un vendedor pasa manualmente a HUMAN queda fijada en HUMAN.
- Sólo una acción manual sobre BOT puede devolverla a BOT.
- El override manual se guarda en `manualModeOverride` y el motor de Dialogflow lo respeta.
- Al cambiar HUMAN/BOT se actualizan todos los aliases legacy del mismo cliente + línea para evitar que un alias viejo vuelva a mostrar BOT.
- El merge visual de conversaciones prioriza el override manual por encima del estado legacy.
- No se modifica CRM, Recovery, Gateway routing, templates ni búsqueda de Bandeja.
