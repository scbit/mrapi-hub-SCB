"use strict";
const express=require("express");
const {getTenant}=require("../../core/tenant");
const {themeCss}=require("../../shared/branding");
const router=express.Router();

router.get("/oportunidades",(req,res)=>{
  const t=getTenant();
  res.type("html").send(`<!doctype html><html lang="es"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="${t.branding.primaryDark}">
  <title>Oportunidades · ${t.branding.shortName}</title>
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/opportunities.css?v=1.0.0">
  <style>${themeCss(t)}</style>
  </head><body>
  <div id="opportunitiesApp"></div>
  <script>window.MRAPI_TENANT=${JSON.stringify({id:t.id,name:t.name,shortName:t.branding.shortName})}</script>
  <script src="/assets/opportunities.js?v=1.0.0"></script>
  </body></html>`);
});

module.exports=router;
