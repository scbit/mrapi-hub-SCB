"use strict";
module.exports = Object.freeze({
  id: "scb",
  name: "Sentire Customs Broker",
  product: "MR API HUB",
  subtitle: "Driving Your Deliveries Forward",
  modules: { hub: true, crm: true, inbox: true },
  branding: {
    shortName: "SCB",
    logoAsset: "scb-logo.jpg",
    primary: "#2fb71b",
    primaryDark: "#21970f",
    accent: "#ff8612",
    ink: "#20242b",
    muted: "#7d8797",
    line: "#e7ebef",
    background: "#f7f9f7",
    soft: "#f1f7ef"
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
