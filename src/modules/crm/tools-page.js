"use strict";
const express=require("express");
const {getTenant}=require("../../core/tenant");
const {browserTenant,themeCss}=require("../../shared/branding");
const router=express.Router();
function page(title,appId,script,extra=""){const t=getTenant();return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="${t.branding.primaryDark}"><title>${title} · ${t.branding.shortName}</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/app.css?v=1.5.3"><link rel="stylesheet" href="/assets/crm-tools.css?v=1.5.3"><style>${themeCss(t)}</style></head><body><div id="${appId}"></div><script>window.MRAPI_TENANT=${JSON.stringify(browserTenant(t))};${extra}</script><script src="/assets/${script}?v=1.5.3"></script></body></html>`;}
router.get("/contacts",(req,res)=>res.type("html").send(page("Contactos","contactsApp","contacts.js")));
router.get("/agenda",(req,res)=>res.type("html").send(page("Agenda Comercial","agendaApp","agenda.js","window.MRAPI_AGENDA_DEFAULT='agenda';")));
router.get("/vencimientos",(req,res)=>res.type("html").send(page("Seguimientos por Vencimiento","agendaApp","agenda.js","window.MRAPI_AGENDA_DEFAULT='vencidos';")));
module.exports=router;
