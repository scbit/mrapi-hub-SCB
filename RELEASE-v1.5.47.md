# MRAPI Hub SCB v1.5.47

- URLs compartibles de Bandeja legibles: `contacto__linea`.
- Ejemplo: `/inbox?conversationId=5492994585825__5492994364416`.
- El backend resuelve ese alias al ID interno `wa_...`; Firestore y la lógica interna no cambian.
- Conserva compatibilidad con links antiguos `wa_...`.
- Dominio canónico: `https://hub.sentirecustomsbroker.com`.
