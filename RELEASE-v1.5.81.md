# v1.5.81

- Bandeja: la etiqueta de etapa del trato se sincroniza cuando cambia la etapa en CRM, sin necesidad de abrir el chat.
- CRM: cambios individuales y masivos de etapa actualizan la conversación vinculada en Inbox.
- CRM/Inbox abiertos en pestañas distintas: se propaga el cambio de etapa al instante mediante evento del navegador, sin reads adicionales.
- Para deals legacy sin `hubConversationId`, se usa un fallback acotado por `dealId/dealIds`.
