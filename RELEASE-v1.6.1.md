# MRAPI Hub v1.6.1

Fix multi-tenant de navegación.

- Bandeja deja de forzar `https://hub.sentirecustomsbroker.com`.
- Usa `window.location.origin` como host del tenant actual.
- Se elimina el redirect automático desde `*.run.app` hacia SCB.
- Fiorella queda en su propio Cloud Run/dominio.
- SCB y AR-TEC continúan usando el host desde el que fueron abiertos.
- Los links de conversación permanecen en el tenant actual.

No se modifica CRM, pipeline, filtros, HUMAN/BOT, Recovery ni Gateway.
