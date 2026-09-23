# v1.5.85 — Historial de notas + auditoría

- Bandeja: agrega desplegable **Historial de notas** debajo de la nota CRM.
- Si una nota se borra, conserva el contenido anterior y registra quién y cuándo hizo el cambio.
- Bandeja: agrega desplegable **Log de auditoría** al final del trato.
- Auditoría registra creación de contacto/trato, cambios de etapa y cambios de owner con usuario, fecha y hora.
- Cambios masivos de etapa/owner también quedan auditados.
- Recovery registra el cambio automático a RESPONDIO RECOVERY.
- Los historiales se cargan **solo al abrir el desplegable**: no agregan reads a la carga normal de Bandeja.
- Para registros históricos creados antes de esta versión, se muestra la fecha de creación disponible, pero no se inventa el usuario creador si nunca fue almacenado.
