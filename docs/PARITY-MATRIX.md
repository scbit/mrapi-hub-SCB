# MR API HUB — matriz de paridad funcional

Referencia auditada: `CRM COMPLETO.zip`, `CORE COMPLETO.zip` y `BANDEJA COMPLETA.zip` entregados por el usuario.

Leyenda: ✅ portado · 🟡 parcial · ❌ pendiente · 🔄 se rediseña dentro del producto nuevo.

## Núcleo común

| Función | Estado v1.3 | Nota |
|---|---:|---|
| Master Login CRM compartido | ✅ | Una sesión para CRM/Bandeja/HUB |
| Tenant SCB configurable | ✅ | Primer tenant del producto `mrapi-hub` |
| Cloud Run Docker | ✅ | Código modular |
| Firestore CRM + Inbox actuales | ✅ | `bscrmscb` + `bsscb` por configuración |
| Storage / archivos | ✅ | `MRAPI_FILES_BUCKET`; archivos viejos conservan bucket en metadata |
| Responsive móvil | ✅ | CRM y Bandeja |
| Roles/permisos completos del CRM viejo | 🟡 | Se conserva control owner/admin en núcleo portado; faltan pantallas admin completas |

## CRM / Pipeline

| Función | Estado v1.3 |
|---|---:|
| Kanban | ✅ |
| Lista | ✅ |
| Drag & drop de stages | ✅ |
| Vistas guardadas por usuario | ✅ |
| Ordenar stages por vista | ✅ |
| Ocultar stages | ✅ |
| Colapsar stages | ✅ |
| Scroll horizontal accesible sin bajar la página | ✅ |
| Cargar 50 más global | ✅ |
| Cargar más por stage | ✅ |
| Filtros owner/stage/tipo | ✅ |
| Selección múltiple + mover stage | ✅ |
| Detalle/edición del trato | ✅ |
| Historial de notas | ✅ |
| Archivos del trato: subir/ver/eliminar | ✅ |
| Ir al HUB desde el trato | ✅ |
| Búsqueda global materializada por nombre/empresa | ❌ |
| Exportar seleccionados | ❌ |
| Bulk vencimiento | ❌ |
| Crear/eliminar trato desde UI | ❌ |
| Contactos: listado/CRUD/owner/status | ✅ |
| Agenda y tareas | ✅ |
| Vencimientos + campañas de seguimiento | 🟡 |
| Mi Estado comercial | ❌ |
| KPI / objetivos / reportes | ❌ |
| Plan de producción | ❌ |
| Equipos de producción | ❌ |
| Búsqueda de productos | ❌ |
| Base de conocimiento | ❌ |
| Importador CSV maestro | ❌ |
| Usuarios / administración | ❌ |

## HUB / CORE

| Función | Estado v1.3 |
|---|---:|
| Resolver trato → conversación directa | ✅ |
| Abrir conversación por `conversationId` aunque no esté entre las primeras 50 | ✅ |
| Contexto de publicidad Meta guardado en conversación | ✅ visualización |
| Facebook / Instagram / Meta Ads badge | ✅ |
| Título/texto/Ad ID/campaña/ad set/imagen | ✅ cuando existe en `bsscb` |
| Conversación ↔ contacto ↔ trato completo | 🟡 |
| Contexto completo de contacto en panel HUB | ❌ |
| Editar contacto desde HUB | ❌ |
| Crear contacto/trato rápido desde chat | ❌ |
| Notas de contacto y trato desde HUB | ❌ |
| Actividades del trato | ❌ |
| Archivos del trato dentro del HUB | ❌ |
| Tickets HUB | ❌ |
| Automatizaciones / supervisor | ❌ |
| Multi-línea con filtro/configuración completa | 🟡 |

## Bandeja / WhatsApp

| Función | Estado v1.3 |
|---|---:|
| Listar conversaciones paginadas | ✅ |
| Búsqueda histórica por teléfono sin scan | ✅ |
| Abrir mensajes | ✅ |
| HUMAN / BOT | ✅ |
| Marcar leído | ✅ |
| Enviar texto | ✅ |
| Enviar PDF/JPG/PNG/WEBP | ✅ |
| Plantillas aprobadas | ✅ |
| Estado Twilio outgoing | ✅ |
| Publicidad visible en conversación | ✅ |
| Webhook entrante Twilio dentro de MR API HUB | ❌ deliberadamente |
| Media entrante proxy completo | ❌ |
| Audio grabado | ❌ |
| Filtro multi-línea | ❌ |
| Inicio de chat por plantilla sin conversación | ❌ |

## Regla de migración

No se considera una función "portada" solo porque exista una pantalla parecida. Debe conservar el comportamiento operativo necesario, permisos y una estrategia de Firestore sin scans masivos interactivos.


### Avance v1.3
Contactos, Agenda y Vencimientos ya están dentro del núcleo nuevo. Campañas de vencimiento siguen pendientes para el siguiente bloque.
