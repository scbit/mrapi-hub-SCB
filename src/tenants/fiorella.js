"use strict";
module.exports = Object.freeze({
  id: "fiorella",
  name: "Fiorella Mucholi Realtor",
  product: "MR API HUB",
  subtitle: "Real Estate · Florida",
  modules: { hub: true, crm: true, inbox: true },
  branding: {
    shortName: "FIORELLA",
    logoAsset: "assets/fiorella-logo.png",
    primary: "#E72F5F",
    primaryDark: "#B91F49",
    accent: "#D5B46B",
    ink: "#252329",
    muted: "#817780",
    line: "#F0D7DF",
    background: "#FFF9FB",
    soft: "#FFF0F4"
  },
  pipeline: {
    stages: ["No responde", "Seguimiento", "Marca Personal", "Búsqueda por iniciar", "Búsqueda Iniciada", "Propuesta Enviada", "Contrato Enviado", "Contrato Firmado", "Por Closing", "Win", "Perdido", "Spam"],
    inboxDefaultStage: "No responde",
    crmDefaultStage: "No responde",
    importantStages: ["No responde","Seguimiento","Marca Personal","Búsqueda por iniciar","Búsqueda Iniciada","Propuesta Enviada","Contrato Enviado","Contrato Firmado","Por Closing"],
    wonStages: ["Win"],
    lostStages: ["Perdido","Spam"]
  },
  features: { legacyUserCompatibility: true, readOptimizedInbox: true }
});
