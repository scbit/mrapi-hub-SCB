"use strict";
const express=require("express");
const {getTenant}=require("../../core/tenant");
const router=express.Router();
router.get("/inbox",(req,res)=>{
  const t=getTenant();
  res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bandeja · ${t.branding.shortName}</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/app.css?v=0.7.3"><link rel="stylesheet" href="/assets/inbox.css?v=0.7.3"></head><body><div id="app"></div><script>window.MRAPI_TENANT=${JSON.stringify({id:t.id,name:t.name,shortName:t.branding.shortName})}</script><script src="/assets/inbox.js?v=0.7.3"></script></body></html>`);
});
module.exports=router;
