"use strict";
module.exports = Object.freeze({
  id: "artec",
  name: "AR-TEC INVENT",
  product: "MR API HUB",
  subtitle: "Investigación & Desarrollo",
  modules: { hub: true, crm: true, inbox: true },
  branding: {
    shortName: "AR-TEC",
    logoAsset: "artec-logo.jpg",
    primary: "#62666d",
    primaryDark: "#24272c",
    accent: "#a5a9af",
    ink: "#1f2328",
    muted: "#7b8088",
    line: "#e3e5e8",
    background: "#f5f6f7",
    soft: "#eef0f2"
  },
  pipeline: {
    stages: ["Nuevos Prospectos", "No responde", "Seguimiento", "Marca personal", "Esperando PI", "Para cotizar", "Cotizado para enviar", "Horno", "Pendiente de pago", "Ganado courier", "Ganado maritimo", "Perdido", "Descartado", "Buscar Producto", "Busqueda en Proceso", "REVISAR ZOHO", "SEGUIMIENTO ZOHO", "Base Importadores", "RECUPERO ZOHO", "RECOVERY +15 DIAS", "RESPONDIO RECOVERY"],
    inboxDefaultStage: "Nuevos Prospectos",
    crmDefaultStage: "No responde",
    importantStages: ["Nuevos Prospectos","Marca personal","Esperando PI","Para cotizar","Cotizado para enviar","Horno"],
    wonStages: ["Ganado courier","Ganado maritimo"],
    lostStages: ["Perdido","Descartado"]
  },
  features: { legacyUserCompatibility: true, readOptimizedInbox: true }
});
