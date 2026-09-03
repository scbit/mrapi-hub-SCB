"use strict";
const express=require("express");
const {getTenant}=require("../../core/tenant");
const {browserTenant,themeCss}=require("../../shared/branding");
const router=express.Router();
router.get("/inbox",(req,res)=>{const t=getTenant();res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="${t.branding.primaryDark}"><title>Bandeja · ${t.branding.shortName}</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/app.css?v=1.5.1"><link rel="stylesheet" href="/assets/inbox.css?v=1.5.1"><style>${themeCss(t)}</style></head><body><div id="app"></div><script>window.MRAPI_TENANT=${JSON.stringify(browserTenant(t))}</script><script src="/assets/inbox.js?v=1.5.1"></script></body></html>`);});
module.exports=router;
