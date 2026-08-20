"use strict";
const PIPELINE_STAGES=["Nuevos Prospectos","No responde","Seguimiento","Marca personal","Esperando PI","Para cotizar","Cotizado para enviar","Horno","Pendiente de pago","Ganado courier","Ganado maritimo","Perdido","Descartado","Buscar Producto","Busqueda en Proceso","REVISAR ZOHO","SEGUIMIENTO ZOHO","Base Importadores","RECUPERO ZOHO"];
const DEAL_TYPES=["LCL_PROPIO","LCL_CONVENCIONAL","FCL","AEREO_COURIER","AEREO_CARGA"];
const DEAL_TYPE_LABELS={LCL_PROPIO:"LCL Propio",LCL_CONVENCIONAL:"LCL Convencional",FCL:"FCL",AEREO_COURIER:"Aéreo Courier",AEREO_CARGA:"Aéreo Carga"};
const LEAD_QUALITY_VALUES=["DESCARTADO","NO_RESPONDE","REGULAR","BUENO","EXCELENTE"];
const LEAD_QUALITY_LABELS={DESCARTADO:"Descartado",NO_RESPONDE:"No Responde",REGULAR:"Regular",BUENO:"Bueno",EXCELENTE:"Excelente"};
module.exports={PIPELINE_STAGES,DEAL_TYPES,DEAL_TYPE_LABELS,LEAD_QUALITY_VALUES,LEAD_QUALITY_LABELS};
