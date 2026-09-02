"use strict";
const config = require("./config");
const scb = require("../tenants/scb");
const artec = require("../tenants/artec");
const presets={scb,artec};
function getTenant(){
  const preset=presets[config.tenantId] || {
    id:config.tenantId || "tenant",
    name:config.brandName || String(config.tenantId||"Tenant").toUpperCase(),
    product:"MR API HUB",
    subtitle:"",
    modules:{hub:true,crm:true,inbox:true},
    branding:{shortName:config.brandShortName || String(config.tenantId||"MRAPI").toUpperCase(),logoAsset:"",primary:"#4b5563",primaryDark:"#1f2937",accent:"#9ca3af",ink:"#20242b",muted:"#7d8797",line:"#e5e7eb",background:"#f7f7f8",soft:"#f1f3f5"},
    features:{legacyUserCompatibility:true,readOptimizedInbox:true}
  };
  const b=preset.branding||{};
  return Object.freeze({
    ...preset,
    id:config.tenantId || preset.id,
    name:config.brandName || preset.name,
    subtitle:config.brandSubtitle || preset.subtitle || "",
    databases:{crm:config.crmDb,inbox:config.inboxDb},
    branding:{...b,shortName:config.brandShortName||b.shortName||preset.id,logoUrl:config.brandLogoUrl||"",primary:config.brandPrimary||b.primary||"#4b5563",primaryDark:config.brandPrimaryDark||b.primaryDark||"#1f2937",accent:config.brandAccent||b.accent||"#9ca3af"},
    integrations:{twilioConfigured:/^AC[a-zA-Z0-9]+$/.test(String(process.env.TWILIO_ACCOUNT_SID||""))&&!!String(process.env.TWILIO_AUTH_TOKEN||"").trim(),dialogflowConfigured:!!config.dfAgentId,deskConfigured:!!config.deskBaseUrl}
  });
}
module.exports = { getTenant };
