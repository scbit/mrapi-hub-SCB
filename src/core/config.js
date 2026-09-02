"use strict";
function intEnv(name, fallback, min, max) {
  const n = Number(process.env[name] || fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(n, max));
}
const tenantId=String(process.env.MRAPI_TENANT_ID || "scb").trim().toLowerCase();
const isScb=tenantId==="scb";
module.exports = Object.freeze({
  port: intEnv("PORT", 8080, 1, 65535),
  nodeEnv: process.env.NODE_ENV || "production",
  tenantId,
  sessionSecret: String(process.env.MRAPI_SESSION_SECRET || "").trim(),
  publicBaseUrl: String(process.env.MRAPI_PUBLIC_BASE_URL || "").replace(/\/$/, ""),
  crmDb: String(process.env.MRAPI_CRM_DB || (isScb?"bscrmscb":"(default)")).trim(),
  inboxDb: String(process.env.MRAPI_INBOX_DB || (isScb?"bsscb":"(default)")).trim(),
  filesBucket: String(process.env.MRAPI_FILES_BUCKET || "").trim(),
  deskDb: String(process.env.MRAPI_DESK_DB || (isScb?"scb-desk":"")).trim(),
  deskBaseUrl: String(process.env.MRAPI_DESK_BASE_URL || process.env.DESK_BASE_URL || (isScb?"https://scb-desk-604957912671.us-central1.run.app":"")).replace(/\/$/, ""),
  tenantCacheMs: intEnv("MRAPI_TENANT_CACHE_MS", 300000, 10000, 3600000),
  authCacheMs: intEnv("MRAPI_AUTH_CACHE_MS", 60000, 5000, 300000),
  inboxPageSize: intEnv("MRAPI_INBOX_PAGE_SIZE", 50, 10, 100),
  inboxMaxPageSize: intEnv("MRAPI_INBOX_MAX_PAGE_SIZE", 100, 20, 200),
  brandName: String(process.env.MRAPI_BRAND_NAME || "").trim(),
  brandShortName: String(process.env.MRAPI_BRAND_SHORT_NAME || "").trim(),
  brandSubtitle: String(process.env.MRAPI_BRAND_SUBTITLE || "").trim(),
  brandLogoUrl: String(process.env.MRAPI_BRAND_LOGO_URL || "").trim(),
  brandPrimary: String(process.env.MRAPI_PRIMARY_COLOR || "").trim(),
  brandPrimaryDark: String(process.env.MRAPI_PRIMARY_DARK_COLOR || "").trim(),
  brandAccent: String(process.env.MRAPI_ACCENT_COLOR || "").trim(),
  dfProjectId: String(process.env.DF_PROJECT_ID || "").trim(),
  dfAgentId: String(process.env.DF_AGENT_ID || "").trim(),
  dfLocation: String(process.env.DF_LOCATION || "global").trim(),
  dfLanguageCode: String(process.env.DF_LANGUAGE_CODE || "es").trim()
});
