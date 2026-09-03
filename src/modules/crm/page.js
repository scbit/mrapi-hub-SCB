"use strict";
const express=require("express");
const {getTenant}=require("../../core/tenant");
const {browserTenant,themeCss}=require("../../shared/branding");
const router=express.Router();
router.get("/crm",(req,res)=>{const t=getTenant();res.type("html").send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="${t.branding.primaryDark}"><title>CRM · ${t.branding.shortName}</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/app.css?v=1.5.2"><link rel="stylesheet" href="/assets/crm.css?v=1.5.2"><style>${themeCss(t)}</style></head><body><div id="crmApp"></div><script>window.MRAPI_TENANT=${JSON.stringify(browserTenant(t))}</script><script src="/assets/crm.js?v=1.5.2"></script></body></html>`);});
module.exports=router;
