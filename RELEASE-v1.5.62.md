# MRAPI Hub v1.5.62

## Mi Estado Comercial · Vencidos

- Agrega un bloque **Vencidos** al inicio de `/mi-estado`.
- Mantiene el mismo formato operativo de los bloques actuales de Mi Estado.
- Lista únicamente tratos con fecha de vencimiento anterior a hoy.
- Se limita a etapas comerciales activas de Mi Estado: Nuevos Prospectos, Seguimiento, Marca personal, Esperando PI, Para cotizar, Cotizado para enviar y Horno.
- Respeta el owner seleccionado, incluido TOTAL.
- Ordena primero los vencimientos más antiguos.
- No modifica CRM, Gateway, Bandeja ni Recovery.
