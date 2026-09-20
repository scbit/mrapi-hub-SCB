# MRAPI Hub SCB v1.5.39

- Corrige plantillas inconsistentes entre conversaciones que muestran la misma línea.
- La ruta de salida usa la línea Meta/Gateway exacta de la conversación.
- Autorrepara conversaciones legacy creadas cuando la línea todavía estaba en Twilio.
- Fallback seguro por catálogo (Phone Number ID / Gateway Line ID / nombre exacto).
- Evita que respuestas asíncronas viejas de templates pisen el selector de la conversación actual.
- Mantiene 1 contacto + 1 línea = 1 conversación y la UI mobile de v1.5.38.
