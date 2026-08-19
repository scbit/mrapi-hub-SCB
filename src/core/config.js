"use strict";
function intEnv(name, fallback, min, max) {
  const n = Number(process.env[name] || fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(n, max));
}
module.exports = Object.freeze({
  port: intEnv("PORT", 8080, 1, 65535),
  nodeEnv: process.env.NODE_ENV || "production",
  tenantId: String(process.env.MRAPI_TENANT_ID || "scb").trim().toLowerCase(),
  sessionSecret: String(process.env.MRAPI_SESSION_SECRET || "").trim(),
  publicBaseUrl: String(process.env.MRAPI_PUBLIC_BASE_URL || "").replace(/\/$/, ""),
  crmDb: String(process.env.MRAPI_CRM_DB || "bscrmscb").trim(),
  inboxDb: String(process.env.MRAPI_INBOX_DB || "bsscb").trim(),
  filesBucket: String(process.env.MRAPI_FILES_BUCKET || "").trim(),
  tenantCacheMs: intEnv("MRAPI_TENANT_CACHE_MS", 300000, 10000, 3600000),
  authCacheMs: intEnv("MRAPI_AUTH_CACHE_MS", 60000, 5000, 300000),
  inboxPageSize: intEnv("MRAPI_INBOX_PAGE_SIZE", 50, 10, 100),
  inboxMaxPageSize: intEnv("MRAPI_INBOX_MAX_PAGE_SIZE", 100, 20, 200)
});
