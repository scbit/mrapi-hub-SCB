"use strict";
const express=require("express");const {getTenant}=require("../../core/tenant");const router=express.Router();
function page(title,id,script){const t=getTenant();return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#ffffff"><title>${title} · ${t.branding.shortName}</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/app.css?v=1.4.4"><link rel="stylesheet" href="/assets/crm-tools.css?v=1.4.4"></head><body><div id="${id}"></div><script>window.MRAPI_TENANT=${JSON.stringify({id:t.id,name:t.name,shortName:t.branding.shortName})}</script><script src="/assets/${script}?v=1.4.4"></script></body></html>`;}
router.get("/mi-estado",(req,res)=>res.type("html").send(page("Mi Estado Comercial","myStatusApp","my-status.js")));
router.get("/users",(req,res)=>res.type("html").send(page("Usuarios","usersApp","users.js")));
module.exports=router;
