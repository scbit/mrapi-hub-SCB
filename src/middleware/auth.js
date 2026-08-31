"use strict";
const config=require("../core/config");
const {verifySession}=require("../shared/crypto");
function bearer(req){ const h=String(req.headers.authorization||""); return h.startsWith("Bearer ") ? h.slice(7).trim() : ""; }
function authOptional(req,res,next){ const p=verifySession(bearer(req),config.sessionSecret); req.authUser=p?{id:p.sub,email:p.email,name:p.name,role:p.role,tenantId:p.tenantId}:null; next(); }
function authRequired(req,res,next){ if(!req.authUser) return res.status(401).json({ok:false,error:"Sesión requerida"}); next(); }
function requireRole(...roles){ const allowed=new Set(roles.map(x=>String(x).toLowerCase())); return (req,res,next)=>{ if(!req.authUser || !allowed.has(String(req.authUser.role||"").toLowerCase())) return res.status(403).json({ok:false,error:"Sin permiso"}); next();}; }
module.exports={authOptional,authRequired,requireRole};
