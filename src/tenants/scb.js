"use strict";
module.exports = Object.freeze({
  id: "scb",
  name: "Sentire Customs Broker",
  product: "MR API HUB",
  modules: { hub: true, crm: true, inbox: true },
  databases: { crm: "bscrmscb", inbox: "bsscb" },
  branding: { shortName: "SCB", logoUrl: "", accent: "#111827" },
  features: { legacyUserCompatibility: true, readOptimizedInbox: true }
});
