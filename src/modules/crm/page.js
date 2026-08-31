"use strict";
const express=require("express");
const {getTenant}=require("../../core/tenant");
const router=express.Router();
router.get("/crm",(req,res)=>{
  const t=getTenant();
  res.type("html").send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#111625"><title>CRM · ${t.branding.shortName}</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/app.css?v=0.8"><link rel="stylesheet" href="/assets/crm.css?v=0.8"></head><body><div id="crmApp"></div><script>window.MRAPI_TENANT=${JSON.stringify({id:t.id,name:t.name,shortName:t.branding.shortName})}</script><script src="/assets/crm.js?v=0.8"></script></body></html>`);
});
module.exports=router;
