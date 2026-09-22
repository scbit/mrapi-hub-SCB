# v1.5.67

- Corrige `Nuevos / sin asignar`: solo muestra conversaciones sin contacto y sin ningún trato vinculado, considerando IDs legacy y arrays `contactIds/dealIds`.
- Conserva Meta Ads/referral al agrupar conversaciones legacy del mismo cliente + línea.
- La Bandeja deja de mostrar una etapa CRM si la conversación no tiene trato real vinculado.
- Al cargar el resumen CRM, sincroniza `dealIds/dealId/stage` de la conversación visible con los tratos CRM reales encontrados.
