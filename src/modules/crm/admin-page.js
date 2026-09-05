"use strict";
const express=require("express");const {getTenant}=require("../../core/tenant");const {browserTenant,themeCss}=require("../../shared/branding");const router=express.Router();
function page(title,id,script){const t=getTenant();return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="${t.branding.primaryDark}"><title>${title} · ${t.branding.shortName}</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/app.css?v=1.5.5"><link rel="stylesheet" href="/assets/crm-tools.css?v=1.5.5"><style>${themeCss(t)}</style></head><body><div id="${id}"></div><script>window.MRAPI_TENANT=${JSON.stringify(browserTenant(t))}</script><script src="/assets/${script}?v=1.5.5"></script></body></html>`;}
router.get("/mi-estado",(req,res)=>res.type("html").send(page("Mi Estado Comercial","myStatusApp","my-status.js")));
router.get("/users",(req,res)=>res.type("html").send(page("Usuarios","usersApp","users.js")));
module.exports=router;
